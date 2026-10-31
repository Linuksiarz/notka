package dev.duwe.notka.boundary.http.plugins

import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.SsoAttempt
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.UserSummary
import io.ktor.http.Cookie
import io.ktor.server.application.ApplicationCall

const val SESSION_COOKIE: String = "notka_session"

/** How long a reader has at the identity provider before the sign-in has to be started again. */
private const val SSO_ATTEMPT_SECONDS: Int = 10 * 60
private const val SSO_ATTEMPT_PARTS: Int = 4

fun ApplicationCall.sessionToken(): String? = request.cookies[SESSION_COOKIE]

/** Resolves the session cookie or fails with `UNAUTHORIZED`; the session expiry slides on every call. */
suspend fun ApplicationCall.requireUser(auth: AuthService): UserSummary = auth.authenticate(sessionToken())

/**
 * Who is signed in, also on a device that has not unlocked the account's notes yet: only for what such
 * a device needs, reading who it is, unlocking and signing out.
 */
suspend fun ApplicationCall.requireSession(auth: AuthService): UserSummary = auth.authenticate(sessionToken(), allowLocked = true)

/** The signed-in user, or `null` for a caller without a valid session — for what anyone may read. */
suspend fun ApplicationCall.optionalUser(auth: AuthService): UserSummary? = try {
    requireSession(auth)
} catch (failure: DomainException) {
    if (failure.kind != dev.duwe.notka.entity.model.ErrorKind.UNAUTHORIZED) throw failure
    null
}

/** Path parameters are never trusted: a non-numeric id can only mean "no such resource". */
fun ApplicationCall.requireIntParameter(name: String): Int = parameters[name]?.toIntOrNull()
    ?: throw DomainException.notFound(
        dev.duwe.notka.entity.model.ErrorKeys.REQUEST_NOT_FOUND,
        "Invalid $name in the request path",
    )

fun ApplicationCall.setSessionCookie(token: String, maxAgeSeconds: Long, secure: Boolean) {
    response.cookies.append(sessionCookie(token, maxAgeSeconds, secure))
}

fun ApplicationCall.clearSessionCookie(secure: Boolean) {
    response.cookies.append(sessionCookie("", 0, secure))
}

/**
 * The sign-in under way, in the browser that started it: that is what makes the provider's answer this
 * browser's. It holds PKCE's verifier, which never leaves for the provider. `__Host-` wherever the
 * cookie is `Secure`, so a sibling subdomain cannot plant its own attempt and sign the reader in as
 * somebody else.
 */
private fun ssoAttemptCookieName(secure: Boolean) = if (secure) "__Host-notka_sso" else "notka_sso"

fun ApplicationCall.setSsoAttemptCookie(attempt: SsoAttempt, secure: Boolean) {
    val value = listOf(attempt.state, attempt.nonce, attempt.codeVerifier, if (attempt.link) "link" else "signin").joinToString(".")
    response.cookies.append(ssoAttemptCookie(value, SSO_ATTEMPT_SECONDS, secure))
}

fun ApplicationCall.ssoAttempt(secure: Boolean): SsoAttempt? {
    val parts = request.cookies[ssoAttemptCookieName(secure)]?.split('.') ?: return null
    if (parts.size != SSO_ATTEMPT_PARTS) return null
    return SsoAttempt(parts[0], parts[1], parts[2], link = parts[3] == "link")
}

fun ApplicationCall.clearSsoAttemptCookie(secure: Boolean) {
    response.cookies.append(ssoAttemptCookie("", 0, secure))
}

private fun ssoAttemptCookie(value: String, maxAgeSeconds: Int, secure: Boolean) = Cookie(
    name = ssoAttemptCookieName(secure),
    value = value,
    maxAge = maxAgeSeconds,
    path = "/",
    secure = secure,
    httpOnly = true,
    // Lax, not Strict: the answer is a top-level navigation coming from the provider's site.
    extensions = mapOf("SameSite" to "Lax"),
)

private fun sessionCookie(value: String, maxAgeSeconds: Long, secure: Boolean) = Cookie(
    name = SESSION_COOKIE,
    value = value,
    maxAge = maxAgeSeconds.toInt(),
    path = "/",
    secure = secure,
    httpOnly = true,
    extensions = mapOf("SameSite" to "Lax"),
)
