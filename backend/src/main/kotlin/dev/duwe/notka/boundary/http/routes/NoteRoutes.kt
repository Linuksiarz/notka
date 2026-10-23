package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.http.dto.CreateNoteRequest
import dev.duwe.notka.boundary.http.dto.CreateShareRequest
import dev.duwe.notka.boundary.http.dto.MoveNoteRequest
import dev.duwe.notka.boundary.http.dto.NotesResponse
import dev.duwe.notka.boundary.http.dto.PatchNoteRequest
import dev.duwe.notka.boundary.http.dto.StepDto
import dev.duwe.notka.boundary.http.dto.StepsRequest
import dev.duwe.notka.boundary.http.dto.StepsResponse
import dev.duwe.notka.boundary.http.dto.SharesResponse
import dev.duwe.notka.boundary.http.dto.UpdateShareRequest
import dev.duwe.notka.boundary.http.dto.toDto
import dev.duwe.notka.boundary.http.dto.NoteVersionsResponse
import dev.duwe.notka.boundary.http.dto.toSummaryDto
import dev.duwe.notka.boundary.http.plugins.requireIntParameter
import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.CreateNoteCommand
import dev.duwe.notka.control.NoteService
import dev.duwe.notka.control.PatchNoteCommand
import dev.duwe.notka.control.SubmitStepsCommand
import dev.duwe.notka.control.SharingService
import dev.duwe.notka.entity.model.BackgroundChange
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.NoteView
import dev.duwe.notka.entity.model.ReminderChange
import dev.duwe.notka.entity.model.ReminderRepeat
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.header
import io.ktor.server.response.respondBytes
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.json.Json

fun Route.noteRoutes(notes: NoteService, sharing: SharingService, auth: AuthService) {
    route("/api/notes") {
        get {
            val user = call.requireUser(auth)
            val labelId = call.request.queryParameters["labelId"]?.let { raw ->
                raw.toIntOrNull() ?: throw DomainException.validation(
                    ErrorKeys.REQUEST_INVALID_BODY,
                    "labelId must be a number",
                )
            }
            val view = parseView(call.request.queryParameters["view"])
            // `reminders=true` is the reminders view: the notes carrying a reminder, soonest first.
            // Its order is by the reminder rather than by when the note was last written, which is why
            // it is not expressed as another `view`.
            val remindersOnly = call.request.queryParameters["reminders"]?.toBooleanStrictOrNull() == true
            val listed = if (remindersOnly) notes.reminders(user.id) else notes.list(user.id, view, labelId)
            call.respond(NotesResponse(listed.map { it.toDto() }))
        }

        post {
            val user = call.requireUser(auth)
            val request = call.receive<CreateNoteRequest>()
            val created = notes.create(
                user.id,
                CreateNoteCommand(
                    kind = request.kind,
                    title = request.title,
                    document = request.content,
                    labelIds = request.labels,
                ),
            )
            call.respond(HttpStatusCode.Created, created.toDto())
        }

        get("/{id}") {
            val user = call.requireUser(auth)
            call.respond(notes.get(user.id, call.requireIntParameter("id")).toDto())
        }

        patch("/{id}") {
            val user = call.requireUser(auth)
            val noteId = call.requireIntParameter("id")
            val request = call.receive<PatchNoteRequest>()
            call.respond(notes.patch(user.id, noteId, request.toCommand()).toDto())
        }

        // The body's collaboration log (`docs/COLLABORATION.md`): an editor sends its steps against
        // the body version it has, and catches up on everyone else's from here.
        post("/{id}/steps") {
            val user = call.requireUser(auth)
            val noteId = call.requireIntParameter("id")
            val request = call.receive<StepsRequest>()
            val command = SubmitStepsCommand(
                docVersion = request.docVersion,
                clientId = request.clientId,
                steps = request.steps.map { it.toString() },
                document = request.content,
                title = request.title,
                kind = request.kind,
                titleBase = request.titleBase,
            )
            call.respond(notes.submitSteps(user.id, noteId, command).toDto())
        }

        get("/{id}/steps") {
            val user = call.requireUser(auth)
            val noteId = call.requireIntParameter("id")
            val since = call.request.queryParameters["since"]?.toIntOrNull() ?: throw DomainException.validation(
                ErrorKeys.REQUEST_INVALID_BODY,
                "since must be a body version",
            )
            val log = notes.stepsSince(user.id, noteId, since)
            val steps = log.steps
            call.respond(
                if (steps == null) {
                    StepsResponse(docVersion = log.docVersion, reset = true)
                } else {
                    StepsResponse(
                        docVersion = log.docVersion,
                        steps = steps.map { StepDto(Json.parseToJsonElement(it.step), it.clientId) },
                    )
                },
            )
        }

        delete("/{id}") {
            val user = call.requireUser(auth)
            val noteId = call.requireIntParameter("id")
            if (call.request.queryParameters["permanent"]?.toBooleanStrictOrNull() == true) {
                notes.deletePermanently(user.id, noteId)
                call.respond(HttpStatusCode.NoContent)
            } else {
                call.respond(notes.trash(user.id, noteId).toDto())
            }
        }

        post("/{id}/restore") {
            val user = call.requireUser(auth)
            call.respond(notes.restore(user.id, call.requireIntParameter("id")).toDto())
        }

        get("/{id}/versions") {
            val user = call.requireUser(auth)
            val noteId = call.requireIntParameter("id")
            call.respond(NoteVersionsResponse(notes.history(user.id, noteId).map { it.toSummaryDto() }))
        }

        get("/{id}/versions/{version}") {
            val user = call.requireUser(auth)
            val noteId = call.requireIntParameter("id")
            val version = call.requireIntParameter("version")
            call.respond(notes.historyEntry(user.id, noteId, version).toDto())
        }

        // Pictures: the body is the image itself, recognised by its bytes, not by its Content-Type.
        post("/{id}/images") {
            val user = call.requireUser(auth)
            val noteId = call.requireIntParameter("id")
            val bytes = call.receive<ByteArray>()
            call.respond(HttpStatusCode.Created, notes.addImage(user.id, noteId, bytes).toDto())
        }

        get("/{id}/images/{imageId}") {
            val user = call.requireUser(auth)
            val (type, bytes) = notes.imageBytes(user.id, call.requireIntParameter("id"), call.requireIntParameter("imageId"))
            // A picture never changes under its id, so the browser may keep it; `private` because it
            // is only ever someone's own note.
            call.response.header(HttpHeaders.CacheControl, "private, max-age=31536000, immutable")
            call.response.header(HttpHeaders.ContentDisposition, "inline")
            call.respondBytes(bytes, ContentType.parse(type))
        }

        delete("/{id}/images/{imageId}") {
            val user = call.requireUser(auth)
            val note = notes.removeImage(user.id, call.requireIntParameter("id"), call.requireIntParameter("imageId"))
            call.respond(note.toDto())
        }

        // The reader opened the note: its "edited by" marker goes away for them alone.
        post("/{id}/seen") {
            val user = call.requireUser(auth)
            call.respond(notes.markSeen(user.id, call.requireIntParameter("id")).toDto())
        }

        post("/{id}/move") {
            val user = call.requireUser(auth)
            val request = call.receive<MoveNoteRequest>()
            call.respond(notes.move(user.id, call.requireIntParameter("id"), request.before, request.after).toDto())
        }

        post("/{id}/copy") {
            val user = call.requireUser(auth)
            val copied = notes.copy(user.id, call.requireIntParameter("id"))
            call.respond(HttpStatusCode.Created, copied.toDto())
        }

        delete("/{id}/labels/{labelId}") {
            val user = call.requireUser(auth)
            val noteId = call.requireIntParameter("id")
            val labelId = call.requireIntParameter("labelId")
            call.respond(notes.detachLabel(user.id, noteId, labelId).toDto())
        }

        route("/{id}/shares") {
            get {
                val user = call.requireUser(auth)
                val noteId = call.requireIntParameter("id")
                call.respond(SharesResponse(sharing.list(user.id, noteId).map { it.toDto() }))
            }

            post {
                val user = call.requireUser(auth)
                val noteId = call.requireIntParameter("id")
                val request = call.receive<CreateShareRequest>()
                val created = sharing.add(user.id, noteId, request.email, request.permission)
                call.respond(HttpStatusCode.Created, created.toDto())
            }

            patch("/{userId}") {
                val user = call.requireUser(auth)
                val noteId = call.requireIntParameter("id")
                val targetUserId = call.requireIntParameter("userId")
                val request = call.receive<UpdateShareRequest>()
                val updated = sharing.update(user.id, noteId, targetUserId, request.permission)
                call.respond(updated.toDto())
            }

            delete("/{userId}") {
                val user = call.requireUser(auth)
                sharing.remove(user.id, call.requireIntParameter("id"), call.requireIntParameter("userId"))
                call.respond(HttpStatusCode.NoContent)
            }
        }
    }
}

private fun parseView(raw: String?): NoteView = when (raw?.trim()?.lowercase()) {
    null, "", "active" -> NoteView.ACTIVE
    "archived" -> NoteView.ARCHIVED
    "trash" -> NoteView.TRASH
    else -> throw DomainException.validation(
        ErrorKeys.REQUEST_INVALID_BODY,
        "View must be one of active, archived, trash",
    )
}

private fun PatchNoteRequest.toCommand() = PatchNoteCommand(
    kind = kind,
    title = title,
    document = content,
    archived = archived,
    pinned = pinned,
    trashed = trashed,
    color = color,
    // "" is the sentinel for "clear the background"; null/omitted means "leave it alone".
    background = when (background) {
        null -> BackgroundChange.Unchanged
        "" -> BackgroundChange.Cleared
        else -> BackgroundChange.Set(background)
    },
    reminder = when {
        reminderAt == null -> ReminderChange.Unchanged
        reminderAt == 0L -> ReminderChange.Cleared
        reminderAt < 0 -> throw DomainException.validation(
            ErrorKeys.REQUEST_INVALID_BODY,
            "reminderAt must be a moment in epoch milliseconds, or 0 to take the reminder away",
        )
        else -> ReminderChange.Set(reminderAt, parseReminderRepeat(reminderRepeat))
    },
    labelIds = labels,
    expectedVersion = version,
)

/** The repeat rule a wire value names; absent or empty means the reminder does not come back. */
private fun parseReminderRepeat(raw: String?): ReminderRepeat? = when (raw) {
    null, "" -> null
    else -> ReminderRepeat.fromWire(raw) ?: throw DomainException.validation(
        ErrorKeys.REQUEST_INVALID_BODY,
        "reminderRepeat must be one of ${ReminderRepeat.entries.joinToString(", ") { it.wire }}",
    )
}
