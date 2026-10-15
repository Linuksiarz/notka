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
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The body's collaboration log (`docs/COLLABORATION.md`): editors send ProseMirror steps against the
 * body version they have, the server orders them, and an editor that is behind catches up from it.
 */
class NoteStepsTest {
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

    private fun step(text: String) =
        """{"stepType":"replace","from":1,"to":1,"slice":{"content":[{"type":"text","text":"$text"}]}}"""

    private fun stepsBody(docVersion: Int, clientId: String, text: String) =
        """{"docVersion":$docVersion,"clientId":"$clientId","steps":[${step(text)}],"content":${bodyOf(text)}}"""

    @Test
    fun ordersTheStepsAndHandsThemToAnEditorThatIsBehind() = testApplication {
        // given: Ada shares a note with Bob, and both start from body version 0
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val noteId = ada.postJson("/api/notes", """{"kind":"TEXT","title":"Shared"}""").asJson().intField("id")
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"EDIT"}""")
        val start = bob.get("/api/notes/$noteId").asJson().intField("docVersion")

        // when: Ada's step lands first, and Bob's — made against the same version — after it
        val adaSent = ada.postJson("/api/notes/$noteId/steps", stepsBody(start, "ada-editor", "A"))
        val bobSent = bob.postJson("/api/notes/$noteId/steps", stepsBody(start, "bob-editor", "B"))
        val missed = bob.get("/api/notes/$noteId/steps?since=$start").asJson()

        // then: Bob is told the note moved on, nothing Bob sent is stored, and Ada's step is there to take in
        assertEquals(HttpStatusCode.OK, adaSent.status)
        assertEquals(1, adaSent.asJson().intField("docVersion"))
        assertEquals(HttpStatusCode.Conflict, bobSent.status)
        assertEquals("note.steps_behind", bobSent.errorField("key"))
        assertEquals(1, missed.intField("docVersion"))
        val steps = missed.getValue("steps").jsonArray
        assertEquals(1, steps.size)
        assertEquals("ada-editor", steps[0].jsonObject.getValue("clientId").jsonPrimitive.content)
        assertEquals("A", steps[0].jsonObject.getValue("step").jsonObject.getValue("slice").jsonObject
            .getValue("content").jsonArray[0].jsonObject.getValue("text").jsonPrimitive.content)
        val stored = ada.get("/api/notes/$noteId").asJson().getValue("content").toString()
        assertTrue(stored.contains("\"A\""), "the body is the one Ada's steps produced, was: $stored")
    }

    @Test
    fun anEditorThatTookTheStepsInIsAcceptedAfterThem() = testApplication {
        // given: Ada has written one step
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val noteId = ada.postJson("/api/notes", """{"kind":"TEXT"}""").asJson().intField("id")
        ada.postJson("/api/notes/$noteId/steps", stepsBody(0, "first", "A"))

        // when: another editor of hers writes against the version that step produced
        val next = ada.postJson("/api/notes/$noteId/steps", stepsBody(1, "second", "AB"))

        // then: it lands as version 2, and the log holds both in order
        assertEquals(HttpStatusCode.OK, next.status)
        assertEquals(2, next.asJson().intField("docVersion"))
        val log = ada.get("/api/notes/$noteId/steps?since=0").asJson().getValue("steps").jsonArray
        assertEquals(listOf("first", "second"), log.map { it.jsonObject.getValue("clientId").jsonPrimitive.content })
    }

    @Test
    fun aBodyWrittenAsAWholeStartsTheLogAgain() = testApplication {
        // given: a note with one step in its log
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val note = ada.postJson("/api/notes", """{"kind":"TEXT"}""").asJson()
        val noteId = note.intField("id")
        val sent = ada.postJson("/api/notes/$noteId/steps", stepsBody(0, "editor", "A")).asJson()

        // when: the body is replaced through PATCH — a write queued offline, say
        ada.patchJson("/api/notes/$noteId", """{"content":${bodyOf("whole")},"version":${sent.intField("version")}}""")
        val behind = ada.get("/api/notes/$noteId/steps?since=1").asJson()

        // then: the body moved to a version the log cannot bring an older editor across
        assertEquals(2, behind.intField("docVersion"))
        assertEquals(true, behind.getValue("reset").jsonPrimitive.boolean)
        val caughtUp = ada.get("/api/notes/$noteId/steps?since=2").asJson()
        assertEquals(false, caughtUp.getValue("reset").jsonPrimitive.boolean)
        assertEquals(0, caughtUp.getValue("steps").jsonArray.size)
    }

    @Test
    fun aViewerCannotWriteSteps() = testApplication {
        // given: Bob may only view Ada's note
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val noteId = ada.postJson("/api/notes", """{"kind":"TEXT"}""").asJson().intField("id")
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"VIEW"}""")

        // when
        val sent = bob.postJson("/api/notes/$noteId/steps", stepsBody(0, "bob-editor", "B"))

        // then: refused, and the log stays empty
        assertEquals(HttpStatusCode.Forbidden, sent.status)
        assertEquals(0, bob.get("/api/notes/$noteId/steps?since=0").asJson().getValue("steps").jsonArray.size)
    }

    @Test
    fun aTitleWrittenWithoutAConnectionDoesNotRenameOverSomebodyElses() = testApplication {
        // given: a note called "Shopping", which Ada renames to "Groceries"
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val noteId = ada.postJson("/api/notes", """{"kind":"TEXT","title":"Shopping"}""").asJson().intField("id")
        ada.postJson("/api/notes/$noteId/steps", """{"docVersion":0,"clientId":"online","steps":[],"content":${bodyOf("")},"title":"Groceries"}""")

        // when: a write queued offline arrives, renaming it from the "Shopping" it last saw
        val queued = ada.postJson(
            "/api/notes/$noteId/steps",
            """{"docVersion":0,"clientId":"offline","steps":[],"content":${bodyOf("")},"title":"Market","titleBase":"Shopping"}""",
        )

        // then: refused, and the title written meanwhile stays
        assertEquals(HttpStatusCode.Conflict, queued.status)
        assertEquals("note.version_conflict", queued.errorField("key"))
        assertEquals("Groceries", ada.get("/api/notes/$noteId").asJson().getValue("title").jsonPrimitive.content)
    }
}
