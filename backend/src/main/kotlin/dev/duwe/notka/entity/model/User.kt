package dev.duwe.notka.entity.model

/**
 * A registered account. The password hash never leaves the entity layer's storage boundary.
 *
 * An account signs in with its [email] or, for the administrator created from the environment,
 * with its [username]; at least one of the two is always there. Only an account with an address can
 * be shared with or sent a password reset.
 */
data class User(
    val id: Int,
    val email: String?,
    val username: String?,
    val displayName: String,
    val passwordHash: String,
    val admin: Boolean,
    /** The background theme this account picked; `null` follows the server's default. */
    val backgroundTheme: String?,
    val createdAt: Long,
) {
    fun toSummary(): UserSummary = UserSummary(id, email, username, displayName, admin)
}

/** Public view of an account: everything except the password hash and the account's own preferences. */
data class UserSummary(
    val id: Int,
    val email: String?,
    val username: String?,
    val displayName: String,
    val admin: Boolean = false,
)

data class Session(
    val token: String,
    val userId: Int,
    val createdAt: Long,
    val expiresAt: Long,
    val lastSeenAt: Long,
)

/** What one account's data takes up, for the administrator's overview. Sizes are in bytes. */
data class AccountUsage(
    val user: UserSummary,
    val createdAt: Long,
    /** The last time any of the account's sessions was used; `null` when it has none. */
    val lastSeenAt: Long?,
    val notes: Long,
    /** Titles and documents of the notes the account owns, trash included. */
    val noteBytes: Long,
    /** The version history of those notes. */
    val historyBytes: Long,
    /** Their pictures. */
    val imageBytes: Long,
) {
    val totalBytes: Long get() = noteBytes + historyBytes + imageBytes
}
