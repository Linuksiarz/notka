package dev.duwe.notka.entity.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class NoteDocumentTest {
    @Test
    fun roundTripsThroughJson() {
        // given
        val document = NoteDocument(
            version = 1,
            blocks = listOf(
                NoteBlock(id = "b1", type = "heading1", spans = listOf(NoteSpan(text = "Groceries", bold = true))),
                NoteBlock(id = "b2", type = "checklist", checked = true, spans = listOf(NoteSpan(text = "Milk"))),
            ),
        )

        // when
        val parsed = NoteDocument.parse(NoteDocument.write(document))

        // then
        assertEquals(document, parsed)
    }

    @Test
    fun acceptsEveryKnownBlockType() {
        // given
        val blocks = NoteDocument.BLOCK_TYPES.mapIndexed { index, type ->
            NoteBlock(id = "b$index", type = type, spans = listOf(NoteSpan(text = "line")))
        }
        val document = NoteDocument(blocks = blocks)

        // when
        val validated = document.validate()

        // then
        assertEquals(document, validated)
        assertEquals(NoteDocument.BLOCK_TYPES.size, validated.blocks.size)
    }

    @Test
    fun rejectsUnknownBlockType() {
        // given
        val document = NoteDocument(blocks = listOf(NoteBlock(id = "b1", type = "html")))

        // when
        val failure = assertFailsWith<DomainException> { document.validate() }

        // then
        assertEquals(ErrorKind.VALIDATION, failure.kind)
        assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, failure.key)
    }

    @Test
    fun rejectsALinkThatWouldRunScript() {
        // given: the scheme hidden behind case and a tab, the way a browser still reads it
        val hostile = listOf("javascript:alert(1)", "JaVa\tScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x")

        // when
        val failures = hostile.map { link ->
            runCatching {
                NoteDocument(blocks = listOf(NoteBlock("b1", "paragraph", spans = listOf(NoteSpan("x", link = link)))))
                    .validate()
            }.exceptionOrNull()
        }

        // then
        failures.forEach { failure ->
            assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, (failure as DomainException).key)
        }
    }

    @Test
    fun acceptsTheLinksTheEditorWrites() {
        // given
        val links = listOf("https://example.com", "http://a.b/c?d", "mailto:ada@example.com", "tel:+48123", "/relative")

        // when
        val accepted = links.filter(NoteDocument::isSafeLink)

        // then
        assertEquals(links, accepted)
    }

    @Test
    fun rejectsEmptyBlockList() {
        // given
        val document = NoteDocument(blocks = emptyList())

        // when
        val failure = assertFailsWith<DomainException> { document.validate() }

        // then
        assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, failure.key)
    }

    @Test
    fun rejectsBlankBlockId() {
        // given
        val document = NoteDocument(blocks = listOf(NoteBlock(id = "  ", type = "paragraph")))

        // when
        val failure = assertFailsWith<DomainException> { document.validate() }

        // then
        assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, failure.key)
    }

    @Test
    fun rejectsDuplicateBlockIds() {
        // given
        val document = NoteDocument(
            blocks = listOf(
                NoteBlock(id = "b1", type = "paragraph"),
                NoteBlock(id = "b1", type = "paragraph"),
            ),
        )

        // when
        val failure = assertFailsWith<DomainException> { document.validate() }

        // then
        assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, failure.key)
    }

    @Test
    fun rejectsUnknownVersion() {
        // given
        val document = NoteDocument(version = 2, blocks = listOf(NoteBlock(id = "b1", type = "paragraph")))

        // when
        val failure = assertFailsWith<DomainException> { document.validate() }

        // then
        assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, failure.key)
    }

    @Test
    fun canonicalEmptyNoteIsValid() {
        // given
        val document = NoteDocument.empty()

        // when
        val validated = document.validate()

        // then
        assertEquals(1, validated.blocks.size)
        assertEquals("paragraph", validated.blocks.single().type)
    }

    @Test
    fun aNestedListLineIsValid() {
        // given: a checklist with an indented child — one level, which is all the original allows
        val document = NoteDocument(
            blocks = listOf(
                NoteBlock(id = "b1", type = "checklist", depth = 0, spans = listOf(NoteSpan("parent"))),
                NoteBlock(id = "b2", type = "checklist", depth = 1, checked = true, spans = listOf(NoteSpan("child"))),
            ),
        )

        // when
        val validated = document.validate()

        // then
        assertEquals(listOf(0, 1), validated.blocks.map { it.depth })
    }

    @Test
    fun aLineDeeperThanTheLimitIsRejected() {
        // given: more indentation than a line can usefully carry
        val document = NoteDocument(
            blocks = listOf(NoteBlock(id = "b1", type = "bulleted", depth = NoteDocument.MAX_BLOCK_DEPTH + 1)),
        )

        // when
        val failure = assertFailsWith<DomainException> { document.validate() }

        // then
        assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, failure.key)
    }

    @Test
    fun aNegativeDepthIsRejected() {
        // given
        val document = NoteDocument(blocks = listOf(NoteBlock(id = "b1", type = "bulleted", depth = -1)))

        // when
        val failure = assertFailsWith<DomainException> { document.validate() }

        // then
        assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, failure.key)
    }

    @Test
    fun aParagraphCannotBeIndented() {
        // given: indentation only means something inside a list
        val document = NoteDocument(blocks = listOf(NoteBlock(id = "b1", type = "paragraph", depth = 1)))

        // when
        val failure = assertFailsWith<DomainException> { document.validate() }

        // then
        assertEquals(ErrorKeys.NOTE_INVALID_DOCUMENT, failure.key)
    }
}
