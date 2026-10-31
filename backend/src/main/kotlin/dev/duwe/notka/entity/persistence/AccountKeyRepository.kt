package dev.duwe.notka.entity.persistence

import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

/**
 * What may unlock an account's key. A sign-in with a password unlocks it with [PASSWORD]; an account
 * from the identity provider has no password and wraps it with a [PASSPHRASE] of its own, entered on
 * each device; the recovery key, shown once, is what a forgotten secret leaves.
 */
enum class KeyWrapKind { PASSWORD, PASSPHRASE, RECOVERY }

/** The account's key sealed by one secret; [salt] is what the secret's own key was derived with. */
data class KeyWrap(val kind: KeyWrapKind, val salt: String?, val wrapped: String)

/** Wrapped account keys and the copies each session holds (`docs/ENCRYPTION.md`). Never a key in the clear. */
class AccountKeyRepository(private val database: Database) {
    fun wraps(userId: Int): Map<KeyWrapKind, KeyWrap> = transaction(database) {
        AccountKeyWraps.selectAll().where { AccountKeyWraps.userId eq userId }
            .map { KeyWrap(KeyWrapKind.valueOf(it[AccountKeyWraps.kind]), it[AccountKeyWraps.salt], it[AccountKeyWraps.wrapped]) }
            .associateBy { it.kind }
    }

    /** Whether the account encrypts its notes: it has a key, under whatever wraps it. */
    fun hasKey(userId: Int): Boolean = transaction(database) {
        AccountKeyWraps.selectAll().where { AccountKeyWraps.userId eq userId }.limit(1).any()
    }

    fun putWrap(userId: Int, wrap: KeyWrap, createdAt: Long) {
        transaction(database) {
            AccountKeyWraps.replace {
                it[AccountKeyWraps.userId] = userId
                it[kind] = wrap.kind.name
                it[salt] = wrap.salt
                it[wrapped] = wrap.wrapped
                it[AccountKeyWraps.createdAt] = createdAt
            }
        }
    }

    /** Forgets the account's key and every session's copy of it. */
    fun deleteAll(userId: Int) {
        transaction(database) {
            AccountKeyWraps.deleteWhere { AccountKeyWraps.userId eq userId }
            SessionKeys.deleteWhere {
                SessionKeys.token inSubQuery Sessions.select(Sessions.token).where { Sessions.userId eq userId }
            }
        }
    }

    /** The key as the session keyed by [tokenHash] holds it, or `null` when it holds none. */
    fun sessionKey(tokenHash: String): String? = transaction(database) {
        SessionKeys.select(SessionKeys.wrapped).where { SessionKeys.token eq tokenHash }.singleOrNull()?.get(SessionKeys.wrapped)
    }

    fun putSessionKey(tokenHash: String, wrapped: String) {
        transaction(database) {
            SessionKeys.replace {
                it[token] = tokenHash
                it[SessionKeys.wrapped] = wrapped
            }
        }
    }
}
