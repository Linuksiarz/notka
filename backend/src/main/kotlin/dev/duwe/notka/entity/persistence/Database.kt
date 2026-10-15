package dev.duwe.notka.entity.persistence

import org.jetbrains.exposed.sql.Database
import java.io.File

/**
 * Opens the SQLite file documented in `docs/DATA-MODEL.md`: WAL journaling plus a busy timeout so
 * Ktor worker threads can read while a write is in flight, and foreign keys on so the
 * `ON DELETE CASCADE` rules of the schema actually fire.
 */
object Databases {
    fun connect(dbPath: String): Database {
        val file = File(dbPath).absoluteFile
        file.parentFile?.mkdirs()
        return Database.connect(url = jdbcUrl(file.path), driver = "org.sqlite.JDBC")
    }

    private fun jdbcUrl(path: String): String =
        "jdbc:sqlite:$path?journal_mode=WAL&busy_timeout=5000&foreign_keys=on&synchronous=NORMAL"
}
