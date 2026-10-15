package dev.duwe.notka.boundary.config

/** The version reported by `GET /api/health`: the Gradle project's, written into the jar at build time. */
val NOTKA_VERSION: String = java.util.Properties()
    .apply { AppConfig::class.java.getResourceAsStream("/notka.properties")?.use(::load) }
    .getProperty("version", "unknown")

/**
 * Environment driven configuration. Every value has a working default so the backend boots
 * without any configuration at all. See `docs/ARCHITECTURE.md`.
 */
data class AppConfig(
    val port: Int,
    val host: String,
    val dbPath: String,
    val staticDir: String,
    val sessionTtlDays: Long,
    val cookieSecure: Boolean,
    val trashRetentionDays: Long,
    val maxNoteBytes: Int,
    /** How many notes one account may own, trash included; a ceiling on what one sign-up can store. */
    val maxNotesPerUser: Int,
    /** How many bytes of pictures the notes one account owns may hold, in total. */
    val maxImageBytesPerUser: Long,
    /**
     * Read the client's address from `X-Forwarded-For`. Only safe when every request comes through a
     * reverse proxy that sets the header itself: exposed directly, any client could claim any
     * address and walk around the sign-in rate limit.
     */
    val trustProxyHeaders: Boolean,
    /** Sign-in and registration attempts one client address may make per minute. */
    val authAttemptsPerMinute: Int,
    val logLevel: String,
    /**
     * Seeds two demo accounts with sample notes on an empty database and tells the frontend to offer
     * their credentials. Read from `DEMO`, which is deliberately not an `NOTKA_*` name: it is the
     * switch a demo instance sets, not a deployment setting.
     */
    val demo: Boolean,
    /**
     * The administrator created on the first start, when the database has none yet. Read only then:
     * once the account exists these are ignored, and changing them changes nothing.
     */
    val initialAdmin: InitialAdmin?,
    /**
     * The address this instance is reached at from the outside, e.g. `https://notes.example.com`.
     * Links in e-mails are built from it — never from a request's `Host`, which the client chooses.
     */
    val publicUrl: String?,
    /** The outgoing mail server; without one the instance sends no e-mail. */
    val smtp: SmtpConfig?,
) {
    val sessionTtlMillis: Long get() = sessionTtlDays * MILLIS_PER_DAY
    val sessionTtlSeconds: Long get() = sessionTtlDays * MILLIS_PER_DAY / 1000L
    val trashRetentionMillis: Long get() = trashRetentionDays * MILLIS_PER_DAY

    /** The largest request body accepted: a full note plus the JSON around it, and nothing more. */
    val maxRequestBytes: Long get() = maxNoteBytes.toLong() * 2 + REQUEST_ENVELOPE_BYTES

    companion object {
        const val MILLIS_PER_DAY: Long = 24L * 60L * 60L * 1000L
        private const val REQUEST_ENVELOPE_BYTES: Long = 64L * 1024L

        fun fromEnvironment(env: (String) -> String? = System::getenv): AppConfig = AppConfig(
            port = env.value("NOTKA_PORT")?.toIntOrNull() ?: 8080,
            host = env.value("NOTKA_HOST") ?: "0.0.0.0",
            dbPath = env.value("NOTKA_DB_PATH") ?: "./data/notka.db",
            staticDir = env.value("NOTKA_STATIC_DIR") ?: "./static",
            sessionTtlDays = env.value("NOTKA_SESSION_TTL_DAYS")?.toLongOrNull() ?: 30L,
            cookieSecure = env.value("NOTKA_COOKIE_SECURE")?.toBooleanStrictOrNull() ?: false,
            trashRetentionDays = env.value("NOTKA_TRASH_RETENTION_DAYS")?.toLongOrNull() ?: 30L,
            maxNoteBytes = env.value("NOTKA_MAX_NOTE_BYTES")?.toIntOrNull() ?: 65536,
            maxNotesPerUser = env.value("NOTKA_MAX_NOTES_PER_USER")?.toIntOrNull() ?: 10_000,
            maxImageBytesPerUser = (env.value("NOTKA_MAX_IMAGE_STORAGE_MB")?.toLongOrNull() ?: 1024L) * 1024L * 1024L,
            trustProxyHeaders = env.value("NOTKA_TRUST_PROXY_HEADERS")?.toBooleanStrictOrNull() ?: false,
            authAttemptsPerMinute = env.value("NOTKA_AUTH_ATTEMPTS_PER_MINUTE")?.toIntOrNull() ?: 10,
            logLevel = env.value("NOTKA_LOG_LEVEL") ?: "INFO",
            demo = env.value("DEMO")?.toBooleanStrictOrNull() ?: false,
            initialAdmin = InitialAdmin.fromEnvironment(env),
            publicUrl = env.value("NOTKA_PUBLIC_URL")?.trimEnd('/')?.also { url ->
                require(url.startsWith("https://") || url.startsWith("http://")) {
                    "NOTKA_PUBLIC_URL must start with https:// or http://"
                }
            },
            smtp = SmtpConfig.fromEnvironment(env),
        )
    }
}

/** The first administrator, from `NOTKA_ADMIN_USERNAME`, `NOTKA_ADMIN_PASSWORD` and `NOTKA_ADMIN_EMAIL`. */
data class InitialAdmin(val username: String, val password: String, val email: String?) {
    /** The password stays out of logs and of every `toString` that might reach one. */
    override fun toString(): String = "InitialAdmin(username=$username, email=$email)"

    companion object {
        fun fromEnvironment(env: (String) -> String?): InitialAdmin? {
            val username = env.value("NOTKA_ADMIN_USERNAME")
            // Not trimmed: a password is exactly what was typed.
            val password = env("NOTKA_ADMIN_PASSWORD")?.takeIf { it.isNotEmpty() }
            if (username == null && password == null) return null
            require(username != null && password != null) {
                "NOTKA_ADMIN_USERNAME and NOTKA_ADMIN_PASSWORD are set together or not at all"
            }
            return InitialAdmin(username, password, env.value("NOTKA_ADMIN_EMAIL"))
        }
    }
}

/** How the connection to the mail server is secured; the names are Vaultwarden's. */
enum class SmtpSecurity(val wire: String) {
    /** Plain connection upgraded with STARTTLS, usually port 587. */
    STARTTLS("starttls"),

    /** TLS from the first byte, usually port 465. */
    FORCE_TLS("force_tls"),

    /** No encryption at all; only for a relay on the same host or network. */
    OFF("off"),
}

/** The outgoing mail server, configured the way Vaultwarden's is: `NOTKA_SMTP_*`. */
data class SmtpConfig(
    val host: String,
    val port: Int,
    val security: SmtpSecurity,
    val username: String?,
    val password: String?,
    val from: String,
    val fromName: String,
    val timeoutSeconds: Int,
) {
    override fun toString(): String =
        "SmtpConfig(host=$host, port=$port, security=$security, username=$username, from=$from)"

    companion object {
        fun fromEnvironment(env: (String) -> String?): SmtpConfig? {
            val host = env.value("NOTKA_SMTP_HOST") ?: return null
            val security = env.value("NOTKA_SMTP_SECURITY")?.let { raw ->
                requireNotNull(SmtpSecurity.entries.firstOrNull { it.wire == raw.lowercase() }) {
                    "NOTKA_SMTP_SECURITY must be one of ${SmtpSecurity.entries.joinToString { it.wire }}"
                }
            } ?: SmtpSecurity.STARTTLS
            val defaultPort = when (security) {
                SmtpSecurity.STARTTLS -> 587
                SmtpSecurity.FORCE_TLS -> 465
                SmtpSecurity.OFF -> 25
            }
            return SmtpConfig(
                host = host,
                port = env.value("NOTKA_SMTP_PORT")?.toIntOrNull() ?: defaultPort,
                security = security,
                username = env.value("NOTKA_SMTP_USERNAME"),
                password = env("NOTKA_SMTP_PASSWORD")?.takeIf { it.isNotEmpty() },
                from = requireNotNull(env.value("NOTKA_SMTP_FROM")) { "NOTKA_SMTP_FROM is required with NOTKA_SMTP_HOST" },
                fromName = env.value("NOTKA_SMTP_FROM_NAME") ?: "Notka",
                timeoutSeconds = env.value("NOTKA_SMTP_TIMEOUT")?.toIntOrNull() ?: 15,
            )
        }
    }
}

private fun ((String) -> String?).value(name: String): String? =
    invoke(name)?.trim()?.takeIf { it.isNotEmpty() }
