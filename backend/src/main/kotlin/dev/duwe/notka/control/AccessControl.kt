package dev.duwe.notka.control

import dev.duwe.notka.entity.model.Access
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.Note
import dev.duwe.notka.entity.model.NoteShare
import dev.duwe.notka.entity.persistence.NoteRepository
import dev.duwe.notka.entity.persistence.ShareRepository

data class VisibleNote(val note: Note, val access: Access)

/**
 * Every note facing use case goes through this: a `noteId` coming from the client is re-checked
 * against the owner and the share table before anything else happens.
 */
class NoteAccessChecker(
    private val notes: NoteRepository,
    private val shares: ShareRepository,
) {
    /** Who [userId] is to [note], from the note's shares already read — for a batch of notes read at once. */
    fun accessFor(userId: Int, note: Note, noteShares: List<NoteShare>): Access? = when {
        note.ownerId == userId -> Access.OWNER
        else -> noteShares.find { it.userId == userId }?.let { Access.from(it.permission) }
    }

    /**
     * Owner or any collaborator; everyone else gets `NOT_FOUND` so note ids stay unguessable. Access is
     * decided before the note is read: a sealed note opens only with its owner's key.
     */
    fun requireVisible(userId: Int, noteId: Int): VisibleNote {
        val ownerId = notes.ownerOf(noteId) ?: throw notFound(noteId)
        val access = if (ownerId == userId) {
            Access.OWNER
        } else {
            shares.find(noteId, userId)?.let { Access.from(it.permission) } ?: throw notFound(noteId)
        }
        return VisibleNote(notes.find(noteId) ?: throw notFound(noteId), access)
    }

    /** `FORBIDDEN` for a `VIEW` collaborator, `NOT_FOUND` for a stranger. */
    fun requireEditable(userId: Int, noteId: Int): VisibleNote {
        val visible = requireVisible(userId, noteId)
        if (!visible.access.canEdit) {
            throw DomainException.forbidden(
                ErrorKeys.NOTE_FORBIDDEN,
                "You do not have edit access to note $noteId",
                mapOf("noteId" to noteId.toString()),
            )
        }
        return visible
    }

    /** Owner only; `FORBIDDEN` for collaborators, `NOT_FOUND` for strangers. */
    fun requireOwner(userId: Int, noteId: Int): Note {
        val ownerId = notes.ownerOf(noteId) ?: throw notFound(noteId)
        if (ownerId == userId) return notes.find(noteId) ?: throw notFound(noteId)
        if (shares.find(noteId, userId) != null) {
            throw DomainException.forbidden(
                ErrorKeys.SHARE_NOT_OWNER,
                "Only the owner of note $noteId may do this",
                mapOf("noteId" to noteId.toString()),
            )
        }
        throw notFound(noteId)
    }

    private fun notFound(noteId: Int) = DomainException.notFound(
        ErrorKeys.NOTE_NOT_FOUND,
        "Note $noteId does not exist",
        mapOf("noteId" to noteId.toString()),
    )
}
