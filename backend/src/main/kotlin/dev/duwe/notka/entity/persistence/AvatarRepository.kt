package dev.duwe.notka.entity.persistence

import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.statements.api.ExposedBlob
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.upsert

/** The accounts' own pictures; an account has one or none, and a new one replaces the old. */
class AvatarRepository(private val database: Database) {
    fun put(userId: Int, bytes: ByteArray, updatedAt: Long) {
        transaction(database) {
            UserAvatars.upsert {
                it[UserAvatars.userId] = userId
                it[data] = ExposedBlob(bytes)
                it[byteSize] = bytes.size
                it[UserAvatars.updatedAt] = updatedAt
            }
        }
    }

    fun bytes(userId: Int): ByteArray? = transaction(database) {
        UserAvatars.select(UserAvatars.data)
            .where { UserAvatars.userId eq userId }
            .singleOrNull()
            ?.get(UserAvatars.data)?.bytes
    }

    fun delete(userId: Int): Int = transaction(database) {
        UserAvatars.deleteWhere { UserAvatars.userId eq userId }
    }
}
