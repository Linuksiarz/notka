package dev.duwe.notka.entity.model

/**
 * A note as it stood at [version], kept so an overwritten state can be read back or downloaded.
 *
 * Only content-bearing state is archived — `title`, `kind` and the document. Appearance is a
 * property of the note rather than a historic choice, so it is not versioned.
 */
data class NoteVersion(
    val noteId: Int,
    val version: Int,
    val kind: NoteKind,
    val title: String,
    val document: NoteDocument,
    val authorId: Int,
    val createdAt: Long,
) {
    companion object {
        fun of(note: Note, authorId: Int, createdAt: Long) = NoteVersion(
            noteId = note.id,
            version = note.version,
            kind = note.kind,
            title = note.title,
            document = note.document,
            authorId = authorId,
            createdAt = createdAt,
        )
    }
}
