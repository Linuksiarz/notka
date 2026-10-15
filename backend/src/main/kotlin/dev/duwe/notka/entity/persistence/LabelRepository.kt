package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.Label
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

/** Labels are per user and are never shared; `note_labels` records who attached what. */
class LabelRepository(private val database: Database) {
    fun insert(ownerId: Int, name: String, createdAt: Long): Label {
        val id = transaction(database) {
            Labels.insert {
                it[Labels.ownerId] = ownerId
                it[Labels.name] = name
                it[Labels.createdAt] = createdAt
            } get Labels.id
        }
        return checkNotNull(find(id)) { "Inserted label $id disappeared" }
    }

    fun find(id: Int): Label? = transaction(database) {
        Labels.selectAll().where { Labels.id eq id }.singleOrNull()?.toLabel()
    }

    /** Case-insensitive lookup, matching the `NOCASE` unique index of the schema. */
    fun findOwnedByName(ownerId: Int, name: String): Label? = transaction(database) {
        Labels.selectAll()
            .where { (Labels.ownerId eq ownerId) and (Labels.name.lowerCase() eq name.lowercase()) }
            .singleOrNull()?.toLabel()
    }

    fun countForUser(ownerId: Int): Long = transaction(database) {
        Labels.selectAll().where { Labels.ownerId eq ownerId }.count()
    }

    fun listForUser(ownerId: Int): List<Label> = transaction(database) {
        Labels.selectAll().where { Labels.ownerId eq ownerId }
            .orderBy(Labels.name.lowerCase() to SortOrder.ASC)
            .map { it.toLabel() }
    }

    fun rename(id: Int, name: String) {
        transaction(database) {
            Labels.update({ Labels.id eq id }) { it[Labels.name] = name }
        }
    }

    fun delete(id: Int) {
        transaction(database) {
            Labels.deleteWhere { Op.build { Labels.id eq id } }
        }
    }

    /** Only the labels [userId] attached to the note and still owns. */
    fun labelsForNote(noteId: Int, userId: Int): List<Label> = transaction(database) {
        NoteLabels.join(Labels, JoinType.INNER, onColumn = NoteLabels.labelId, otherColumn = Labels.id)
            .selectAll()
            .where { (NoteLabels.noteId eq noteId) and (NoteLabels.addedBy eq userId) and (Labels.ownerId eq userId) }
            .orderBy(Labels.name.lowerCase() to SortOrder.ASC)
            .map { it.toLabel() }
    }

    /** Replaces the caller's label set on the note; other users' rows are left alone. */
    fun replaceForNote(noteId: Int, userId: Int, labelIds: List<Int>) {
        transaction(database) {
            NoteLabels.deleteWhere {
                Op.build { (NoteLabels.noteId eq noteId) and (NoteLabels.addedBy eq userId) }
            }
            labelIds.distinct().forEach { labelId ->
                NoteLabels.insert {
                    it[NoteLabels.noteId] = noteId
                    it[NoteLabels.labelId] = labelId
                    it[NoteLabels.addedBy] = userId
                }
            }
        }
    }

    fun detach(noteId: Int, labelId: Int, userId: Int) {
        transaction(database) {
            NoteLabels.deleteWhere {
                Op.build {
                    (NoteLabels.noteId eq noteId) and (NoteLabels.labelId eq labelId) and (NoteLabels.addedBy eq userId)
                }
            }
        }
    }

    private fun ResultRow.toLabel() = Label(
        id = this[Labels.id],
        ownerId = this[Labels.ownerId],
        name = this[Labels.name],
        createdAt = this[Labels.createdAt],
    )
}
