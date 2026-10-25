package dev.duwe.notka.boundary.http.dto

import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.UserSummary
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class UserDto(
    val id: Int,
    val email: String?,
    val username: String?,
    val displayName: String,
    val admin: Boolean,
    /** When the account's picture last changed (`GET /api/users/{id}/avatar?v=…`); `null` shows the initials. */
    val avatarAt: Long?,
)

fun UserSummary.toDto(): UserDto = UserDto(id, email, username, displayName, admin, avatarAt)

@Serializable
data class AuthResponse(val user: UserDto)

@Serializable
data class RegisterRequest(val email: String, val displayName: String, val password: String)

@Serializable
data class LoginRequest(
    /** An e-mail address, or the administrator's username. */
    val login: String,
    val password: String,
)

@Serializable
data class PasswordResetRequest(val token: String, val password: String)

@Serializable
data class PatchMeRequest(
    val displayName: String? = null,
    val currentPassword: String? = null,
    val newPassword: String? = null,
)

/** A sample sign-in offered by a demo instance; see `DemoData`. */
@Serializable
data class DemoAccountDto(val email: String, val password: String)

@Serializable
data class HealthResponse(
    val status: String,
    val version: String,
    /**
     * True on a demo instance, so the sign-in screen can offer the sample credentials instead of
     * leaving them to the README. Configuration, not data: the health check still touches neither
     * the database nor the session.
     */
    val demo: Boolean = false,
    /** Whether `POST /api/auth/register` would accept a sign-up now; the sign-in screen hides it otherwise. */
    val registrationOpen: Boolean = true,
    /** How many days a trashed note stays before it is deleted for good; the trash says so. */
    val trashRetentionDays: Long = 30,
    /**
     * The sample sign-ins, empty on anything but a demo instance. The passwords are public there by
     * design, and carrying them here keeps the seeder the single place that defines them.
     */
    val demoAccounts: List<DemoAccountDto> = emptyList(),
)

@Serializable
data class LabelDto(val id: Int, val name: String)

@Serializable
data class LabelsResponse(val labels: List<LabelDto>)

@Serializable
data class CreateLabelRequest(val name: String)

@Serializable
data class RenameLabelRequest(val name: String)

@Serializable
data class ShareDto(val user: UserDto, val permission: String)

@Serializable
data class SharesResponse(val shares: List<ShareDto>)

@Serializable
data class CreateShareRequest(val email: String, val permission: String)

@Serializable
data class UpdateShareRequest(val permission: String)

/**
 * `background` has no default so that it is always serialized, `null` included.
 * `shares` is dropped while empty: a note shared with nobody says nothing about it.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class NoteDto(
    val id: Int,
    val kind: String,
    val title: String,
    val content: NoteDocument,
    val color: String,
    val background: String?,
    val archived: Boolean,
    /** Whether this reader folded the list's completed items away — the reader's own, like [pinned]. */
    val completedCollapsed: Boolean,
    val pinned: Boolean,
    /** The note's place in its section, highest first; the order the lists come in. */
    val position: Long,
    val trashedAt: Long?,
    val createdAt: Long,
    val updatedAt: Long,
    val version: Int,
    /** The version of the body in its step log; an editor sends its steps against it. */
    val docVersion: Int,
    val owner: UserDto,
    val access: String,
    val canEdit: Boolean,
    val canChangeAppearance: Boolean,
    val labels: List<LabelDto>,
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val shares: List<ShareDto> = emptyList(),
    /** Only the links that already have a card; a note with none omits the field entirely. */
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val linkPreviews: List<LinkPreviewDto> = emptyList(),
    /** The reminder, if the note carries one; a note without one omits both fields. */
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val reminderAt: Long? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val reminderRepeat: String? = null,
    /** The note's pictures in order; a note with none omits the field. */
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val images: List<NoteImageDto> = emptyList(),
    /**
     * Somebody else's content edit the reader has not opened the note since — the card's "edited by"
     * marker. Absent when there is none; `POST /api/notes/{id}/seen` takes it away for this reader.
     */
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val unseenEdit: UnseenEditDto? = null,
)

/** Who wrote a note's content last, and when, while the reader has not seen it. */
@Serializable
data class UnseenEditDto(val user: UserDto, val at: Long)

/** A picture's place in the note; its bytes are at `/api/notes/{noteId}/images/{id}`. */
@Serializable
data class NoteImageDto(val id: Int, val width: Int, val height: Int, val contentType: String)

/**
 * A link's card, resolved from the cache. `siteName` is the site's own name when it publishes one
 * and its host otherwise; `imageUrl` is absent when the page offers no artwork.
 */
@Serializable
data class LinkPreviewDto(
    val url: String,
    val title: String,
    val siteName: String,
    val imageUrl: String? = null,
)

@Serializable
data class NotesResponse(val notes: List<NoteDto>)

/**
 * One entry in the history list. It deliberately carries no document: a note can keep fifty of
 * these, and shipping every body would turn a list request into megabytes. Fetch the version itself
 * when the user actually asks for it.
 */
@Serializable
data class NoteVersionSummaryDto(
    val version: Int,
    val kind: String,
    val title: String,
    val createdAt: Long,
    val author: UserDto,
)

/** One archived state of a note, content included. Appearance is not versioned. */
@Serializable
data class NoteVersionDto(
    val version: Int,
    val kind: String,
    val title: String,
    val content: NoteDocument,
    val createdAt: Long,
    val author: UserDto,
)

@Serializable
data class NoteVersionsResponse(val versions: List<NoteVersionSummaryDto>)

@Serializable
data class CreateNoteRequest(
    val kind: String? = null,
    val title: String? = null,
    /** Absent means "start from the canonical empty document". */
    val content: NoteDocument? = null,
    val labels: List<Int>? = null,
)

/**
 * Partial update. Every nullable field means "absent" when `null`, except [background]: because a
 * note can legitimately have *no* background, clearing it is expressed with the empty string
 * sentinel (`background = ""` → `null`), while `null`/omitted leaves it untouched.
 */
@Serializable
data class PatchNoteRequest(
    val kind: String? = null,
    val title: String? = null,
    val content: NoteDocument? = null,
    val archived: Boolean? = null,
    val pinned: Boolean? = null,
    /** Folds (`true`) or unfolds (`false`) the completed items for the caller alone, like [pinned]. */
    val completedCollapsed: Boolean? = null,
    val trashed: Boolean? = null,
    val color: String? = null,
    val background: String? = null,
    /**
     * The reminder's moment, in epoch milliseconds. `null`/omitted leaves the reminder alone and a
     * positive value sets one; **`0` takes it away** — a note can legitimately have none, and that is
     * the only way to say so. [reminderRepeat] belongs to the same instruction and is ignored unless a
     * moment is being set; it must be one of `daily`, `weekly`, `monthly`, `yearly`, or omitted for a
     * reminder that does not come back.
     */
    val reminderAt: Long? = null,
    val reminderRepeat: String? = null,
    val labels: List<Int>? = null,
    /**
     * Optional optimistic-concurrency token: the `version` the client last read. Send it when
     * writing `title`, `kind` or `content`, so that a concurrent edit answers `409` instead of
     * silently destroying the other writer's text. Omit it for appearance, label and archive
     * changes — those cannot lose anyone's content, and guarding them would block a collaborator
     * from recolouring a note just because someone else typed in it.
     */
    val version: Int? = null,
)

/**
 * An editor's steps over the body at [docVersion] (`docs/COLLABORATION.md`), with the body they
 * produce — and the title and kind when those changed with them. Each step is ProseMirror's own JSON,
 * which the server stores and hands on without reading it.
 */
@Serializable
data class StepsRequest(
    val docVersion: Int,
    val clientId: String,
    val steps: List<JsonElement>,
    val content: NoteDocument,
    val title: String? = null,
    val kind: String? = null,
    /**
     * The title the writer started from, sent with a [title] written without a connection: if the
     * note was renamed meanwhile, the write is refused (`note.version_conflict`) rather than renaming
     * it over somebody else's title — the offline queue then keeps the text as a note of its own.
     */
    val titleBase: String? = null,
)

@Serializable
data class StepDto(val step: JsonElement, val clientId: String)

/**
 * The steps after `since`, or `reset: true` when the log does not reach back that far and the
 * editor has to read the note itself.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class StepsResponse(
    val docVersion: Int,
    @EncodeDefault val steps: List<StepDto> = emptyList(),
    @EncodeDefault val reset: Boolean = false,
)

/** Where a dragged note goes: directly above [before], or directly below [after] — exactly one. */
@Serializable
data class MoveNoteRequest(val before: Int? = null, val after: Int? = null)
