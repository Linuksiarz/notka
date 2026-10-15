package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.boundary.http.dto.AuthResponse
import dev.duwe.notka.boundary.http.dto.LoginRequest
import dev.duwe.notka.boundary.http.dto.PasswordResetRequest
import dev.duwe.notka.boundary.http.dto.PatchMeRequest
import dev.duwe.notka.boundary.http.dto.RegisterRequest
import dev.duwe.notka.boundary.http.dto.toDto
import dev.duwe.notka.boundary.http.plugins.AUTH_RATE_LIMIT
import dev.duwe.notka.boundary.http.plugins.clearSessionCookie
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.boundary.http.plugins.sessionToken
import dev.duwe.notka.boundary.http.plugins.setSessionCookie
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.ServerSettingsService
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.authRoutes(auth: AuthService, settings: ServerSettingsService, config: AppConfig) {
    route("/api/auth") {
        // Guessing a password costs one attempt per request, so the requests are what is limited.
        rateLimit(AUTH_RATE_LIMIT) {
            post("/register") {
                if (!settings.registrationOpen()) {
                    throw DomainException(
                        ErrorKind.FORBIDDEN,
                        ErrorKeys.AUTH_REGISTRATION_DISABLED,
                        message = "Registration is disabled on this instance",
                    )
                }
                val request = call.receive<RegisterRequest>()
                val result = auth.register(request.email, request.displayName, request.password)
                call.setSessionCookie(result.token, config.sessionTtlSeconds, config.cookieSecure)
                call.respond(HttpStatusCode.Created, AuthResponse(result.user.toDto()))
            }

            post("/login") {
                val request = call.receive<LoginRequest>()
                val result = auth.login(request.login, request.password)
                call.setSessionCookie(result.token, config.sessionTtlSeconds, config.cookieSecure)
                call.respond(AuthResponse(result.user.toDto()))
            }

            // The link from a reset e-mail lands here; the token is as good as a password while it lasts.
            post("/password-reset") {
                val request = call.receive<PasswordResetRequest>()
                val result = auth.completePasswordReset(request.token, request.password)
                call.setSessionCookie(result.token, config.sessionTtlSeconds, config.cookieSecure)
                call.respond(AuthResponse(result.user.toDto()))
            }
        }

        post("/logout") {
            auth.logout(call.sessionToken())
            call.clearSessionCookie(config.cookieSecure)
            call.respond(HttpStatusCode.NoContent)
        }

        post("/logout-all") {
            val user = call.requireUser(auth)
            auth.logoutEverywhere(user.id)
            call.clearSessionCookie(config.cookieSecure)
            call.respond(HttpStatusCode.NoContent)
        }

        get("/me") {
            val user = call.requireUser(auth)
            call.respond(AuthResponse(user.toDto()))
        }

        patch("/me") {
            val user = call.requireUser(auth)
            val request = call.receive<PatchMeRequest>()
            val updated = auth.updateProfile(
                userId = user.id,
                currentToken = call.sessionToken(),
                displayName = request.displayName,
                currentPassword = request.currentPassword,
                newPassword = request.newPassword,
            )
            call.respond(AuthResponse(updated.toDto()))
        }
    }
}
