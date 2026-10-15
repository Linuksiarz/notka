package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.http.dto.CreateLabelRequest
import dev.duwe.notka.boundary.http.dto.LabelDto
import dev.duwe.notka.boundary.http.dto.LabelsResponse
import dev.duwe.notka.boundary.http.dto.RenameLabelRequest
import dev.duwe.notka.boundary.http.plugins.requireIntParameter
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.LabelService
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.labelRoutes(labels: LabelService, auth: AuthService) {
    route("/api/labels") {
        get {
            val user = call.requireUser(auth)
            call.respond(LabelsResponse(labels.list(user.id).map { LabelDto(it.id, it.name) }))
        }

        post {
            val user = call.requireUser(auth)
            val request = call.receive<CreateLabelRequest>()
            val created = labels.create(user.id, request.name)
            call.respond(HttpStatusCode.Created, LabelDto(created.id, created.name))
        }

        patch("/{id}") {
            val user = call.requireUser(auth)
            val labelId = call.requireIntParameter("id")
            val request = call.receive<RenameLabelRequest>()
            val renamed = labels.rename(user.id, labelId, request.name)
            call.respond(LabelDto(renamed.id, renamed.name))
        }

        delete("/{id}") {
            val user = call.requireUser(auth)
            labels.delete(user.id, call.requireIntParameter("id"))
            call.respond(HttpStatusCode.NoContent)
        }
    }
}
