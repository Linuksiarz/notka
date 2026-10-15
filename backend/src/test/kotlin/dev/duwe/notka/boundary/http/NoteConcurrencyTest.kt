package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.REGISTER_BOB
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.errorField
import dev.duwe.notka.errorParams
import dev.duwe.notka.intField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.patchJson
import dev.duwe.notka.postJson
import dev.duwe.notka.stringField
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Optimistic concurrency on the REST write path.
 *
 * Two people editing one shared note used to end with the second save silently destroying the
 * first one's text. These tests pin the replacement behaviour: a write that carries a stale
 * `version` is refused, and the refused writer's text never reaches the server.
 */
class NoteConcurrencyTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private fun bodyOf(text: String) =
        """{"version":1,"blocks":[{"id":"b1","type":"paragraph","spans":[{"text":"$text"}]}]}"""

    @Test
    fun refusesAStaleWriteAndKeepsTheFirstWritersText() = testApplication {
        // given: Ada owns a note, Bob may edit it, and both have read the same version
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)

        val noteId = ada.postJson("/api/notes", """{"kind":"TEXT","title":"Shared"}""")
            .asJson().intField("id")
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"EDIT"}""")
        val seenVersion = bob.get("/api/notes/$noteId").asJson().intField("version")

        // when: Ada saves first, and Bob then saves from the copy he had already loaded
        val adaSaved = ada.patchJson(
            "/api/notes/$noteId",
            """{"content":${bodyOf("ADA")},"version":$seenVersion}""",
        )
        val bobSaved = bob.patchJson(
            "/api/notes/$noteId",
            """{"content":${bodyOf("BOB")},"version":$seenVersion}""",
        )

        // then: Bob is told instead of silently winning
        assertEquals(HttpStatusCode.OK, adaSaved.status)
        assertEquals(HttpStatusCode.Conflict, bobSaved.status)
        assertEquals("note.version_conflict", bobSaved.errorField("key"))
        assertEquals(noteId.toString(), bobSaved.asJson().errorParams().getValue("noteId").jsonPrimitive.content)

        val stored = ada.get("/api/notes/$noteId").asJson().getValue("content").jsonObject.toString()
        assertTrue(stored.contains("ADA"), "Ada's text must survive, was: $stored")
        assertTrue(!stored.contains("BOB"), "Bob's refused text must not be stored, was: $stored")
    }

    @Test
    fun bumpsTheVersionOnEveryAcceptedWrite() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val created = ada.postJson("/api/notes", """{"kind":"TEXT","title":"Versioned"}""").asJson()
        val noteId = created.intField("id")
        val firstVersion = created.intField("version")

        // when
        val saved = ada.patchJson(
            "/api/notes/$noteId",
            """{"content":${bodyOf("one")},"version":$firstVersion}""",
        )

        // then
        assertEquals(HttpStatusCode.OK, saved.status)
        assertEquals(firstVersion + 1, saved.asJson().intField("version"))
    }

    @Test
    fun acceptsAWriteThatCarriesNoVersion() = testApplication {
        // given: clients that do not participate in concurrency control keep working
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val noteId = ada.postJson("/api/notes", """{"kind":"TEXT","title":"Unguarded"}""")
            .asJson().intField("id")

        // when
        val saved = ada.patchJson("/api/notes/$noteId", """{"title":"Renamed"}""")

        // then
        assertEquals(HttpStatusCode.OK, saved.status)
        assertEquals("Renamed", saved.asJson().stringField("title"))
    }

    @Test
    fun appearanceChangesAreNotBlockedBySomeoneElsesTextEdit() = testApplication {
        // given: Bob recolours a note that Ada has just edited, and he holds no version token
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val noteId = ada.postJson("/api/notes", """{"kind":"TEXT","title":"Colour"}""")
            .asJson().intField("id")
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"EDIT"}""")
        val staleVersion = bob.get("/api/notes/$noteId").asJson().intField("version")
        ada.patchJson("/api/notes/$noteId", """{"content":${bodyOf("ADA")},"version":$staleVersion}""")

        // when: an appearance-only change is sent without the token
        val recoloured = bob.patchJson("/api/notes/$noteId", """{"color":"teal","trashed":false}""")

        // then: it is accepted, because it cannot lose anyone's text
        assertEquals(HttpStatusCode.OK, recoloured.status)
        assertEquals("teal", recoloured.asJson().stringField("color"))
    }
}
