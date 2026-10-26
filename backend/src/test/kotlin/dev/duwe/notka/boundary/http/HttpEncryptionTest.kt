package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.errorField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.patchJson
import dev.duwe.notka.postJson
import dev.duwe.notka.stringField
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class HttpEncryptionTest {
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
    fun turningEncryptionOnAnswersWithTheRecoveryKeyOnceAndTheNotesSayTheyAreEncrypted() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        val registered = client.postJson("/api/auth/register", REGISTER_ADA).asJson().getValue("user").jsonObject
        assertFalse(registered.getValue("encryption").jsonPrimitive.boolean)
        assertTrue(registered.getValue("linkPreviews").jsonPrimitive.boolean)

        // when
        val wrong = client.postJson("/api/auth/me/encryption", """{"password":"not it"}""")
        val enabled = client.postJson("/api/auth/me/encryption", """{"password":"correct horse battery"}""")
        val note = client.postJson("/api/notes", """{"title":"Plan"}""").asJson()
        val me = client.get("/api/auth/me").asJson().getValue("user").jsonObject

        // then
        assertEquals("auth.invalid_current_password", wrong.errorField("key"))
        assertEquals(HttpStatusCode.Created, enabled.status)
        assertEquals(39, enabled.asJson().stringField("recoveryKey").length)
        assertEquals("ENCRYPTED", note.stringField("encryption"))
        assertTrue(me.getValue("encryption").jsonPrimitive.boolean)
        assertFalse("recoveryKey" in me)
    }

    @Test
    fun linkPreviewsAreTheAccountsOwnSettingAndEncryptionCanBeTurnedOff() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        client.postJson("/api/auth/register", REGISTER_ADA)
        client.postJson("/api/auth/me/encryption", """{"password":"correct horse battery"}""")
        val linked = """{"title":"Links","content":{"version":1,"blocks":[{"id":"b1","type":"paragraph","spans":[{"text":"https://example.com"}]}]}}"""
        val noteId = client.postJson("/api/notes", linked).asJson().stringField("id")

        // when
        val before = client.get("/api/notes/$noteId").asJson().stringField("encryption")
        val switched = client.patchJson("/api/auth/me", """{"linkPreviews":false}""").asJson().getValue("user").jsonObject
        val after = client.get("/api/notes/$noteId").asJson().stringField("encryption")
        val off = client.delete("/api/auth/me/encryption").asJson().getValue("user").jsonObject

        // then
        assertEquals("LINK_PREVIEWS", before)
        assertFalse(switched.getValue("linkPreviews").jsonPrimitive.boolean)
        assertEquals("ENCRYPTED", after)
        assertFalse(off.getValue("encryption").jsonPrimitive.boolean)
        assertEquals("DISABLED", client.get("/api/notes/$noteId").asJson().stringField("encryption"))
    }

    @Test
    fun aResetOfAnEncryptingAccountAsksForTheRecoveryKey() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        val userId = client.postJson("/api/auth/register", REGISTER_ADA).asJson().getValue("user").jsonObject.stringField("id").toInt()
        client.postJson("/api/auth/me/encryption", """{"password":"correct horse battery"}""")
        val token = fixture.services.auth.issuePasswordReset(userId)

        // when
        val response = jsonClient().postJson("/api/auth/password-reset", """{"token":"$token","password":"a brand new password"}""")

        // then
        assertEquals(HttpStatusCode.Conflict, response.status)
        assertEquals("auth.recovery_key_required", response.errorField("key"))
    }
}
