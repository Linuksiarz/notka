package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.REGISTER_BOB
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.errorField
import dev.duwe.notka.errorParams
import dev.duwe.notka.hasField
import dev.duwe.notka.intField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.patchJson
import dev.duwe.notka.postJson
import dev.duwe.notka.stringField
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
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

class HttpNotesTest {
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
    fun createReadPatchListAndTrashOverHttp() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val created = ada.postJson("/api/notes", """{"kind":"TEXT","title":"Groceries"}""")

        // then
        assertEquals(HttpStatusCode.Created, created.status)
        val note = created.asJson()
        assertEquals("TEXT", note.stringField("kind"))
        assertEquals("Groceries", note.stringField("title"))
        assertEquals("default", note.stringField("color"))
        assertTrue(note.hasField("background"))
        assertTrue(note["background"].toString() == "null")
        assertFalse(note.hasField("shares"))
        assertEquals("OWNER", note.stringField("access"))
        assertTrue(note.stringField("canEdit").toBoolean())
        assertEquals(1, note.getValue("content").jsonObject.getValue("blocks").jsonArray.size)

        // when: reading it and listing the active view
        val noteId = note.intField("id")
        val read = ada.get("/api/notes/$noteId")
        val listed = ada.get("/api/notes")

        // then
        assertEquals(HttpStatusCode.OK, read.status)
        assertEquals("Groceries", read.asJson().stringField("title"))
        assertEquals(1, listed.asJson().getValue("notes").jsonArray.size)
    }

    @Test
    fun patchAppliesOnlyTheFieldsThatArePresent() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val noteId = createNote(ada, """{"title":"Groceries","kind":"TEXT"}""")

        // when: only the color is patched
        val patched = ada.patchJson("/api/notes/$noteId", """{"color":"teal"}""")

        // then: the title survives and the color is applied
        assertEquals(HttpStatusCode.OK, patched.status)
        assertEquals("Groceries", patched.asJson().stringField("title"))
        assertEquals("teal", patched.asJson().stringField("color"))
    }

    @Test
    fun backgroundIsClearedWithTheEmptyStringSentinel() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val noteId = createNote(ada, """{"title":"Groceries"}""")
        ada.patchJson("/api/notes/$noteId", """{"background":"groceries"}""")

        // when: a null background leaves it alone
        val untouched = ada.patchJson("/api/notes/$noteId", """{"title":"Renamed"}""")
        // and: the sentinel clears it
        val cleared = ada.patchJson("/api/notes/$noteId", """{"background":""}""")

        // then
        assertEquals("groceries", untouched.asJson().stringField("background"))
        assertTrue(cleared.asJson()["background"].toString() == "null")
    }

    @Test
    fun trashRestoreAndPermanentDelete() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val noteId = createNote(ada, """{"title":"Groceries"}""")

        // when: trashing, then restoring, then trashing and deleting for good
        val trashed = ada.delete("/api/notes/$noteId")
        val activeAfterTrash = ada.get("/api/notes")
        val trashView = ada.get("/api/notes?view=trash")
        val restored = ada.post("/api/notes/$noteId/restore")
        ada.delete("/api/notes/$noteId")
        val permanent = ada.delete("/api/notes/$noteId?permanent=true")

        // then
        assertEquals(HttpStatusCode.OK, trashed.status)
        assertTrue(trashed.asJson()["trashedAt"].toString() != "null")
        assertEquals(0, activeAfterTrash.asJson().getValue("notes").jsonArray.size)
        assertEquals(1, trashView.asJson().getValue("notes").jsonArray.size)
        assertTrue(restored.asJson()["trashedAt"].toString() == "null")
        assertEquals(HttpStatusCode.NoContent, permanent.status)
        assertEquals(HttpStatusCode.NotFound, ada.get("/api/notes/$noteId").status)
    }

    @Test
    fun copyCreatesANewNote() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val noteId = createNote(ada, """{"title":"Groceries"}""")

        // when
        val copy = ada.post("/api/notes/$noteId/copy")

        // then
        assertEquals(HttpStatusCode.Created, copy.status)
        assertEquals("Groceries", copy.asJson().stringField("title"))
        assertTrue(copy.asJson().intField("id") != noteId)
    }

    @Test
    fun notesAreFilteredByLabel() = testApplication {
        // given: a label and two notes, one of them on the label
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val labelId = ada.postJson("/api/labels", """{"name":"errands"}""").asJson().intField("id")
        val labelled = ada.postJson("/api/notes", """{"kind":"TEXT","title":"pharmacy"}""").asJson().intField("id")
        ada.postJson("/api/notes", """{"kind":"TEXT","title":"shopping"}""")
        ada.patchJson("/api/notes/$labelled", """{"labels":[$labelId]}""")

        // when: the notes are listed with that label
        val filtered = ada.get("/api/notes?labelId=$labelId")

        // then: only the labelled note comes back
        assertEquals(HttpStatusCode.OK, filtered.status)
        val titles = filtered.asJson().getValue("notes").jsonArray
            .map { it.jsonObject.stringField("title") }
        assertEquals(listOf("pharmacy"), titles)
    }

    @Test
    fun filteringBySomebodyElsesLabelIsNotFound() = testApplication {
        // given: a label of one account, and another account asking for it
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val labelId = ada.postJson("/api/labels", """{"name":"errands"}""").asJson().intField("id")
        val bob = jsonClient()
        bob.postJson("/api/auth/register", REGISTER_BOB)

        // when: the other account filters by it
        val response = bob.get("/api/notes?labelId=$labelId")

        // then: it is a not-found, not an empty list
        assertEquals(HttpStatusCode.NotFound, response.status)
        assertEquals("label.not_found", response.errorField("key"))
    }

    @Test
    fun unknownViewIsRejected() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val response = ada.get("/api/notes?view=someday")

        // then
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("request.invalid_body", response.errorField("key"))
    }

    @Test
    fun contentWithNoBlocksIsRejected() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val response = ada.postJson("/api/notes", """{"content":{"version":1,"blocks":[]}}""")

        // then
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("note.invalid_document", response.errorField("key"))
    }

    @Test
    fun oversizedDocumentsAreRejected() {
        // given
        val tinyFixture = TestFixture(maxNoteBytes = 64)

        // when
        testApplication {
            application { notkaModule(tinyFixture.services) }
            val ada = jsonClient()
            ada.postJson("/api/auth/register", REGISTER_ADA)
            val response = ada.postJson(
                "/api/notes",
                """{"content":{"version":1,"blocks":[{"id":"b1","type":"paragraph","spans":[{"text":"${"x".repeat(200)}"}]}]}}""",
            )

            // then
            assertEquals(HttpStatusCode.PayloadTooLarge, response.status)
            assertEquals("note.content_too_large", response.errorField("key"))
            assertEquals("PAYLOAD_TOO_LARGE", response.errorField("code"))
        }
        tinyFixture.close()
    }

    @Test
    fun aStrangerGets404AndAViewerGets403() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val noteId = createNote(ada, """{"title":"Groceries"}""")

        // when: before sharing
        val strangerRead = bob.get("/api/notes/$noteId")
        val strangerPatch = bob.patchJson("/api/notes/$noteId", """{"title":"Hacked"}""")

        // then
        assertEquals(HttpStatusCode.NotFound, strangerRead.status)
        assertEquals("note.not_found", strangerRead.errorField("key"))
        assertEquals(HttpStatusCode.NotFound, strangerPatch.status)

        // when: shared with VIEW
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"VIEW"}""")
        val viewerRead = bob.get("/api/notes/$noteId")
        val viewerPatch = bob.patchJson("/api/notes/$noteId", """{"title":"Hacked"}""")

        // then
        assertEquals(HttpStatusCode.OK, viewerRead.status)
        assertEquals("VIEW", viewerRead.asJson().stringField("access"))
        assertFalse(viewerRead.asJson().stringField("canEdit").toBoolean())
        assertTrue(viewerRead.asJson().hasField("shares"))
        assertEquals(HttpStatusCode.Forbidden, viewerPatch.status)
        assertEquals("note.forbidden", viewerPatch.errorField("key"))
    }

    @Test
    fun shareLifecycleOverHttp() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val noteId = createNote(ada, """{"title":"Groceries"}""")

        // when: sharing with EDIT and reading it as the collaborator
        val share = ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"EDIT"}""")
        val sharedList = ada.get("/api/notes/$noteId/shares")
        val collaboratorView = bob.get("/api/notes/$noteId")
        val ownerView = ada.get("/api/notes/$noteId")

        // then
        assertEquals(HttpStatusCode.Created, share.status)
        assertEquals("EDIT", share.asJson().stringField("permission"))
        assertEquals(1, sharedList.asJson().getValue("shares").jsonArray.size)
        assertEquals("EDIT", collaboratorView.asJson().stringField("access"))
        assertTrue(collaboratorView.asJson().stringField("canChangeAppearance").toBoolean())
        assertEquals(1, ownerView.asJson().getValue("shares").jsonArray.size)

        // when: downgrading to VIEW and removing the share
        val bobId = bob.get("/api/auth/me").asJson().getValue("user").jsonObject.intField("id")
        val downgraded = ada.patchJson("/api/notes/$noteId/shares/$bobId", """{"permission":"VIEW"}""")
        val removed = ada.delete("/api/notes/$noteId/shares/$bobId")
        val afterRemoval = bob.get("/api/notes/$noteId")

        // then
        assertEquals("VIEW", downgraded.asJson().stringField("permission"))
        assertEquals(HttpStatusCode.NoContent, removed.status)
        assertEquals(HttpStatusCode.NotFound, afterRemoval.status)
        assertEquals("note.not_found", afterRemoval.errorField("key"))
    }

    @Test
    fun shareErrorsCarryTheirKeys() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val noteId = createNote(ada, """{"title":"Groceries"}""")
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"VIEW"}""")

        // when
        val unknownRecipient = ada.postJson(
            "/api/notes/$noteId/shares",
            """{"email":"nobody@example.com","permission":"VIEW"}""",
        )
        val toSelf = ada.postJson("/api/notes/$noteId/shares", """{"email":"ada@example.com","permission":"VIEW"}""")
        val alreadyShared = ada.postJson(
            "/api/notes/$noteId/shares",
            """{"email":"bob@example.com","permission":"EDIT"}""",
        )

        // then
        assertEquals(HttpStatusCode.NotFound, unknownRecipient.status)
        assertEquals("share.recipient_not_found", unknownRecipient.errorField("key"))
        assertEquals("nobody@example.com", unknownRecipient.asJson().errorParams().stringField("email"))
        assertEquals(HttpStatusCode.BadRequest, toSelf.status)
        assertEquals("share.cannot_share_with_self", toSelf.errorField("key"))
        assertEquals(HttpStatusCode.Conflict, alreadyShared.status)
        assertEquals("share.already_shared", alreadyShared.errorField("key"))
        assertEquals("bob@example.com", alreadyShared.asJson().errorParams().stringField("email"))
    }

    @Test
    fun labelLifecycleOverHttp() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val created = ada.postJson("/api/labels", """{"name":"work"}""")
        val duplicate = ada.postJson("/api/labels", """{"name":"WORK"}""")
        val list = ada.get("/api/labels")
        val labelId = created.asJson().intField("id")
        val renamed = ada.patchJson("/api/labels/$labelId", """{"name":"work/2026"}""")
        val noteId = createNote(ada, """{"title":"Groceries","labels":[$labelId]}""")
        val noteRead = ada.get("/api/notes/$noteId")
        val deleted = ada.delete("/api/labels/$labelId")

        // then
        assertEquals(HttpStatusCode.Created, created.status)
        assertEquals(HttpStatusCode.Conflict, duplicate.status)
        assertEquals("label.name_taken", duplicate.errorField("key"))
        assertEquals(1, list.asJson().getValue("labels").jsonArray.size)
        assertEquals("work/2026", renamed.asJson().stringField("name"))
        assertEquals("work/2026", (noteRead.asJson().getValue("labels") as JsonArray).single().jsonObject.stringField("name"))
        assertEquals(HttpStatusCode.NoContent, deleted.status)
        assertEquals(0, ada.get("/api/notes/$noteId").asJson().getValue("labels").jsonArray.size)
    }

    @Test
    fun labelsArePrivateToTheirOwner() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val noteId = createNote(ada, """{"title":"Groceries"}""")
        val adaLabel = ada.postJson("/api/labels", """{"name":"work"}""").asJson().intField("id")
        val bobLabel = bob.postJson("/api/labels", """{"name":"private"}""").asJson().intField("id")
        ada.patchJson("/api/notes/$noteId", """{"labels":[$adaLabel]}""")
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"EDIT"}""")

        // when
        bob.patchJson("/api/notes/$noteId", """{"labels":[$bobLabel]}""")
        val ownerView = ada.get("/api/notes/$noteId").asJson()

        // then
        assertEquals("work", (ownerView.getValue("labels") as JsonArray).single().jsonObject.stringField("name"))
        val bobNoteId = bob.get("/api/notes").asJson().getValue("notes").jsonArray.single().jsonObject.intField("id")
        assertEquals(noteId, bobNoteId)
        assertEquals(
            "private",
            (bob.get("/api/notes/$noteId").asJson().getValue("labels") as JsonArray).single().jsonObject.stringField("name"),
        )
    }

    @Test
    fun noteLabelsCanBeDetachedThroughTheEndpoint() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val labelId = ada.postJson("/api/labels", """{"name":"work"}""").asJson().intField("id")
        val noteId = createNote(ada, """{"title":"Groceries","labels":[$labelId]}""")

        // when
        val response = ada.delete("/api/notes/$noteId/labels/$labelId")

        // then
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(0, response.asJson().getValue("labels").jsonArray.size)
    }

    private suspend fun createNote(client: HttpClient, body: String): Int =
        client.postJson("/api/notes", body).asJson().getValue("id").jsonPrimitive.content.toInt()


    @Test
    fun aCollaboratorsEditIsNamedOnTheCardUntilTheNoteIsSeen() = testApplication {
        // given: Ada shares a note with Bob, and Bob renames it
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val noteId = ada.postJson("/api/notes", """{"title":"Ours"}""").asJson().intField("id")
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"EDIT"}""")
        bob.postJson("/api/notes/$noteId/seen", "{}")
        fixture.now += 1000
        bob.patchJson("/api/notes/$noteId", """{"title":"Bob's"}""")

        // when: Ada lists her notes, then opens this one
        val listed = ada.get("/api/notes").asJson().getValue("notes").jsonArray.single().jsonObject
        val seen = ada.post("/api/notes/$noteId/seen")

        // then: the card named Bob, and after opening it names nobody
        val edit = listed.getValue("unseenEdit").jsonObject
        assertEquals("Bob Builder", edit.getValue("user").jsonObject.stringField("displayName"))
        assertEquals(fixture.now, edit.getValue("at").jsonPrimitive.content.toLong())
        assertEquals(HttpStatusCode.OK, seen.status)
        assertFalse(seen.asJson().hasField("unseenEdit"))
        assertFalse(bob.get("/api/notes/$noteId").asJson().hasField("unseenEdit"))
    }
}
