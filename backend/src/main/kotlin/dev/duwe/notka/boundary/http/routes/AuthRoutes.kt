package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.boundary.http.dto.AuthResponse
import dev.duwe.notka.boundary.http.dto.ChangePassphraseRequest
import dev.duwe.notka.boundary.http.dto.EnableEncryptionRequest
import dev.duwe.notka.boundary.http.dto.EncryptionEnabledResponse
import dev.duwe.notka.boundary.http.dto.LoginRequest
import dev.duwe.notka.boundary.http.dto.PasswordResetRequest
import dev.duwe.notka.boundary.http.dto.PatchMeRequest
import dev.duwe.notka.boundary.http.dto.RecoverEncryptionRequest
import dev.duwe.notka.boundary.http.dto.RegisterRequest
import dev.duwe.notka.boundary.http.dto.SsoExchangeRequest
import dev.duwe.notka.boundary.http.dto.SsoExchangeResponse
import dev.duwe.notka.boundary.http.dto.SsoStartRequest
import dev.duwe.notka.boundary.http.dto.SsoStartResponse
import dev.duwe.notka.boundary.http.dto.UnlockEncryptionRequest
import dev.duwe.notka.boundary.http.dto.toAccountDto
import dev.duwe.notka.boundary.http.plugins.AUTH_RATE_LIMIT
import dev.duwe.notka.boundary.http.plugins.clearSessionCookie
import dev.duwe.notka.boundary.http.plugins.clearSsoAttemptCookie
import dev.duwe.notka.boundary.http.plugins.requireSession
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.boundary.http.plugins.sessionToken
import dev.duwe.notka.boundary.http.plugins.setSessionCookie
import dev.duwe.notka.boundary.http.plugins.setSsoAttemptCookie
import dev.duwe.notka.boundary.http.plugins.ssoAttempt
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.EncryptionService
import dev.duwe.notka.control.ServerSettingsService
import dev.duwe.notka.control.SsoService
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import dev.duwe.notka.entity.model.UserSummary
import io.ktor.http.HttpStatusCode
import io.ktor.http.Parameters
import io.ktor.http.encodeURLParameter
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondRedirect
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route

/**
 * Android's app, by its own scheme. A scheme and not an app link: the app is built once for every
 * server, and an app link needs each host named in the app. Any app may claim a scheme, which is why the
 * code that travels here is worthless without the verifier in the WebView that started the sign-in.
 */
private const val APP_RETURN = "dev.duwe.notka://sso"

/** The provider's code from the query of its answer, or why there is none. */
private fun Parameters.providerCode(): String {
    if (this["error"] != null) {
        throw DomainException.forbidden(ErrorKeys.AUTH_SSO_DENIED, "The identity provider refused the sign-in")
    }
    return this["code"] ?: throw DomainException.validation(ErrorKeys.AUTH_SSO_FAILED, "The identity provider sent no code")
}

fun Route.authRoutes(
    auth: AuthService,
    encryption: EncryptionService,
    sso: SsoService,
    settings: ServerSettingsService,
    config: AppConfig,
) {
    fun ApplicationCall.account(user: UserSummary) = user.toAccountDto(encryption.settings(user.id, sessionToken()))

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
                call.respond(HttpStatusCode.Created, AuthResponse(result.user.toAccountDto(encryption.settings(result.user.id, result.token))))
            }

            post("/login") {
                val request = call.receive<LoginRequest>()
                val result = auth.login(request.login, request.password)
                call.setSessionCookie(result.token, config.sessionTtlSeconds, config.cookieSecure)
                call.respond(AuthResponse(result.user.toAccountDto(encryption.settings(result.user.id, result.token))))
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
                call.respond(AuthResponse(result.user.toAccountDto(encryption.settings(result.user.id, result.token))))
            }
        }

        post("/logout") {
            auth.logout(call.sessionToken())
            call.clearSessionCookie(config.cookieSecure)
            call.respond(HttpStatusCode.NoContent)
        }

        post("/logout-all") {
            val user = call.requireSession(auth)
            auth.logoutEverywhere(user.id)
            call.clearSessionCookie(config.cookieSecure)
            call.respond(HttpStatusCode.NoContent)
        }

        get("/me") {
            val user = call.requireSession(auth)
            call.respond(AuthResponse(call.account(user)))
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
            call.respond(AuthResponse(call.account(updated)))
        }

        // Encryption of the account's private notes (`docs/ENCRYPTION.md`). Turning it on answers with
        // the recovery key, the one time it is ever sent.
        rateLimit(AUTH_RATE_LIMIT) {
            post("/me/encryption") {
                val user = call.requireUser(auth)
                val request = call.receive<EnableEncryptionRequest>()
                val recoveryKey = encryption.enable(user.id, request.password, request.passphrase, call.requireSessionToken())
                call.respond(HttpStatusCode.Created, EncryptionEnabledResponse(call.account(user), recoveryKey))
            }

            // A device that signed in through the identity provider opens the notes here, once.
            post("/me/encryption/unlock") {
                val user = call.requireSession(auth)
                encryption.unlock(user.id, call.receive<UnlockEncryptionRequest>().secret, call.requireSessionToken())
                call.respond(AuthResponse(call.account(user)))
            }

            post("/me/encryption/recover") {
                val user = call.requireSession(auth)
                val request = call.receive<RecoverEncryptionRequest>()
                encryption.recover(user.id, request.recoveryKey, request.newPassphrase, call.requireSessionToken())
                call.respond(AuthResponse(call.account(user)))
            }

            post("/me/encryption/discard") {
                val user = call.requireSession(auth)
                encryption.discard(user.id, call.requireSessionToken())
                call.respond(AuthResponse(call.account(user)))
            }

            post("/me/encryption/passphrase") {
                val user = call.requireUser(auth)
                val request = call.receive<ChangePassphraseRequest>()
                encryption.changePassphrase(user.id, request.currentPassphrase, request.newPassphrase, call.requireSessionToken())
                call.respond(AuthResponse(call.account(user)))
            }
        }

        delete("/me/encryption") {
            val user = call.requireUser(auth)
            encryption.disable(user.id)
            call.respond(AuthResponse(call.account(user)))
        }

        // Signing in through the identity provider (`docs/API.md`). The attempt lives in a cookie of
        // this browser, and the provider's answer counts only with it.
        rateLimit(AUTH_RATE_LIMIT) {
            post("/sso/start") {
                val request = call.receive<SsoStartRequest>()
                if (request.link) call.requireUser(auth)
                val start = sso.begin(request.link, request.appChallenge)
                if (request.appChallenge == null) call.setSsoAttemptCookie(start.attempt, config.cookieSecure)
                call.respond(SsoStartResponse(start.url))
            }

            // A navigation, not a call of the page's: every outcome is a redirect, and a failure's key
            // travels along for the page to localize.
            get("/sso/callback") {
                val answer = call.request.queryParameters
                val state = answer["state"]
                if (state != null && sso.isAppAttempt(state)) {
                    val outcome = try {
                        "ssoCode=${sso.handOff(state, answer.providerCode()).encodeURLParameter()}"
                    } catch (failure: DomainException) {
                        sso.abandon(state)
                        "ssoError=${failure.key}"
                    }
                    return@get call.respondRedirect("$APP_RETURN?$outcome")
                }
                val attempt = call.ssoAttempt(config.cookieSecure)
                call.clearSsoAttemptCookie(config.cookieSecure)
                val target = try {
                    if (attempt == null || state != attempt.state) {
                        throw DomainException.validation(ErrorKeys.AUTH_SSO_FAILED, "The answer does not belong to a sign-in of this browser")
                    }
                    val code = answer.providerCode()
                    if (attempt.link) {
                        sso.link(call.requireUser(auth).id, code, attempt)
                        "/?sso=linked"
                    } else {
                        val result = sso.signIn(code, attempt)
                        call.setSessionCookie(result.token, config.sessionTtlSeconds, config.cookieSecure)
                        "/"
                    }
                } catch (failure: DomainException) {
                    "/?ssoError=${failure.key}"
                }
                call.respondRedirect(target)
            }

            // Android's app, back from the Custom Tab with the callback's code. This is where the sign-in
            // actually happens, in the WebView, so the session cookie lands there.
            post("/sso/exchange") {
                val request = call.receive<SsoExchangeRequest>()
                val handoff = sso.redeem(request.code, request.verifier)
                if (handoff.attempt.link) {
                    val user = call.requireUser(auth)
                    sso.link(user.id, handoff.providerCode, handoff.attempt)
                    call.respond(SsoExchangeResponse(call.account(user), linked = true))
                } else {
                    val result = sso.signIn(handoff.providerCode, handoff.attempt)
                    call.setSessionCookie(result.token, config.sessionTtlSeconds, config.cookieSecure)
                    val account = result.user.toAccountDto(encryption.settings(result.user.id, result.token))
                    call.respond(SsoExchangeResponse(account, linked = false))
                }
            }
        }

        delete("/me/sso") {
            val user = call.requireUser(auth)
            sso.unlink(user.id)
            call.respond(AuthResponse(call.account(user)))
        }
    }
}

/** The cookie of a request [requireUser] has already accepted. */
private fun ApplicationCall.requireSessionToken(): String = checkNotNull(sessionToken()) { "An authenticated call carries its cookie" }
