package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.errorField
import dev.duwe.notka.hasField
import dev.duwe.notka.intField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.patchJson
import dev.duwe.notka.postJson
import dev.duwe.notka.stringField
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Reminders: a moment and an optional repeat rule on the note, and the view that gathers them.
 *
 * A reminder is metadata, like the archive flag (rule 12) — never version-guarded and never a history
 * entry — and it is the note's own property, so everyone with access sees the same one.
 */
class HttpReminderTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private suspend fun signIn(client: HttpClient): Unit {
        client.postJson("/api/auth/register", REGISTER_ADA)
    }

    private suspend fun note(client: HttpClient, title: String): Int =
        client.postJson("/api/notes", """{"kind":"TEXT","title":"$title"}""").asJson().intField("id")

    private suspend fun reminders(client: HttpClient): List<String> =
        (client.get("/api/notes?reminders=true").asJson()["notes"] as JsonArray)
            .jsonArray.map { it.jsonObject.stringField("title") }

    @Test
    fun aNoteWithoutAReminderSaysNothingAboutOne() = testApplication {
        // given: an ordinary note
        val ada = jsonClient()
        application { notkaModule(fixture.services) }
        signIn(ada)
        val id = note(ada, "Groceries")

        // when
        val fetched = ada.get("/api/notes/$id").asJson()

        // then: both fields are absent, not null
        assertFalse(fetched.hasField("reminderAt"))
        assertFalse(fetched.hasField("reminderRepeat"))
    }

    @Test
    fun settingAReminderReturnsItAndTheViewGathersIt() = testApplication {
        // given: a note and a moment to remind about
        val ada = jsonClient()
        application { notkaModule(fixture.services) }
        signIn(ada)
        val id = note(ada, "Call the dentist")

        // when
        val patched = ada.patchJson(
            "/api/notes/$id",
            """{"reminderAt":1791648000000,"reminderRepeat":"weekly"}""",
        )

        // then: it is on the note, and it is what the reminders view lists
        assertEquals(HttpStatusCode.OK, patched.status)
        assertEquals(1791648000000L, patched.asJson()["reminderAt"]?.jsonPrimitive?.content?.toLong())
        assertEquals("weekly", patched.asJson().stringField("reminderRepeat"))
        assertEquals(listOf("Call the dentist"), reminders(ada))
    }

    @Test
    fun theViewIsOrderedByTheReminderNotByTheEdit() = testApplication {
        // given: two notes, the later moment written first
        val ada = jsonClient()
        application { notkaModule(fixture.services) }
        signIn(ada)
        val later = note(ada, "Later")
        val sooner = note(ada, "Sooner")
        ada.patchJson("/api/notes/$later", """{"reminderAt":1791650000000}""")
        ada.patchJson("/api/notes/$sooner", """{"reminderAt":1791640000000}""")
        ada.patchJson("/api/notes/$later", """{"title":"Later"}""")

        // when
        val listed = reminders(ada)

        // then: soonest first, whichever note was edited last
        assertEquals(listOf("Sooner", "Later"), listed)
    }

    @Test
    fun clearingItWithZeroTakesItOutOfTheView() = testApplication {
        // given: a note with a reminder
        val ada = jsonClient()
        application { notkaModule(fixture.services) }
        signIn(ada)
        val id = note(ada, "Return the book")
        ada.patchJson("/api/notes/$id", """{"reminderAt":1791648000000,"reminderRepeat":"daily"}""")
        assertEquals(listOf("Return the book"), reminders(ada))

        // when: the reminder is taken away
        val cleared = ada.patchJson("/api/notes/$id", """{"reminderAt":0}""")

        // then: both the moment and the rule are gone, and the view no longer has it
        assertFalse(cleared.asJson().hasField("reminderAt"))
        assertFalse(cleared.asJson().hasField("reminderRepeat"))
        assertTrue(reminders(ada).isEmpty())
    }

    @Test
    fun anUnknownRepeatRuleIsRefused() = testApplication {
        // given: a note
        val ada = jsonClient()
        application { notkaModule(fixture.services) }
        signIn(ada)
        val id = note(ada, "Groceries")

        // when: the rule names something this app does not know
        val response = ada.patchJson("/api/notes/$id", """{"reminderAt":1791648000000,"reminderRepeat":"hourly"}""")

        // then
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("request.invalid_body", response.asJson().errorField("key"))
    }

    @Test
    fun aNegativeMomentIsRefused() = testApplication {
        // given: a note
        val ada = jsonClient()
        application { notkaModule(fixture.services) }
        signIn(ada)
        val id = note(ada, "Groceries")

        // when: the moment is a negative number, which is neither a reminder nor the "take it away" 0
        val response = ada.patchJson("/api/notes/$id", """{"reminderAt":-5}""")

        // then
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("request.invalid_body", response.asJson().errorField("key"))
    }

    @Test
    fun aReminderIsNotAContentWrite() = testApplication {
        // given: a note with content and no history yet
        val ada = jsonClient()
        application { notkaModule(fixture.services) }
        signIn(ada)
        val id = note(ada, "Groceries")

        // when: only the reminder is written
        ada.patchJson("/api/notes/$id", """{"reminderAt":1791648000000}""")

        // then: nothing was archived, because no text was replaced (rule 13)
        val history = (ada.get("/api/notes/$id/versions").asJson()["versions"] as JsonArray).jsonArray
        assertTrue(history.isEmpty())
    }
}
