package dev.duwe.notka.control

import dev.duwe.notka.entity.model.Note
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteShare
import dev.duwe.notka.entity.persistence.NoteRepository
import dev.duwe.notka.entity.persistence.ShareRepository
import dev.duwe.notka.entity.persistence.UserRepository

/** Whether a note is stored encrypted, and when it is not, why — what the editor's lock says. */
enum class NoteProtection {
    ENCRYPTED,

    /** Everyone it is shared with reads it, and they do not have the owner's key. */
    SHARED,

    /** The server reads the links out of the note to fetch their cards. */
    LINK_PREVIEWS,

    /** The owner has not turned encryption on. */
    DISABLED,
}

/**
 * Decides which notes are sealed (`docs/ENCRYPTION.md`): a note is stored encrypted when its owner
 * turned encryption on, it is shared with nobody, and the server does not need to read it for its
 * link previews. The rule is applied whenever its owner's request reads or writes the note — the one
 * moment the owner's key is surely unlocked — so a note follows its shares, its links and its owner's
 * settings without a second place to keep in step.
 */
class NoteSealing(
    private val notes: NoteRepository,
    private val shares: ShareRepository,
    private val users: UserRepository,
    private val accountKeys: AccountKeys,
    private val linkPreviews: LinkPreviewService,
) {
    /** Whether a note of [ownerId] holding [document] is sealed while nobody shares it. */
    fun wanted(ownerId: Int, document: NoteDocument): Boolean =
        accountKeys.unlocked(ownerId) != null && !(users.linkPreviews(ownerId) && hasLinks(document))

    /**
     * Brings [viewerId]'s own notes among [records] to the state the rule gives them, and returns
     * [records] as they are stored now. Nobody else's notes are touched: only their owner's key opens
     * them.
     */
    fun settle(
        viewerId: Int,
        records: List<Note>,
        sharesByNote: Map<Int, List<NoteShare>>,
        previewsOff: Set<Int>,
    ): List<Note> {
        val unlocked = accountKeys.unlocked(viewerId) != null
        return records.map { note ->
            if (note.ownerId != viewerId || (note.sealed && !unlocked)) return@map note
            val want = unlocked && sharesByNote[note.id].isNullOrEmpty() &&
                !(viewerId !in previewsOff && hasLinks(note.document))
            if (want == note.sealed) note else note.also { notes.setSealed(it.id, want) }.copy(sealed = want)
        }
    }

    /** What the lock tells [viewerId] about a note [settle] has already brought to its state. */
    fun protection(viewerId: Int, note: Note, shared: Boolean, previewsOff: Set<Int>): NoteProtection = when {
        note.sealed -> NoteProtection.ENCRYPTED
        shared || note.ownerId != viewerId -> NoteProtection.SHARED
        accountKeys.unlocked(viewerId) == null -> NoteProtection.DISABLED
        viewerId !in previewsOff && hasLinks(note.document) -> NoteProtection.LINK_PREVIEWS
        else -> NoteProtection.DISABLED
    }

    /** [settle] for every note the account owns, archived and trashed ones too: after a change of its settings. */
    fun settleAll(ownerId: Int) {
        val owned = notes.listOwnedBy(ownerId)
        settle(ownerId, owned, shares.listForNotes(owned.map { it.id }), users.linkPreviewsOffAmong(listOf(ownerId)))
    }

    /** Opens every note of the account back into the clear, while its key is still there to do it. */
    fun unsealAll(ownerId: Int) {
        notes.listOwnedBy(ownerId).filter { it.sealed }.forEach { notes.setSealed(it.id, false) }
    }

    /**
     * Before the note gets its first collaborator: they read it without the owner's key. A sealed note
     * is shared with nobody, so the request sharing it is its owner's, and the key is unlocked.
     */
    fun beforeSharing(noteId: Int) {
        notes.setSealed(noteId, false)
    }

    /** After a share went: sealed again if that was the last one and the owner's key is at hand. */
    fun afterUnsharing(noteId: Int) {
        val note = notes.find(noteId) ?: return
        settle(note.ownerId, listOf(note), shares.listForNotes(listOf(noteId)), users.linkPreviewsOffAmong(listOf(note.ownerId)))
    }

    private fun hasLinks(document: NoteDocument): Boolean = linkPreviews.extract(document).isNotEmpty()
}
