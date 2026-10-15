package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.http.dto.SelectThemeRequest
import dev.duwe.notka.boundary.http.dto.toDto
import dev.duwe.notka.boundary.http.plugins.requireIntParameter
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.ThemeService
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import io.ktor.server.routing.route

/**
 * A theme's picture is drawn as a CSS background, where an SVG's script never runs — but the same
 * url can be opened on its own, and then the browser would run it on this origin. The sandbox keeps
 * it inert there too: no script, no same-origin access, nothing loaded from anywhere.
 */
private const val THEME_FILE_POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"

/** The themes every account chooses from, its own choice, and the pictures themselves. */
fun Route.themeRoutes(auth: AuthService, themes: ThemeService) {
    route("/api/themes") {
        get {
            val user = call.requireUser(auth)
            call.respond(themes.choice(user.id).toDto())
        }

        put("/selection") {
            val user = call.requireUser(auth)
            val request = call.receive<SelectThemeRequest>()
            themes.select(user.id, request.themeId)
            call.respond(themes.choice(user.id).toDto())
        }

        get("/{themeId}/files/{fileId}") {
            call.requireUser(auth)
            val (type, bytes) = themes.file(call.parameters["themeId"].orEmpty(), call.requireIntParameter("fileId"))
            // A replaced theme gets new file ids, so a picture never changes under its url.
            call.response.header(HttpHeaders.CacheControl, "private, max-age=31536000, immutable")
            call.response.header("Content-Security-Policy", THEME_FILE_POLICY)
            call.response.header(HttpHeaders.ContentDisposition, "inline")
            call.respondBytes(bytes, ContentType.parse(type))
        }
    }
}
