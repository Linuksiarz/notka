package dev.duwe.notka.entity.persistence

import org.jetbrains.exposed.sql.Table

object Users : Table("users") {
    val id = integer("id").autoIncrement()
    val email = text("email").nullable()
    val username = text("username").nullable()
    val displayName = text("display_name")
    val passwordHash = text("password_hash")
    val admin = bool("is_admin")
    val backgroundTheme = text("background_theme").nullable()
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}

object Sessions : Table("sessions") {
    val token = text("token")
    val userId = integer("user_id")
    val createdAt = long("created_at")
    val expiresAt = long("expires_at")
    val lastSeenAt = long("last_seen_at")

    override val primaryKey = PrimaryKey(token)
}

object Notes : Table("notes") {
    val id = integer("id").autoIncrement()
    val ownerId = integer("owner_id")
    val kind = text("kind")
    val title = text("title")
    val content = text("content")
    val archived = bool("archived")
    /* Pinned notes sort to the top of a view. Like the archive flag, pinning is metadata: it never
       guards a version and never creates a history entry. */
    val pinned = bool("pinned")
    /* The note's place in its section, highest first — the original's own order. A new note, and a
       note being pinned or unpinned, goes to the top; an edit leaves it where it is. */
    val position = long("position")
    val trashedAt = long("trashed_at").nullable()
    /* Appearance belongs to the note, not to a (note, user) pair: everyone with access sees the
       same colour and background. Deliberately different from Google Keep — see AGENTS.md. */
    val color = text("color")
    val background = text("background").nullable()
    /* The reminder, as metadata: a moment and an optional rule for coming back. */
    val reminderAt = long("reminder_at").nullable()
    val reminderRepeat = text("reminder_repeat").nullable()
    val createdAt = long("created_at")
    val updatedAt = long("updated_at")

    /** Bumped on every write; the value a client last saw is its optimistic-concurrency token. */
    val version = integer("version")

    override val primaryKey = PrimaryKey(id)
}

object NoteShares : Table("note_shares") {
    val noteId = integer("note_id")
    val userId = integer("user_id")
    val permission = text("permission")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(noteId, userId)
}

/**
 * Archived note states, one row per content-changing write, newest last. Cascades away with the
 * note, so trashing and the 30-day purge need no extra work.
 */
object NoteVersions : Table("note_versions") {
    val id = integer("id").autoIncrement()
    val noteId = integer("note_id")
    val version = integer("version")
    val kind = text("kind")
    val title = text("title")
    val content = text("content")
    val authorId = integer("author_id")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}

/**
 * The ProseMirror steps that brought a note's body to where it is, one row per step, numbered by the
 * body's version after it (`docs/COLLABORATION.md`). The server never reads a step: it orders them,
 * keeps the newest of them and hands them to the editors that are behind.
 */
object NoteSteps : Table("note_steps") {
    val noteId = integer("note_id")
    val docVersion = integer("doc_version")
    val clientId = text("client_id")
    val step = text("step")

    override val primaryKey = PrimaryKey(noteId, docVersion)
}

/**
 * Where a note's step log stands: the version its body is at, and the oldest version the log can
 * still bring an editor up from. A note without a row is at version 0 with a complete log.
 */
object NoteStepHeads : Table("note_step_heads") {
    val noteId = integer("note_id")
    val docVersion = integer("doc_version")
    val logStart = integer("log_start")

    override val primaryKey = PrimaryKey(noteId)
}

object Labels : Table("labels") {
    val id = integer("id").autoIncrement()
    val ownerId = integer("owner_id")
    val name = text("name")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}

object NoteLabels : Table("note_labels") {
    val noteId = integer("note_id")
    val labelId = integer("label_id")
    val addedBy = integer("added_by")

    override val primaryKey = PrimaryKey(noteId, labelId)
}

/** One row per address a note links to; the url is the key because the page, not the note, owns it. */
object LinkPreviews : Table("link_previews") {
    val url = text("url")
    val title = text("title")
    val siteName = text("site_name")
    val imageUrl = text("image_url").nullable()
    val fetchedAt = long("fetched_at")

    override val primaryKey = PrimaryKey(url)
}

/** The pictures of a note; the bytes live here too, so the database file stays the whole state. */
object NoteImages : Table("note_images") {
    val id = integer("id").autoIncrement()
    val noteId = integer("note_id")
    val contentType = text("content_type")
    val width = integer("width")
    val height = integer("height")
    val byteSize = integer("byte_size")
    val data = blob("data")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}

/** Instance-wide settings the administrator changes at run time, one row per key. */
object ServerSettings : Table("server_settings") {
    val key = text("key")
    val value = text("value")

    override val primaryKey = PrimaryKey(key)
}

/** Outstanding password resets, keyed by the hash of the token the e-mail carries. */
object PasswordResets : Table("password_resets") {
    val tokenHash = text("token_hash")
    val userId = integer("user_id")
    val createdAt = long("created_at")
    val expiresAt = long("expires_at")

    override val primaryKey = PrimaryKey(tokenHash)
}

/** Background themes the administrator uploaded; the manifest is the theme's own `theme.json`, checked. */
object Themes : Table("themes") {
    val id = text("id")
    val name = text("name")
    val author = text("author").nullable()
    val license = text("license").nullable()
    val manifest = text("manifest")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}

/** The pictures of a theme, by the file name its manifest uses. */
object ThemeFiles : Table("theme_files") {
    val id = integer("id").autoIncrement()
    val themeId = text("theme_id")
    val name = text("name")
    val contentType = text("content_type")
    val data = blob("data")

    override val primaryKey = PrimaryKey(id)
}
