package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.FriendGroup
import dev.duwe.notka.entity.model.UserSummary
import dev.duwe.notka.entity.model.Validation
import dev.duwe.notka.entity.persistence.FriendRepository
import dev.duwe.notka.entity.persistence.UserRepository

/** More people than anybody shares notes with, and a ceiling on what one account can store. */
const val MAX_FRIENDS_PER_USER: Int = 500

const val MAX_FRIEND_GROUPS_PER_USER: Int = 100

/** An account's friends together with its groups of them. */
data class FriendCircle(val friends: List<UserSummary>, val groups: List<FriendGroup>)

/**
 * The people an account keeps at hand for sharing, and named groups of them. Both are the account's
 * own, like its labels: the friend is not asked or told, and nobody else ever sees the list. Being a
 * friend grants nothing — sharing a note still goes through [SharingService], one share at a time.
 */
class FriendService(
    private val friends: FriendRepository,
    private val users: UserRepository,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun circle(userId: Int): FriendCircle {
        val ids = friends.friendIds(userId)
        val accounts = users.findSummaries(ids)
        return FriendCircle(ids.mapNotNull(accounts::get), friends.groups(userId))
    }

    /** [login] is an e-mail address, or the username of an account that signs in with one. */
    fun add(userId: Int, login: String): UserSummary {
        val trimmed = login.trim()
        val target = (Validation.normalizedEmailOrNull(trimmed)?.let(users::findByEmail) ?: users.findByUsername(trimmed))
            ?: throw DomainException.notFound(
                ErrorKeys.FRIEND_NOT_FOUND,
                "No account signs in as that",
                mapOf("login" to trimmed),
            )
        if (target.id == userId) {
            throw DomainException.validation(ErrorKeys.FRIEND_SELF, "You cannot add yourself as a friend")
        }
        if (friends.isFriend(userId, target.id)) {
            throw DomainException.conflict(
                ErrorKeys.FRIEND_ALREADY_ADDED,
                "Already a friend",
                mapOf("name" to target.displayName),
            )
        }
        if (friends.friendIds(userId).size >= MAX_FRIENDS_PER_USER) {
            throw DomainException.forbidden(
                ErrorKeys.FRIEND_LIMIT_REACHED,
                "An account can have at most $MAX_FRIENDS_PER_USER friends",
                mapOf("limit" to MAX_FRIENDS_PER_USER.toString()),
            )
        }
        friends.addFriend(userId, target.id, clock())
        return target.toSummary()
    }

    fun remove(userId: Int, friendId: Int) {
        if (friends.removeFriend(userId, friendId) == 0) {
            throw DomainException.notFound(
                ErrorKeys.FRIEND_NOT_FOUND,
                "User $friendId is not a friend",
                mapOf("userId" to friendId.toString()),
            )
        }
    }

    fun createGroup(userId: Int, name: String, memberIds: List<Int>): FriendGroup {
        val normalized = Validation.friendGroupName(name)
        if (friends.findGroupByName(userId, normalized) != null) throw nameTaken(normalized)
        if (friends.countGroups(userId) >= MAX_FRIEND_GROUPS_PER_USER) {
            throw DomainException.forbidden(
                ErrorKeys.FRIEND_GROUP_LIMIT_REACHED,
                "An account can have at most $MAX_FRIEND_GROUPS_PER_USER groups",
                mapOf("limit" to MAX_FRIEND_GROUPS_PER_USER.toString()),
            )
        }
        val members = requireFriends(userId, memberIds)
        return requireGroup(userId, friends.insertGroup(userId, normalized, members, clock()))
    }

    /** `null` leaves that part of the group as it is. */
    fun updateGroup(userId: Int, groupId: Int, name: String?, memberIds: List<Int>?): FriendGroup {
        val group = requireGroup(userId, groupId)
        if (name != null) {
            val normalized = Validation.friendGroupName(name)
            val existing = friends.findGroupByName(userId, normalized)
            if (existing != null && existing.id != group.id) throw nameTaken(normalized)
            friends.rename(group.id, normalized)
        }
        if (memberIds != null) friends.setMembers(group.id, requireFriends(userId, memberIds), clock())
        return requireGroup(userId, group.id)
    }

    fun deleteGroup(userId: Int, groupId: Int) {
        friends.deleteGroup(requireGroup(userId, groupId).id)
    }

    /** A group is somebody else's or nobody's in the same way: it does not exist for this account. */
    private fun requireGroup(userId: Int, groupId: Int): FriendGroup {
        val group = friends.group(groupId)
        if (group == null || group.ownerId != userId) {
            throw DomainException.notFound(
                ErrorKeys.FRIEND_GROUP_NOT_FOUND,
                "Group $groupId does not exist",
                mapOf("groupId" to groupId.toString()),
            )
        }
        return group
    }

    private fun requireFriends(userId: Int, memberIds: List<Int>): List<Int> {
        val members = memberIds.distinct()
        val known = friends.friendIds(userId).toSet()
        val stranger = members.firstOrNull { it !in known }
        if (stranger != null) {
            throw DomainException.validation(
                ErrorKeys.FRIEND_GROUP_NOT_A_FRIEND,
                "User $stranger is not a friend",
                mapOf("userId" to stranger.toString()),
            )
        }
        return members
    }

    private fun nameTaken(name: String) = DomainException.conflict(
        ErrorKeys.FRIEND_GROUP_NAME_TAKEN,
        "Group '$name' already exists",
        mapOf("name" to name),
    )
}
