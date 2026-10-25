package dev.duwe.notka.entity.model

/** The 11 customizable card colors plus `default` (plain card). */
val NOTE_COLORS: Set<String> =
    setOf("default", "red", "orange", "yellow", "green", "teal", "blue", "darkblue", "purple", "pink", "brown", "gray")

/**
 * The backgrounds a note can wear, in the original's order. They are ids, not pictures: what each
 * looks like is the reader's background theme (`docs/THEMES.md`), so the note stays the same note.
 */
val NOTE_BACKGROUNDS: Set<String> =
    linkedSetOf("groceries", "food", "music", "recipes", "notes", "places", "travel", "video", "celebration")

/** Request validation shared by control and boundary. All failures are `VALIDATION`. */
object Validation {
    private val EMAIL = Regex("^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(\\.[A-Za-z0-9\\-]+)+$")
    private const val EMAIL_MAX_LENGTH = 254
    private val USERNAME = Regex("^[a-z0-9][a-z0-9._-]{1,31}$")
    private const val DISPLAY_NAME_MAX_LENGTH = 80
    private const val PASSWORD_MIN_LENGTH = 8
    private const val PASSWORD_MAX_LENGTH = 200
    private const val LABEL_NAME_MAX_LENGTH = 50

    /** Lowercases and trims, or returns `null` when the shape is not an address at all. */
    fun normalizedEmailOrNull(raw: String): String? {
        val email = raw.trim().lowercase()
        return email.takeIf { it.length <= EMAIL_MAX_LENGTH && EMAIL.matches(it) }
    }

    fun email(raw: String): String = normalizedEmailOrNull(raw) ?: throw DomainException.validation(
        ErrorKeys.AUTH_EMAIL_INVALID,
        "Email must be a valid address of at most $EMAIL_MAX_LENGTH characters",
    )

    /** A login name: 2 to 32 of `a-z`, digits, `.`, `_` and `-`, compared without case. Never an address. */
    fun username(raw: String): String = raw.trim().lowercase().takeIf(USERNAME::matches)
        ?: throw DomainException.validation(
            ErrorKeys.AUTH_USERNAME_INVALID,
            "Username must be 2 to 32 letters, digits, dots, underscores or hyphens",
        )

    fun displayName(raw: String): String {
        val name = raw.trim()
        if (name.isEmpty() || name.length > DISPLAY_NAME_MAX_LENGTH) {
            throw DomainException.validation(
                ErrorKeys.AUTH_DISPLAY_NAME_INVALID,
                "Display name must be 1 to $DISPLAY_NAME_MAX_LENGTH characters",
            )
        }
        return name
    }

    fun password(raw: String): String {
        if (raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH) {
            throw DomainException.validation(
                ErrorKeys.AUTH_PASSWORD_TOO_SHORT,
                "Password must be $PASSWORD_MIN_LENGTH to $PASSWORD_MAX_LENGTH characters",
            )
        }
        return raw
    }

    fun labelName(raw: String): String {
        val name = raw.trim()
        if (name.isEmpty() || name.length > LABEL_NAME_MAX_LENGTH) {
            throw DomainException.validation(
                ErrorKeys.LABEL_NAME_INVALID,
                "Label name must be 1 to $LABEL_NAME_MAX_LENGTH characters",
            )
        }
        return name
    }

    /** A friend group's name follows a label's rules. */
    fun friendGroupName(raw: String): String {
        val name = raw.trim()
        if (name.isEmpty() || name.length > LABEL_NAME_MAX_LENGTH) {
            throw DomainException.validation(
                ErrorKeys.FRIEND_GROUP_NAME_INVALID,
                "Group name must be 1 to $LABEL_NAME_MAX_LENGTH characters",
            )
        }
        return name
    }

    fun noteKind(raw: String): NoteKind =
        NoteKind.entries.firstOrNull { it.name == raw.uppercase() } ?: throw DomainException.validation(
            ErrorKeys.NOTE_INVALID_DOCUMENT,
            "Kind must be one of ${NoteKind.entries.joinToString { it.name }}",
        )

    fun color(raw: String): String =
        if (raw in NOTE_COLORS) raw else throw DomainException.validation(
            ErrorKeys.NOTE_INVALID_DOCUMENT,
            "Unknown color '$raw'",
        )

    fun background(raw: String): String =
        if (raw in NOTE_BACKGROUNDS) raw else throw DomainException.validation(
            ErrorKeys.NOTE_INVALID_DOCUMENT,
            "Unknown background '$raw'",
        )

    fun permission(raw: String): Permission =
        Permission.entries.firstOrNull { it.name == raw.uppercase() } ?: throw DomainException.validation(
            ErrorKeys.REQUEST_INVALID_BODY,
            "Permission must be VIEW or EDIT",
        )
}
