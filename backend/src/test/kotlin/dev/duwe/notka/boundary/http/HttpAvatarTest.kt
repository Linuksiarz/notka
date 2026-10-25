package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.REGISTER_BOB
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.control.MAX_AVATAR_BYTES
import dev.duwe.notka.entity.model.jxlFixture
import dev.duwe.notka.entity.model.picture
import dev.duwe.notka.errorField
import dev.duwe.notka.intField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.postJson
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

class HttpAvatarTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private suspend fun HttpClient.uploadAvatar(bytes: ByteArray, type: ContentType = ContentType("image", "jxl")): HttpResponse =
        put("/api/auth/me/avatar") {
            contentType(type)
            setBody(bytes)
        }

    private suspend fun HttpResponse.user(): JsonObject = asJson().getValue("user").jsonObject

    @Test
    fun anAvatarIsStoredServedToEveryoneAndRemoved() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val adaId = ada.postJson("/api/auth/register", REGISTER_ADA).user().intField("id")
        val bob = jsonClient()
        bob.postJson("/api/auth/register", REGISTER_BOB)
        val jxl = jxlFixture("square-512.jxl")

        // when
        val uploaded = ada.uploadAvatar(jxl, ContentType.Application.OctetStream)

        // then: the account now says when its picture changed, and everyone signed in gets the bytes back
        assertEquals(HttpStatusCode.OK, uploaded.status)
        assertEquals(fixture.now, uploaded.user().getValue("avatarAt").jsonPrimitive.long)
        val served = bob.get("/api/users/$adaId/avatar?v=${fixture.now}")
        assertEquals(HttpStatusCode.OK, served.status)
        assertEquals("image/jxl", served.headers[HttpHeaders.ContentType])
        assertContentEquals(jxl, served.readRawBytes())

        // when: it is taken away
        val removed = ada.delete("/api/auth/me/avatar")

        // then
        assertEquals(JsonNull, removed.user()["avatarAt"])
        assertEquals(HttpStatusCode.NotFound, bob.get("/api/users/$adaId/avatar").status)
    }

    @Test
    fun aCollaboratorsAvatarTravelsWithTheShare() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val bob = jsonClient()
        bob.postJson("/api/auth/register", REGISTER_BOB)
        bob.uploadAvatar(jxlFixture("square-512.jxl"))
        val noteId = ada.postJson("/api/notes", """{"title":"Trip"}""").asJson().intField("id")

        // when
        ada.postJson("/api/notes/$noteId/shares", """{"email":"bob@example.com","permission":"EDIT"}""")
        val shares = ada.get("/api/notes/$noteId/shares").asJson()

        // then
        val shared = shares.getValue("shares").jsonArray.single().jsonObject.getValue("user").jsonObject
        assertEquals(fixture.now, shared.getValue("avatarAt").jsonPrimitive.long)
    }

    @Test
    fun anythingButASmallJpegXlIsRefused() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        val svg = """<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>""".toByteArray()

        // when
        val png = ada.uploadAvatar(picture("png", 64, 64), ContentType.Image.PNG)
        val script = ada.uploadAvatar(svg, ContentType.Image.SVG)
        val tooWide = ada.uploadAvatar(jxlFixture("too-wide-1500.jxl"))
        val tooBig = ada.uploadAvatar(jxlFixture("square-512.jxl") + ByteArray(MAX_AVATAR_BYTES))

        // then
        assertEquals(HttpStatusCode.BadRequest, png.status)
        assertEquals("avatar.unsupported", png.errorField("key"))
        assertEquals("avatar.unsupported", script.errorField("key"))
        assertEquals("avatar.unsupported", tooWide.errorField("key"))
        assertEquals(HttpStatusCode.PayloadTooLarge, tooBig.status)
    }

    @Test
    fun anAvatarNeedsASession() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = jsonClient()
        val adaId = ada.postJson("/api/auth/register", REGISTER_ADA).user().intField("id")
        ada.uploadAvatar(jxlFixture("square-512.jxl"))
        val stranger = jsonClient()

        // when
        val read = stranger.get("/api/users/$adaId/avatar")
        val write = stranger.uploadAvatar(jxlFixture("square-512.jxl"))

        // then
        assertEquals(HttpStatusCode.Unauthorized, read.status)
        assertEquals(HttpStatusCode.Unauthorized, write.status)
    }
}
