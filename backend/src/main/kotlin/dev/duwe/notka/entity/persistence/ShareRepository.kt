package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.NoteShare
import dev.duwe.notka.entity.model.Permission
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

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
                Op.build { (NoteShares.noteId eq noteId) and (NoteShares.userId eq userId) }
            }
            // A pin is that account's filing of a note it can no longer see.
            NotePins.deleteWhere {
                Op.build { (NotePins.noteId eq noteId) and (NotePins.userId eq userId) }
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
