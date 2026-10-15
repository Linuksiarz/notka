package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.boundary.http.dto.AccountsResponse
import dev.duwe.notka.boundary.http.dto.PatchServerSettingsRequest
import dev.duwe.notka.boundary.http.dto.ServerSettingsDto
import dev.duwe.notka.boundary.http.dto.toDto
import dev.duwe.notka.boundary.http.plugins.requireIntParameter
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.control.AdminService
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.ServerSettingsService
import dev.duwe.notka.control.ThemeService
import dev.duwe.notka.entity.model.UserSummary
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** The administrator's server settings: sign-up, accounts and the instance's themes. */
fun Route.adminRoutes(
    auth: AuthService,
    admin: AdminService,
    settings: ServerSettingsService,
    themes: ThemeService,
    config: AppConfig,
) {
    suspend fun ApplicationCall.requireAdmin(): UserSummary = requireUser(auth).also(admin::requireAdmin)

    fun currentSettings() = ServerSettingsDto(
        registrationOpen = settings.registrationOpen(),
        defaultThemeId = settings.defaultTheme(),
        mailConfigured = admin.mailConfigured,
    )

    route("/api/admin") {
        get("/settings") {
            call.requireAdmin()
            call.respond(currentSettings())
        }

        patch("/settings") {
            call.requireAdmin()
            val request = call.receive<PatchServerSettingsRequest>()
            request.registrationOpen?.let(settings::setRegistrationOpen)
            request.defaultThemeId?.let(settings::setDefaultTheme)
            call.respond(currentSettings())
        }

        get("/users") {
            call.requireAdmin()
            call.respond(
                AccountsResponse(
                    accounts = admin.usage().map { it.toDto() },
                    imageQuotaBytes = config.maxImageBytesPerUser,
                    databaseBytes = File(config.dbPath).length(),
                ),
            )
        }

        delete("/users/{id}") {
            call.requireAdmin()
            admin.deleteUser(call.requireIntParameter("id"))
            call.respond(HttpStatusCode.NoContent)
        }

        post("/users/{id}/password-reset") {
            call.requireAdmin()
            val userId = call.requireIntParameter("id")
            val locale = call.request.headers[HttpHeaders.AcceptLanguage]?.substringBefore(',')?.trim().orEmpty()
            // Talking to the mail server blocks; it must not hold one of the event loop's threads.
            withContext(Dispatchers.IO) { admin.resetPassword(userId, locale) }
            call.respond(HttpStatusCode.NoContent)
        }

        // The body is the theme's `.zip` itself.
        post("/themes") {
            call.requireAdmin()
            val archive = call.receive<ByteArray>()
            call.respond(HttpStatusCode.Created, themes.upload(archive).toDto())
        }

        delete("/themes/{themeId}") {
            call.requireAdmin()
            themes.delete(call.parameters["themeId"].orEmpty())
            call.respond(HttpStatusCode.NoContent)
        }
    }
}
