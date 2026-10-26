package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteKind
import dev.duwe.notka.entity.model.NoteVersion
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import javax.crypto.SecretKey

/** How much history one note keeps; older snapshots are dropped. */
private const val MAX_VERSIONS_PER_NOTE = 50

/**
 * Archived note states. Dumb storage: access control lives in the control layer. A sealed note's
 * history is sealed with it, and opened here.
 */
class NoteVersionRepository(private val database: Database, private val keys: KeyRing) {
    fun archive(version: NoteVersion) {
        transaction(database) {
            val key = keys.sealingKeyOf(version.noteId)
            val stored = { text: String, place: String -> key?.let { Sealing.sealText(it, text, place) } ?: text }
            NoteVersions.insert {
                it[noteId] = version.noteId
                it[NoteVersions.version] = version.version
                it[kind] = version.kind.name
                it[title] = stored(version.title, SealedPlaces.versionTitle(version.noteId))
                it[content] = stored(NoteDocument.write(version.document), SealedPlaces.versionContent(version.noteId))
                it[authorId] = version.authorId
                it[createdAt] = version.createdAt
            }
            trim(version.noteId)
        }
    }

    /** Newest first, which is the order the history dialog shows them in. */
    fun listForNote(noteId: Int): List<NoteVersion> = transaction(database) {
        val key = keys.sealingKeyOf(noteId)
        NoteVersions.selectAll()
            .where { NoteVersions.noteId eq noteId }
            .orderBy(NoteVersions.version to SortOrder.DESC)
            .map { it.toNoteVersion(key) }
    }

    fun find(noteId: Int, version: Int): NoteVersion? = transaction(database) {
        val key = keys.sealingKeyOf(noteId)
        NoteVersions.selectAll()
            .where { (NoteVersions.noteId eq noteId) and (NoteVersions.version eq version) }
            .singleOrNull()
            ?.toNoteVersion(key)
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

    private fun ResultRow.toNoteVersion(key: SecretKey?): NoteVersion {
        val noteId = this[NoteVersions.noteId]
        val opened = { text: String, place: String -> key?.let { Sealing.openText(it, text, place) } ?: text }
        return NoteVersion(
            noteId = noteId,
            version = this[NoteVersions.version],
            kind = NoteKind.valueOf(this[NoteVersions.kind]),
            title = opened(this[NoteVersions.title], SealedPlaces.versionTitle(noteId)),
            document = NoteDocument.parse(opened(this[NoteVersions.content], SealedPlaces.versionContent(noteId))),
            authorId = this[NoteVersions.authorId],
            createdAt = this[NoteVersions.createdAt],
        )
    }
}
