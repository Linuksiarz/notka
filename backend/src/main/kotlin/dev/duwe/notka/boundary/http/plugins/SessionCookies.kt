package dev.duwe.notka.boundary.http.plugins

import dev.duwe.notka.control.AuthService
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.UserSummary
import io.ktor.http.Cookie
import io.ktor.server.application.ApplicationCall

const val SESSION_COOKIE: String = "notka_session"

fun ApplicationCall.sessionToken(): String? = request.cookies[SESSION_COOKIE]

/** Resolves the session cookie or fails with `UNAUTHORIZED`; the session expiry slides on every call. */
suspend fun ApplicationCall.requireUser(auth: AuthService): UserSummary = auth.authenticate(sessionToken())

/** The signed-in user, or `null` for a caller without a valid session — for what anyone may read. */
suspend fun ApplicationCall.optionalUser(auth: AuthService): UserSummary? = try {
    requireUser(auth)
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

private fun sessionCookie(value: String, maxAgeSeconds: Long, secure: Boolean) = Cookie(
    name = SESSION_COOKIE,
    value = value,
    maxAge = maxAgeSeconds.toInt(),
    path = "/",
    secure = secure,
    httpOnly = true,
    extensions = mapOf("SameSite" to "Lax"),
)
