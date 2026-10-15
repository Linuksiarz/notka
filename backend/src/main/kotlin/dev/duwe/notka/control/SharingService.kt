package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.Permission
import dev.duwe.notka.entity.model.Validation
import dev.duwe.notka.entity.persistence.ShareRepository
import dev.duwe.notka.entity.persistence.UserRepository

/** Sharing is owner-only; the permission model is `VIEW` / `EDIT`. */
class SharingService(
    private val access: NoteAccessChecker,
    private val shares: ShareRepository,
    private val users: UserRepository,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun list(userId: Int, noteId: Int): List<ShareWithUser> {
        access.requireOwner(userId, noteId)
        return sharesWithUsers(noteId)
    }

    fun add(userId: Int, noteId: Int, email: String, permission: String): ShareWithUser {
        val note = access.requireOwner(userId, noteId)
        val requestedPermission = Validation.permission(permission)
        val normalizedEmail = Validation.email(email)
        val target = users.findByEmail(normalizedEmail) ?: throw DomainException.notFound(
            ErrorKeys.SHARE_RECIPIENT_NOT_FOUND,
            "No account with that email",
            mapOf("email" to normalizedEmail),
        )
        if (target.id == note.ownerId) {
            throw DomainException.validation(
                ErrorKeys.SHARE_CANNOT_SHARE_WITH_SELF,
                "You cannot share a note with yourself",
                mapOf("email" to normalizedEmail),
            )
        }
        if (shares.find(noteId, target.id) != null) {
            throw DomainException.conflict(
                ErrorKeys.SHARE_ALREADY_SHARED,
                "Note $noteId is already shared with $normalizedEmail",
                mapOf("email" to normalizedEmail),
            )
        }
        shares.insert(noteId, target.id, requestedPermission, clock())
        return ShareWithUser(target.toSummary(), requestedPermission.name)
    }

    fun update(userId: Int, noteId: Int, targetUserId: Int, permission: String): ShareWithUser {
        access.requireOwner(userId, noteId)
        val requestedPermission = Validation.permission(permission)
        val existing = shares.find(noteId, targetUserId) ?: throw shareNotFound(noteId, targetUserId)
        shares.updatePermission(noteId, targetUserId, requestedPermission)
        val target = users.findById(existing.userId) ?: throw shareNotFound(noteId, targetUserId)
        return ShareWithUser(target.toSummary(), requestedPermission.name)
    }

    /** Removing a share only removes access; appearance belongs to the note and stays. */
    fun remove(userId: Int, noteId: Int, targetUserId: Int) {
        access.requireOwner(userId, noteId)
        val existing = shares.find(noteId, targetUserId) ?: throw shareNotFound(noteId, targetUserId)
        shares.delete(noteId, existing.userId)
    }

    private fun shareNotFound(noteId: Int, targetUserId: Int) = DomainException.notFound(
        ErrorKeys.SHARE_NOT_FOUND,
        "Note $noteId is not shared with user $targetUserId",
        mapOf("noteId" to noteId.toString(), "userId" to targetUserId.toString()),
    )

    private fun sharesWithUsers(noteId: Int): List<ShareWithUser> {
        val noteShares = shares.listForNote(noteId)
        val accounts = users.findSummaries(noteShares.map { it.userId })
        return noteShares.mapNotNull { share ->
            accounts[share.userId]?.let { ShareWithUser(it, share.permission.name) }
        }
    }
}
