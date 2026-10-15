package dev.duwe.notka.entity.persistence

import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.upsert

/** The `server_settings` key/value table. A key that was never written reads as `null`. */
class ServerSettingsRepository(private val database: Database) {
    fun get(key: String): String? = transaction(database) {
        ServerSettings.selectAll().where { ServerSettings.key eq key }.singleOrNull()?.get(ServerSettings.value)
    }

    /** Writes [value], or forgets the key when it is `null`. */
    fun set(key: String, value: String?) {
        transaction(database) {
            if (value == null) {
                ServerSettings.deleteWhere { ServerSettings.key eq key }
            } else {
                ServerSettings.upsert {
                    it[ServerSettings.key] = key
                    it[ServerSettings.value] = value
                }
            }
        }
    }
}
