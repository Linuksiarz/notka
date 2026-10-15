package dev.duwe.notka

import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.control.AccountMail
import dev.duwe.notka.control.CreateNoteCommand
import dev.duwe.notka.control.ResolvedNote
import dev.duwe.notka.control.ShareWithUser
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.UserSummary
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import io.ktor.client.HttpClient
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import java.util.Comparator

private const val DAY_MILLIS: Long = 24L * 60L * 60L * 1000L

/** A single-use temp database plus the wired application graph; deleted by [close]. */
class TestFixture(
    cookieSecure: Boolean = false,
    /** Sign-up starts closed on a real instance; most tests register through it, so here it starts open. */
    registrationOpen: Boolean = true,
    maxNotesPerUser: Int = 10_000,
    maxImageBytesPerUser: Long = 1024L * 1024L * 1024L,
    maxNoteBytes: Int = 65536,
    demo: Boolean = false,
    trustProxyHeaders: Boolean = false,
    httpClient: HttpClient? = null,
    publicUrl: String? = "https://notes.example.com",
    /** The mail the instance would send; `null` is an instance without a mail server. */
    mail: AccountMail? = null,
) {
    val directory: Path = Files.createTempDirectory("notka-test")
    var now: Long = 1_700_000_000_000L

    val config: AppConfig = AppConfig(
        port = 0,
        host = "127.0.0.1",
        dbPath = directory.resolve("notka.db").toString(),
        staticDir = directory.resolve("static").toString(),
        sessionTtlDays = 30,
        cookieSecure = cookieSecure,
        trashRetentionDays = 30,
        maxNoteBytes = maxNoteBytes,
        maxNotesPerUser = maxNotesPerUser,
        maxImageBytesPerUser = maxImageBytesPerUser,
        trustProxyHeaders = trustProxyHeaders,
        authAttemptsPerMinute = 10,
        logLevel = "ERROR",
        demo = demo,
        initialAdmin = null,
        publicUrl = publicUrl,
        smtp = null,
    )

    val services: AppServices =
        AppServices.create(config, { now }, httpClient ?: AppServices.defaultHttpClient(), mail)
            .also { if (registrationOpen) it.settings.setRegistrationOpen(true) }

    /** A scope for tests that drive the link fetcher themselves. */
    val previewScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val json = Json { ignoreUnknownKeys = true }

    fun advanceDays(days: Long) {
        now += days * DAY_MILLIS
    }

    fun registerUser(
        email: String = "ada@example.com",
        displayName: String = "Ada Lovelace",
        password: String = "correct horse battery",
    ): UserSummary = services.auth.register(email, displayName, password).user

    fun createNote(
        ownerId: Int,
        title: String = "Groceries",
        kind: String = "TEXT",
        document: NoteDocument? = null,
    ): ResolvedNote = services.notes.create(
        ownerId,
        CreateNoteCommand(kind = kind, title = title, document = document),
    )

    fun share(noteId: Int, ownerId: Int, email: String, permission: String = "VIEW"): ShareWithUser =
        services.sharing.add(ownerId, noteId, email, permission)

    fun close() {
        previewScope.cancel()
        services.close()
        runCatching {
            Files.walk(directory).use { paths ->
                paths.sorted(Comparator.reverseOrder()).forEach { Files.deleteIfExists(it) }
            }
        }
    }
}

fun JsonObject.stringField(name: String): String = getValue(name).jsonPrimitive.content

/** An [AccountMail] that keeps what it was asked to send, or fails like a mail server that refuses. */
class RecordingMail(private val failing: Boolean = false) : AccountMail {
    data class Sent(val to: String, val displayName: String, val link: String, val locale: String)

    val sent = mutableListOf<Sent>()

    override fun sendPasswordReset(to: String, displayName: String, link: String, locale: String) {
        if (failing) error("The mail server refused the message")
        sent += Sent(to, displayName, link, locale)
    }
}
