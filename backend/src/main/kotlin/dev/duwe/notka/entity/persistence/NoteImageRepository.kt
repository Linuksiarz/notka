package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.ImageInfo
import dev.duwe.notka.entity.model.NoteImage
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.core.statements.api.ExposedBlob
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

/**
 * A note's pictures. Reads that list them never touch the bytes; only [bytes] does. A sealed note's
 * pictures are sealed with it; their size is the picture's own, so the owner's storage counts what
 * they uploaded.
 */
class NoteImageRepository(private val database: Database, private val keys: KeyRing) {
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
            it[data] = ExposedBlob(stored(noteId, bytes))
            it[NoteImages.createdAt] = createdAt
        } get NoteImages.id
    }

    /** Inside a transaction: [bytes] as [noteId] stores them. */
    private fun stored(noteId: Int, bytes: ByteArray): ByteArray =
        keys.sealingKeyOf(noteId)?.let { Sealing.seal(it, bytes, SealedPlaces.image(noteId)) } ?: bytes

    fun listForNote(noteId: Int): List<NoteImage> = transaction(database) {
        NoteImages.select(metadata)
            .where { NoteImages.noteId eq noteId }
            .orderBy(NoteImages.id to SortOrder.ASC)
            .map { it.toImage() }
    }

    /** [listForNote] for many notes in one query; a note without pictures is absent. */
    fun listForNotes(noteIds: Collection<Int>): Map<Int, List<NoteImage>> = transaction(database) {
        if (noteIds.isEmpty()) return@transaction emptyMap()
        NoteImages.select(metadata)
            .where { NoteImages.noteId inList noteIds }
            .orderBy(NoteImages.id to SortOrder.ASC)
            .map { it.toImage() }
            .groupBy { it.noteId }
    }

    fun countForNote(noteId: Int): Long = transaction(database) {
        NoteImages.selectAll().where { NoteImages.noteId eq noteId }.count()
    }

    /** The picture's bytes and type, but only when it belongs to [noteId]. */
    fun bytes(noteId: Int, imageId: Int): Pair<String, ByteArray>? = transaction(database) {
        NoteImages.select(NoteImages.contentType, NoteImages.data)
            .where { (NoteImages.id eq imageId) and (NoteImages.noteId eq noteId) }
            .singleOrNull()
            ?.let { row ->
                val data = row[NoteImages.data].bytes
                val key = keys.sealingKeyOf(noteId)
                row[NoteImages.contentType] to (key?.let { Sealing.open(it, data, SealedPlaces.image(noteId)) } ?: data)
            }
    }

    fun delete(noteId: Int, imageId: Int): Int = transaction(database) {
        NoteImages.deleteWhere { (NoteImages.id eq imageId) and (NoteImages.noteId eq noteId) }
    }

    /** Puts a copy of every picture of [fromNoteId] on [toNoteId], in the same order, sealed as [toNoteId] is. */
    fun copy(fromNoteId: Int, toNoteId: Int, createdAt: Long) {
        transaction(database) {
            val sourceKey = keys.sealingKeyOf(fromNoteId)
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
                    val data = row[NoteImages.data].bytes
                    val plain = sourceKey?.let { key -> Sealing.open(key, data, SealedPlaces.image(fromNoteId)) } ?: data
                    it[NoteImages.data] = ExposedBlob(stored(toNoteId, plain))
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
