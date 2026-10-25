package dev.duwe.notka.entity.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The bytes of a test picture `cjxl` wrote, from `src/test/resources/avatars`. */
fun jxlFixture(name: String): ByteArray =
    checkNotNull(JpegXlFormatTest::class.java.getResourceAsStream("/avatars/$name")) { "No fixture $name" }
        .use { it.readBytes() }

class JpegXlFormatTest {
    @Test
    fun readsTheSizeOfABareCodestreamAndOfAContainer() {
        // given: cjxl's own output, once as a codestream and once in the ISO BMFF container
        val codestream = jxlFixture("square-512.jxl")
        val container = jxlFixture("container-300x200.jxl")

        // when
        val found = listOf(ImageFormats.sniffJpegXl(codestream), ImageFormats.sniffJpegXl(container))

        // then
        assertEquals(listOf(ImageInfo("image/jxl", 512, 512), ImageInfo("image/jxl", 300, 200)), found)
    }

    @Test
    fun aNotePictureIsNeverJpegXlAndJpegXlIsNeverAnotherFormat() {
        // given
        val jxl = jxlFixture("square-512.jxl")
        val png = picture("png", 32, 32)

        // when
        val asNotePicture = ImageFormats.sniff(jxl)
        val pngAsJpegXl = ImageFormats.sniffJpegXl(png)

        // then: not every browser draws JPEG XL, so a note does not carry it
        assertNull(asNotePicture)
        assertNull(pngAsJpegXl)
    }

    @Test
    fun aTruncatedHeaderIsNotAPicture() {
        // given: the signature alone, with no size header after it
        val truncated = byteArrayOf(0xFF.toByte(), 0x0A)

        // when
        val found = ImageFormats.sniffJpegXl(truncated)

        // then
        assertNull(found)
    }
}
