package dev.duwe.notka

import org.jetbrains.exposed.v1.jdbc.Database
import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.boundary.config.NOTKA_VERSION
import dev.duwe.notka.boundary.http.plugins.configureHttpPlugins
import dev.duwe.notka.boundary.http.plugins.configureStaticServing
import dev.duwe.notka.boundary.http.routes.adminRoutes
import dev.duwe.notka.boundary.http.routes.authRoutes
import dev.duwe.notka.boundary.http.routes.avatarRoutes
import dev.duwe.notka.boundary.http.routes.friendRoutes
import dev.duwe.notka.boundary.http.routes.themeRoutes
import dev.duwe.notka.boundary.mail.SmtpAccountMail
import dev.duwe.notka.control.AccountMail
import dev.duwe.notka.control.AdminService
import dev.duwe.notka.control.AvatarService
import dev.duwe.notka.control.FriendService
import dev.duwe.notka.entity.persistence.AvatarRepository
import dev.duwe.notka.entity.persistence.FriendRepository
import dev.duwe.notka.control.ServerSettingsService
import dev.duwe.notka.control.ThemeService
import dev.duwe.notka.entity.persistence.PasswordResetRepository
import dev.duwe.notka.entity.persistence.ServerSettingsRepository
import dev.duwe.notka.entity.persistence.ThemeRepository
import io.github.oshai.kotlinlogging.KotlinLogging
import dev.duwe.notka.boundary.http.routes.eventRoutes
import dev.duwe.notka.boundary.http.routes.healthRoutes
import dev.duwe.notka.boundary.http.routes.labelRoutes
import dev.duwe.notka.boundary.http.routes.noteRoutes
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.DemoData
import dev.duwe.notka.control.LabelService
import dev.duwe.notka.control.NoteAccessChecker
import dev.duwe.notka.control.NoteEventBus
import dev.duwe.notka.control.NoteService
import dev.duwe.notka.control.SharingService
import dev.duwe.notka.control.LinkPreviewService
import dev.duwe.notka.control.SessionCleanupJob
import dev.duwe.notka.control.TrashCleanupJob
import dev.duwe.notka.entity.persistence.LinkPreviewRepository
import dev.duwe.notka.entity.persistence.Databases
import dev.duwe.notka.entity.persistence.LabelRepository
import dev.duwe.notka.entity.persistence.Migrations
import dev.duwe.notka.entity.persistence.NoteImageRepository
import dev.duwe.notka.entity.persistence.NoteRepository
import dev.duwe.notka.entity.persistence.NoteVersionRepository
import dev.duwe.notka.entity.persistence.SessionRepository
import dev.duwe.notka.entity.persistence.ShareRepository
import dev.duwe.notka.entity.persistence.UserRepository
import io.ktor.server.application.Application
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.routing.routing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

private val logger = KotlinLogging.logger {}

/** Everything the boundary needs, wired from the outside in. */
class AppServices(
    val config: AppConfig,
    val database: Database,
    val auth: AuthService,
    val settings: ServerSettingsService,
    val admin: AdminService,
    val themes: ThemeService,
    val notes: NoteService,
    val sharing: SharingService,
    val labels: LabelService,
    val avatars: AvatarService,
    val friends: FriendService,
    val trashCleanup: TrashCleanupJob,
    val sessionCleanup: SessionCleanupJob,
    val events: NoteEventBus,
    val linkPreviews: LinkPreviewService,
) {
    /** Stops the preview fetcher: its scope and the client it was given are ours to close. */
    fun close() {
        linkPreviews.close()
    }

    companion object {
        /** Connects, creates the schema and builds the object graph. */
        /**
         * A client for the link fetcher: no redirects of its own (every hop is checked before it is
         * followed), no throwing on 404, and a request timeout, so one slow site cannot hold a
         * background fetch for ever.
         */
        fun defaultHttpClient(): HttpClient = HttpClient(CIO) {
            followRedirects = false
            expectSuccess = false
            install(HttpTimeout) { requestTimeoutMillis = LinkPreviewService.REQUEST_TIMEOUT_MILLIS }
        }

        fun create(
            config: AppConfig,
            clock: () -> Long = System::currentTimeMillis,
            httpClient: HttpClient = defaultHttpClient(),
            mail: AccountMail? = config.smtp?.let(::SmtpAccountMail),
        ): AppServices {
            val database = Databases.connect(config.dbPath)
            Migrations.run(config.dbPath)
            val users = UserRepository(database)
            val sessions = SessionRepository(database)
            val notes = NoteRepository(database)
            val versions = NoteVersionRepository(database)
            val shares = ShareRepository(database)
            val labels = LabelRepository(database)
            val access = NoteAccessChecker(notes, shares)
            val events = NoteEventBus()
            val linkPreviews = LinkPreviewService(
                previews = LinkPreviewRepository(database),
                http = httpClient,
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                clock = clock,
            )
            val auth = AuthService(users, sessions, PasswordResetRepository(database), config.sessionTtlMillis, clock)
            val themes = ThemeRepository(database)
            val settings = ServerSettingsService(ServerSettingsRepository(database), themes)
            return AppServices(
                config = config,
                database = database,
                auth = auth,
                settings = settings,
                admin = AdminService(users, auth, mail, config.publicUrl),
                themes = ThemeService(themes, users, settings, clock),
                notes = NoteService(
                    notes = notes,
                    versions = versions,
                    shares = shares,
                    labels = labels,
                    users = users,
                    access = access,
                    events = events,
                    linkPreviews = linkPreviews,
                    maxNoteBytes = config.maxNoteBytes,
                    maxNotesPerUser = config.maxNotesPerUser,
                    images = NoteImageRepository(database),
                    maxImageBytesPerUser = config.maxImageBytesPerUser,
                    clock = clock,
                ),
                sharing = SharingService(access, shares, users, clock),
                labels = LabelService(labels, clock),
                avatars = AvatarService(AvatarRepository(database), users, clock),
                friends = FriendService(FriendRepository(database), users, clock),
                trashCleanup = TrashCleanupJob(notes, config.trashRetentionMillis, clock),
                sessionCleanup = SessionCleanupJob(auth),
                events = events,
                linkPreviews = linkPreviews,
            )
        }
    }
}

fun main() {
    val config = AppConfig.fromEnvironment()
    val services = AppServices.create(config)
    seedDemoData(config, services)
    ensureAdministrator(config, services)
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    services.trashCleanup.start(scope)
    services.sessionCleanup.start(scope)
    embeddedServer(Netty, port = config.port, host = config.host) { notkaModule(services) }
        .start(wait = true)
}

/**
 * Fills a fresh instance with the sample accounts when `DEMO=true`, and says so in the log. The
 * seeder ignores an instance that already has accounts, so restarting is harmless.
 */
private fun seedDemoData(config: AppConfig, services: AppServices) {
    if (config.demo) DemoData.seed(services.auth, services.notes, services.sharing)
}

/**
 * The first start creates the administrator from `NOTKA_ADMIN_USERNAME` / `NOTKA_ADMIN_PASSWORD`;
 * every later start ignores them, and says so, because a password left in the environment is a
 * password left lying around. A demo instance gets its administrator from the seed instead.
 */
private fun ensureAdministrator(config: AppConfig, services: AppServices) {
    val initial = config.initialAdmin
    if (services.auth.hasAdmin()) {
        if (initial != null) {
            logger.warn { "NOTKA_ADMIN_USERNAME/NOTKA_ADMIN_PASSWORD are ignored: this instance already has its administrator. Remove them from the environment." }
        }
        return
    }
    checkNotNull(initial) {
        "This instance has no administrator yet. Start it once with NOTKA_ADMIN_USERNAME and NOTKA_ADMIN_PASSWORD set; they are read only on that first start."
    }
    val admin = services.auth.createAdmin(initial.username, initial.password, initial.email)
    logger.info { "Created the administrator account '${admin.username}'" }
}

/** Route and plugin wiring; the same entry point is used by the HTTP tests. */
fun Application.notkaModule(services: AppServices) {
    environment.log.info("Notka $NOTKA_VERSION starting with database ${services.config.dbPath}")
    configureHttpPlugins(services.config)
    routing {
        healthRoutes(services.config, services.settings)
        authRoutes(services.auth, services.settings, services.config)
        adminRoutes(services.auth, services.admin, services.settings, services.themes, services.config)
        themeRoutes(services.auth, services.themes)
        noteRoutes(services.notes, services.sharing, services.auth)
        labelRoutes(services.labels, services.auth)
        avatarRoutes(services.avatars, services.auth)
        friendRoutes(services.friends, services.auth)
        eventRoutes(services.events, services.auth)
    }
    configureStaticServing(services.config)
}
