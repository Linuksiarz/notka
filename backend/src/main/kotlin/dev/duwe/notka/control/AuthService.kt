package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.User
import dev.duwe.notka.entity.model.UserSummary
import dev.duwe.notka.entity.model.Validation
import dev.duwe.notka.entity.persistence.PasswordResetRepository
import dev.duwe.notka.entity.persistence.SessionRepository
import dev.duwe.notka.entity.persistence.UserRepository
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** How long the link in a password-reset e-mail works. */
const val PASSWORD_RESET_TTL_MILLIS: Long = 24L * 60L * 60L * 1000L

data class AuthResult(val user: UserSummary, val token: String)

/** Register, login, logout, session lookup, profile updates and password resets. */
class AuthService(
    private val users: UserRepository,
    private val sessions: SessionRepository,
    private val resets: PasswordResetRepository,
    private val sessionTtlMillis: Long,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    companion object {
        private const val TOKEN_BYTES = 32

        private val random = SecureRandom()

        /** 256 bits of URL-safe randomness; this value is the cookie content. */
        fun newToken(): String = ByteArray(TOKEN_BYTES)
            .also(random::nextBytes)
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

        /**
         * What the database keeps instead of the cookie: a copy of the database must not be a set of
         * working logins. The token is 256 random bits, so a plain SHA-256 is enough — there is
         * nothing to guess that a slow hash would protect.
         */
        fun hashToken(token: String): String = MessageDigest.getInstance("SHA-256")
            .digest(token.toByteArray(Charsets.UTF_8))
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

        /**
         * Verified against when the address belongs to nobody, so an unknown account takes as long
         * to refuse as a wrong password and the response time does not reveal who has an account.
         */
        private val UNKNOWN_ACCOUNT_HASH: String by lazy { PasswordHasher.hash(newToken()) }
    }

    /** True once somebody has registered. Used by [DemoData] so a restart never seeds twice. */
    fun hasUsers(): Boolean = users.count() > 0

    /** True once the instance has its administrator; until then it is created from the environment. */
    fun hasAdmin(): Boolean = users.hasAdmin()

    /** A self-service sign-up, or a demo account; [admin] is only ever set by the demo seeder. */
    fun register(email: String, displayName: String, password: String, admin: Boolean = false): AuthResult {
        val normalizedEmail = Validation.email(email)
        val name = Validation.displayName(displayName)
        val secret = Validation.password(password)
        requireFreeEmail(normalizedEmail)
        val user = users.insert(normalizedEmail, null, name, PasswordHasher.hash(secret), clock(), admin)
        return AuthResult(user.toSummary(), startSession(user.id))
    }

    /**
     * The administrator of a new instance, from the environment. It signs in with [username]; an
     * [email] is optional and only needed to be shared with or sent a reset.
     */
    fun createAdmin(username: String, password: String, email: String?): UserSummary {
        val login = Validation.username(username)
        val secret = Validation.password(password)
        val address = email?.let(Validation::email)
        if (users.findByUsername(login) != null) {
            throw DomainException.conflict(ErrorKeys.AUTH_USERNAME_INVALID, "Username $login is taken")
        }
        address?.let(::requireFreeEmail)
        return users.insert(address, login, login, PasswordHasher.hash(secret), clock(), admin = true).toSummary()
    }

    /**
     * Signs in with an e-mail address or a username — whichever [login] looks like. Never reveals
     * which part was wrong: an unknown account, a malformed login and a wrong password all fail the
     * same way.
     */
    fun login(login: String, password: String): AuthResult {
        val user = findByLogin(login)
        val verified = PasswordHasher.verify(password, user?.passwordHash ?: UNKNOWN_ACCOUNT_HASH)
        if (user == null || !verified) {
            throw DomainException.unauthorized(ErrorKeys.AUTH_INVALID_CREDENTIALS, "Invalid login or password")
        }
        return AuthResult(user.toSummary(), startSession(user.id))
    }

    /** Idempotent. */
    fun logout(token: String?) {
        if (!token.isNullOrEmpty()) sessions.delete(hashToken(token))
    }

    /** Signs the account out on every device, the one asking included. */
    fun logoutEverywhere(userId: Int) {
        sessions.deleteAllForUserExcept(userId, keepToken = null)
    }

    /**
     * Forgets sessions and reset links nobody used within their lifetime. They are refused anyway;
     * this only keeps them from piling up. Returns how many sessions were removed.
     */
    fun purgeExpiredSessions(now: Long = clock()): Int {
        resets.deleteExpired(now)
        return sessions.deleteExpired(now)
    }

    /** Validates the session and slides its expiry; every authenticated request goes through here. */
    fun authenticate(token: String?): UserSummary {
        if (token.isNullOrEmpty()) throw DomainException.unauthorized()
        val now = clock()
        val tokenHash = hashToken(token)
        val session = sessions.findByToken(tokenHash)
            ?: throw DomainException.unauthorized(message = "Invalid session")
        if (session.expiresAt <= now) {
            sessions.delete(tokenHash)
            throw DomainException.unauthorized(message = "Session expired")
        }
        val user = users.findById(session.userId)
            ?: throw DomainException.unauthorized(message = "Invalid session")
        sessions.touch(tokenHash, now + sessionTtlMillis, now)
        return user.toSummary()
    }

    /**
     * A new password also signs out every other device: whoever knew the old one may still hold a
     * session, and changing it is exactly when the owner wants them out. [currentToken] — the session
     * making the change — stays signed in.
     */
    fun updateProfile(
        userId: Int,
        currentToken: String?,
        displayName: String?,
        currentPassword: String?,
        newPassword: String?,
    ): UserSummary {
        if (displayName == null && newPassword == null) {
            throw DomainException.validation(
                ErrorKeys.REQUEST_INVALID_BODY,
                "Provide a display name or a new password",
            )
        }
        val user = users.findById(userId) ?: throw DomainException.unauthorized()
        displayName?.let { users.updateDisplayName(userId, Validation.displayName(it)) }
        if (newPassword != null) {
            val secret = Validation.password(newPassword)
            if (currentPassword.isNullOrEmpty() || !PasswordHasher.verify(currentPassword, user.passwordHash)) {
                throw DomainException.validation(
                    ErrorKeys.AUTH_INVALID_CURRENT_PASSWORD,
                    "Current password is incorrect",
                )
            }
            users.updatePasswordHash(userId, PasswordHasher.hash(secret))
            sessions.deleteAllForUserExcept(userId, currentToken?.let(::hashToken))
        }
        return checkNotNull(users.findById(userId)) { "User $userId disappeared" }.toSummary()
    }

    /**
     * A one-time token that lets the account choose a new password, valid for a day. Only its hash
     * is stored; the token itself goes into the e-mail and nowhere else. Issuing a new one voids the
     * one before.
     */
    fun issuePasswordReset(userId: Int): String {
        val token = newToken()
        val now = clock()
        resets.replace(hashToken(token), userId, now, now + PASSWORD_RESET_TTL_MILLIS)
        return token
    }

    /** Takes back a reset whose e-mail could not be sent. */
    fun cancelPasswordReset(userId: Int) {
        resets.deleteForUser(userId)
    }

    /**
     * The other half of an administrator's reset, once the e-mail is on its way: the old password
     * stops working and every device is signed out, so whoever the reset was meant to keep out is out.
     */
    fun lockOut(userId: Int) {
        users.updatePasswordHash(userId, PasswordHasher.hash(newToken()))
        sessions.deleteAllForUserExcept(userId, keepToken = null)
    }

    /** Sets the password a reset link was sent for, voids the link and signs the account in. */
    fun completePasswordReset(token: String, newPassword: String): AuthResult {
        val secret = Validation.password(newPassword)
        val reset = resets.find(hashToken(token))?.takeIf { it.expiresAt > clock() }
            ?: throw DomainException.validation(ErrorKeys.AUTH_RESET_INVALID, "The reset link is invalid or has expired")
        users.updatePasswordHash(reset.userId, PasswordHasher.hash(secret))
        resets.deleteForUser(reset.userId)
        sessions.deleteAllForUserExcept(reset.userId, keepToken = null)
        val user = checkNotNull(users.findById(reset.userId)) { "User ${reset.userId} disappeared" }
        return AuthResult(user.toSummary(), startSession(user.id))
    }

    private fun findByLogin(login: String): User? {
        val trimmed = login.trim()
        return if ('@' in trimmed) {
            Validation.normalizedEmailOrNull(trimmed)?.let(users::findByEmail)
        } else {
            trimmed.takeIf { it.isNotEmpty() }?.let(users::findByUsername)
        }
    }

    private fun requireFreeEmail(email: String) {
        if (users.findByEmail(email) != null) {
            throw DomainException.conflict(
                ErrorKeys.AUTH_EMAIL_TAKEN,
                "Email $email is already registered",
                mapOf("email" to email),
            )
        }
    }

    private fun startSession(userId: Int): String {
        val token = newToken()
        val now = clock()
        sessions.insert(hashToken(token), userId, now, now + sessionTtlMillis)
        return token
    }
}
