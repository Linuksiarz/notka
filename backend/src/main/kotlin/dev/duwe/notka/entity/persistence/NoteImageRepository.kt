package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.ImageInfo
import dev.duwe.notka.entity.model.NoteImage
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.statements.api.ExposedBlob
import org.jetbrains.exposed.sql.sum
import org.jetbrains.exposed.sql.transactions.transaction

/** A note's pictures. Reads that list them never touch the bytes; only [bytes] does. */
class NoteImageRepository(private val database: Database) {
    private val metadata = listOf(
        NoteImages.id,
        NoteImages.noteId,
        NoteImages.contentType,
        NoteImages.width,
        NoteImages.height,
        NoteImages.byteSize,
        NoteImages.createdAt,
    )

    fun insert(noteId: Int, info: ImageInfo, bytes: ByteArray, createdAt: Long): Int = transaction(database) {
        NoteImages.insert {
            it[NoteImages.noteId] = noteId
            it[contentType] = info.contentType
            it[width] = info.width
            it[height] = info.height
            it[byteSize] = bytes.size
            it[data] = ExposedBlob(bytes)
            it[NoteImages.createdAt] = createdAt
        } get NoteImages.id
    }

    fun listForNote(noteId: Int): List<NoteImage> = transaction(database) {
        NoteImages.select(metadata)
            .where { NoteImages.noteId eq noteId }
            .orderBy(NoteImages.id to SortOrder.ASC)
            .map { it.toImage() }
    }

    fun countForNote(noteId: Int): Long = transaction(database) {
        NoteImages.selectAll().where { NoteImages.noteId eq noteId }.count()
    }

    /** The picture's bytes and type, but only when it belongs to [noteId]. */
    fun bytes(noteId: Int, imageId: Int): Pair<String, ByteArray>? = transaction(database) {
        NoteImages.select(NoteImages.contentType, NoteImages.data)
            .where { (NoteImages.id eq imageId) and (NoteImages.noteId eq noteId) }
            .singleOrNull()
            ?.let { it[NoteImages.contentType] to it[NoteImages.data].bytes }
    }

    fun delete(noteId: Int, imageId: Int): Int = transaction(database) {
        NoteImages.deleteWhere { (NoteImages.id eq imageId) and (NoteImages.noteId eq noteId) }
    }

    /** Puts a copy of every picture of [fromNoteId] on [toNoteId], in the same order. */
    fun copy(fromNoteId: Int, toNoteId: Int, createdAt: Long) {
        transaction(database) {
            val rows = NoteImages.selectAll()
                .where { NoteImages.noteId eq fromNoteId }
                .orderBy(NoteImages.id to SortOrder.ASC)
                .toList()
            for (row in rows) {
                NoteImages.insert {
                    it[noteId] = toNoteId
                    it[contentType] = row[NoteImages.contentType]
                    it[width] = row[NoteImages.width]
                    it[height] = row[NoteImages.height]
                    it[byteSize] = row[NoteImages.byteSize]
                    it[data] = ExposedBlob(row[NoteImages.data].bytes)
                    it[NoteImages.createdAt] = createdAt
                }
            }
        }
    }

    /** Bytes held by the pictures of the given notes; the storage an account's notes take up. */
    fun bytesForNotes(noteIds: Collection<Int>): Long {
        if (noteIds.isEmpty()) return 0
        return transaction(database) {
            val total = NoteImages.byteSize.sum()
            NoteImages.select(total).where { NoteImages.noteId inList noteIds }.single()[total]?.toLong() ?: 0
        }
    }

    private fun ResultRow.toImage() = NoteImage(
        id = this[NoteImages.id],
        noteId = this[NoteImages.noteId],
        contentType = this[NoteImages.contentType],
        width = this[NoteImages.width],
        height = this[NoteImages.height],
        byteSize = this[NoteImages.byteSize],
        createdAt = this[NoteImages.createdAt],
    )
}
