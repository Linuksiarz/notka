package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.NoteBlock
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteSpan
import dev.duwe.notka.entity.persistence.LinkPreviewRepository
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.plugins.HttpTimeout
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.runBlocking
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Link previews: which addresses are read out of a document, which of them this server is willing to
 * ask about, what it takes from the answer, and when it asks again.
 */
class LinkPreviewServiceTest {
    private lateinit var fixture: TestFixture
    private val requested = mutableListOf<String>()

    private fun htmlClient(
        body: String,
        status: HttpStatusCode = HttpStatusCode.OK,
        contentType: String = "text/html; charset=utf-8",
    ): HttpClient {
        val engine = MockEngine { request ->
            requested += request.url.toString()
            respond(
                content = ByteReadChannel(body),
                status = status,
                headers = headersOf(HttpHeaders.ContentType, contentType),
            )
        }
        return HttpClient(engine) {
            followRedirects = false
            expectSuccess = false
            install(HttpTimeout) { requestTimeoutMillis = 1_000 }
        }
    }

    @BeforeTest
    fun setUp() {
        requested.clear()
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private fun document(vararg spans: NoteSpan) = NoteDocument(
        blocks = listOf(NoteBlock(id = "b1", type = "paragraph", spans = spans.toList())),
    )

    private fun service(client: HttpClient = htmlClient("<title>x</title>")): LinkPreviewService =
        LinkPreviewService(
            previews = LinkPreviewRepository(fixture.services.database),
            http = client,
            scope = fixture.previewScope,
            clock = { fixture.now },
        )

    // ---------------------------------------------------------------- extraction

    @Test
    fun `reads links out of both the styling and the text`() {
        // given: one span that is a link and one that merely contains an address
        val document = document(
            NoteSpan(text = "the docs", link = "https://example.com/docs"),
            NoteSpan(text = "and https://example.org/page."),
        )

        // when
        val urls = service().extract(document)

        // then: both are found, and the sentence's full stop is not part of the address
        assertEquals(listOf("https://example.com/docs", "https://example.org/page"), urls)
    }

    @Test
    fun `keeps the order, drops repeats and stops at five`() {
        // given: six distinct addresses, one of them twice
        val spans = (1..6).map { NoteSpan(text = "https://example.com/$it") } +
            NoteSpan(text = "https://example.com/1")

        // when
        val urls = service().extract(document(*spans.toTypedArray()))

        // then
        assertEquals(5, urls.size)
        assertEquals("https://example.com/1", urls.first())
        assertEquals(urls.distinct(), urls)
    }

    // ---------------------------------------------------------------- refusals

    @Test
    fun `refuses addresses that point back inside the network`() {
        // given: loopback, private, link-local (the cloud metadata address) and a non-http scheme
        val hostile = listOf(
            "http://127.0.0.1/admin",
            "http://localhost/admin",
            "http://10.0.0.5/admin",
            "http://192.168.1.1/admin",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]/admin",
            "http://100.100.100.100/tailnet",
            "http://0.0.0.1/admin",
            "http://[64:ff9b::7f00:1]/nat64-loopback",
            "http://[2002:c0a8:101::]/6to4-private",
            "file:///etc/passwd",
            "ftp://example.com/file",
        )

        // when: each is resolved through a service whose client would record the attempt
        val service = service()

        // then: none of them is answered, and not one request left the process
        val answers = hostile.map { url -> runBlocking { runCatching { service.resolve(url) }.getOrNull() } }
        assertTrue(answers.all { it == null }, "some address was answered: $answers")
        assertEquals(emptyList(), requested)
    }

    // ---------------------------------------------------------------- parsing

    @Test
    fun `takes the card from the open graph tags`() {
        // given: a page that describes itself
        val page = """
            <html><head>
              <meta property="og:title" content="Chipolo ONE Point">
              <meta property="og:site_name" content="Chipolo">
              <meta property="og:image" content="/img/one-point.png">
            </head><body></body></html>
        """.trimIndent()

        // when: a public address is resolved through it
        val preview = runBlocking {
            service(htmlClient(page)).resolve("https://93.184.216.34/products/one-point")
        }

        // then: the title, the site's own name and the artwork, resolved against the page
        assertEquals("Chipolo ONE Point", preview?.title)
        assertEquals("Chipolo", preview?.siteName)
        assertEquals("https://93.184.216.34/img/one-point.png", preview?.imageUrl)
    }

    @Test
    fun `a thumbnail that is not an http address is dropped`() {
        // given: a page whose artwork would run as script if anything ever used it as a link
        val page = """<html><head><meta property="og:title" content="T">
            <meta property="og:image" content="javascript:alert(1)"></head></html>"""

        // when
        val preview = runBlocking { service(htmlClient(page)).resolve("https://93.184.216.34/") }

        // then: the card is kept, without the thumbnail
        assertEquals("T", preview?.title)
        assertEquals(null, preview?.imageUrl)
    }

    @Test
    fun `falls back to the title tag and the host`() {
        // given: a page with nothing but a title
        val page = "<html><head><title> Just a page </title></head><body></body></html>"

        // when
        val preview = runBlocking {
            service(htmlClient(page)).resolve("https://93.184.216.34/x")
        }

        // then
        assertEquals("Just a page", preview?.title)
        assertEquals("93.184.216.34", preview?.siteName)
        assertNull(preview?.imageUrl)
    }

    @Test
    fun `a page that is not html, or says nothing, has no card`() {
        // given: a pdf and a titleless html page
        val service = service(htmlClient("%PDF-1.4", contentType = "application/pdf"))

        // when
        val notHtml = runBlocking { service.resolve("https://93.184.216.34/a.pdf") }
        val noTitle = runBlocking {
            service(htmlClient("<html><body>nothing here</body></html>"))
                .resolve("https://93.184.216.34/b")
        }

        // then
        assertNull(notHtml)
        assertNull(noTitle)
    }

    @Test
    fun `a redirect still caches the card under the address the note carries`() {
        // given: a client whose address answers with a redirect to another one, which has the card
        val engine = MockEngine { request ->
            requested += request.url.toString()
            if (request.url.encodedPath == "/moved") {
                respond(
                    content = ByteReadChannel(""),
                    status = HttpStatusCode.Found,
                    headers = headersOf(HttpHeaders.Location, "https://example.com/landing"),
                )
            } else {
                respond(
                    content = ByteReadChannel(
                        """<html><head><meta property="og:title" content="The landing page">
                           <meta property="og:site_name" content="Example"></head></html>""",
                    ),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "text/html"),
                )
            }
        }
        val service = service(HttpClient(engine) { followRedirects = false })

        // when
        val preview = runBlocking { service.resolve("https://example.com/moved") }

        // then: the card is the landing page's, and its address is the one the note holds
        assertEquals("https://example.com/moved", preview?.url)
        assertEquals("The landing page", preview?.title)
        service.close()
    }

    @Test
    fun `a failing status is not a card`() {
        // given: a page that answers 500
        val service = service(htmlClient("boom", status = HttpStatusCode.InternalServerError))

        // when
        val preview = runBlocking { service.resolve("https://93.184.216.34/c") }

        // then
        assertNull(preview)
    }

    // ---------------------------------------------------------------- cache

    @Test
    fun `a card is served from the cache and refreshed only when it is old`() {
        // given: a document linking to one public address and a service that fetches it on refresh
        val client = htmlClient("<html><head><title>First</title></head></html>")
        val service = service(client)
        val document = document(NoteSpan(text = "https://93.184.216.34/page"))
        runBlocking { service.refresh(document) {} }
        // The refresh runs on its own coroutine; wait for the row to appear.
        var cached = service.forDocument(document)
        repeat(50) {
            if (cached.isNotEmpty()) return@repeat
            Thread.sleep(20)
            cached = service.forDocument(document)
        }

        // then: the first read has a card, and asking again does not go back to the site
        assertEquals("First", cached.firstOrNull()?.title)
        val requestsAfterFirstFetch = requested.size
        runBlocking { service.refresh(document) {} }
        Thread.sleep(150)
        assertEquals(requestsAfterFirstFetch, requested.size)
        assertEquals("First", service.forDocument(document).firstOrNull()?.title)

        // when: the clock moves past the ttl and the document is written again
        fixture.advanceDays(8)
        runBlocking { service.refresh(document) {} }
        var refreshed = service.forDocument(document).firstOrNull()
        repeat(50) {
            if (refreshed != null && refreshed.fetchedAt == fixture.now) return@repeat
            Thread.sleep(20)
            refreshed = service.forDocument(document).firstOrNull()
        }

        // then: it was asked again
        assertTrue(requested.size > requestsAfterFirstFetch)
        assertEquals(fixture.now, refreshed?.fetchedAt)
    }
}
