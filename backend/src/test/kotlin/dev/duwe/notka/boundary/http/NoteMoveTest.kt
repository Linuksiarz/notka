package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.intField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.postJson
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

/** Dragging a card: `POST /api/notes/{id}/move` puts a note directly above or below another. */
class NoteMoveTest {
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
    fun movesANoteAboveOrBelowAnotherAndKeepsTheRestInOrder() = testApplication {
        // given: four notes, newest first — D, C, B, A
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val ids = listOf("A", "B", "C", "D").associateWith { title ->
            ada.postJson("/api/notes", """{"title":"$title"}""").asJson().intField("id")
        }
        suspend fun order() = ada.get("/api/notes").asJson().getValue("notes").jsonArray
            .map { it.jsonObject.getValue("title").jsonPrimitive.content }

        // when: A goes above C, then D goes below B
        val moved = ada.postJson("/api/notes/${ids.getValue("A")}/move", """{"before":${ids.getValue("C")}}""")
        val first = order()
        ada.postJson("/api/notes/${ids.getValue("D")}/move", """{"after":${ids.getValue("B")}}""")
        val second = order()

        // then: each lands exactly there, and the others keep their order
        assertEquals(HttpStatusCode.OK, moved.status)
        assertEquals(listOf("D", "A", "C", "B"), first)
        assertEquals(listOf("A", "C", "B", "D"), second)
    }

    @Test
    fun refusesAMoveWithoutExactlyOneAnchor() = testApplication {
        // given: two notes
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val first = ada.postJson("/api/notes", """{"title":"one"}""").asJson().intField("id")
        val second = ada.postJson("/api/notes", """{"title":"two"}""").asJson().intField("id")

        // when
        val none = ada.postJson("/api/notes/$first/move", "{}")
        val both = ada.postJson("/api/notes/$first/move", """{"before":$second,"after":$second}""")

        // then
        assertEquals(HttpStatusCode.BadRequest, none.status)
        assertEquals(HttpStatusCode.BadRequest, both.status)
    }
}
