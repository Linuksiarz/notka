package dev.duwe.notka.entity.persistence

import java.sql.Connection
import java.sql.DriverManager

/**
 * Creates the schema from `docs/DATA-MODEL.md`.
 *
 * Every statement is `IF NOT EXISTS` and **all of them run on every start**. That is what makes a
 * table added to this list appear in a database that already exists: an early return on
 * `PRAGMA user_version` — which is only a marker telling "schema already created" apart from "empty
 * database file", never a migration framework — left a running instance without `link_previews` and
 * every read of it failed. There is still no migration machinery: a *changed* column is a schema
 * change, and a pre-release database carrying the old one is thrown away.
 */
object Migrations {
    private const val SCHEMA_VERSION = 1

    private val statements = listOf(
        """
        CREATE TABLE IF NOT EXISTS users (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            email            TEXT    UNIQUE,
            username         TEXT    UNIQUE COLLATE NOCASE,
            display_name     TEXT    NOT NULL,
            password_hash    TEXT    NOT NULL,
            is_admin         INTEGER NOT NULL DEFAULT 0,
            background_theme TEXT,
            created_at       INTEGER NOT NULL,
            CHECK (email IS NOT NULL OR username IS NOT NULL)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS user_avatars (
            user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            data       BLOB    NOT NULL,
            byte_size  INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS friends (
            owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (owner_id, friend_id)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS friend_groups (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name       TEXT    NOT NULL,
            created_at INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS friend_group_members (
            group_id INTEGER NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
            user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            added_at INTEGER NOT NULL,
            PRIMARY KEY (group_id, user_id)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token        TEXT    PRIMARY KEY,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at   INTEGER NOT NULL,
            expires_at   INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind       TEXT    NOT NULL,
            title      TEXT    NOT NULL DEFAULT '',
            content    TEXT    NOT NULL,
            archived   INTEGER NOT NULL DEFAULT 0,
            position   INTEGER NOT NULL,
            trashed_at INTEGER,
            color      TEXT    NOT NULL DEFAULT 'default',
            background TEXT,
            reminder_at INTEGER,
            reminder_repeat TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            edited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
            edited_at  INTEGER NOT NULL,
            version    INTEGER NOT NULL DEFAULT 1
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_pins (
            note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            pinned     INTEGER NOT NULL,
            position   INTEGER NOT NULL,
            PRIMARY KEY (note_id, user_id)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_folds (
            note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (note_id, user_id)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_reads (
            note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            seen_at    INTEGER NOT NULL,
            PRIMARY KEY (note_id, user_id)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_shares (
            note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            permission TEXT    NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (note_id, user_id)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_versions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            version    INTEGER NOT NULL,
            kind       TEXT    NOT NULL,
            title      TEXT    NOT NULL,
            content    TEXT    NOT NULL,
            author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            UNIQUE (note_id, version)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_steps (
            note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            doc_version INTEGER NOT NULL,
            client_id   TEXT    NOT NULL,
            step        TEXT    NOT NULL,
            PRIMARY KEY (note_id, doc_version)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_step_heads (
            note_id     INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
            doc_version INTEGER NOT NULL,
            log_start   INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS labels (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name       TEXT    NOT NULL,
            created_at INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_labels (
            note_id  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
            added_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (note_id, label_id)
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS link_previews (
            url        TEXT PRIMARY KEY,
            title      TEXT    NOT NULL,
            site_name  TEXT    NOT NULL,
            image_url  TEXT,
            fetched_at INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS note_images (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id      INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            content_type TEXT    NOT NULL,
            width        INTEGER NOT NULL,
            height       INTEGER NOT NULL,
            byte_size    INTEGER NOT NULL,
            data         BLOB    NOT NULL,
            created_at   INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS server_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS password_resets (
            token_hash TEXT    PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS themes (
            id         TEXT    PRIMARY KEY,
            name       TEXT    NOT NULL,
            author     TEXT,
            license    TEXT,
            manifest   TEXT    NOT NULL,
            created_at INTEGER NOT NULL
        )
        """.trimIndent(),
        """
        CREATE TABLE IF NOT EXISTS theme_files (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            theme_id     TEXT    NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
            name         TEXT    NOT NULL,
            content_type TEXT    NOT NULL,
            data         BLOB    NOT NULL,
            UNIQUE (theme_id, name)
        )
        """.trimIndent(),
        "CREATE INDEX IF NOT EXISTS note_images_note_idx ON note_images(note_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS friend_groups_owner_name_idx ON friend_groups(owner_id, name COLLATE NOCASE)",
        "CREATE INDEX IF NOT EXISTS friend_group_members_user_idx ON friend_group_members(user_id)",
        "CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS labels_owner_name_idx ON labels(owner_id, name COLLATE NOCASE)",
        "CREATE INDEX IF NOT EXISTS notes_owner_idx ON notes(owner_id)",
        "CREATE INDEX IF NOT EXISTS notes_trashed_at_idx ON notes(trashed_at)",
        "CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)",
        "CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)",
        "CREATE INDEX IF NOT EXISTS note_shares_user_idx ON note_shares(user_id)",
        "CREATE INDEX IF NOT EXISTS note_labels_label_idx ON note_labels(label_id)",
        "CREATE INDEX IF NOT EXISTS note_versions_note_idx ON note_versions(note_id, version DESC)",
    )

    fun run(dbPath: String) {
        DriverManager.getConnection("jdbc:sqlite:$dbPath").use { connection ->
            connection.autoCommit = false
            try {
                connection.createStatement().use { statement ->
                    statements.forEach { statement.execute(it) }
                    statement.execute("PRAGMA user_version = $SCHEMA_VERSION")
                }
                connection.commit()
            } catch (failure: Exception) {
                connection.rollback()
                throw failure
            } finally {
                connection.autoCommit = true
            }
            requireCurrentShape(connection, dbPath)
        }
    }

    /**
     * `IF NOT EXISTS` leaves a table of an earlier pre-release alone, columns and all, and the first
     * query that reads a missing column would fail somewhere far from here. This compares every
     * table against the schema above, built in memory, and refuses to start with a sentence that
     * says what to do instead.
     */
    private fun requireCurrentShape(connection: Connection, dbPath: String) {
        val expected = DriverManager.getConnection("jdbc:sqlite::memory:").use { memory ->
            memory.createStatement().use { statement -> statements.forEach { statement.execute(it) } }
            columnsByTable(memory)
        }
        val actual = columnsByTable(connection)
        val outdated = expected.filter { (table, columns) -> actual[table] != columns }.keys
        check(outdated.isEmpty()) {
            "The database at $dbPath was created by an earlier pre-release of Notka: " +
                "${outdated.joinToString()} no longer match the schema. There is no migration before the " +
                "first release — move the file away and start again with an empty database."
        }
    }

    private fun columnsByTable(connection: Connection): Map<String, Set<String>> {
        val tables = connection.createStatement().use { statement ->
            statement.executeQuery("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
                .use { rows -> generateSequence { if (rows.next()) rows.getString(1) else null }.toList() }
        }
        return tables.associateWith { table ->
            connection.createStatement().use { statement ->
                statement.executeQuery("PRAGMA table_info($table)")
                    .use { rows -> generateSequence { if (rows.next()) rows.getString("name") else null }.toSet() }
            }
        }
    }
}
