package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.REGISTER_BOB
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.errorField
import dev.duwe.notka.intField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.patchJson
import dev.duwe.notka.postJson
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HttpFriendsTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    @Test
    fun friendsAndGroupsAreTheAccountsOwn() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val bob = jsonClient()
        val bobId = bob.postJson("/api/auth/register", REGISTER_BOB).asJson().getValue("user").jsonObject.intField("id")

        // when
        val added = ada.postJson("/api/friends", """{"login":"bob@example.com"}""")
        val group = ada.postJson("/api/friend-groups", """{"name":"Family","memberIds":[$bobId]}""")
        val groupId = group.asJson().intField("id")
        val renamed = ada.patchJson("/api/friend-groups/$groupId", """{"name":"Relatives"}""")
        val bobsView = bob.get("/api/friends").asJson()
        val bobEditing = bob.patchJson("/api/friend-groups/$groupId", """{"name":"Mine"}""")

        // then
        assertEquals(HttpStatusCode.Created, added.status)
        assertEquals(HttpStatusCode.Created, group.status)
        assertEquals("Relatives", renamed.asJson().getValue("name").jsonPrimitive.content)
        val circle = ada.get("/api/friends").asJson()
        assertEquals(bobId, circle.getValue("friends").jsonArray.single().jsonObject.intField("id"))
        val listed = circle.getValue("groups").jsonArray.single().jsonObject
        assertEquals(listOf(bobId), listed.getValue("memberIds").jsonArray.map { it.jsonPrimitive.int })
        assertTrue(bobsView.getValue("friends").jsonArray.isEmpty())
        assertTrue(bobsView.getValue("groups").jsonArray.isEmpty())
        assertEquals(HttpStatusCode.NotFound, bobEditing.status)
        assertEquals("friend_group.not_found", bobEditing.errorField("key"))
    }

    @Test
    fun unfriendingAndDeletingAGroupAnswerNoContent() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val bobId = jsonClient().postJson("/api/auth/register", REGISTER_BOB).asJson()
            .getValue("user").jsonObject.intField("id")
        ada.postJson("/api/friends", """{"login":"bob@example.com"}""")
        val groupId = ada.postJson("/api/friend-groups", """{"name":"Family"}""").asJson().intField("id")

        // when
        val unfriended = ada.delete("/api/friends/$bobId")
        val again = ada.delete("/api/friends/$bobId")
        val deleted = ada.delete("/api/friend-groups/$groupId")

        // then
        assertEquals(HttpStatusCode.NoContent, unfriended.status)
        assertEquals(HttpStatusCode.NotFound, again.status)
        assertEquals(HttpStatusCode.NoContent, deleted.status)
        assertTrue(ada.get("/api/friends").asJson().getValue("groups").jsonArray.isEmpty())
    }
}
