package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteKind
import dev.duwe.notka.entity.model.NoteVersion
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

/** How much history one note keeps; older snapshots are dropped. */
private const val MAX_VERSIONS_PER_NOTE = 50

/** Archived note states. Dumb storage: access control lives in the control layer. */
class NoteVersionRepository(private val database: Database) {
    fun archive(version: NoteVersion) {
        transaction(database) {
            NoteVersions.insert {
                it[noteId] = version.noteId
                it[NoteVersions.version] = version.version
                it[kind] = version.kind.name
                it[title] = version.title
                it[content] = NoteDocument.write(version.document)
                it[authorId] = version.authorId
                it[createdAt] = version.createdAt
            }
            trim(version.noteId)
        }
    }

    /** Newest first, which is the order the history dialog shows them in. */
    fun listForNote(noteId: Int): List<NoteVersion> = transaction(database) {
        NoteVersions.selectAll()
            .where { NoteVersions.noteId eq noteId }
            .orderBy(NoteVersions.version to SortOrder.DESC)
            .map { it.toNoteVersion() }
    }

    fun find(noteId: Int, version: Int): NoteVersion? = transaction(database) {
        NoteVersions.selectAll()
            .where { (NoteVersions.noteId eq noteId) and (NoteVersions.version eq version) }
            .singleOrNull()
            ?.toNoteVersion()
    }

    /** Keeps the [MAX_VERSIONS_PER_NOTE] newest snapshots and drops the rest. */
    private fun trim(noteId: Int) {
        val oldestKept = NoteVersions.select(NoteVersions.version)
            .where { NoteVersions.noteId eq noteId }
            .orderBy(NoteVersions.version to SortOrder.DESC)
            .limit(1)
            .offset((MAX_VERSIONS_PER_NOTE - 1).toLong())
            .singleOrNull()
            ?.get(NoteVersions.version)
            ?: return

        NoteVersions.deleteWhere {
            (NoteVersions.noteId eq noteId) and (NoteVersions.version less oldestKept)
        }
    }

    private fun ResultRow.toNoteVersion() = NoteVersion(
        noteId = this[NoteVersions.noteId],
        version = this[NoteVersions.version],
        kind = NoteKind.valueOf(this[NoteVersions.kind]),
        title = this[NoteVersions.title],
        document = NoteDocument.parse(this[NoteVersions.content]),
        authorId = this[NoteVersions.authorId],
        createdAt = this[NoteVersions.createdAt],
    )
}
