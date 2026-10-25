package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.FriendGroup
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

/** An account's friends and the groups it sorts them into. Nothing here is ever shown to anybody else. */
class FriendRepository(private val database: Database) {
    /** The owner's friends' account ids, in the order they were added. */
    fun friendIds(ownerId: Int): List<Int> = transaction(database) {
        Friends.selectAll().where { Friends.ownerId eq ownerId }
            .orderBy(Friends.createdAt to SortOrder.ASC, Friends.friendId to SortOrder.ASC)
            .map { it[Friends.friendId] }
    }

    fun isFriend(ownerId: Int, friendId: Int): Boolean = transaction(database) {
        Friends.selectAll().where { (Friends.ownerId eq ownerId) and (Friends.friendId eq friendId) }.any()
    }

    fun addFriend(ownerId: Int, friendId: Int, createdAt: Long) {
        transaction(database) {
            Friends.insert {
                it[Friends.ownerId] = ownerId
                it[Friends.friendId] = friendId
                it[Friends.createdAt] = createdAt
            }
        }
    }

    /** Unfriending takes the friend out of every one of the owner's groups as well. */
    fun removeFriend(ownerId: Int, friendId: Int): Int = transaction(database) {
        val groups = FriendGroups.select(FriendGroups.id).where { FriendGroups.ownerId eq ownerId }.map { it[FriendGroups.id] }
        if (groups.isNotEmpty()) {
            FriendGroupMembers.deleteWhere {
                Op.build { (FriendGroupMembers.groupId inList groups) and (FriendGroupMembers.userId eq friendId) }
            }
        }
        Friends.deleteWhere { Op.build { (Friends.ownerId eq ownerId) and (Friends.friendId eq friendId) } }
    }

    fun groups(ownerId: Int): List<FriendGroup> = transaction(database) {
        val rows = FriendGroups.selectAll().where { FriendGroups.ownerId eq ownerId }
            .orderBy(FriendGroups.name.lowerCase() to SortOrder.ASC)
            .toList()
        val members = membersOf(rows.map { it[FriendGroups.id] })
        rows.map {
            val id = it[FriendGroups.id]
            FriendGroup(id, it[FriendGroups.ownerId], it[FriendGroups.name], members[id].orEmpty())
        }
    }

    fun group(groupId: Int): FriendGroup? = transaction(database) {
        FriendGroups.selectAll().where { FriendGroups.id eq groupId }.singleOrNull()?.let {
            FriendGroup(groupId, it[FriendGroups.ownerId], it[FriendGroups.name], membersOf(listOf(groupId))[groupId].orEmpty())
        }
    }

    fun countGroups(ownerId: Int): Long = transaction(database) {
        FriendGroups.selectAll().where { FriendGroups.ownerId eq ownerId }.count()
    }

    /** Case-insensitive, matching the `NOCASE` unique index of the schema. */
    fun findGroupByName(ownerId: Int, name: String): FriendGroup? = transaction(database) {
        FriendGroups.select(FriendGroups.id)
            .where { (FriendGroups.ownerId eq ownerId) and (FriendGroups.name.lowerCase() eq name.lowercase()) }
            .singleOrNull()?.get(FriendGroups.id)
    }?.let(::group)

    fun insertGroup(ownerId: Int, name: String, memberIds: List<Int>, createdAt: Long): Int = transaction(database) {
        val id = FriendGroups.insert {
            it[FriendGroups.ownerId] = ownerId
            it[FriendGroups.name] = name
            it[FriendGroups.createdAt] = createdAt
        } get FriendGroups.id
        insertMembers(id, memberIds, createdAt)
        id
    }

    fun rename(groupId: Int, name: String) {
        transaction(database) {
            FriendGroups.update({ FriendGroups.id eq groupId }) { it[FriendGroups.name] = name }
        }
    }

    /** Replaces the members; the ones that stay keep their place, the new ones go to the end. */
    fun setMembers(groupId: Int, memberIds: List<Int>, addedAt: Long) {
        transaction(database) {
            val current = membersOf(listOf(groupId))[groupId].orEmpty()
            val gone = current - memberIds.toSet()
            if (gone.isNotEmpty()) {
                FriendGroupMembers.deleteWhere {
                    Op.build { (FriendGroupMembers.groupId eq groupId) and (FriendGroupMembers.userId inList gone) }
                }
            }
            insertMembers(groupId, memberIds.filterNot(current::contains), addedAt)
        }
    }

    fun deleteGroup(groupId: Int) {
        transaction(database) {
            FriendGroups.deleteWhere { FriendGroups.id eq groupId }
        }
    }

    private fun insertMembers(groupId: Int, memberIds: List<Int>, addedAt: Long) {
        // One timestamp for a batch would tie their order; the index keeps the order they were given in.
        FriendGroupMembers.batchInsert(memberIds.withIndex()) { (index, userId) ->
            this[FriendGroupMembers.groupId] = groupId
            this[FriendGroupMembers.userId] = userId
            this[FriendGroupMembers.addedAt] = addedAt + index
        }
    }

    private fun membersOf(groupIds: List<Int>): Map<Int, List<Int>> {
        if (groupIds.isEmpty()) return emptyMap()
        return FriendGroupMembers.selectAll().where { FriendGroupMembers.groupId inList groupIds }
            .orderBy(FriendGroupMembers.addedAt to SortOrder.ASC, FriendGroupMembers.userId to SortOrder.ASC)
            .groupBy({ it[FriendGroupMembers.groupId] }, { it[FriendGroupMembers.userId] })
    }
}
