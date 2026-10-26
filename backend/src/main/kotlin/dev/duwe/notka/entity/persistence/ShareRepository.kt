package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.NoteShare
import dev.duwe.notka.entity.model.Permission
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

class ShareRepository(private val database: Database) {
    fun find(noteId: Int, userId: Int): NoteShare? = transaction(database) {
        NoteShares.selectAll()
            .where { (NoteShares.noteId eq noteId) and (NoteShares.userId eq userId) }
            .singleOrNull()?.toShare()
    }

    fun listForNote(noteId: Int): List<NoteShare> = transaction(database) {
        NoteShares.selectAll().where { NoteShares.noteId eq noteId }
            .orderBy(NoteShares.createdAt to SortOrder.ASC)
            .map { it.toShare() }
    }

    /** [listForNote] for many notes in one query; a note shared with nobody is absent. */
    fun listForNotes(noteIds: Collection<Int>): Map<Int, List<NoteShare>> = transaction(database) {
        if (noteIds.isEmpty()) return@transaction emptyMap()
        NoteShares.selectAll().where { NoteShares.noteId inList noteIds }
            .orderBy(NoteShares.createdAt to SortOrder.ASC)
            .map { it.toShare() }
            .groupBy { it.noteId }
    }

    fun insert(noteId: Int, userId: Int, permission: Permission, createdAt: Long) {
        transaction(database) {
            NoteShares.insert {
                it[NoteShares.noteId] = noteId
                it[NoteShares.userId] = userId
                it[NoteShares.permission] = permission.name
                it[NoteShares.createdAt] = createdAt
            }
        }
    }

    fun updatePermission(noteId: Int, userId: Int, permission: Permission) {
        transaction(database) {
            NoteShares.update({ (NoteShares.noteId eq noteId) and (NoteShares.userId eq userId) }) {
                it[NoteShares.permission] = permission.name
            }
        }
    }

    fun delete(noteId: Int, userId: Int) {
        transaction(database) {
            NoteShares.deleteWhere {
                (NoteShares.noteId eq noteId) and (NoteShares.userId eq userId)
            }
            // A pin is that account's filing of a note it can no longer see.
            NotePins.deleteWhere {
                (NotePins.noteId eq noteId) and (NotePins.userId eq userId)
            }
            NoteFolds.deleteWhere {
                (NoteFolds.noteId eq noteId) and (NoteFolds.userId eq userId)
            }
        }
    }

    private fun ResultRow.toShare() = NoteShare(
        noteId = this[NoteShares.noteId],
        userId = this[NoteShares.userId],
        permission = Permission.valueOf(this[NoteShares.permission]),
        createdAt = this[NoteShares.createdAt],
    )
}
