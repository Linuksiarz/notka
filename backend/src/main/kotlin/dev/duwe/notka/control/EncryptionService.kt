package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.persistence.SessionRepository
import dev.duwe.notka.entity.persistence.UserRepository

/** The account's own choices about what the server may read; only the account itself is told them. */
data class AccountSettings(val encryption: Boolean, val linkPreviews: Boolean)

/**
 * Turning encryption on and off, and link previews, for one account (`docs/ENCRYPTION.md`). Every
 * change is followed by [NoteSealing.settleAll], so the account's notes are stored the way the new
 * settings say before the answer goes out.
 */
class EncryptionService(
    private val users: UserRepository,
    private val sessions: SessionRepository,
    private val accountKeys: AccountKeys,
    private val sealing: NoteSealing,
    private val notes: NoteService,
) {
    fun settings(userId: Int): AccountSettings = AccountSettings(accountKeys.enabled(userId), users.linkPreviews(userId))

    /**
     * Encrypts the account's private notes from now on. The [password] is asked for again because it
     * is what the key is wrapped with. The other devices are signed out: their sessions hold no copy
     * of the key, and signing in again gives them one.
     *
     * @return the recovery key, shown once and never stored.
     */
    fun enable(userId: Int, password: String, token: String): String {
        val user = users.findById(userId) ?: throw DomainException.unauthorized()
        if (!PasswordHasher.verify(password, user.passwordHash)) {
            throw DomainException.validation(ErrorKeys.AUTH_INVALID_CURRENT_PASSWORD, "Current password is incorrect")
        }
        if (accountKeys.enabled(userId)) {
            throw DomainException.conflict(ErrorKeys.AUTH_ENCRYPTION_ALREADY_ON, "The account already encrypts its notes")
        }
        val recoveryKey = accountKeys.create(userId, password, token)
        sessions.deleteAllForUserExcept(userId, AuthService.hashToken(token))
        sealing.settleAll(userId)
        return recoveryKey
    }

    /** Stores every note of the account in the clear again, then forgets the key. */
    fun disable(userId: Int) {
        if (!accountKeys.enabled(userId)) return
        sealing.unsealAll(userId)
        accountKeys.destroy(userId)
    }

    /**
     * Switched off, the server never reads a note's links, so a note with links can be encrypted too;
     * switched back on, those notes are stored in the clear again and their cards are fetched.
     */
    fun setLinkPreviews(userId: Int, enabled: Boolean) {
        if (users.linkPreviews(userId) == enabled) return
        users.setLinkPreviews(userId, enabled)
        sealing.settleAll(userId)
        if (enabled) notes.refreshLinkPreviews(userId)
    }
}
