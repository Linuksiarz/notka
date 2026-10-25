package dev.duwe.notka.boundary.http.dto

import dev.duwe.notka.control.FriendCircle
import dev.duwe.notka.entity.model.FriendGroup
import kotlinx.serialization.Serializable

@Serializable
data class FriendGroupDto(val id: Int, val name: String, val memberIds: List<Int>)

@Serializable
data class FriendsResponse(val friends: List<UserDto>, val groups: List<FriendGroupDto>)

/** An e-mail address, or the username of an account that signs in with one. */
@Serializable
data class AddFriendRequest(val login: String)

@Serializable
data class CreateFriendGroupRequest(val name: String, val memberIds: List<Int> = emptyList())

/** A field left out is left as it is. */
@Serializable
data class UpdateFriendGroupRequest(val name: String? = null, val memberIds: List<Int>? = null)

fun FriendGroup.toDto(): FriendGroupDto = FriendGroupDto(id, name, memberIds)

fun FriendCircle.toDto(): FriendsResponse = FriendsResponse(friends.map { it.toDto() }, groups.map { it.toDto() })
