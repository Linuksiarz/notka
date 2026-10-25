package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.http.dto.AddFriendRequest
import dev.duwe.notka.boundary.http.dto.CreateFriendGroupRequest
import dev.duwe.notka.boundary.http.dto.UpdateFriendGroupRequest
import dev.duwe.notka.boundary.http.dto.toDto
import dev.duwe.notka.boundary.http.plugins.requireIntParameter
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.FriendService
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.friendRoutes(friends: FriendService, auth: AuthService) {
    route("/api/friends") {
        get {
            val user = call.requireUser(auth)
            call.respond(friends.circle(user.id).toDto())
        }

        post {
            val user = call.requireUser(auth)
            val request = call.receive<AddFriendRequest>()
            call.respond(HttpStatusCode.Created, friends.add(user.id, request.login).toDto())
        }

        delete("/{userId}") {
            val user = call.requireUser(auth)
            friends.remove(user.id, call.requireIntParameter("userId"))
            call.respond(HttpStatusCode.NoContent)
        }
    }

    route("/api/friend-groups") {
        post {
            val user = call.requireUser(auth)
            val request = call.receive<CreateFriendGroupRequest>()
            call.respond(HttpStatusCode.Created, friends.createGroup(user.id, request.name, request.memberIds).toDto())
        }

        patch("/{id}") {
            val user = call.requireUser(auth)
            val request = call.receive<UpdateFriendGroupRequest>()
            val updated = friends.updateGroup(user.id, call.requireIntParameter("id"), request.name, request.memberIds)
            call.respond(updated.toDto())
        }

        delete("/{id}") {
            val user = call.requireUser(auth)
            friends.deleteGroup(user.id, call.requireIntParameter("id"))
            call.respond(HttpStatusCode.NoContent)
        }
    }
}
