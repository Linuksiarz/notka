package dev.duwe.notka.entity.persistence

import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

/** A reset as stored: whose it is and until when it works. */
data class PasswordReset(val userId: Int, val expiresAt: Long)

/** Like sessions, resets are kept by the hash of their token, never by the token itself. */
class PasswordResetRepository(private val database: Database) {
    /** Replaces whatever reset the account already had: only the newest link works. */
    fun replace(tokenHash: String, userId: Int, createdAt: Long, expiresAt: Long) {
        transaction(database) {
            PasswordResets.deleteWhere { PasswordResets.userId eq userId }
            PasswordResets.insert {
                it[PasswordResets.tokenHash] = tokenHash
                it[PasswordResets.userId] = userId
                it[PasswordResets.createdAt] = createdAt
                it[PasswordResets.expiresAt] = expiresAt
            }
        }
    }

    fun find(tokenHash: String): PasswordReset? = transaction(database) {
        PasswordResets.selectAll().where { PasswordResets.tokenHash eq tokenHash }.singleOrNull()
            ?.let { PasswordReset(it[PasswordResets.userId], it[PasswordResets.expiresAt]) }
    }

    fun deleteForUser(userId: Int) {
        transaction(database) {
            PasswordResets.deleteWhere { PasswordResets.userId eq userId }
        }
    }

    fun deleteExpired(now: Long): Int = transaction(database) {
        PasswordResets.deleteWhere { PasswordResets.expiresAt lessEq now }
    }
}
