package dev.duwe.notka.boundary.http

import dev.duwe.notka.boundary.config.NOTKA_VERSION
import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.errorField
import dev.duwe.notka.errorParams
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.patchJson
import dev.duwe.notka.postJson
import dev.duwe.notka.setCookieHeader
import dev.duwe.notka.stringField
import io.ktor.client.request.get
import io.ktor.client.request.head
import io.ktor.client.request.post
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.jsonObject
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class HttpAuthTest {
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
    fun registerReturns201AndAnHttpOnlySessionCookie() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()

        // when
        val response = client.postJson("/api/auth/register", REGISTER_ADA)

        // then
        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals("ada@example.com", response.asJson().getValue("user").jsonObject.stringField("email"))
        val cookie = response.setCookieHeader()
        assertTrue(cookie.startsWith("notka_session="), cookie)
        assertTrue(cookie.contains("HttpOnly"), cookie)
        assertTrue(cookie.contains("Path=/"), cookie)
        assertTrue(cookie.contains("SameSite=Lax"), cookie)
        assertFalse(cookie.contains("Secure"), cookie)
    }

    @Test
    fun secureCookiesAreFlaggedWhenConfigured() {
        // given
        val secureFixture = TestFixture(cookieSecure = true)

        // when
        testApplication {
            application { notkaModule(secureFixture.services) }
            val response = jsonClient().postJson("/api/auth/register", REGISTER_ADA)

            // then
            assertTrue(response.setCookieHeader().contains("Secure"))
        }
        secureFixture.close()
    }

    @Test
    fun duplicateEmailReturns409WithTheEmailTakenKey() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        client.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val response = client.postJson("/api/auth/register", REGISTER_ADA)

        // then
        assertEquals(HttpStatusCode.Conflict, response.status)
        assertEquals("CONFLICT", response.errorField("code"))
        assertEquals("auth.email_taken", response.errorField("key"))
        assertEquals("ada@example.com", response.asJson().errorParams().stringField("email"))
    }

    @Test
    fun wrongPasswordReturns401WithTheInvalidCredentialsKey() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        client.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val response = client.postJson(
            "/api/auth/login",
            """{"login":"ada@example.com","password":"definitely wrong"}""",
        )

        // then
        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertEquals("UNAUTHORIZED", response.errorField("code"))
        assertEquals("auth.invalid_credentials", response.errorField("key"))
    }

    @Test
    fun meWithoutASessionReturns401() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()

        // when
        val response = client.get("/api/auth/me")

        // then
        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertEquals("request.unauthorized", response.errorField("key"))
        assertEquals("UNAUTHORIZED", response.errorField("code"))
    }

    @Test
    fun loginAndLogoutRoundTrip() = testApplication {
        // given: a registered user whose session was already closed
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        client.postJson("/api/auth/register", REGISTER_ADA)
        client.post("/api/auth/logout")

        // when
        val login = client.postJson(
            "/api/auth/login",
            """{"login":"ada@example.com","password":"correct horse battery"}""",
        )
        val me = client.get("/api/auth/me")
        val logout = client.post("/api/auth/logout")
        val meAfter = client.get("/api/auth/me")

        // then
        assertEquals(HttpStatusCode.OK, login.status)
        assertEquals(HttpStatusCode.OK, me.status)
        assertEquals(HttpStatusCode.NoContent, logout.status)
        assertEquals(HttpStatusCode.Unauthorized, meAfter.status)
    }

    @Test
    fun patchMeUpdatesTheDisplayName() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        client.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val response = client.patchJson("/api/auth/me", """{"displayName":"Ada L."}""")

        // then
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("Ada L.", response.asJson().getValue("user").jsonObject.stringField("displayName"))
    }

    @Test
    fun patchMeWithTheWrongCurrentPasswordIsRejected() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        client.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val response = client.patchJson(
            "/api/auth/me",
            """{"currentPassword":"nope","newPassword":"a brand new secret"}""",
        )

        // then
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("auth.invalid_current_password", response.errorField("key"))
    }

    @Test
    fun registrationCanBeDisabled() {
        // given
        val closedFixture = TestFixture(registrationOpen = false)

        // when
        testApplication {
            application { notkaModule(closedFixture.services) }
            val response = jsonClient().postJson("/api/auth/register", REGISTER_ADA)

            // then
            assertEquals(HttpStatusCode.Forbidden, response.status)
            assertEquals("auth.registration_disabled", response.errorField("key"))
            assertEquals("FORBIDDEN", response.errorField("code"))
        }
        closedFixture.close()
    }

    @Test
    fun logoutAllSignsOutEveryDevice() = testApplication {
        // given: the same account signed in on two clients
        application { notkaModule(fixture.services) }
        val phone = jsonClient()
        val laptop = jsonClient()
        phone.postJson("/api/auth/register", REGISTER_ADA)
        laptop.postJson("/api/auth/login", """{"login":"ada@example.com","password":"correct horse battery"}""")

        // when
        val response = phone.post("/api/auth/logout-all")

        // then
        assertEquals(HttpStatusCode.NoContent, response.status)
        assertEquals(HttpStatusCode.Unauthorized, phone.get("/api/auth/me").status)
        assertEquals(HttpStatusCode.Unauthorized, laptop.get("/api/auth/me").status)
    }

    @Test
    fun malformedJsonReturns400WithTheInvalidBodyKey() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()

        // when
        val response = client.postJson("/api/auth/register", """{"email": """)

        // then
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("request.invalid_body", response.errorField("key"))
    }

    @Test
    fun healthIsPublic() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()

        // when
        val response = client.get("/api/health")

        // then
        assertEquals(HttpStatusCode.OK, response.status)
        val body = response.asJson()
        assertEquals("ok", body.stringField("status"))
        // The build's own version, written into the jar: not a placeholder left unexpanded.
        assertEquals(NOTKA_VERSION, body.stringField("version"))
        assertTrue(NOTKA_VERSION.matches(Regex("\\d+\\.\\d+\\.\\d+.*")), NOTKA_VERSION)
    }

    @Test
    fun headIsAnsweredLikeGet() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()

        // when: an uptime monitor asks without wanting the body
        val response = client.head("/api/health")

        // then
        assertEquals(HttpStatusCode.OK, response.status)
    }

    @Test
    fun unknownApiPathsReturnTheErrorEnvelope() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()

        // when
        val response = client.get("/api/does-not-exist")

        // then
        assertEquals(HttpStatusCode.NotFound, response.status)
        assertEquals("NOT_FOUND", response.errorField("code"))
        assertEquals("request.not_found", response.errorField("key"))
    }
}
