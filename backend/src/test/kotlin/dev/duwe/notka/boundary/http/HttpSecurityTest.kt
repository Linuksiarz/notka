package dev.duwe.notka.boundary.http

import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.TestFixture
import dev.duwe.notka.errorField
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import dev.duwe.notka.postJson
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

private const val WRONG_LOGIN = """{"login":"ada@example.com","password":"not the password"}"""

class HttpSecurityTest {
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
    fun everyResponseCarriesTheBrowserHardeningHeaders() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val response = client.get("/api/health")

        // then
        val policy = assertNotNull(response.headers["Content-Security-Policy"])
        assertTrue(policy.contains("script-src 'self'"), policy)
        assertTrue(policy.contains("frame-ancestors 'none'"), policy)
        assertEquals("nosniff", response.headers["X-Content-Type-Options"])
        assertEquals("DENY", response.headers["X-Frame-Options"])
    }

    @Test
    fun aCrossSiteWriteIsRefused() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val response = client.post("/api/auth/register") {
            header("Sec-Fetch-Site", "cross-site")
            contentType(ContentType.Application.Json)
            setBody(REGISTER_ADA)
        }

        // then
        assertEquals(HttpStatusCode.Forbidden, response.status)
        assertEquals("request.cross_site", response.errorField("key"))
    }

    @Test
    fun aSameOriginWriteIsAccepted() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val response = client.post("/api/auth/register") {
            header("Sec-Fetch-Site", "same-origin")
            contentType(ContentType.Application.Json)
            setBody(REGISTER_ADA)
        }

        // then
        assertEquals(HttpStatusCode.Created, response.status)
    }

    @Test
    fun signingInIsRateLimitedPerClient() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        repeat(10) { client.postJson("/api/auth/login", WRONG_LOGIN) }

        // when
        val response = client.postJson("/api/auth/login", WRONG_LOGIN)

        // then
        assertEquals(HttpStatusCode.TooManyRequests, response.status)
        assertEquals("request.too_many", response.errorField("key"))
        assertNotNull(response.headers["Retry-After"])
    }

    @Test
    fun aForgedForwardedForDoesNotEscapeTheLimitByDefault() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val client = jsonClient()
        repeat(10) { attempt -> client.loginFrom("203.0.113.$attempt") }

        // when
        val response = client.loginFrom("203.0.113.99")

        // then
        assertEquals(HttpStatusCode.TooManyRequests, response.status)
    }

    @Test
    fun behindATrustedProxyEachClientHasItsOwnLimit() {
        // given
        val proxied = TestFixture(trustProxyHeaders = true)

        testApplication {
            application { notkaModule(proxied.services) }
            val client = jsonClient()
            repeat(10) { client.loginFrom("203.0.113.1") }

            // when
            val other = client.loginFrom("203.0.113.2")

            // then
            assertEquals(HttpStatusCode.Unauthorized, other.status)
        }
        proxied.close()
    }

    @Test
    fun anOversizedBodyIsRefusedBeforeItIsRead() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val huge = "x".repeat((fixture.config.maxRequestBytes + 1).toInt())

        // when
        val response = client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"login":"ada@example.com","password":"$huge"}""")
        }

        // then
        assertEquals(HttpStatusCode.PayloadTooLarge, response.status)
        assertEquals("request.too_large", response.errorField("key"))
    }

    private suspend fun HttpClient.loginFrom(address: String): HttpResponse = post("/api/auth/login") {
        header("X-Forwarded-For", address)
        contentType(ContentType.Application.Json)
        setBody(WRONG_LOGIN)
    }
}
