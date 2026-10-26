package dev.duwe.notka.entity.persistence

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jetbrains.exposed.v1.jdbc.*
import java.io.File

/** Connections kept open: one writer at a time in SQLite, and WAL lets the others read meanwhile. */
private const val POOL_SIZE = 8

/** The database and the pool behind it; closing it closes every connection. */
class PooledDatabase(val database: Database, private val pool: HikariDataSource) : AutoCloseable {
    override fun close() = pool.close()
}

/**
 * Opens the SQLite file documented in `docs/DATA-MODEL.md`: WAL journaling plus a busy timeout so
 * Ktor worker threads can read while a write is in flight, and foreign keys on so the
 * `ON DELETE CASCADE` rules of the schema actually fire.
 *
 * The connections are pooled (HikariCP). Without a pool Exposed opened the file anew for every
 * transaction — and every repository call is one — which was most of what a request cost.
 */
object Databases {
    fun connect(dbPath: String): PooledDatabase {
        val file = File(dbPath).absoluteFile
        file.parentFile?.mkdirs()
        val pool = HikariDataSource(
            HikariConfig().apply {
                jdbcUrl = jdbcUrl(file.path)
                driverClassName = "org.sqlite.JDBC"
                maximumPoolSize = POOL_SIZE
                poolName = "notka"
            },
        )
        return PooledDatabase(Database.connect(pool), pool)
    }

    private fun jdbcUrl(path: String): String =
        "jdbc:sqlite:$path?journal_mode=WAL&busy_timeout=5000&foreign_keys=on&synchronous=NORMAL"
}
