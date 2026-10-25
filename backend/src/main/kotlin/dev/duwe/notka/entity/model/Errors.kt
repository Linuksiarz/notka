package dev.duwe.notka.entity.model

/** Transport agnostic classification of a domain failure; the boundary maps it to an HTTP status. */
enum class ErrorKind {
    VALIDATION,
    UNAUTHORIZED,
    FORBIDDEN,
    NOT_FOUND,
    CONFLICT,
    PAYLOAD_TOO_LARGE,
    TOO_MANY_REQUESTS,
    INTERNAL,

    /** A server this one depends on — the mail server — did not do its part. */
    UNAVAILABLE,
}

/**
 * Stable machine-readable identifiers. The frontend localizes from these, so they are part of the
 * public contract and must not be renamed casually. `message` stays English and is only the
 * developer-facing fallback.
 */
object ErrorKeys {
    const val REQUEST_INVALID_BODY = "request.invalid_body"
    const val REQUEST_UNAUTHORIZED = "request.unauthorized"
    const val REQUEST_NOT_FOUND = "request.not_found"
    const val REQUEST_INTERNAL = "request.internal"
    const val REQUEST_TOO_LARGE = "request.too_large"
    const val REQUEST_TOO_MANY = "request.too_many"
    const val REQUEST_CROSS_SITE = "request.cross_site"

    const val AUTH_INVALID_CREDENTIALS = "auth.invalid_credentials"
    const val AUTH_EMAIL_TAKEN = "auth.email_taken"
    const val AUTH_REGISTRATION_DISABLED = "auth.registration_disabled"
    const val AUTH_INVALID_CURRENT_PASSWORD = "auth.invalid_current_password"
    const val AUTH_DISPLAY_NAME_INVALID = "auth.display_name_invalid"
    const val AUTH_PASSWORD_TOO_SHORT = "auth.password_too_short"
    const val AUTH_EMAIL_INVALID = "auth.email_invalid"
    const val AUTH_USERNAME_INVALID = "auth.username_invalid"
    const val AUTH_ADMIN_REQUIRED = "auth.admin_required"
    const val AUTH_RESET_INVALID = "auth.reset_invalid"

    const val ADMIN_USER_NOT_FOUND = "admin.user_not_found"
    const val ADMIN_CANNOT_CHANGE_ADMIN = "admin.cannot_change_admin"
    const val ADMIN_USER_HAS_NO_EMAIL = "admin.user_has_no_email"
    const val MAIL_NOT_CONFIGURED = "mail.not_configured"
    const val MAIL_SEND_FAILED = "mail.send_failed"

    const val THEME_NOT_FOUND = "theme.not_found"
    const val THEME_ARCHIVE = "theme.archive"
    const val THEME_TOO_LARGE = "theme.too_large"
    const val THEME_MANIFEST = "theme.manifest"
    const val THEME_FORMAT = "theme.format"
    const val THEME_NAME = "theme.name"
    const val THEME_EMPTY = "theme.empty"
    const val THEME_UNKNOWN_BACKGROUND = "theme.unknown_background"
    const val THEME_MISSING_FILE = "theme.missing_file"
    const val THEME_FILE_TYPE = "theme.file_type"
    const val THEME_TINT = "theme.tint"

    const val NOTE_NOT_FOUND = "note.not_found"
    const val NOTE_FORBIDDEN = "note.forbidden"
    const val NOTE_CONTENT_TOO_LARGE = "note.content_too_large"
    const val NOTE_INVALID_DOCUMENT = "note.invalid_document"
    const val NOTE_VERSION_CONFLICT = "note.version_conflict"
    const val NOTE_STEPS_BEHIND = "note.steps_behind"
    const val NOTE_VERSION_NOT_FOUND = "note.version_not_found"
    const val NOTE_LIMIT_REACHED = "note.limit_reached"
    const val IMAGE_UNSUPPORTED = "image.unsupported"
    const val IMAGE_TOO_LARGE = "image.too_large"
    const val IMAGE_LIMIT_REACHED = "image.limit_reached"
    const val IMAGE_STORAGE_FULL = "image.storage_full"
    const val IMAGE_NOT_FOUND = "image.not_found"

    const val SHARE_RECIPIENT_NOT_FOUND = "share.recipient_not_found"
    const val SHARE_CANNOT_SHARE_WITH_SELF = "share.cannot_share_with_self"
    const val SHARE_ALREADY_SHARED = "share.already_shared"
    const val SHARE_NOT_OWNER = "share.not_owner"
    const val SHARE_NOT_FOUND = "share.not_found"

    const val AVATAR_UNSUPPORTED = "avatar.unsupported"
    const val AVATAR_TOO_LARGE = "avatar.too_large"
    const val AVATAR_NOT_FOUND = "avatar.not_found"

    const val FRIEND_NOT_FOUND = "friend.not_found"
    const val FRIEND_SELF = "friend.self"
    const val FRIEND_ALREADY_ADDED = "friend.already_added"
    const val FRIEND_LIMIT_REACHED = "friend.limit_reached"
    const val FRIEND_GROUP_NOT_FOUND = "friend_group.not_found"
    const val FRIEND_GROUP_NAME_INVALID = "friend_group.name_invalid"
    const val FRIEND_GROUP_NAME_TAKEN = "friend_group.name_taken"
    const val FRIEND_GROUP_NOT_A_FRIEND = "friend_group.not_a_friend"
    const val FRIEND_GROUP_LIMIT_REACHED = "friend_group.limit_reached"

    const val LABEL_NOT_FOUND = "label.not_found"
    const val LABEL_NAME_TAKEN = "label.name_taken"
    const val LABEL_NAME_INVALID = "label.name_invalid"
    const val LABEL_LIMIT_REACHED = "label.limit_reached"
}

/** The only failure type the control layer throws. */
class DomainException(
    val kind: ErrorKind,
    val key: String,
    val params: Map<String, String> = emptyMap(),
    message: String,
) : RuntimeException(message) {
    companion object {
        fun validation(key: String, message: String, params: Map<String, String> = emptyMap()) =
            DomainException(ErrorKind.VALIDATION, key, params, message)

        fun unauthorized(
            key: String = ErrorKeys.REQUEST_UNAUTHORIZED,
            message: String = "Authentication required",
            params: Map<String, String> = emptyMap(),
        ) = DomainException(ErrorKind.UNAUTHORIZED, key, params, message)

        fun forbidden(key: String, message: String, params: Map<String, String> = emptyMap()) =
            DomainException(ErrorKind.FORBIDDEN, key, params, message)

        fun notFound(key: String, message: String, params: Map<String, String> = emptyMap()) =
            DomainException(ErrorKind.NOT_FOUND, key, params, message)

        fun conflict(key: String, message: String, params: Map<String, String> = emptyMap()) =
            DomainException(ErrorKind.CONFLICT, key, params, message)

        fun unavailable(key: String, message: String, params: Map<String, String> = emptyMap()) =
            DomainException(ErrorKind.UNAVAILABLE, key, params, message)

        fun payloadTooLarge(key: String, message: String, params: Map<String, String> = emptyMap()) =
            DomainException(ErrorKind.PAYLOAD_TOO_LARGE, key, params, message)

    }
}
