package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.BackgroundChange
import dev.duwe.notka.entity.model.Filing
import dev.duwe.notka.entity.model.Note
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteFields
import dev.duwe.notka.entity.model.NoteKind
import dev.duwe.notka.entity.model.NoteStep
import dev.duwe.notka.entity.model.NoteStepLog
import dev.duwe.notka.entity.model.NoteView
import dev.duwe.notka.entity.model.ReminderChange
import dev.duwe.notka.entity.model.ReminderRepeat
import dev.duwe.notka.entity.model.TrashAction
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.core.statements.api.ExposedBlob
import javax.crypto.SecretKey

/** How many steps of one note's body the log keeps; an editor further behind reads the note instead. */
private const val MAX_LOGGED_STEPS = 1000

/**
 * Dumb queries over `notes`; access control lives in the control layer. A sealed note's title, body
 * and steps are opened and sealed here with its owner's key from [keys], so everything above sees the
 * note in the clear (`docs/ENCRYPTION.md`).
 */
class NoteRepository(private val database: Database, private val keys: KeyRing) {
    /** Every read of a note carries whether it is sealed. */
    private val withSeal = Notes.join(SealedNotes, JoinType.LEFT, Notes.id, SealedNotes.noteId)

    /** [sealed] stores the note encrypted from its first byte; `NoteSealing` decides it. */
    fun insert(
        ownerId: Int,
        kind: NoteKind,
        title: String,
        document: NoteDocument,
        createdAt: Long,
        color: String = Note.DEFAULT_COLOR,
        background: String? = null,
        sealed: Boolean = false,
    ): Note {
        val key = if (sealed) keys.require(ownerId) else null
        val id = transaction(database) {
            val top = topPosition()
            val id = Notes.insert {
                it[Notes.ownerId] = ownerId
                it[Notes.kind] = kind.name
                it[Notes.title] = ""
                it[Notes.content] = ""
                it[Notes.archived] = false
                it[Notes.position] = top
                it[Notes.trashedAt] = null
                it[Notes.createdAt] = createdAt
                it[Notes.updatedAt] = createdAt
                it[Notes.editedBy] = ownerId
                it[Notes.editedAt] = createdAt
                it[Notes.version] = 1
                it[Notes.color] = color
                it[Notes.background] = background
            } get Notes.id
            // The id is part of what a sealed value is bound to, so the text is written once it exists.
            Notes.update({ Notes.id eq id }) {
                it[Notes.title] = key?.let { k -> Sealing.sealText(k, title, SealedPlaces.noteTitle(id)) } ?: title
                it[Notes.content] = NoteDocument.write(document).let { text ->
                    key?.let { k -> Sealing.sealText(k, text, SealedPlaces.noteContent(id)) } ?: text
                }
            }
            if (sealed) SealedNotes.insert { it[SealedNotes.noteId] = id }
            id
        }
        return checkNotNull(find(id)) { "Inserted note $id disappeared" }
    }

    fun idsOwnedBy(ownerId: Int): List<Int> = transaction(database) {
        Notes.select(Notes.id).where { Notes.ownerId eq ownerId }.map { it[Notes.id] }
    }

    /** Every note the account owns, archived and trashed ones included. */
    fun listOwnedBy(ownerId: Int): List<Note> = transaction(database) {
        withSeal.selectAll().where { Notes.ownerId eq ownerId }.map { it.toNote() }
    }

    /** Who owns the note, read without opening it: what an access check needs first. */
    fun ownerOf(id: Int): Int? = transaction(database) {
        Notes.select(Notes.ownerId).where { Notes.id eq id }.singleOrNull()?.get(Notes.ownerId)
    }

    /**
     * Seals the note — title, body, every history entry, the step log and the pictures — with its
     * owner's key, or opens all of it back into the clear, in one transaction.
     *
     * @return whether anything changed.
     */
    fun setSealed(id: Int, sealed: Boolean): Boolean = transaction(database) {
        val ownerId = ownerOf(id) ?: return@transaction false
        val was = SealedNotes.selectAll().where { SealedNotes.noteId eq id }.any()
        if (was == sealed) return@transaction false
        val key = keys.require(ownerId)
        val text = { value: String, place: String ->
            if (sealed) Sealing.sealText(key, value, place) else Sealing.openText(key, value, place)
        }
        val bytes = { value: ByteArray, place: String ->
            if (sealed) Sealing.seal(key, value, place) else Sealing.open(key, value, place)
        }
        val note = Notes.select(Notes.title, Notes.content).where { Notes.id eq id }.single()
        Notes.update({ Notes.id eq id }) {
            it[title] = text(note[Notes.title], SealedPlaces.noteTitle(id))
            it[content] = text(note[Notes.content], SealedPlaces.noteContent(id))
        }
        NoteVersions.select(NoteVersions.id, NoteVersions.title, NoteVersions.content)
            .where { NoteVersions.noteId eq id }
            .toList()
            .forEach { row ->
                NoteVersions.update({ NoteVersions.id eq row[NoteVersions.id] }) {
                    it[title] = text(row[NoteVersions.title], SealedPlaces.versionTitle(id))
                    it[content] = text(row[NoteVersions.content], SealedPlaces.versionContent(id))
                }
            }
        NoteSteps.select(NoteSteps.docVersion, NoteSteps.step)
            .where { NoteSteps.noteId eq id }
            .toList()
            .forEach { row ->
                NoteSteps.update({ (NoteSteps.noteId eq id) and (NoteSteps.docVersion eq row[NoteSteps.docVersion]) }) {
                    it[step] = text(row[NoteSteps.step], SealedPlaces.step(id))
                }
            }
        // One picture at a time: twenty of them are up to 200 MB.
        NoteImages.select(NoteImages.id).where { NoteImages.noteId eq id }.map { it[NoteImages.id] }.forEach { imageId ->
            val data = NoteImages.select(NoteImages.data).where { NoteImages.id eq imageId }.single()[NoteImages.data]
            NoteImages.update({ NoteImages.id eq imageId }) {
                it[NoteImages.data] = ExposedBlob(bytes(data.bytes, SealedPlaces.image(id)))
            }
        }
        if (sealed) {
            SealedNotes.insert { it[noteId] = id }
        } else {
            SealedNotes.deleteWhere { noteId eq id }
        }
        true
    }

    /** Removes the account's sealed notes: what a password reset without the recovery key leaves behind. */
    fun deleteSealedOwnedBy(ownerId: Int): Int = transaction(database) {
        Notes.deleteWhere {
            (Notes.ownerId eq ownerId) and (Notes.id inSubQuery SealedNotes.select(SealedNotes.noteId))
        }
    }

    /** Every note the account owns, archived and trashed ones included. */
    fun countOwned(ownerId: Int): Long = transaction(database) {
        Notes.selectAll().where { Notes.ownerId eq ownerId }.count()
    }

    fun find(id: Int): Note? = transaction(database) {
        withSeal.selectAll().where { Notes.id eq id }.singleOrNull()?.toNote()
    }

    /** Notes owned by [userId] plus the ones shared with them, filtered by the requested view. */
    /**
     * The notes [userId] may see in [view], optionally only those carrying [labelId].
     *
     * A label belongs to one user, so this can only ever narrow the list: a note is visible because of
     * its owner or a share, and the label it carries is the one its owner put on it.
     */
    fun listVisible(userId: Int, view: NoteView, labelId: Int? = null): List<Note> = transaction(database) {
        val sharedWithUser = NoteShares.select(NoteShares.noteId).where { NoteShares.userId eq userId }
        val viewFilter = when (view) {
            NoteView.ACTIVE -> Notes.trashedAt.isNull() and (Notes.archived eq false)
            NoteView.ARCHIVED -> Notes.trashedAt.isNull() and (Notes.archived eq true)
            NoteView.TRASH -> Notes.trashedAt.isNotNull()
        }
        val visible = (Notes.ownerId eq userId) or (Notes.id inSubQuery sharedWithUser)
        val labeled = labelId?.let { wanted ->
            Notes.id inSubQuery NoteLabels.select(NoteLabels.noteId).where { NoteLabels.labelId eq wanted }
        }
        val filter = listOfNotNull(viewFilter, visible, labeled).reduce { all, next -> all and next }
        withSeal.selectAll().where { filter }
            .orderBy(Notes.position to SortOrder.DESC)
            .map { it.toNote() }
    }

    /**
     * Applies [fields]. When [NoteFields.expectedVersion] is set the row is only written if it still
     * carries that version, and the version is incremented, so a concurrent edit is detected rather
     * than silently overwritten.
     *
     * @return the number of rows changed; `0` means the version guard did not match.
     */
    fun update(id: Int, fields: NoteFields): Int = transaction(database) {
        val changed = write(id, fields)
        // A body written as a whole is not a step: the log cannot bring an editor across it, so it
        // starts again after it.
        if (changed > 0 && fields.document != null) {
            val (version, _) = stepHead(id)
            NoteSteps.deleteWhere { NoteSteps.noteId eq id }
            writeStepHead(id, version + 1, version + 1)
        }
        changed
    }

    /**
     * Puts the note at [position] in the order every view shows, and makes room for it: every other
     * note at that place or above moves up by one, which keeps their order among themselves — and
     * everyone else's notes, which share the numbering — exactly as it was. The note's version moves on
     * (its collaborators are told); its `updated_at` does not, because being moved is not being edited.
     */
    fun place(id: Int, position: Long): Int = transaction(database) {
        Notes.update({ (Notes.position greaterEq position) and (Notes.id neq id) }) { row ->
            row[Notes.position] = Notes.position + 1
        }
        Notes.update({ Notes.id eq id }) { row ->
            row[Notes.position] = position
            row[Notes.version] = Notes.version + 1
        }
    }

    /** The version a note's body is at, and the oldest version its step log can bring an editor up from. */
    fun stepHead(noteId: Int): Pair<Int, Int> = transaction(database) {
        NoteStepHeads.selectAll().where { NoteStepHeads.noteId eq noteId }.singleOrNull()
            ?.let { it[NoteStepHeads.docVersion] to it[NoteStepHeads.logStart] }
            ?: (0 to 0)
    }

    /** The body's version in the step log of each of [noteIds]; a note that never had a step is absent (version 0). */
    fun docVersionsAmong(noteIds: Collection<Int>): Map<Int, Int> = transaction(database) {
        if (noteIds.isEmpty()) return@transaction emptyMap()
        NoteStepHeads.selectAll().where { NoteStepHeads.noteId inList noteIds }
            .associate { it[NoteStepHeads.noteId] to it[NoteStepHeads.docVersion] }
    }

    fun stepsSince(noteId: Int, since: Int): NoteStepLog = transaction(database) {
        val (version, logStart) = stepHead(noteId)
        if (since < logStart || since > version) return@transaction NoteStepLog(version, null)
        val steps = NoteSteps.selectAll()
            .where { (NoteSteps.noteId eq noteId) and (NoteSteps.docVersion greater since) }
            .orderBy(NoteSteps.docVersion to SortOrder.ASC)
            .let { rows ->
                val key = keys.sealingKeyOf(noteId)
                rows.map { row ->
                    val step = row[NoteSteps.step]
                    NoteStep(key?.let { Sealing.openText(it, step, SealedPlaces.step(noteId)) } ?: step, row[NoteSteps.clientId])
                }
            }
        NoteStepLog(version, steps)
    }

    /**
     * Appends an editor's steps to the body it saw at [expected], and writes [fields] — the body those
     * steps produce — in the same transaction, so the log and the stored body never disagree.
     *
     * @return the body's new version, or `null` when it is no longer at [expected]: somebody else's
     *   steps came first, and the editor has to take them in before its own can follow.
     */
    fun appendSteps(noteId: Int, expected: Int, clientId: String, steps: List<String>, fields: NoteFields): Int? =
        transaction(database) {
            val (version, logStart) = stepHead(noteId)
            if (version != expected) return@transaction null
            val key = keys.sealingKeyOf(noteId)
            steps.forEachIndexed { index, step ->
                NoteSteps.insert {
                    it[NoteSteps.noteId] = noteId
                    it[NoteSteps.docVersion] = expected + index + 1
                    it[NoteSteps.clientId] = clientId
                    it[NoteSteps.step] = key?.let { k -> Sealing.sealText(k, step, SealedPlaces.step(noteId)) } ?: step
                }
            }
            val next = expected + steps.size
            val keptFrom = maxOf(logStart, next - MAX_LOGGED_STEPS)
            NoteSteps.deleteWhere {
                (NoteSteps.noteId eq noteId) and (NoteSteps.docVersion lessEq keptFrom)
            }
            writeStepHead(noteId, next, keptFrom)
            write(noteId, fields)
            next
        }

    private fun writeStepHead(noteId: Int, docVersion: Int, logStart: Int) {
        NoteStepHeads.replace {
            it[NoteStepHeads.noteId] = noteId
            it[NoteStepHeads.docVersion] = docVersion
            it[NoteStepHeads.logStart] = logStart
        }
    }

    private fun write(id: Int, fields: NoteFields): Int {
        val guard = fields.expectedVersion?.let { version ->
            (Notes.id eq id) and (Notes.version eq version)
        } ?: Notes.id eq id
        val top = if (fields.toTop) topPosition() else null
        val key: SecretKey? = if (fields.title != null || fields.document != null) keys.sealingKeyOf(id) else null
        val stored = { text: String, place: String -> key?.let { Sealing.sealText(it, text, place) } ?: text }

        return Notes.update({ guard }) { row ->
                top?.let { row[Notes.position] = it }
                fields.kind?.let { row[Notes.kind] = it.name }
                fields.title?.let { row[Notes.title] = stored(it, SealedPlaces.noteTitle(id)) }
                fields.document?.let { row[Notes.content] = stored(NoteDocument.write(it), SealedPlaces.noteContent(id)) }
                fields.archived?.let { row[Notes.archived] = it }
                fields.color?.let { row[Notes.color] = it }
                when (fields.background) {
                    BackgroundChange.Unchanged -> Unit
                    BackgroundChange.Cleared -> row[Notes.background] = null
                    is BackgroundChange.Set -> row[Notes.background] = fields.background.value
                }
                when (fields.reminder) {
                    ReminderChange.Unchanged -> Unit
                    ReminderChange.Cleared -> {
                        row[Notes.reminderAt] = null
                        row[Notes.reminderRepeat] = null
                    }
                    is ReminderChange.Set -> {
                        row[Notes.reminderAt] = fields.reminder.at
                        row[Notes.reminderRepeat] = fields.reminder.repeat?.wire
                    }
                }
                when (fields.trash) {
                    TrashAction.KEEP -> Unit
                    TrashAction.TRASH -> row[Notes.trashedAt] = fields.updatedAt
                    TrashAction.RESTORE -> row[Notes.trashedAt] = null
                }
                row[Notes.updatedAt] = fields.updatedAt
                fields.editedBy?.let {
                    row[Notes.editedBy] = it
                    row[Notes.editedAt] = fields.updatedAt
                }
                row[Notes.version] = Notes.version + 1
            }
    }

    /** How [userId] filed the notes among [noteIds] that they ever pinned or unpinned. */
    fun filingsAmong(userId: Int, noteIds: Collection<Int>): Map<Int, Filing> = transaction(database) {
        if (noteIds.isEmpty()) return@transaction emptyMap()
        NotePins.selectAll()
            .where { (NotePins.userId eq userId) and (NotePins.noteId inList noteIds) }
            .associate { it[NotePins.noteId] to Filing(it[NotePins.pinned], it[NotePins.position]) }
    }

    /** The notes among [noteIds] whose completed items [userId] folded away. */
    fun foldedAmong(userId: Int, noteIds: Collection<Int>): Set<Int> = transaction(database) {
        if (noteIds.isEmpty()) return@transaction emptySet()
        NoteFolds.selectAll()
            .where { (NoteFolds.userId eq userId) and (NoteFolds.noteId inList noteIds) }
            .mapTo(mutableSetOf()) { it[NoteFolds.noteId] }
    }

    /**
     * Folds or unfolds [noteId]'s completed items for [userId] alone. Like a pin it touches nothing of
     * the note — not its version, not `updated_at`, not anybody else's fold.
     */
    fun setCompletedCollapsed(noteId: Int, userId: Int, collapsed: Boolean) {
        transaction(database) {
            if (collapsed) {
                NoteFolds.insertIgnore {
                    it[NoteFolds.noteId] = noteId
                    it[NoteFolds.userId] = userId
                }
            } else {
                NoteFolds.deleteWhere { (NoteFolds.noteId eq noteId) and (NoteFolds.userId eq userId) }
            }
        }
    }

    /**
     * Pins or unpins [noteId] for [userId] alone, and takes it to the top of where it lands in that
     * account's order (the original's rule) — nobody else's order, version or `updated_at` changes,
     * because filing a note is neither editing it nor anybody else's business.
     *
     * @return whether anything changed.
     */
    fun setPinned(noteId: Int, userId: Int, pinned: Boolean): Boolean = transaction(database) {
        val was = NotePins.select(NotePins.pinned)
            .where { (NotePins.noteId eq noteId) and (NotePins.userId eq userId) }
            .singleOrNull()?.get(NotePins.pinned) ?: false
        if (was == pinned) return@transaction false
        val top = topPosition()
        NotePins.replace {
            it[NotePins.noteId] = noteId
            it[NotePins.userId] = userId
            it[NotePins.pinned] = pinned
            it[NotePins.position] = top
        }
        true
    }

    /** Puts [userId]'s own filing of [noteId], if there is one, at [position] (where a drag left it). */
    fun placeFiling(noteId: Int, userId: Int, position: Long) {
        transaction(database) {
            NotePins.update({ (NotePins.noteId eq noteId) and (NotePins.userId eq userId) }) {
                it[NotePins.position] = position
            }
        }
    }

    /** The `edited_at` [userId] last saw of each note among [noteIds] it ever opened. */
    fun seenAmong(userId: Int, noteIds: Collection<Int>): Map<Int, Long> = transaction(database) {
        if (noteIds.isEmpty()) return@transaction emptyMap()
        NoteReads.selectAll()
            .where { (NoteReads.userId eq userId) and (NoteReads.noteId inList noteIds) }
            .associate { it[NoteReads.noteId] to it[NoteReads.seenAt] }
    }

    /** Records that [userId] has seen [noteId] as of its content edit at [editedAt]. */
    fun markSeen(noteId: Int, userId: Int, editedAt: Long) {
        transaction(database) {
            NoteReads.replace {
                it[NoteReads.noteId] = noteId
                it[NoteReads.userId] = userId
                it[NoteReads.seenAt] = editedAt
            }
        }
    }

    fun delete(id: Int) {
        transaction(database) {
            Notes.deleteWhere { Notes.id eq id }
        }
    }

    /** Hard-deletes every trashed note whose `trashed_at` is older than [cutoff]; returns the count. */
    fun purgeTrashedBefore(cutoff: Long): Int = transaction(database) {
        Notes.deleteWhere {
            Notes.trashedAt.isNotNull() and (Notes.trashedAt less cutoff)
        }
    }

    /** One above every note there is, in anyone's order; called inside the transaction that uses it. */
    private fun topPosition(): Long {
        val shared = Notes.select(Notes.position.max()).single()[Notes.position.max()] ?: 0L
        val filed = NotePins.select(NotePins.position.max()).single()[NotePins.position.max()] ?: 0L
        return maxOf(shared, filed) + 1
    }

    private fun ResultRow.toNote(): Note {
        val id = this[Notes.id]
        val ownerId = this[Notes.ownerId]
        val key = if (getOrNull(SealedNotes.noteId) != null) keys.require(ownerId) else null
        val opened = { text: String, place: String -> key?.let { Sealing.openText(it, text, place) } ?: text }
        return Note(
            id = id,
            ownerId = ownerId,
            kind = NoteKind.valueOf(this[Notes.kind]),
            title = opened(this[Notes.title], SealedPlaces.noteTitle(id)),
            document = NoteDocument.parse(opened(this[Notes.content], SealedPlaces.noteContent(id))),
            archived = this[Notes.archived],
            position = this[Notes.position],
            trashedAt = this[Notes.trashedAt],
            createdAt = this[Notes.createdAt],
            updatedAt = this[Notes.updatedAt],
            version = this[Notes.version],
            color = this[Notes.color],
            background = this[Notes.background],
            reminderAt = this[Notes.reminderAt],
            reminderRepeat = ReminderRepeat.fromWire(this[Notes.reminderRepeat]),
            editedBy = this[Notes.editedBy],
            editedAt = this[Notes.editedAt],
            sealed = key != null,
        )
    }

    /**
     * The notes [userId] may see that carry a reminder, soonest first.
     *
     * The reminders view is a **time** view, not an "edited" one: its own order is the whole point of
     * it, which is why it does not share `listVisible`'s `position` ordering. Trashed notes
     * are left out — a note in the trash has no reminder — and archived ones with it.
     */
    fun listWithReminders(userId: Int): List<Note> = transaction(database) {
        val sharedWithUser = NoteShares.select(NoteShares.noteId).where { NoteShares.userId eq userId }
        withSeal.selectAll()
            .where {
                Notes.trashedAt.isNull() and
                    Notes.reminderAt.isNotNull() and
                    ((Notes.ownerId eq userId) or (Notes.id inSubQuery sharedWithUser))
            }
            .orderBy(Notes.reminderAt to SortOrder.ASC)
            .map { it.toNote() }
    }
}
