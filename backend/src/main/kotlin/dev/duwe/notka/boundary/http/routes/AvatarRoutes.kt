package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.http.dto.AuthResponse
import dev.duwe.notka.boundary.http.dto.toAccountDto
import dev.duwe.notka.boundary.http.dto.toDto
import dev.duwe.notka.boundary.http.plugins.requireIntParameter
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.AvatarService
import dev.duwe.notka.control.EncryptionService
import dev.duwe.notka.control.SsoService
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put

/** `PUT /api/auth/me/avatar`, the one route whose body is an avatar. */
const val AVATAR_UPLOAD = "/api/auth/me/avatar"

private val JPEG_XL = ContentType("image", "jxl")

fun Route.avatarRoutes(avatars: AvatarService, auth: AuthService, encryption: EncryptionService, sso: SsoService) {
    // The body is the picture itself, recognised by its bytes, not by its Content-Type.
    put(AVATAR_UPLOAD) {
        val user = call.requireUser(auth)
        sso.requireMayUploadAvatar(user.id)
        val bytes = call.receive<ByteArray>()
        call.respond(AuthResponse(avatars.set(user.id, bytes).toAccountDto(encryption.settings(user.id))))
    }

    delete(AVATAR_UPLOAD) {
        val user = call.requireUser(auth)
        sso.requireUnmanaged(user.id)
        call.respond(AuthResponse(avatars.remove(user.id).toAccountDto(encryption.settings(user.id))))
    }

    // A POST because it hands the picture over once: the page encodes it and answers with the upload above.
    post("$AVATAR_UPLOAD/provider") {
        val user = call.requireUser(auth)
        val picture = sso.takePicture(user.id) ?: return@post call.respond(HttpStatusCode.NoContent)
        call.respondBytes(picture.bytes, ContentType.parse(picture.contentType))
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
