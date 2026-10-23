package dev.duwe.notka.control

import dev.duwe.notka.entity.model.Access
import dev.duwe.notka.entity.model.BackgroundChange
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.Label
import dev.duwe.notka.entity.model.LinkPreview
import dev.duwe.notka.entity.model.Filing
import dev.duwe.notka.entity.model.Note
import dev.duwe.notka.entity.model.ReminderChange
import dev.duwe.notka.entity.model.ReminderRepeat
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteFields
import dev.duwe.notka.entity.model.NoteKind
import dev.duwe.notka.entity.model.NoteStepLog
import dev.duwe.notka.entity.model.NoteView
import dev.duwe.notka.entity.model.TrashAction
import dev.duwe.notka.entity.model.UserSummary
import dev.duwe.notka.entity.model.Validation
import dev.duwe.notka.entity.model.ImageFormats
import dev.duwe.notka.entity.model.NoteImage
import dev.duwe.notka.entity.persistence.LabelRepository
import dev.duwe.notka.entity.persistence.NoteImageRepository
import dev.duwe.notka.entity.model.NoteVersion
import dev.duwe.notka.entity.persistence.NoteRepository
import dev.duwe.notka.entity.persistence.NoteVersionRepository
import dev.duwe.notka.entity.persistence.ShareRepository
import dev.duwe.notka.entity.persistence.UserRepository

/** The largest picture a note accepts: a phone's camera photo, comfortably. */
const val MAX_IMAGE_BYTES: Int = 10 * 1024 * 1024

/** How many pictures one note can carry. */
const val MAX_IMAGES_PER_NOTE: Int = 20

/** How many steps one write may carry: a long paste is one step, a busy minute of typing a few hundred. */
const val MAX_STEPS_PER_WRITE: Int = 2000

/** An editor names itself with a short random id; anything longer is not one. */
const val MAX_CLIENT_ID_LENGTH: Int = 64

/** Somebody else's content edit this reader has not opened the note since: who, and when. */
data class UnseenEdit(val editor: UserSummary, val at: Long)

/** A share together with the account it points at. */
data class ShareWithUser(val user: UserSummary, val permission: String)

/**
 * A note as seen by one user: the stored row plus the resolved appearance, the viewer's own
 * labels and (for the owner) the collaborator list.
 */
data class ResolvedNote(
    val note: Note,
    val access: Access,
    val owner: UserSummary,
    val labels: List<Label>,
    val shares: List<ShareWithUser>,
    /** The cards for the links this note contains, resolved from the cache. */
    val linkPreviews: List<LinkPreview>,
    /** The note's pictures, in the order they were added; their bytes are fetched one by one. */
    val images: List<NoteImage> = emptyList(),
    /** The version of the note's body in its step log (`docs/COLLABORATION.md`). */
    val docVersion: Int = 0,
    /** Whether this reader pinned the note: a pin is each account's own (`NotePins`). */
    val pinned: Boolean = false,
    /** Where this reader has the note: its own place once it pinned or unpinned it, else the shared one. */
    val position: Long = note.position,
    /** The edit a card names as "edited by", or `null` when the reader has seen the note since. */
    val unseenEdit: UnseenEdit? = null,
) {
    val color: String get() = note.color
    val background: String? get() = note.background
    val reminderAt: Long? get() = note.reminderAt
    val reminderRepeat: ReminderRepeat? get() = note.reminderRepeat
}

data class CreateNoteCommand(
    val kind: String? = null,
    val title: String? = null,
    val document: NoteDocument? = null,
    val labelIds: List<Int>? = null,
)

data class PatchNoteCommand(
    val kind: String? = null,
    val title: String? = null,
    val document: NoteDocument? = null,
    val archived: Boolean? = null,
    val pinned: Boolean? = null,
    val trashed: Boolean? = null,
    val color: String? = null,
    val background: BackgroundChange = BackgroundChange.Unchanged,
    val reminder: ReminderChange = ReminderChange.Unchanged,
    val labelIds: List<Int>? = null,
    /** The version the client last saw; when present, the write is rejected if it is stale. */
    val expectedVersion: Int? = null,
)

/**
 * An editor's steps over the body it saw at [docVersion], with what they produce: the body, and the
 * title and kind when those changed alongside. The steps are ProseMirror's own JSON, kept as text.
 */
data class SubmitStepsCommand(
    val docVersion: Int,
    val clientId: String,
    val steps: List<String>,
    val document: NoteDocument,
    val title: String? = null,
    val kind: String? = null,
    /** The title [title] replaces, as its writer last saw it; see `StepsRequest.titleBase`. */
    val titleBase: String? = null,
)

/**
 * A note read back for its history: the archived state plus who wrote it.
 *
 * The author is resolved here rather than in the boundary so the DTO stays a plain mapping.
 */
data class ResolvedVersion(
    val version: NoteVersion,
    val author: UserSummary,
)

/** Note CRUD, archive/trash/restore/copy, access checks and version history. */
class NoteService(
    private val notes: NoteRepository,
    private val versions: NoteVersionRepository,
    private val shares: ShareRepository,
    private val labels: LabelRepository,
    private val users: UserRepository,
    private val access: NoteAccessChecker,
    private val events: NoteEventBus,
    private val linkPreviews: LinkPreviewService,
    private val maxNoteBytes: Int,
    private val maxNotesPerUser: Int = Int.MAX_VALUE,
    private val images: NoteImageRepository? = null,
    private val maxImageBytesPerUser: Long = Long.MAX_VALUE,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun list(userId: Int, view: NoteView, labelId: Int? = null): List<ResolvedNote> {
        // A label the caller does not own is a 404 rather than an empty list: asking for somebody
        // else's label is a mistake, not an empty view.
        requireOwnedLabels(userId, listOfNotNull(labelId))
        val records = notes.listVisible(userId, view, labelId)
        val owners = users.findSummaries(records.map { it.ownerId }.distinct())
        val filings = notes.filingsAmong(userId, records.map { it.id })
        val reads = readsAmong(userId, records)
        return records.map { note ->
            val noteAccess = checkNotNull(access.accessFor(userId, note)) {
                "Note ${note.id} was listed but is not accessible"
            }
            resolve(
                VisibleNote(note, noteAccess),
                userId,
                owners[note.ownerId] ?: ownerSummary(note),
                filings[note.id],
                reads.unseenEdit(note),
            )
        }.sortedWith(compareByDescending<ResolvedNote> { it.pinned }.thenByDescending { it.position })
    }

    /**
     * The reminders view: everything this user can see that carries a reminder, soonest first.
     *
     * Its own method rather than a flag on [list], because its order is by the reminder instead of by
     * when the note was last written — and that order is the whole point of the view.
     */
    fun reminders(userId: Int): List<ResolvedNote> {
        val records = notes.listWithReminders(userId)
        val owners = users.findSummaries(records.map { it.ownerId }.distinct())
        val reads = readsAmong(userId, records)
        return records.map { note ->
            val noteAccess = checkNotNull(access.accessFor(userId, note)) {
                "Note ${note.id} was listed but is not accessible"
            }
            resolve(
                VisibleNote(note, noteAccess),
                userId,
                owners[note.ownerId] ?: ownerSummary(note),
                unseenEdit = reads.unseenEdit(note),
            )
        }
    }

    fun get(userId: Int, noteId: Int): ResolvedNote {
        val visible = access.requireVisible(userId, noteId)
        return resolve(
            visible,
            userId,
            ownerSummary(visible.note),
            unseenEdit = readsAmong(userId, listOf(visible.note)).unseenEdit(visible.note),
        )
    }

    /**
     * Records that [userId] opened the note: the "edited by" marker goes away for that reader alone,
     * until somebody else writes the note's content again. Nobody else is told, and the note's version
     * stays — like a pin, it is the reader's own business.
     */
    fun markSeen(userId: Int, noteId: Int): ResolvedNote {
        val note = access.requireVisible(userId, noteId).note
        notes.markSeen(noteId, userId, note.editedAt)
        return get(userId, noteId)
    }

    fun create(userId: Int, command: CreateNoteCommand): ResolvedNote {
        val kind = command.kind?.let(Validation::noteKind) ?: NoteKind.TEXT
        val document = validateDocument(command.document ?: NoteDocument.empty())
        val labelIds = requireOwnedLabels(userId, command.labelIds ?: emptyList())
        requireRoomForANote(userId)
        val note = notes.insert(userId, kind, command.title ?: "", document, clock())
        if (labelIds.isNotEmpty()) labels.replaceForNote(note.id, userId, labelIds)
        linkPreviews.refresh(document) { publishChange(get(userId, note.id).note) }
        return get(userId, note.id)
    }

    fun patch(userId: Int, noteId: Int, command: PatchNoteCommand): ResolvedNote {
        // A pin is the reader's own, so anyone who can see the note may pin it — a VIEW collaborator
        // too. Everything else in a patch changes the note for everyone and needs edit access.
        val pin = command.pinned
        val rest = command.copy(pinned = null)
        if (rest == PatchNoteCommand()) {
            access.requireVisible(userId, noteId)
            // Nobody else is told: their view of the note did not change.
            if (pin != null) notes.setPinned(noteId, userId, pin)
            return get(userId, noteId)
        }
        val previous = access.requireEditable(userId, noteId).note
        val document = command.document?.let(::validateDocument)
        val kind = command.kind?.let(Validation::noteKind)
        val labelIds = command.labelIds?.let { requireOwnedLabels(userId, it) }
        val color = command.color?.let(Validation::color)
        val background = when (val change = command.background) {
            is BackgroundChange.Set -> BackgroundChange.Set(Validation.background(change.value))
            else -> change
        }
        val fields = NoteFields(
            kind = kind,
            title = command.title,
            document = document,
            archived = command.archived,
            trash = when (command.trashed) {
                true -> TrashAction.TRASH
                false -> TrashAction.RESTORE
                null -> TrashAction.KEEP
            },
            color = color,
            background = background,
            reminder = command.reminder,
            updatedAt = clock(),
            editedBy = userId.takeIf { touchesContent(command) },
            expectedVersion = command.expectedVersion,
        )
        val changed = notes.update(noteId, fields)
        if (touchesContent(command) && changed > 0) {
            versions.archive(NoteVersion.of(previous, authorId = userId, createdAt = clock()))
        }
        if (command.expectedVersion != null && changed == 0) {
            throw DomainException.conflict(
                ErrorKeys.NOTE_VERSION_CONFLICT,
                "Note $noteId changed since version ${command.expectedVersion}",
                mapOf("noteId" to noteId.toString()),
            )
        }
        labelIds?.let { labels.replaceForNote(noteId, userId, it) }
        // After the version guard above, which a pin would otherwise have moved on.
        if (pin != null) notes.setPinned(noteId, userId, pin)
        val resolved = get(userId, noteId)
        document?.let { linkPreviews.refresh(it) { publishChange(get(userId, noteId).note) } }
        publishChange(resolved.note)
        return resolved
    }

    /**
     * Writes an editor's steps (`docs/COLLABORATION.md`). They land only on the body they were made
     * for: an editor that is behind is told so and catches up through [stepsSince] — nothing is
     * overwritten and nothing is refused for good. Like a content `PATCH` it archives what it replaces.
     */
    fun submitSteps(userId: Int, noteId: Int, command: SubmitStepsCommand): ResolvedNote {
        val previous = access.requireEditable(userId, noteId).note
        val document = validateDocument(command.document)
        val kind = command.kind?.let(Validation::noteKind)
        if (command.clientId.isBlank() || command.clientId.length > MAX_CLIENT_ID_LENGTH) {
            throw DomainException.validation(ErrorKeys.REQUEST_INVALID_BODY, "clientId must be 1..$MAX_CLIENT_ID_LENGTH characters")
        }
        if (command.steps.size > MAX_STEPS_PER_WRITE) {
            throw DomainException.validation(ErrorKeys.REQUEST_INVALID_BODY, "A write carries at most $MAX_STEPS_PER_WRITE steps")
        }
        val renamedMeanwhile = command.title != null && command.titleBase != null &&
            previous.title != command.titleBase && previous.title != command.title
        if (renamedMeanwhile) {
            throw DomainException.conflict(
                ErrorKeys.NOTE_VERSION_CONFLICT,
                "Note $noteId was renamed since its writer last saw it",
                mapOf("noteId" to noteId.toString()),
            )
        }
        val changed = command.steps.isNotEmpty() ||
            (command.title != null && command.title != previous.title) ||
            (kind != null && kind != previous.kind)
        val fields = NoteFields(
            kind = kind,
            title = command.title,
            document = document,
            updatedAt = clock(),
            editedBy = userId.takeIf { changed },
        )
        notes.appendSteps(noteId, command.docVersion, command.clientId, command.steps, fields)
            ?: throw DomainException.conflict(
                ErrorKeys.NOTE_STEPS_BEHIND,
                "Note $noteId is past body version ${command.docVersion}",
                mapOf("noteId" to noteId.toString()),
            )
        if (changed) versions.archive(NoteVersion.of(previous, authorId = userId, createdAt = clock()))
        val resolved = get(userId, noteId)
        linkPreviews.refresh(document) { publishChange(get(userId, noteId).note) }
        publishChange(resolved.note)
        return resolved
    }

    /**
     * Moves a note in the order its views show: directly above [before], or directly below [after] —
     * exactly one of them, a note the caller can see. Dragging a card does this; the order is the
     * note's own, so everyone with access sees the note in its new place.
     */
    fun move(userId: Int, noteId: Int, before: Int?, after: Int?): ResolvedNote {
        access.requireEditable(userId, noteId)
        if ((before == null) == (after == null)) {
            throw DomainException.validation(ErrorKeys.REQUEST_INVALID_BODY, "Exactly one of before and after is required")
        }
        val anchorId = before ?: after ?: error("unreachable")
        if (anchorId == noteId) {
            throw DomainException.validation(ErrorKeys.REQUEST_INVALID_BODY, "A note cannot be moved next to itself")
        }
        access.requireVisible(userId, anchorId)
        // Highest first: "above" is one more than the anchor, "below" takes the anchor's own place and
        // the anchor moves up with everything above it. The anchor's place is where the mover sees it.
        val anchorPosition = get(userId, anchorId).position
        val target = if (before != null) anchorPosition + 1 else anchorPosition
        notes.place(noteId, target)
        notes.placeFiling(noteId, userId, target)
        val resolved = get(userId, noteId)
        publishChange(resolved.note)
        return resolved
    }

    /** The steps an editor at [since] is missing, for anyone who can see the note. */
    fun stepsSince(userId: Int, noteId: Int, since: Int): NoteStepLog {
        access.requireVisible(userId, noteId)
        return notes.stepsSince(noteId, since)
    }

    /** Previous states of a note, newest first. Anyone who can see the note can read its history. */
    fun history(userId: Int, noteId: Int): List<ResolvedVersion> {
        access.requireVisible(userId, noteId)
        val archived = versions.listForNote(noteId)
        val authors = users.findSummaries(archived.map { it.authorId }.distinct())
        return archived.map { entry ->
            ResolvedVersion(entry, authors[entry.authorId] ?: unknownAuthor(entry.authorId))
        }
    }

    fun historyEntry(userId: Int, noteId: Int, version: Int): ResolvedVersion {
        access.requireVisible(userId, noteId)
        val entry = versions.find(noteId, version) ?: throw DomainException.notFound(
            ErrorKeys.NOTE_VERSION_NOT_FOUND,
            "Note $noteId has no version $version",
            mapOf("noteId" to noteId.toString(), "version" to version.toString()),
        )
        return ResolvedVersion(entry, users.findById(entry.authorId)?.toSummary() ?: unknownAuthor(entry.authorId))
    }

    fun trash(userId: Int, noteId: Int): ResolvedNote = setTrashed(userId, noteId, TrashAction.TRASH)

    fun restore(userId: Int, noteId: Int): ResolvedNote = setTrashed(userId, noteId, TrashAction.RESTORE)

    /** Hard delete; owner only. */
    fun deletePermanently(userId: Int, noteId: Int) {
        access.requireOwner(userId, noteId)
        notes.delete(noteId)
    }

    /** Creates a copy owned by the caller: same title, content and appearance, no shares. */
    fun copy(userId: Int, noteId: Int): ResolvedNote {
        val visible = access.requireVisible(userId, noteId)
        val source = visible.note
        requireRoomForANote(userId)
        val copied = notes.insert(
            ownerId = userId,
            kind = source.kind,
            title = source.title,
            document = source.document,
            createdAt = clock(),
            color = source.color,
            background = source.background,
        )
        images?.copy(source.id, copied.id, clock())
        val sourceLabels = labels.labelsForNote(source.id, userId).map { it.id }
        if (sourceLabels.isNotEmpty()) labels.replaceForNote(copied.id, userId, sourceLabels)
        return get(userId, copied.id)
    }

    /**
     * Attaches a picture, recognised from its own bytes. Anyone who can edit the note may, and the
     * picture counts against the storage of the note's **owner**, whose note it is. Like the
     * appearance, it is not version-guarded and never a history entry — but it is a change, so the
     * note's version moves on and everyone looking at it is told.
     */
    fun addImage(userId: Int, noteId: Int, bytes: ByteArray): ResolvedNote {
        val note = access.requireEditable(userId, noteId).note
        val store = checkNotNull(images) { "No image storage configured" }
        if (bytes.size > MAX_IMAGE_BYTES) {
            throw DomainException.payloadTooLarge(
                ErrorKeys.IMAGE_TOO_LARGE,
                "A picture can be at most $MAX_IMAGE_BYTES bytes",
                mapOf("limit" to (MAX_IMAGE_BYTES / (1024 * 1024)).toString()),
            )
        }
        val info = ImageFormats.sniff(bytes) ?: throw DomainException.validation(
            ErrorKeys.IMAGE_UNSUPPORTED,
            "Only PNG, JPEG, GIF and WebP pictures can be attached",
        )
        if (store.countForNote(noteId) >= MAX_IMAGES_PER_NOTE) {
            throw DomainException.forbidden(
                ErrorKeys.IMAGE_LIMIT_REACHED,
                "A note can carry at most $MAX_IMAGES_PER_NOTE pictures",
                mapOf("limit" to MAX_IMAGES_PER_NOTE.toString()),
            )
        }
        if (store.bytesForNotes(notes.idsOwnedBy(note.ownerId)) + bytes.size > maxImageBytesPerUser) {
            throw DomainException.forbidden(ErrorKeys.IMAGE_STORAGE_FULL, "The account's picture storage is full")
        }
        store.insert(noteId, info, bytes, clock())
        return touched(userId, noteId)
    }

    fun removeImage(userId: Int, noteId: Int, imageId: Int): ResolvedNote {
        access.requireEditable(userId, noteId)
        val removed = checkNotNull(images) { "No image storage configured" }.delete(noteId, imageId)
        if (removed == 0) throw imageNotFound(imageId)
        return touched(userId, noteId)
    }

    /** A picture's type and bytes, for anyone who can see the note. */
    fun imageBytes(userId: Int, noteId: Int, imageId: Int): Pair<String, ByteArray> {
        access.requireVisible(userId, noteId)
        return images?.bytes(noteId, imageId) ?: throw imageNotFound(imageId)
    }

    private fun imageNotFound(imageId: Int) = DomainException.notFound(
        ErrorKeys.IMAGE_NOT_FOUND,
        "Picture $imageId does not exist",
        mapOf("imageId" to imageId.toString()),
    )

    /** Moves the note's version on without touching its content, and tells everyone who sees it. */
    private fun touched(userId: Int, noteId: Int): ResolvedNote {
        notes.update(noteId, NoteFields(updatedAt = clock()))
        val resolved = get(userId, noteId)
        publishChange(resolved.note)
        return resolved
    }

    private fun requireRoomForANote(userId: Int) {
        if (notes.countOwned(userId) >= maxNotesPerUser) {
            throw DomainException.forbidden(
                ErrorKeys.NOTE_LIMIT_REACHED,
                "An account can own at most $maxNotesPerUser notes",
                mapOf("limit" to maxNotesPerUser.toString()),
            )
        }
    }

    fun detachLabel(userId: Int, noteId: Int, labelId: Int): ResolvedNote {
        access.requireEditable(userId, noteId)
        labels.detach(noteId, labelId, userId)
        notes.update(noteId, NoteFields(updatedAt = clock()))
        return get(userId, noteId)
    }

    private fun setTrashed(userId: Int, noteId: Int, action: TrashAction): ResolvedNote {
        access.requireEditable(userId, noteId)
        notes.update(noteId, NoteFields(trash = action, updatedAt = clock()))
        val resolved = get(userId, noteId)
        publishChange(resolved.note)
        return resolved
    }

    /** Tells every account that can see this note that it moved on to a new version. */
    private fun publishChange(note: Note) {
        val audience = setOf(note.ownerId) + shares.listForNote(note.id).map { it.userId }
        events.publish(NoteChangedEvent(noteId = note.id, version = note.version, audience = audience))
    }


    private fun resolve(
        visible: VisibleNote,
        viewerId: Int,
        owner: UserSummary,
        filing: Filing? = notes.filingsAmong(viewerId, listOf(visible.note.id))[visible.note.id],
        unseenEdit: UnseenEdit? = null,
    ): ResolvedNote {
        val note = visible.note
        return ResolvedNote(
            note = note,
            access = visible.access,
            owner = owner,
            labels = labels.labelsForNote(note.id, viewerId),
            shares = sharesWithUsers(note.id),
            linkPreviews = linkPreviews.forDocument(note.document),
            images = images?.listForNote(note.id).orEmpty(),
            docVersion = notes.stepHead(note.id).first,
            pinned = filing?.pinned ?: false,
            position = filing?.position ?: note.position,
            unseenEdit = unseenEdit,
        )
    }

    /**
     * What one reader last saw of a batch of notes, and who edited them, read once for the batch.
     * A note is marked while its last content edit is somebody else's and newer than what the reader
     * saw of it; a reader who never opened it has seen nothing yet.
     */
    private class Reads(
        private val viewerId: Int,
        private val seen: Map<Int, Long>,
        private val editors: Map<Int, UserSummary>,
    ) {
        fun unseenEdit(note: Note): UnseenEdit? {
            val editorId = note.editedBy ?: return null
            if (editorId == viewerId) return null
            val seenAt = seen[note.id]
            if (seenAt != null && seenAt >= note.editedAt) return null
            return editors[editorId]?.let { UnseenEdit(it, note.editedAt) }
        }
    }

    private fun readsAmong(viewerId: Int, records: List<Note>): Reads {
        val editorIds = records.mapNotNull { it.editedBy }.filter { it != viewerId }.distinct()
        return Reads(viewerId, notes.seenAmong(viewerId, records.map { it.id }), users.findSummaries(editorIds))
    }

    private fun sharesWithUsers(noteId: Int): List<ShareWithUser> {
        val noteShares = shares.listForNote(noteId)
        val accounts = users.findSummaries(noteShares.map { it.userId })
        return noteShares.mapNotNull { share ->
            accounts[share.userId]?.let { ShareWithUser(it, share.permission.name) }
        }
    }

    /** Archiving is about content: title, kind and the document. Appearance is not versioned. */
    private fun touchesContent(command: PatchNoteCommand): Boolean =
        command.title != null || command.kind != null || command.document != null

    private fun unknownAuthor(userId: Int): UserSummary =
        UserSummary(id = userId, email = null, username = null, displayName = "")

    private fun ownerSummary(note: Note): UserSummary =
        checkNotNull(users.findById(note.ownerId)) { "Note owner ${note.ownerId} is gone" }.toSummary()

    private fun validateDocument(document: NoteDocument): NoteDocument {
        document.validate()
        val size = NoteDocument.write(document).toByteArray(Charsets.UTF_8).size
        if (size > maxNoteBytes) {
            throw DomainException.payloadTooLarge(
                ErrorKeys.NOTE_CONTENT_TOO_LARGE,
                "Note document exceeds $maxNoteBytes bytes",
                mapOf("limit" to maxNoteBytes.toString()),
            )
        }
        return document
    }

    private fun requireOwnedLabels(userId: Int, labelIds: List<Int>): List<Int> {
        val distinct = labelIds.distinct()
        distinct.forEach { labelId ->
            val label = labels.find(labelId)
            if (label == null || label.ownerId != userId) {
                throw DomainException.notFound(
                    ErrorKeys.LABEL_NOT_FOUND,
                    "Label $labelId does not exist",
                    mapOf("labelId" to labelId.toString()),
                )
            }
        }
        return distinct
    }
}
