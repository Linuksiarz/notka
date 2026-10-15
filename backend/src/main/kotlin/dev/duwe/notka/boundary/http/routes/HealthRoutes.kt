package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.boundary.config.NOTKA_VERSION
import dev.duwe.notka.boundary.http.dto.DemoAccountDto
import dev.duwe.notka.boundary.http.dto.HealthResponse
import dev.duwe.notka.control.ServerSettingsService
import dev.duwe.notka.control.DemoData
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

/**
 * Liveness probe plus what the sign-in screen and the trash need to know about this instance. No
 * authentication; the only database access is reading whether sign-up is open.
 */
fun Route.healthRoutes(config: AppConfig, settings: ServerSettingsService) {
    get("/api/health") {
        call.respond(
            HealthResponse(
                status = "ok",
                version = NOTKA_VERSION,
                demo = config.demo,
                registrationOpen = settings.registrationOpen(),
                trashRetentionDays = config.trashRetentionDays,
                demoAccounts = if (config.demo) {
                    DemoData.ACCOUNTS.map { DemoAccountDto(email = it.email, password = it.password) }
                } else {
                    emptyList()
                },
            ),
        )
    }
}
