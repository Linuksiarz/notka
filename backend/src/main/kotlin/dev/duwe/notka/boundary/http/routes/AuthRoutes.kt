package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.boundary.http.dto.AuthResponse
import dev.duwe.notka.boundary.http.dto.EnableEncryptionRequest
import dev.duwe.notka.boundary.http.dto.EncryptionEnabledResponse
import dev.duwe.notka.boundary.http.dto.LoginRequest
import dev.duwe.notka.boundary.http.dto.PasswordResetRequest
import dev.duwe.notka.boundary.http.dto.PatchMeRequest
import dev.duwe.notka.boundary.http.dto.RegisterRequest
import dev.duwe.notka.boundary.http.dto.toAccountDto
import dev.duwe.notka.boundary.http.plugins.AUTH_RATE_LIMIT
import dev.duwe.notka.boundary.http.plugins.clearSessionCookie
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.boundary.http.plugins.sessionToken
import dev.duwe.notka.boundary.http.plugins.setSessionCookie
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.EncryptionService
import dev.duwe.notka.control.ServerSettingsService
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import dev.duwe.notka.entity.model.UserSummary
import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.authRoutes(
    auth: AuthService,
    encryption: EncryptionService,
    settings: ServerSettingsService,
    config: AppConfig,
) {
    fun UserSummary.toAccount() = toAccountDto(encryption.settings(id))

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
                call.respond(HttpStatusCode.Created, AuthResponse(result.user.toAccount()))
            }

            post("/login") {
                val request = call.receive<LoginRequest>()
                val result = auth.login(request.login, request.password)
                call.setSessionCookie(result.token, config.sessionTtlSeconds, config.cookieSecure)
                call.respond(AuthResponse(result.user.toAccount()))
            }

            // The link from a reset e-mail lands here; the token is as good as a password while it lasts.
            post("/password-reset") {
                val request = call.receive<PasswordResetRequest>()
                val result = auth.completePasswordReset(
                    request.token,
                    request.password,
                    request.recoveryKey,
                    request.discardEncrypted,
                )
                call.setSessionCookie(result.token, config.sessionTtlSeconds, config.cookieSecure)
                call.respond(AuthResponse(result.user.toAccount()))
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
            call.respond(AuthResponse(user.toAccount()))
        }

        patch("/me") {
            val user = call.requireUser(auth)
            val request = call.receive<PatchMeRequest>()
            request.linkPreviews?.let { encryption.setLinkPreviews(user.id, it) }
            val updated = if (request.displayName != null || request.newPassword != null || request.linkPreviews == null) {
                auth.updateProfile(
                    userId = user.id,
                    currentToken = call.sessionToken(),
                    displayName = request.displayName,
                    currentPassword = request.currentPassword,
                    newPassword = request.newPassword,
                )
            } else {
                user
            }
            call.respond(AuthResponse(updated.toAccount()))
        }

        // Encryption of the account's private notes (`docs/ENCRYPTION.md`). Turning it on answers with
        // the recovery key, the one time it is ever sent.
        rateLimit(AUTH_RATE_LIMIT) {
            post("/me/encryption") {
                val user = call.requireUser(auth)
                val request = call.receive<EnableEncryptionRequest>()
                val recoveryKey = encryption.enable(user.id, request.password, call.requireSessionToken())
                call.respond(HttpStatusCode.Created, EncryptionEnabledResponse(user.toAccount(), recoveryKey))
            }
        }

        delete("/me/encryption") {
            val user = call.requireUser(auth)
            encryption.disable(user.id)
            call.respond(AuthResponse(user.toAccount()))
        }
    }
}

/** The cookie of a request [requireUser] has already accepted. */
private fun ApplicationCall.requireSessionToken(): String = checkNotNull(sessionToken()) { "An authenticated call carries its cookie" }
