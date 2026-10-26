package dev.duwe.notka.control

import dev.duwe.notka.entity.model.LinkPreview
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.persistence.LinkPreviewRepository
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readAvailable
import io.github.oshai.kotlinlogging.KotlinLogging
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.jsoup.Jsoup
import org.jsoup.nodes.Document

/** How many links of one note get a card. Keep shows a handful and stops; so do we. */
private const val MAX_LINKS_PER_NOTE = 5

/** Nothing about a link is worth making a request wait: these bound the fetch, not the note. */
private const val FETCH_TIMEOUT_MS = 4_000L
private const val MAX_HTML_BYTES = 256 * 1024
private const val MAX_REDIRECTS = 3

/** A week. A page's title rarely changes, and a stale one is cheap to show until it is refetched. */
private const val CACHE_TTL_MS = 7L * 24 * 60 * 60 * 1000

private const val USER_AGENT = "Notka/0.1 link preview (+https://github.com/notka)"

/** Trailing punctuation is part of the sentence, not of the address. */
private const val URL_TRAILING = ".,;:!?)\\]}\"'"

private val URL_IN_TEXT = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE)

/**
 * Turns the links a note contains into the cards the original shows under it.
 *
 * The note's document is the only source of truth: the urls are read out of it, never stored beside
 * it, so deleting a link from a note deletes its card with it. What *is* stored is the answer the
 * site gave — the `link_previews` cache — because that belongs to the address rather than the note.
 *
 * Fetching is deliberately awkward, because the url comes from a user and this server sits inside
 * somebody's network: only `http`/`https`, only hosts that resolve to public addresses (every
 * redirect hop is checked again), a timeout, a cap on the body, and a user agent that says who is
 * asking.
 */
class LinkPreviewService(
    private val previews: LinkPreviewRepository,
    private val http: HttpClient,
    private val scope: CoroutineScope,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val logger = KotlinLogging.logger {}

    /** Nothing about a link is worth an error, but "why has this one no card" must be answerable. */
    private fun noCard(url: String, reason: String): LinkPreview? {
        logger.debug { "no link card for $url: $reason" }
        return null
    }

    /** Stops the background fetches and releases the client this service was built with. */
    fun close() {
        scope.cancel()
        http.close()
    }

    /** What the document links to, in the order it links to it. */
    fun extract(document: NoteDocument): List<String> {
        val found = LinkedHashSet<String>()
        document.blocks.forEach { block ->
            block.spans.forEach { span ->
                span.link?.trim()?.takeIf { it.isNotEmpty() }?.let { found += it }
                URL_IN_TEXT.findAll(span.text).forEach { found += it.value.trimEnd(*URL_TRAILING.toCharArray()) }
            }
        }
        return found.take(MAX_LINKS_PER_NOTE)
    }

    /**
     * The cards for [document], from the cache only. A read must never wait for the network: the
     * page was fetched when the note was written, and whatever is not cached yet simply has no card.
     */
    fun forDocument(document: NoteDocument): List<LinkPreview> = forDocuments(mapOf(0 to document))[0].orEmpty()

    /** [forDocument] for many documents, keyed as given, in one read of the cache. */
    fun <K> forDocuments(documents: Map<K, NoteDocument>): Map<K, List<LinkPreview>> {
        val urls = documents.mapValues { (_, document) -> extract(document) }
        val byUrl = previews.findAll(urls.values.flatten()).associateBy { it.url }
        return urls.mapValues { (_, wanted) -> wanted.mapNotNull { byUrl[it] } }
    }

    /**
     * Fetches whatever [document] links to but the cache does not hold yet (or holds too old), then
     * tells the note's viewers to read it again. Called from a write: the writer's own request is
     * answered without waiting for a single site.
     */
    fun refresh(document: NoteDocument, onResolved: () -> Unit) {
        val wanted = extract(document)
        if (wanted.isEmpty()) return
        val cached = previews.findAll(wanted).associateBy { it.url }
        val missing = wanted.filter { url -> cached[url]?.let { clock() - it.fetchedAt > CACHE_TTL_MS } ?: true }
        if (missing.isEmpty()) return
        scope.launch {
            try {
                var resolvedAny = false
                missing.forEach { url ->
                    resolve(url)?.let {
                        previews.save(it)
                        resolvedAny = true
                    }
                }
                if (resolvedAny) onResolved()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                // A card that could not be stored is a card missing, never a crash of the scope.
                logger.warn(failure) { "link previews could not be stored" }
            }
        }
    }

    /** Fetches and parses one address; `null` when it is not something we are willing to ask. */
    suspend fun resolve(url: String): LinkPreview? {
        val first = publicUriOrNull(url) ?: return noCard(url, "not a public http(s) address")
        var current = first
        repeat(MAX_REDIRECTS + 1) {
            val response = runCatching {
                http.get(current.toString()) {
                    header(HttpHeaders.UserAgent, USER_AGENT)
                    header(HttpHeaders.Accept, "text/html,application/xhtml+xml")
                }
            }.getOrElse { failure ->
                return noCard(current.toString(), "request failed: ${failure.message}")
            }

            if (response.status.value in 300..399) {
                val location = response.headers[HttpHeaders.Location]
                    ?: return noCard(current.toString(), "redirect without a Location")
                response.bodyAsChannel().cancel(null)
                current = publicUriOrNull(current.resolve(location).toString())
                    ?: return noCard(location, "redirect target is not a public http(s) address")
                return@repeat
            }
            if (!response.status.isSuccess()) {
                return noCard(current.toString(), "answered ${response.status.value}")
            }
            val contentType = response.headers[HttpHeaders.ContentType]?.substringBefore(';') ?: ""
            if (!contentType.contains("html", ignoreCase = true)) {
                return noCard(current.toString(), "content type is '$contentType'")
            }
            val html = readCapped(response.bodyAsChannel())
                ?: return noCard(current.toString(), "the body could not be read")
            val answer = parse(current, html)
            if (current.toString() != url) logger.debug { "$url redirected to $current" }
            // The card belongs to the address the note carries, not to wherever the site sent us.
            // Keying it by the redirect target is how two of the owner's three links ended up cached
            // under addresses nothing looks up, and showed no card at all.
            return answer?.copy(url = url) ?: noCard(current.toString(), "the page names itself nowhere")
        }
        return noCard(url, "too many redirects")
    }

    /**
     * Only `http`/`https`, and only a host that resolves to public addresses. Loopback, site-local,
     * link-local, multicast and unique-local addresses are what a request forged by a user would be
     * aimed at, so they are refused before any connection is made.
     */
    private fun publicUriOrNull(url: String): URI? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        if (uri.scheme?.lowercase() !in setOf("http", "https")) return null
        val host = uri.host?.takeIf { it.isNotBlank() } ?: return null
        val addresses = runCatching { InetAddress.getAllByName(host) }.getOrNull() ?: return null
        if (addresses.isEmpty() || addresses.any { !isPublic(it) }) return null
        return uri
    }

    private fun isPublic(address: InetAddress): Boolean {
        if (address.isAnyLocalAddress || address.isLoopbackAddress) return false
        if (address.isLinkLocalAddress || address.isSiteLocalAddress) return false
        if (address.isMulticastAddress) return false
        val bytes = address.address.map { it.toInt() and 0xff }
        return when (address) {
            is Inet4Address -> !isReservedV4(bytes)
            is Inet6Address -> !isReservedV6(bytes)
            else -> false
        }
    }

    /**
     * The IPv4 ranges Java has no accessor for: "this network" (0/8), carrier-grade NAT (100.64/10,
     * which is also where Tailscale puts a VPS's private peers), the benchmarking block (198.18/15)
     * and everything from 240/4 up, broadcast included.
     */
    private fun isReservedV4(b: List<Int>): Boolean =
        b[0] == 0 ||
            (b[0] == 100 && b[1] in 64..127) ||
            (b[0] == 198 && b[1] in 18..19) ||
            b[0] >= 240

    /**
     * Unique-local (fc00::/7), and the prefixes that carry an IPv4 address inside an IPv6 one —
     * NAT64 (64:ff9b::/96), 6to4 (2002::/16) and the deprecated IPv4-compatible form (::/96) —
     * because the address they carry may be a private one.
     */
    private fun isReservedV6(b: List<Int>): Boolean =
        (b[0] and 0xfe) == 0xfc ||
            (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b) ||
            (b[0] == 0x20 && b[1] == 0x02) ||
            b.subList(0, 12).all { it == 0 }

    /** Reads at most [MAX_HTML_BYTES]: a page bigger than that is not a link card. */
    private suspend fun readCapped(channel: ByteReadChannel): ByteArray? {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        while (out.size() < MAX_HTML_BYTES) {
            val read = runCatching { channel.readAvailable(buffer, 0, buffer.size) }.getOrNull() ?: return null
            if (read <= 0) break
            out.write(buffer, 0, minOf(read, MAX_HTML_BYTES - out.size()))
        }
        return out.toByteArray().takeIf { it.isNotEmpty() }
    }

    private fun parse(uri: URI, bytes: ByteArray): LinkPreview? {
        val page: Document = Jsoup.parse(ByteArrayInputStream(bytes), null, uri.toString())
        if (page.title().isBlank() && meta(page, "og:title") == null) {
            logger.debug { "${uri.host} answered ${bytes.size} bytes with no title at all" }
        }
        val title = meta(page, "og:title") ?: page.title().takeIf { it.isNotBlank() } ?: return null
        val site = meta(page, "og:site_name") ?: uri.host.orEmpty()
        // The viewer's browser loads the thumbnail, so it gets the same scheme rule as the page.
        val image = meta(page, "og:image")
            ?.let { runCatching { uri.resolve(it) }.getOrNull() }
            ?.takeIf { it.scheme?.lowercase() in setOf("http", "https") }
            ?.toString()
        return LinkPreview(
            url = uri.toString(),
            title = title.trim().take(200),
            siteName = site.trim().removePrefix("www.").take(120),
            imageUrl = image,
            fetchedAt = clock(),
        )
    }

    private fun meta(page: Document, property: String): String? =
        page.selectFirst("""meta[property="$property"], meta[name="$property"]""")
            ?.attr("content")
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

    /** The timeout is a property of the client this service is built with; see `AppServices`. */
    companion object {
        const val REQUEST_TIMEOUT_MILLIS: Long = FETCH_TIMEOUT_MS
    }
}
