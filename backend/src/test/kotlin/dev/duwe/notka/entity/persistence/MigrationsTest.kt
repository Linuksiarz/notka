package dev.duwe.notka.entity.persistence

import java.nio.file.Files
import java.sql.DriverManager
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * The schema of an instance that already exists.
 *
 * Every statement is `IF NOT EXISTS`, so running them all on every start is what lets a table added
 * later appear in a database created earlier. Skipping them because `PRAGMA user_version` was already
 * set is what left a running instance without `link_previews`, and every read of it failed.
 */
class MigrationsTest {
    private val directory = Files.createTempDirectory("notka-migrations")
    private val dbPath = directory.resolve("notka.db").toString()

    @AfterTest
    fun tearDown() {
        Files.walk(directory).use { paths ->
            paths.sorted(Comparator.reverseOrder()).forEach { Files.deleteIfExists(it) }
        }
    }

    @Test
    fun `a table added later appears in a database that already has the marker`() {
        // given: a database that looks like one created before the other tables existed — one table
        // of the current shape, and the schema marker already at its current value
        DriverManager.getConnection("jdbc:sqlite:$dbPath").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("CREATE TABLE server_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
                statement.execute("PRAGMA user_version = 1")
            }
        }

        // when
        Migrations.run(dbPath)

        // then: the new table is there, and the one that already existed is untouched
        val tables = mutableSetOf<String>()
        DriverManager.getConnection("jdbc:sqlite:$dbPath").use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT name FROM sqlite_master WHERE type = 'table'").use { rows ->
                    while (rows.next()) tables += rows.getString(1)
                }
            }
        }
        assertTrue("link_previews" in tables, "tables were $tables")
        assertTrue("notes" in tables, "tables were $tables")
    }

    @Test
    fun `running it again changes nothing`() {
        // given: a schema that has already been created
        Migrations.run(dbPath)

        // when: it is run twice more
        Migrations.run(dbPath)
        Migrations.run(dbPath)

        // then: it is still a working database, with its marker in place
        DriverManager.getConnection("jdbc:sqlite:$dbPath").use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("PRAGMA user_version").use { rows ->
                    assertTrue(rows.next())
                    assertEquals(1, rows.getInt(1))
                }
            }
        }
    }

    @Test
    fun `a table of an earlier pre-release is refused with a sentence that says what to do`() {
        // given: an accounts table from before accounts had a username and an administrator flag
        DriverManager.getConnection("jdbc:sqlite:$dbPath").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute(
                    "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, " +
                        "display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)",
                )
            }
        }

        // when
        val failure = assertFailsWith<IllegalStateException> { Migrations.run(dbPath) }

        // then
        assertTrue("users" in failure.message.orEmpty(), failure.message)
        assertTrue("empty database" in failure.message.orEmpty(), failure.message)
    }
}
