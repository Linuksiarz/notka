package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.http.dto.AuthResponse
import dev.duwe.notka.boundary.http.dto.toDto
import dev.duwe.notka.boundary.http.plugins.requireIntParameter
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.AvatarService
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.put

/** `PUT /api/auth/me/avatar`, the one route whose body is an avatar. */
const val AVATAR_UPLOAD = "/api/auth/me/avatar"

private val JPEG_XL = ContentType("image", "jxl")

fun Route.avatarRoutes(avatars: AvatarService, auth: AuthService) {
    // The body is the picture itself, recognised by its bytes, not by its Content-Type.
    put(AVATAR_UPLOAD) {
        val user = call.requireUser(auth)
        val bytes = call.receive<ByteArray>()
        call.respond(AuthResponse(avatars.set(user.id, bytes).toDto()))
    }

    delete(AVATAR_UPLOAD) {
        val user = call.requireUser(auth)
        call.respond(AuthResponse(avatars.remove(user.id).toDto()))
    }

    get("/api/users/{id}/avatar") {
        call.requireUser(auth)
        val bytes = avatars.bytes(call.requireIntParameter("id"))
        // The client asks with `?v=` set to the picture's `avatarAt`, so a new picture is a new address
        // and this one may be kept for good.
        call.response.header(HttpHeaders.CacheControl, "private, max-age=31536000, immutable")
        call.response.header(HttpHeaders.ContentDisposition, "inline")
        call.respondBytes(bytes, JPEG_XL)
    }
}
