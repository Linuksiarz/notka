package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class FriendServiceTest {
    private lateinit var fixture: TestFixture
    private val friends get() = fixture.services.friends

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    @Test
    fun aFriendIsAddedByAddressOrUsernameAndListedInOrder() {
        // given
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val admin = fixture.services.auth.createAdmin("root", "correct horse battery", null)

        // when
        friends.add(ada.id, "  BOB@example.com ")
        friends.add(ada.id, "Root")
        val circle = friends.circle(ada.id)

        // then
        assertEquals(listOf(bob.id, admin.id), circle.friends.map { it.id })
        assertTrue(friends.circle(bob.id).friends.isEmpty(), "being added as a friend gives the friend nothing")
    }

    @Test
    fun yourselfAStrangerAndAFriendTwiceAreRefused() {
        // given
        val ada = fixture.registerUser()
        fixture.registerUser("bob@example.com", "Bob Builder")
        friends.add(ada.id, "bob@example.com")

        // when
        val self = assertFailsWith<DomainException> { friends.add(ada.id, "ada@example.com") }
        val stranger = assertFailsWith<DomainException> { friends.add(ada.id, "nobody@example.com") }
        val twice = assertFailsWith<DomainException> { friends.add(ada.id, "bob@example.com") }

        // then
        assertEquals(ErrorKeys.FRIEND_SELF, self.key)
        assertEquals(ErrorKind.NOT_FOUND, stranger.kind)
        assertEquals(ErrorKeys.FRIEND_NOT_FOUND, stranger.key)
        assertEquals(ErrorKind.CONFLICT, twice.kind)
        assertEquals(ErrorKeys.FRIEND_ALREADY_ADDED, twice.key)
    }

    @Test
    fun aGroupHoldsOnlyFriendsAndLosesTheOnesUnfriended() {
        // given
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val cyd = fixture.registerUser("cyd@example.com", "Cyd Charisse")
        val dan = fixture.registerUser("dan@example.com", "Dan Brown")
        friends.add(ada.id, bob.email!!)
        friends.add(ada.id, cyd.email!!)

        // when
        val group = friends.createGroup(ada.id, "Family", listOf(cyd.id, bob.id, cyd.id))
        val stranger = assertFailsWith<DomainException> { friends.createGroup(ada.id, "Work", listOf(dan.id)) }
        friends.remove(ada.id, bob.id)

        // then: in the order given, without the repeat, and without the friend who is gone
        assertEquals(listOf(cyd.id, bob.id), group.memberIds)
        assertEquals(ErrorKeys.FRIEND_GROUP_NOT_A_FRIEND, stranger.key)
        assertEquals(listOf(cyd.id), friends.circle(ada.id).groups.single().memberIds)
    }

    @Test
    fun aGroupIsRenamedAndRefilledButOnlyByItsOwner() {
        // given
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val cyd = fixture.registerUser("cyd@example.com", "Cyd Charisse")
        friends.add(ada.id, bob.email!!)
        friends.add(ada.id, cyd.email!!)
        val family = friends.createGroup(ada.id, "Family", listOf(bob.id))
        friends.createGroup(ada.id, "Work", emptyList())

        // when
        val updated = friends.updateGroup(ada.id, family.id, "Relatives", listOf(bob.id, cyd.id))
        val taken = assertFailsWith<DomainException> { friends.updateGroup(ada.id, family.id, "WORK", null) }
        val notTheirs = assertFailsWith<DomainException> { friends.deleteGroup(bob.id, family.id) }

        // then
        assertEquals("Relatives", updated.name)
        assertEquals(listOf(bob.id, cyd.id), updated.memberIds)
        assertEquals(ErrorKeys.FRIEND_GROUP_NAME_TAKEN, taken.key)
        assertEquals(ErrorKind.NOT_FOUND, notTheirs.kind)
        assertEquals(listOf("Relatives", "Work"), friends.circle(ada.id).groups.map { it.name })
    }

    @Test
    fun aDeletedAccountLeavesEveryoneElsesFriendsAndGroups() {
        // given
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        friends.add(ada.id, bob.email!!)
        friends.createGroup(ada.id, "Family", listOf(bob.id))

        // when
        fixture.services.admin.deleteUser(bob.id)

        // then
        val circle = friends.circle(ada.id)
        assertTrue(circle.friends.isEmpty())
        assertTrue(circle.groups.single().memberIds.isEmpty())
    }
}
