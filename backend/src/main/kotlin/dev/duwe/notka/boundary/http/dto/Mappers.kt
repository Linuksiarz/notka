package dev.duwe.notka.boundary.http.dto

import dev.duwe.notka.control.ResolvedNote
import dev.duwe.notka.entity.model.LinkPreview
import dev.duwe.notka.control.ResolvedVersion
import dev.duwe.notka.control.ShareWithUser
import dev.duwe.notka.entity.model.Label

fun Label.toDto(): LabelDto = LabelDto(id, name)

fun ShareWithUser.toDto(): ShareDto = ShareDto(user.toDto(), permission)

/** Collaborator shares are dropped here: the owner is the only one who sees them. */
fun ResolvedVersion.toSummaryDto(): NoteVersionSummaryDto = NoteVersionSummaryDto(
    version = version.version,
    kind = version.kind.name,
    title = version.title,
    createdAt = version.createdAt,
    author = author.toDto(),
)

fun ResolvedVersion.toDto(): NoteVersionDto = NoteVersionDto(
    version = version.version,
    kind = version.kind.name,
    title = version.title,
    content = version.document,
    createdAt = version.createdAt,
    author = author.toDto(),
)

fun ResolvedNote.toDto(): NoteDto = NoteDto(
    id = note.id,
    kind = note.kind.name,
    title = note.title,
    content = note.document,
    color = color,
    background = background,
    reminderAt = reminderAt,
    reminderRepeat = reminderRepeat?.wire,
    archived = note.archived,
    completedCollapsed = completedCollapsed,
    pinned = pinned,
    position = position,
    trashedAt = note.trashedAt,
    createdAt = note.createdAt,
    updatedAt = note.updatedAt,
    version = note.version,
    docVersion = docVersion,
    owner = owner.toDto(),
    access = access.name,
    canEdit = access.canEdit,
    canChangeAppearance = access.canChangeAppearance,
    labels = labels.map { it.toDto() },
    shares = shares.map { it.toDto() },
    linkPreviews = linkPreviews.map { it.toDto() },
    images = images.map { NoteImageDto(it.id, it.width, it.height, it.contentType) },
    unseenEdit = unseenEdit?.let { UnseenEditDto(it.editor.toDto(), it.at) },
)

fun LinkPreview.toDto(): LinkPreviewDto = LinkPreviewDto(
    url = url,
    title = title,
    siteName = siteName,
    imageUrl = imageUrl,
)
