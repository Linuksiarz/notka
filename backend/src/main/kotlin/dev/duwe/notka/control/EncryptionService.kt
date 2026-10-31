package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.User
import dev.duwe.notka.entity.model.Validation
import dev.duwe.notka.entity.persistence.KeyWrapKind
import dev.duwe.notka.entity.persistence.SessionRepository
import dev.duwe.notka.entity.persistence.SsoIdentityRepository
import dev.duwe.notka.entity.persistence.UserRepository

/** The account's own choices about what the server may read; only the account itself is told them. */
data class AccountSettings(
    val encryption: Boolean,
    val linkPreviews: Boolean,
    /** The session asking holds no copy of the key: it has to enter the account's secret first. */
    val locked: Boolean,
    val hasPassword: Boolean,
    val ssoLinked: Boolean,
)

/**
 * Turning encryption on and off, and link previews, for one account (`docs/ENCRYPTION.md`). Every
 * change is followed by [NoteSealing.settleAll], so the account's notes are stored the way the new
 * settings say before the answer goes out.
 */
class EncryptionService(
    private val users: UserRepository,
    private val identities: SsoIdentityRepository,
    private val sessions: SessionRepository,
    private val accountKeys: AccountKeys,
    private val sealing: NoteSealing,
    private val notes: NoteService,
) {
    /** [token] is the session asking; left out where only an unlocked session can have got this far. */
    fun settings(userId: Int, token: String? = null): AccountSettings = AccountSettings(
        encryption = accountKeys.enabled(userId),
        linkPreviews = users.linkPreviews(userId),
        locked = token != null && !accountKeys.unlockSession(userId, token),
        hasPassword = account(userId).hasPassword,
        ssoLinked = identities.isLinked(userId),
    )

    /**
     * Encrypts the account's private notes from now on. An account with a password gives it again,
     * because it is what the key is wrapped with; one without chooses a [passphrase]. The other devices
     * are signed out: their sessions hold no copy of the key.
     *
     * @return the recovery key, shown once and never stored.
     */
    fun enable(userId: Int, password: String?, passphrase: String?, token: String): String {
        val user = account(userId)
        val (kind, secret) = if (user.hasPassword) {
            if (password == null || !PasswordHasher.verify(password, user.passwordHash)) {
                throw DomainException.validation(ErrorKeys.AUTH_INVALID_CURRENT_PASSWORD, "Current password is incorrect")
            }
            KeyWrapKind.PASSWORD to password
        } else {
            KeyWrapKind.PASSPHRASE to Validation.passphrase(passphrase.orEmpty())
        }
        if (accountKeys.enabled(userId)) {
            throw DomainException.conflict(ErrorKeys.AUTH_ENCRYPTION_ALREADY_ON, "The account already encrypts its notes")
        }
        val recoveryKey = accountKeys.create(userId, kind, secret, token)
        sessions.deleteAllForUserExcept(userId, AuthService.hashToken(token))
        sealing.settleAll(userId)
        return recoveryKey
    }

    /** This device enters the account's passphrase, or its password when it has one. */
    fun unlock(userId: Int, secret: String, token: String) {
        if (!accountKeys.unlockWithSecret(userId, secret, token)) {
            throw DomainException.validation(ErrorKeys.AUTH_ENCRYPTION_SECRET_INVALID, "That does not open this account's notes")
        }
    }

    /**
     * The secret is forgotten and the recovery key is at hand. An account without a password chooses a
     * new passphrase, and its other devices are signed out, as they are by a new password; an account
     * with one keeps it, and the administrator's reset is what changes that.
     */
    fun recover(userId: Int, recoveryKey: String, newPassphrase: String?, token: String) {
        val user = account(userId)
        val passphrase = if (user.hasPassword) null else Validation.passphrase(newPassphrase.orEmpty())
        val key = accountKeys.openWithRecoveryKey(userId, recoveryKey)
            ?: throw DomainException.validation(ErrorKeys.AUTH_RECOVERY_KEY_INVALID, "The recovery key does not match")
        if (passphrase == null) {
            accountKeys.adoptIntoSession(userId, key, token)
        } else {
            accountKeys.adoptPassphrase(userId, key, passphrase, token)
            sessions.deleteAllForUserExcept(userId, AuthService.hashToken(token))
        }
    }

    /**
     * Neither the passphrase nor the recovery key is left: the sealed notes can never be opened again,
     * so they go, and the account starts without encryption. An account with a password has the
     * administrator's reset for this, which is not in the hands of whoever holds the provider's sign-in.
     */
    fun discard(userId: Int, token: String) {
        if (account(userId).hasPassword || accountKeys.unlockSession(userId, token)) {
            throw DomainException.forbidden(ErrorKeys.AUTH_ENCRYPTION_LOCKED, "Only a locked account without a password can give up its notes")
        }
        accountKeys.discard(userId)
    }

    /** The same key under a new passphrase; every other device is signed out, as by a new password. */
    fun changePassphrase(userId: Int, current: String, new: String, token: String) {
        val passphrase = Validation.passphrase(new)
        if (!accountKeys.passphraseMatches(userId, current)) {
            throw DomainException.validation(ErrorKeys.AUTH_ENCRYPTION_SECRET_INVALID, "That is not the current passphrase")
        }
        accountKeys.rewrapPassphrase(userId, passphrase)
        sessions.deleteAllForUserExcept(userId, AuthService.hashToken(token))
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

    private fun account(userId: Int): User = users.findById(userId) ?: throw DomainException.unauthorized()
}
