package dev.duwe.notka.boundary.http.plugins

import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.boundary.http.dto.ErrorBody
import dev.duwe.notka.boundary.http.dto.ErrorResponse
import dev.duwe.notka.boundary.http.dto.toCode
import dev.duwe.notka.boundary.http.dto.toHttpStatus
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import dev.duwe.notka.boundary.http.routes.AVATAR_UPLOAD
import dev.duwe.notka.control.MAX_AVATAR_BYTES
import dev.duwe.notka.control.MAX_IMAGE_BYTES
import dev.duwe.notka.control.MAX_THEME_ARCHIVE_BYTES
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.application.install
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.autohead.AutoHeadResponse
import io.ktor.server.plugins.ContentTransformationException
import io.ktor.server.plugins.PayloadTooLargeException
import io.ktor.server.plugins.bodylimit.RequestBodyLimit
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.compression.Compression
import io.ktor.server.plugins.compression.deflate
import io.ktor.server.plugins.compression.gzip
import io.ktor.server.plugins.compression.excludeContentType
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.defaultheaders.DefaultHeaders
import io.ktor.server.sse.SSE
import io.ktor.server.plugins.forwardedheaders.XForwardedHeaders
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimit
import io.ktor.server.plugins.ratelimit.RateLimitName
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.response.respond
import kotlinx.serialization.SerializationException
import org.slf4j.event.Level
import kotlin.time.Duration.Companion.minutes

/** The window `NOTKA_AUTH_ATTEMPTS_PER_MINUTE` counts sign-in and registration attempts in. */
private val AUTH_ATTEMPTS_PERIOD = 1.minutes

/**
 * What the page may load. Everything is served by this server; the only exception is a link card's
 * thumbnail, which is an image on the linked site. Inline styles stay allowed because the editor and
 * the dialogs position themselves with `style` attributes; scripts do not. `'wasm-unsafe-eval'` lets
 * the page compile the JPEG XL encoder it loads from this origin (an avatar is encoded in the
 * browser); it allows no `eval` of script.
 */
private const val CONTENT_SECURITY_POLICY =
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; " +
        "worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; " +
        "form-action 'self'; frame-ancestors 'none'"

/** `POST /api/notes/{id}/images`, the only route whose body may be a picture. */
private val IMAGE_UPLOAD = Regex("^/api/notes/\\d+/images$")

/** The administrator's theme upload; its body is a whole `.zip`. */
private const val THEME_UPLOAD = "/api/admin/themes"

/** The rate limit [authRoutes] puts on signing in and registering. */
val AUTH_RATE_LIMIT = RateLimitName("auth")

/**
 * Refuses a state-changing request another site's page made with the user's cookie. `SameSite=Lax`
 * already keeps the cookie off a cross-site POST; this also covers a sibling subdomain, which counts
 * as the same site. A request without `Sec-Fetch-Site` is not from a browser and passes.
 */
private val CrossSiteRequestGuard = createApplicationPlugin("CrossSiteRequestGuard") {
    val safeMethods = setOf(HttpMethod.Get, HttpMethod.Head, HttpMethod.Options)
    val allowedSites = setOf("same-origin", "none")
    onCall { call ->
        val site = call.request.headers["Sec-Fetch-Site"] ?: return@onCall
        if (call.request.httpMethod !in safeMethods && site !in allowedSites) {
            throw DomainException.forbidden(ErrorKeys.REQUEST_CROSS_SITE, "Cross-site requests are not accepted")
        }
    }
}

/** Installs the plumbing of the API. All error rendering happens here, never in a route. */
fun Application.configureHttpPlugins(config: AppConfig) {
    val log = environment.log
    install(ContentNegotiation) {
        json(HttpSerialization.json)
    }
    install(StatusPages) {
        exception<DomainException> { call, cause ->
            call.respond(
                cause.kind.toHttpStatus(),
                ErrorResponse(ErrorBody(cause.kind.toCode(), cause.key, cause.message ?: cause.key, cause.params)),
            )
        }
        exception<BadRequestException> { call, _ ->
            call.respondError(ErrorKind.VALIDATION, ErrorKeys.REQUEST_INVALID_BODY, "Malformed request body")
        }
        exception<ContentTransformationException> { call, _ ->
            call.respondError(ErrorKind.VALIDATION, ErrorKeys.REQUEST_INVALID_BODY, "Malformed request body")
        }
        exception<SerializationException> { call, _ ->
            call.respondError(ErrorKind.VALIDATION, ErrorKeys.REQUEST_INVALID_BODY, "Malformed request body")
        }
        exception<PayloadTooLargeException> { call, _ ->
            call.respondError(ErrorKind.PAYLOAD_TOO_LARGE, ErrorKeys.REQUEST_TOO_LARGE, "Request body is too large")
        }
        exception<Throwable> { call, cause ->
            log.error("Unhandled failure while serving ${call.request.path()}", cause)
            call.respondError(ErrorKind.INTERNAL, ErrorKeys.REQUEST_INTERNAL, "Internal server error")
        }
        status(HttpStatusCode.NotFound) { call, _ ->
            if (call.request.path().startsWith("/api")) {
                call.respondError(ErrorKind.NOT_FOUND, ErrorKeys.REQUEST_NOT_FOUND, "Resource does not exist")
            }
        }
        status(HttpStatusCode.TooManyRequests) { call, _ ->
            call.respondError(ErrorKind.TOO_MANY_REQUESTS, ErrorKeys.REQUEST_TOO_MANY, "Too many attempts, try again later")
        }
    }
    install(CallLogging) {
        level = Level.INFO
        filter { call -> call.request.path().startsWith("/api") }
    }
    install(SSE)
    // `HEAD` answers like `GET` without the body: uptime monitors and proxies ask that way, and every
    // route here is a `GET` route, which would otherwise answer a `HEAD` with 404.
    install(AutoHeadResponse)
    install(DefaultHeaders) {
        header(HttpHeaders.Server, "Notka")
        header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        header("X-Content-Type-Options", "nosniff")
        header("X-Frame-Options", "DENY")
        header("Referrer-Policy", "same-origin")
        header("Cross-Origin-Opener-Policy", "same-origin")
        header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
    }
    // Only the last hop is believed: it is the one our own proxy appended. The RFC 7239 `Forwarded`
    // header is never read, because common proxies pass a client's copy of it through untouched.
    if (config.trustProxyHeaders) install(XForwardedHeaders) { useLastProxy() }
    install(CrossSiteRequestGuard)
    // A picture is the one body larger than a note; it gets its own ceiling, and only its own route.
    install(RequestBodyLimit) {
        bodyLimit { call ->
            val isPost = call.request.httpMethod == HttpMethod.Post
            val path = call.request.path()
            when {
                isPost && IMAGE_UPLOAD.matches(path) -> MAX_IMAGE_BYTES.toLong() + 1
                call.request.httpMethod == HttpMethod.Put && path == AVATAR_UPLOAD -> MAX_AVATAR_BYTES.toLong() + 1
                isPost && path == THEME_UPLOAD -> MAX_THEME_ARCHIVE_BYTES.toLong() + 1
                else -> config.maxRequestBytes
            }
        }
    }
    install(RateLimit) {
        register(AUTH_RATE_LIMIT) {
            rateLimiter(limit = config.authAttemptsPerMinute, refillPeriod = AUTH_ATTEMPTS_PERIOD)
            requestKey { call -> call.request.origin.remoteHost }
        }
    }
    install(Compression) {
        // Pictures are compressed already; gzipping them again only costs time.
        gzip { excludeContentType(ContentType.Image.Any) }
        deflate { excludeContentType(ContentType.Image.Any) }
    }
}

private suspend fun ApplicationCall.respondError(kind: ErrorKind, key: String, message: String) {
    respond(kind.toHttpStatus(), ErrorResponse(ErrorBody(kind.toCode(), key, message)))
}
