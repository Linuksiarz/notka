package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.REGISTER_BOB
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.control.MAX_IMAGE_BYTES
import dev.duwe.notka.entity.model.picture
import dev.duwe.notka.errorField
import dev.duwe.notka.intField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.postJson
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class HttpImagesTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private suspend fun HttpClient.upload(noteId: Int, bytes: ByteArray, type: ContentType = ContentType.Image.PNG): HttpResponse =
        post("/api/notes/$noteId/images") {
            contentType(type)
            setBody(bytes)
        }

    private fun JsonObject.images() = (this["images"]?.jsonArray ?: emptyList()).map { it.jsonObject }

    @Test
    fun aPictureIsAttachedServedAndRemoved() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val note = ada.postJson("/api/notes", """{"title":"Trip"}""").asJson()
        val noteId = note.intField("id")
        val png = picture("png", 320, 200)

        // when
        val uploaded = ada.upload(noteId, png)

        // then: the note now lists it, with its size, and moved to a new version
        assertEquals(HttpStatusCode.Created, uploaded.status)
        val withImage = uploaded.asJson()
        val image = withImage.images().single()
        assertEquals(320, image.intField("width"))
        assertEquals(200, image.intField("height"))
        assertEquals(note.intField("version") + 1, withImage.intField("version"))

        // and: its bytes come back as they went in, as a cacheable picture
        val served = ada.get("/api/notes/$noteId/images/${image.intField("id")}")
        assertEquals(HttpStatusCode.OK, served.status)
        assertEquals("image/png", served.headers[HttpHeaders.ContentType])
        assertContentEquals(png, served.readRawBytes())

        // when: it is taken off again
        val removed = ada.delete("/api/notes/$noteId/images/${image.intField("id")}")

        // then
        assertEquals(HttpStatusCode.OK, removed.status)
        assertEquals(0, removed.asJson().images().size)
        assertEquals(HttpStatusCode.NotFound, ada.get("/api/notes/$noteId/images/${image.intField("id")}").status)
    }

    @Test
    fun aViewerSeesPicturesButCannotAddThemAndAStrangerSeesNothing() = testApplication {
        // given: Ada's note with a picture, shared with Bob for viewing; Eve is nobody's collaborator
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val bob = jsonClient()
        val eve = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        bob.postJson("/api/auth/register", REGISTER_BOB)
        eve.postJson("/api/auth/register", """{"email":"eve@example.com","displayName":"Eve","password":"correct horse battery"}""")
        val noteId = ada.postJson("/api/notes", """{"title":"Shared"}""").asJson().intField("id")
        val imageId = ada.upload(noteId, picture("jpg", 40, 30)).asJson().images().single().intField("id")
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"VIEW"}""")

        // when
        val bobReads = bob.get("/api/notes/$noteId/images/$imageId").status
        val bobAdds = bob.upload(noteId, picture("png", 10, 10))
        val eveReads = eve.get("/api/notes/$noteId/images/$imageId").status

        // then
        assertEquals(HttpStatusCode.OK, bobReads)
        assertEquals(HttpStatusCode.Forbidden, bobAdds.status)
        assertEquals(HttpStatusCode.NotFound, eveReads)
    }

    @Test
    fun onlyRealPicturesOfAReasonableSizeAreAccepted() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val noteId = ada.postJson("/api/notes", """{"title":"x"}""").asJson().intField("id")
        val svg = """<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>""".toByteArray()

        // when: an SVG that calls itself a PNG, and a body one byte over the limit
        val disguised = ada.upload(noteId, svg)
        val tooLarge = ada.upload(noteId, ByteArray(MAX_IMAGE_BYTES + 1))

        // then
        assertEquals(HttpStatusCode.BadRequest, disguised.status)
        assertEquals("image.unsupported", disguised.errorField("key"))
        assertEquals(HttpStatusCode.PayloadTooLarge, tooLarge.status)
        assertEquals("image.too_large", tooLarge.errorField("key"))
    }

    @Test
    fun aCopyCarriesThePicturesAndAnotherNotesIdDoesNotReachThem() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val first = ada.postJson("/api/notes", """{"title":"a"}""").asJson().intField("id")
        val second = ada.postJson("/api/notes", """{"title":"b"}""").asJson().intField("id")
        val imageId = ada.upload(first, picture("gif", 8, 8)).asJson().images().single().intField("id")

        // when
        val copy = ada.post("/api/notes/$first/copy").asJson()
        val crossed = ada.get("/api/notes/$second/images/$imageId").status

        // then: the copy has a picture of its own, and an image id only works under its own note
        val copied = copy.images().single()
        assertFalse(copied.intField("id") == imageId)
        assertEquals("image/gif", copied["contentType"]?.jsonPrimitive?.content)
        assertEquals(HttpStatusCode.NotFound, crossed)
    }
}
