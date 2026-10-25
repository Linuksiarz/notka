package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.AccountUsage
import dev.duwe.notka.entity.model.Session
import dev.duwe.notka.entity.model.User
import dev.duwe.notka.entity.model.UserSummary
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.SqlExpressionBuilder.lessEq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.neq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class UserRepository(private val database: Database) {
    /** Every read of an account carries when its picture changed, so a summary can point at the right copy. */
    private val withAvatar = Users.join(UserAvatars, JoinType.LEFT, Users.id, UserAvatars.userId)

    fun insert(
        email: String?,
        username: String?,
        displayName: String,
        passwordHash: String,
        createdAt: Long,
        admin: Boolean = false,
    ): User {
        val id = transaction(database) {
            Users.insert {
                it[Users.email] = email
                it[Users.username] = username
                it[Users.displayName] = displayName
                it[Users.passwordHash] = passwordHash
                it[Users.admin] = admin
                it[Users.createdAt] = createdAt
            } get Users.id
        }
        return checkNotNull(findById(id)) { "Inserted user $id disappeared" }
    }

    /** How many accounts exist; the demo seeder fills an empty instance and only an empty one. */
    fun count(): Long = transaction(database) { Users.selectAll().count() }

    fun hasAdmin(): Boolean = transaction(database) {
        Users.selectAll().where { Users.admin eq true }.limit(1).any()
    }

    fun findById(id: Int): User? = transaction(database) {
        withAvatar.selectAll().where { Users.id eq id }.singleOrNull()?.toUser()
    }

    fun findByEmail(email: String): User? = transaction(database) {
        withAvatar.selectAll().where { Users.email eq email }.singleOrNull()?.toUser()
    }

    /** Usernames compare without case, as the column does. */
    fun findByUsername(username: String): User? = transaction(database) {
        withAvatar.selectAll().where { Users.username.lowerCase() eq username.lowercase() }.singleOrNull()?.toUser()
    }

    fun findSummaries(ids: Collection<Int>): Map<Int, UserSummary> {
        if (ids.isEmpty()) return emptyMap()
        return transaction(database) {
            withAvatar.selectAll().where { Users.id inList ids.distinct() }
                .map { it.toUser().toSummary() }
                .associateBy { it.id }
        }
    }

    fun updateDisplayName(id: Int, displayName: String) {
        transaction(database) {
            Users.update({ Users.id eq id }) { it[Users.displayName] = displayName }
        }
    }

    fun updatePasswordHash(id: Int, passwordHash: String) {
        transaction(database) {
            Users.update({ Users.id eq id }) { it[Users.passwordHash] = passwordHash }
        }
    }

    fun updateBackgroundTheme(id: Int, themeId: String?) {
        transaction(database) {
            Users.update({ Users.id eq id }) { it[Users.backgroundTheme] = themeId }
        }
    }

    /** Everyone who picked [themeId] goes back to the server's default; the theme is going away. */
    fun forgetBackgroundTheme(themeId: String) {
        transaction(database) {
            Users.update({ Users.backgroundTheme eq themeId }) { it[Users.backgroundTheme] = null }
        }
    }

    /** Removes the account; the schema cascades its notes, pictures, labels, shares and sessions with it. */
    fun delete(id: Int): Int = transaction(database) {
        Users.deleteWhere { Users.id eq id }
    }

    /**
     * Every account with what its notes take up. One statement, so the overview costs one pass over
     * the tables however many accounts there are; `length(CAST(… AS BLOB))` counts bytes, not
     * characters.
     */
    fun usage(): List<AccountUsage> = transaction(database) {
        val rows = mutableListOf<AccountUsage>()
        exec(
            """
            SELECT u.id, u.email, u.username, u.display_name, u.is_admin, u.created_at,
                (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen,
                (SELECT a.updated_at FROM user_avatars a WHERE a.user_id = u.id) AS avatar_at,
                (SELECT COUNT(*) FROM notes n WHERE n.owner_id = u.id) AS notes,
                (SELECT COALESCE(SUM(length(CAST(n.title AS BLOB)) + length(CAST(n.content AS BLOB))), 0)
                    FROM notes n WHERE n.owner_id = u.id) AS note_bytes,
                (SELECT COALESCE(SUM(length(CAST(v.title AS BLOB)) + length(CAST(v.content AS BLOB))), 0)
                    FROM note_versions v JOIN notes n ON n.id = v.note_id WHERE n.owner_id = u.id) AS history_bytes,
                (SELECT COALESCE(SUM(i.byte_size), 0)
                    FROM note_images i JOIN notes n ON n.id = i.note_id WHERE n.owner_id = u.id) AS image_bytes
            FROM users u
            ORDER BY u.id
            """.trimIndent(),
        ) { result ->
            while (result.next()) {
                rows += AccountUsage(
                    user = UserSummary(
                        id = result.getInt("id"),
                        email = result.getString("email"),
                        username = result.getString("username"),
                        displayName = result.getString("display_name"),
                        admin = result.getInt("is_admin") != 0,
                        avatarAt = result.getLong("avatar_at").takeUnless { result.wasNull() },
                    ),
                    createdAt = result.getLong("created_at"),
                    lastSeenAt = result.getLong("last_seen").takeUnless { result.wasNull() },
                    notes = result.getLong("notes"),
                    noteBytes = result.getLong("note_bytes"),
                    historyBytes = result.getLong("history_bytes"),
                    imageBytes = result.getLong("image_bytes"),
                )
            }
        }
        rows
    }

    private fun ResultRow.toUser() = User(
        id = this[Users.id],
        email = this[Users.email],
        username = this[Users.username],
        displayName = this[Users.displayName],
        passwordHash = this[Users.passwordHash],
        admin = this[Users.admin],
        backgroundTheme = this[Users.backgroundTheme],
        createdAt = this[Users.createdAt],
        avatarAt = getOrNull(UserAvatars.updatedAt),
    )
}

/** Sessions are keyed by the hash of their cookie, never by the cookie itself (see `AuthService`). */
class SessionRepository(private val database: Database) {
    fun insert(token: String, userId: Int, createdAt: Long, expiresAt: Long) {
        transaction(database) {
            Sessions.insert {
                it[Sessions.token] = token
                it[Sessions.userId] = userId
                it[Sessions.createdAt] = createdAt
                it[Sessions.expiresAt] = expiresAt
                it[Sessions.lastSeenAt] = createdAt
            }
        }
    }

    fun findByToken(token: String): Session? = transaction(database) {
        Sessions.selectAll().where { Sessions.token eq token }.singleOrNull()?.toSession()
    }

    /** Sliding expiry: every authenticated request pushes both timestamps forward. */
    fun touch(token: String, expiresAt: Long, lastSeenAt: Long) {
        transaction(database) {
            Sessions.update({ Sessions.token eq token }) {
                it[Sessions.expiresAt] = expiresAt
                it[Sessions.lastSeenAt] = lastSeenAt
            }
        }
    }

    fun delete(token: String) {
        transaction(database) {
            Sessions.deleteWhere { Op.build { Sessions.token eq token } }
        }
    }

    fun deleteExpired(now: Long): Int = transaction(database) {
        Sessions.deleteWhere { Sessions.expiresAt lessEq now }
    }

    fun deleteAllForUserExcept(userId: Int, keepToken: String?) {
        transaction(database) {
            Sessions.deleteWhere {
                val ofUser = Sessions.userId eq userId
                if (keepToken == null) ofUser else ofUser and (Sessions.token neq keepToken)
            }
        }
    }

    private fun ResultRow.toSession() = Session(
        token = this[Sessions.token],
        userId = this[Sessions.userId],
        createdAt = this[Sessions.createdAt],
        expiresAt = this[Sessions.expiresAt],
        lastSeenAt = this[Sessions.lastSeenAt],
    )
}
