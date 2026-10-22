package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.RecordingMail
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.entity.model.picture
import dev.duwe.notka.errorField
import dev.duwe.notka.intField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.patchJson
import dev.duwe.notka.postJson
import dev.duwe.notka.stringField
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private const val ADMIN_LOGIN = """{"login":"root","password":"a long admin password"}"""

/** The server settings, as the administrator — and nobody else — reaches them over HTTP. */
class HttpAdminTest {
    private val mail = RecordingMail()
    private val fixture = TestFixture(registrationOpen = false, mail = mail).also {
        it.services.auth.createAdmin("root", "a long admin password", email = "root@example.com")
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private fun zip(vararg files: Pair<String, ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            for ((name, bytes) in files) {
                zip.putNextEntry(ZipEntry(name))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private val manifest = """
        {"format":1,"name":"Watercolour","author":"Ada","license":"CC0",
         "logo":"logo.png","highlight":"#FDE3CF",
         "backgrounds":{"food":{"light":"food.png","tint":"#FBE4D8","tonal":"#FFEDE7"},"music":{"light":"m.svg","dark":"m-dark.svg"}}}
    """.trimIndent().toByteArray()
    private val svg = """<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>""".toByteArray()

    private suspend fun HttpClient.uploadTheme(bytes: ByteArray): HttpResponse = post("/api/admin/themes") {
        contentType(ContentType.Application.Zip)
        setBody(bytes)
    }

    @Test
    fun onlyTheAdministratorReachesTheServerSettings() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        fixture.services.settings.setRegistrationOpen(true)
        val ada = jsonClient()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        fixture.services.settings.setRegistrationOpen(false)

        // when
        val asAda = ada.get("/api/admin/users")

        // then
        assertEquals(HttpStatusCode.Forbidden, asAda.status)
        assertEquals("auth.admin_required", asAda.errorField("key"))
    }

    @Test
    fun theAdministratorOpensSignUpAndSeesEveryAccount() = testApplication {
        // given: sign-up starts closed
        application { notkaModule(fixture.services) }
        val root = jsonClient()
        val signedIn = root.postJson("/api/auth/login", ADMIN_LOGIN).asJson()
        val stranger = jsonClient()
        val refused = stranger.postJson("/api/auth/register", REGISTER_ADA).status

        // when
        val settings = root.patchJson("/api/admin/settings", """{"registrationOpen":true}""").asJson()
        val accepted = stranger.postJson("/api/auth/register", REGISTER_ADA).status
        val accounts = root.get("/api/admin/users").asJson()

        // then
        assertEquals(true, signedIn.getValue("user").jsonObject["admin"]?.jsonPrimitive?.boolean)
        assertEquals(HttpStatusCode.Forbidden, refused)
        assertEquals(true, settings["registrationOpen"]?.jsonPrimitive?.boolean)
        assertEquals(true, settings["mailConfigured"]?.jsonPrimitive?.boolean)
        assertEquals(HttpStatusCode.Created, accepted)
        val listed = accounts.getValue("accounts").jsonArray.map { it.jsonObject.getValue("user").jsonObject }
        assertEquals(listOf("root", null), listed.map { it["username"]?.jsonPrimitive?.contentOrNullSafe() })
        assertTrue(accounts.intField("databaseBytes") > 0)
    }

    @Test
    fun aResetLinkSetsANewPasswordAndSignsIn() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = fixture.registerUser()
        val root = jsonClient()
        root.postJson("/api/auth/login", ADMIN_LOGIN)

        // when
        val reset = root.post("/api/admin/users/${ada.id}/password-reset") { header(HttpHeaders.AcceptLanguage, "pl,en;q=0.5") }
        val token = mail.sent.single().link.substringAfter('#')
        val visitor = jsonClient()
        val completed = visitor.postJson("/api/auth/password-reset", """{"token":"$token","password":"a brand new password"}""")
        val me = visitor.get("/api/auth/me")

        // then
        assertEquals(HttpStatusCode.NoContent, reset.status)
        assertEquals("pl", mail.sent.single().locale)
        assertEquals(HttpStatusCode.OK, completed.status)
        assertEquals(HttpStatusCode.OK, me.status)
    }

    @Test
    fun anUploadedThemeIsListedPickedAndServedInert() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val root = jsonClient()
        root.postJson("/api/auth/login", ADMIN_LOGIN)
        val archive = zip(
            "watercolour/theme.json" to manifest,
            "watercolour/food.png" to picture("png", 4, 4),
            "watercolour/m.svg" to svg,
            "watercolour/m-dark.svg" to svg,
            "watercolour/logo.png" to picture("png", 8, 8),
        )

        // when
        val uploaded = root.uploadTheme(archive)
        val defaulted = root.patchJson("/api/admin/settings", """{"defaultThemeId":"watercolour"}""").asJson()
        val picked = root.put("/api/themes/selection") {
            contentType(ContentType.Application.Json)
            setBody("""{"themeId":"notka"}""")
        }.asJson()

        // then
        assertEquals(HttpStatusCode.Created, uploaded.status)
        val theme = uploaded.asJson()
        assertEquals("watercolour", theme.stringField("id"))
        val food = theme.getValue("backgrounds").jsonObject.getValue("food").jsonObject
        assertEquals("#fbe4d8", food.stringField("tint"))
        assertEquals("#ffede7", food.stringField("tonal"))
        assertEquals(JsonNull, food.getValue("tonalDark"))
        assertEquals("watercolour", defaulted.stringField("defaultThemeId"))
        assertEquals("notka", picked.stringField("selectedThemeId"))
        assertEquals("#fde3cf", theme.stringField("highlight"))
        assertEquals(JsonNull, theme.getValue("highlightDark"))
        val logo = root.get(theme.stringField("logo"))
        assertEquals(HttpStatusCode.OK, logo.status)
        assertEquals("image/png", logo.headers[HttpHeaders.ContentType])

        // and: the picture comes back with a policy that keeps an SVG's script from running
        val music = theme.getValue("backgrounds").jsonObject.getValue("music").jsonObject
        val served = root.get(music.stringField("light"))
        assertEquals(HttpStatusCode.OK, served.status)
        assertEquals("image/svg+xml", served.headers[HttpHeaders.ContentType])
        assertTrue(served.headers["Content-Security-Policy"].orEmpty().contains("sandbox"))

        // when: the theme is removed
        val removed = root.delete("/api/admin/themes/watercolour")
        val settings = root.get("/api/admin/settings").asJson()

        // then: the default falls back to the built-in theme
        assertEquals(HttpStatusCode.NoContent, removed.status)
        assertEquals("notka", settings.stringField("defaultThemeId"))
    }

    @Test
    fun aThemeThatDoesNotFitIsRefusedWithItsReason() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val root = jsonClient()
        root.postJson("/api/auth/login", ADMIN_LOGIN)
        val unknown = """{"format":1,"name":"X","backgrounds":{"space":{"light":"a.png"}}}""".toByteArray()
        val disguised = """{"format":1,"name":"X","backgrounds":{"food":{"light":"a.png"}}}""".toByteArray()
        val noLogo = """{"format":1,"name":"X","logo":"logo.png"}""".toByteArray()
        val badHighlight = """{"format":1,"name":"X","highlight":"yellow"}""".toByteArray()
        val nothing = """{"format":1,"name":"X"}""".toByteArray()

        // when
        val notAZip = root.uploadTheme("hello".toByteArray())
        val unknownBackground = root.uploadTheme(zip("theme.json" to unknown, "a.png" to picture("png", 2, 2)))
        val svgAsPng = root.uploadTheme(zip("theme.json" to disguised, "a.png" to svg))
        val missingLogo = root.uploadTheme(zip("theme.json" to noLogo))
        val notAColour = root.uploadTheme(zip("theme.json" to badHighlight))
        val empty = root.uploadTheme(zip("theme.json" to nothing))

        // then
        assertEquals("theme.archive", notAZip.errorField("key"))
        assertEquals("theme.unknown_background", unknownBackground.errorField("key"))
        assertEquals("theme.file_type", svgAsPng.errorField("key"))
        assertEquals("theme.missing_file", missingLogo.errorField("key"))
        assertEquals("theme.tint", notAColour.errorField("key"))
        assertEquals("theme.empty", empty.errorField("key"))
    }

    @Test
    fun aThemeMayCarryOnlyALogoAndAHighlight() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val root = jsonClient()
        root.postJson("/api/auth/login", ADMIN_LOGIN)
        val brand = """{"format":1,"name":"Brand","logo":"logo.svg","highlightDark":"#41331c"}""".toByteArray()

        // when
        val uploaded = root.uploadTheme(zip("theme.json" to brand, "logo.svg" to svg))

        // then
        assertEquals(HttpStatusCode.Created, uploaded.status)
        val theme = uploaded.asJson()
        assertTrue(theme.getValue("backgrounds").jsonObject.isEmpty())
        assertEquals("#41331c", theme.stringField("highlightDark"))
        assertTrue(theme.stringField("logo").startsWith("/api/themes/brand/files/"))
    }
}

private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? = if (this is kotlinx.serialization.json.JsonNull) null else content
