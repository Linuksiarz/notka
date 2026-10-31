package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.User
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

/**
 * Which account an identity provider's subject is. The provider's `iss` and `sub` are the whole key:
 * an e-mail address can be changed or given to somebody else, and is never what links an account.
 */
class SsoIdentityRepository(private val database: Database) {
    fun findUserId(issuer: String, subject: String): Int? = transaction(database) {
        SsoIdentities.select(SsoIdentities.userId)
            .where { (SsoIdentities.issuer eq issuer) and (SsoIdentities.subject eq subject) }
            .singleOrNull()?.get(SsoIdentities.userId)
    }

    fun isLinked(userId: Int): Boolean = transaction(database) {
        SsoIdentities.selectAll().where { SsoIdentities.userId eq userId }.limit(1).any()
    }

    fun link(issuer: String, subject: String, userId: Int, createdAt: Long) {
        transaction(database) {
            SsoIdentities.insert {
                it[SsoIdentities.issuer] = issuer
                it[SsoIdentities.subject] = subject
                it[SsoIdentities.userId] = userId
                it[SsoIdentities.createdAt] = createdAt
            }
        }
    }

    /** A new account and its identity in one transaction: neither exists without the other. */
    fun createAccount(issuer: String, subject: String, email: String, displayName: String, createdAt: Long): Int =
        transaction(database) {
            val id = Users.insert {
                it[Users.email] = email
                it[Users.username] = null
                it[Users.displayName] = displayName
                it[Users.passwordHash] = User.NO_PASSWORD
                it[Users.admin] = false
                it[Users.createdAt] = createdAt
            } get Users.id
            link(issuer, subject, id, createdAt)
            id
        }

    fun unlink(userId: Int) {
        transaction(database) {
            SsoIdentities.deleteWhere { SsoIdentities.userId eq userId }
        }
    }
}
