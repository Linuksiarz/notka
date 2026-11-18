package dev.duwe.notka.control

import dev.duwe.notka.entity.model.ImageFormats
import io.github.oshai.kotlinlogging.KotlinLogging
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readAvailable
import java.io.ByteArrayOutputStream
import java.net.URI
import java.util.concurrent.ConcurrentHashMap

private const val MAX_PICTURE_BYTES = 5 * 1024 * 1024
private const val MAX_REDIRECTS = 3
private const val USER_AGENT = "Notka/0.1 profile picture (+https://github.com/notka)"

/** The picture at the identity provider, as it was found there; the page turns it into an avatar. */
class ProviderPicture(val bytes: ByteArray, val contentType: String)

/**
 * The hand-over of a provider's `picture` to the page, which encodes it (`boundary/jpegXl.ts`), because
 * the server converts nothing. A sign-in only remembers the address, so it never waits for a picture;
 * the fetch happens when the page asks. Held in memory: a restart only means the next sign-in brings it.
 *
 * Only the issuer's own host may be a private one, because the administrator chose it and many a
 * self-hosted provider lives there. Any other host could be whatever a user typed into their profile
 * at the provider, so it gets the rules of a link in a note, on every redirect hop.
 */
class ProviderPictures(private val http: HttpClient, issuer: String?) {
    private val logger = KotlinLogging.logger {}

    private val issuerAuthority = issuer?.let { runCatching { URI(it).authority }.getOrNull() }
    private val addresses = ConcurrentHashMap<Int, String>()
    private val awaitingAnswer = ConcurrentHashMap.newKeySet<Int>()

    /** With no [url] the provider says nothing about a picture, and the account keeps the one it has. */
    fun remember(userId: Int, url: String?) {
        if (url == null) addresses.remove(userId) else addresses[userId] = url
    }

    /** The picture of the sign-in that was remembered for [userId], once; `null` when there is none to be had. */
    suspend fun take(userId: Int): ProviderPicture? {
        val url = addresses.remove(userId) ?: return null
        return fetch(url)?.also { awaitingAnswer += userId }
    }

    /** Whether the page was handed a picture and this upload is its encoded answer. Counts once. */
    fun answered(userId: Int): Boolean = awaitingAnswer.remove(userId)

    private suspend fun fetch(url: String): ProviderPicture? {
        var current = allowedUriOrNull(url) ?: return noPicture(url, "not an address we may ask")
        repeat(MAX_REDIRECTS + 1) {
            val response = runCatching {
                http.get(current.toString()) {
                    header(HttpHeaders.UserAgent, USER_AGENT)
                    header(HttpHeaders.Accept, "image/*")
                }
            }.getOrElse { failure -> return noPicture(current.toString(), "request failed: ${failure.message}") }

            if (response.status.value in 300..399) {
                val location = response.headers[HttpHeaders.Location]
                    ?: return noPicture(current.toString(), "redirect without a Location")
                response.bodyAsChannel().cancel(null)
                current = allowedUriOrNull(current.resolve(location).toString())
                    ?: return noPicture(location, "redirect target is not an address we may ask")
                return@repeat
            }
            if (!response.status.isSuccess()) return noPicture(current.toString(), "answered ${response.status.value}")
            val bytes = readCapped(response.bodyAsChannel())
                ?: return noPicture(current.toString(), "over $MAX_PICTURE_BYTES bytes")
            val info = ImageFormats.sniff(bytes) ?: return noPicture(current.toString(), "not a picture we accept")
            return ProviderPicture(bytes, info.contentType)
        }
        return noPicture(url, "too many redirects")
    }

    private fun allowedUriOrNull(url: String): URI? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        val fromIssuer = uri.scheme?.lowercase() in setOf("http", "https") &&
            issuerAuthority != null && uri.authority.equals(issuerAuthority, ignoreCase = true)
        return if (fromIssuer) uri else PublicAddresses.uriOrNull(url)
    }

    private suspend fun readCapped(channel: ByteReadChannel): ByteArray? {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        while (true) {
            val read = channel.readAvailable(buffer, 0, buffer.size)
            if (read <= 0) return out.toByteArray()
            if (out.size() + read > MAX_PICTURE_BYTES) return null
            out.write(buffer, 0, read)
        }
    }

    /** A picture is decoration, so its absence is no error, but "why did mine not come over" must be answerable. */
    private fun noPicture(url: String, reason: String): ProviderPicture? {
        logger.info { "No picture from the identity provider at $url: $reason" }
        return null
    }
}
