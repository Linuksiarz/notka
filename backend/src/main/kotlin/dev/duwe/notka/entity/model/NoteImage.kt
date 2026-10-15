package dev.duwe.notka.entity.model

/** Larger than any camera makes; a header claiming more is not a picture worth trusting. */
private const val MAX_SIDE = 30_000

/** A picture attached to a note, without its bytes. Pictures are listed in the order they were added. */
data class NoteImage(
    val id: Int,
    val noteId: Int,
    val contentType: String,
    val width: Int,
    val height: Int,
    val byteSize: Int,
    val createdAt: Long,
)

/** What the bytes of an upload turned out to be. */
data class ImageInfo(val contentType: String, val width: Int, val height: Int)

/**
 * Recognises the picture formats a note may carry from their own bytes — never from a name or a
 * header the client sent — and reads their size from the header alone, without decoding the image.
 *
 * PNG, JPEG, GIF and WebP: what every browser draws. SVG is deliberately not among them: it is a
 * document that can carry script, and a picture is served from this origin.
 */
object ImageFormats {
    fun sniff(bytes: ByteArray): ImageInfo? = png(bytes) ?: jpeg(bytes) ?: gif(bytes) ?: webp(bytes)

    private fun u8(bytes: ByteArray, at: Int): Int = bytes[at].toInt() and 0xff

    private fun be16(bytes: ByteArray, at: Int): Int = (u8(bytes, at) shl 8) or u8(bytes, at + 1)

    private fun le16(bytes: ByteArray, at: Int): Int = u8(bytes, at) or (u8(bytes, at + 1) shl 8)

    private fun le24(bytes: ByteArray, at: Int): Int = le16(bytes, at) or (u8(bytes, at + 2) shl 16)

    private fun be32(bytes: ByteArray, at: Int): Int = (be16(bytes, at) shl 16) or be16(bytes, at + 2)

    private fun startsWith(bytes: ByteArray, at: Int, ascii: String): Boolean =
        bytes.size >= at + ascii.length && ascii.indices.all { bytes[at + it] == ascii[it].code.toByte() }

    private fun valid(type: String, width: Int, height: Int): ImageInfo? =
        if (width in 1..MAX_SIDE && height in 1..MAX_SIDE) ImageInfo(type, width, height) else null

    private fun png(bytes: ByteArray): ImageInfo? {
        val signature = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        if (bytes.size < 24 || !signature.indices.all { bytes[it] == signature[it] }) return null
        if (!startsWith(bytes, 12, "IHDR")) return null
        return valid("image/png", be32(bytes, 16), be32(bytes, 20))
    }

    private fun gif(bytes: ByteArray): ImageInfo? {
        if (!startsWith(bytes, 0, "GIF87a") && !startsWith(bytes, 0, "GIF89a")) return null
        if (bytes.size < 10) return null
        return valid("image/gif", le16(bytes, 6), le16(bytes, 8))
    }

    /** Walks the markers to the first start-of-frame, which carries the size. */
    private fun jpeg(bytes: ByteArray): ImageInfo? {
        if (bytes.size < 4 || u8(bytes, 0) != 0xFF || u8(bytes, 1) != 0xD8) return null
        var at = 2
        while (at + 9 < bytes.size) {
            if (u8(bytes, at) != 0xFF) return null
            val marker = u8(bytes, at + 1)
            if (marker == 0xFF) {
                at += 1
                continue
            }
            val isFrame = marker in 0xC0..0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC
            if (isFrame) return valid("image/jpeg", be16(bytes, at + 7), be16(bytes, at + 5))
            if (marker == 0xD9 || marker == 0xDA) return null
            at += 2 + be16(bytes, at + 2)
        }
        return null
    }

    private fun webp(bytes: ByteArray): ImageInfo? {
        if (!startsWith(bytes, 0, "RIFF") || !startsWith(bytes, 8, "WEBP") || bytes.size < 30) return null
        return when {
            startsWith(bytes, 12, "VP8X") -> valid("image/webp", le24(bytes, 24) + 1, le24(bytes, 27) + 1)
            startsWith(bytes, 12, "VP8L") -> {
                val bits = le16(bytes, 21) or (le16(bytes, 23) shl 16)
                valid("image/webp", (bits and 0x3FFF) + 1, ((bits shr 14) and 0x3FFF) + 1)
            }
            startsWith(bytes, 12, "VP8 ") -> valid("image/webp", le16(bytes, 26) and 0x3FFF, le16(bytes, 28) and 0x3FFF)
            else -> null
        }
    }
}
