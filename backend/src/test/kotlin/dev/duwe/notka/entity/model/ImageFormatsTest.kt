package dev.duwe.notka.entity.model

import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** A real picture in [format], [width] by [height], as the JDK writes it. */
fun picture(format: String, width: Int, height: Int): ByteArray {
    val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
    return ByteArrayOutputStream().also { ImageIO.write(image, format, it) }.toByteArray()
}

class ImageFormatsTest {
    @Test
    fun recognisesTheFormatsABrowserDrawsAndReadsTheirSize() {
        // given: the JDK's own PNG, JPEG and GIF, and a WebP header written by hand (VP8X)
        val webp = ByteArray(30).also { bytes ->
            "RIFF".toByteArray().copyInto(bytes, 0)
            "WEBP".toByteArray().copyInto(bytes, 8)
            "VP8X".toByteArray().copyInto(bytes, 12)
            // canvas 640 x 480, stored minus one, 24 bits little endian
            bytes[24] = (639 and 0xff).toByte(); bytes[25] = (639 shr 8).toByte()
            bytes[27] = (479 and 0xff).toByte(); bytes[28] = (479 shr 8).toByte()
        }

        // when
        val found = listOf(
            ImageFormats.sniff(picture("png", 320, 200)),
            ImageFormats.sniff(picture("jpg", 64, 48)),
            ImageFormats.sniff(picture("gif", 10, 20)),
            ImageFormats.sniff(webp),
        )

        // then
        assertEquals(
            listOf(
                ImageInfo("image/png", 320, 200),
                ImageInfo("image/jpeg", 64, 48),
                ImageInfo("image/gif", 10, 20),
                ImageInfo("image/webp", 640, 480),
            ),
            found,
        )
    }

    @Test
    fun refusesAnythingElseAnSvgFirst() {
        // given
        val svg = """<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>""".toByteArray()

        // when / then
        assertNull(ImageFormats.sniff(svg))
        assertNull(ImageFormats.sniff("hello".toByteArray()))
        assertNull(ImageFormats.sniff(ByteArray(0)))
    }
}
