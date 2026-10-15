package dev.duwe.notka.entity.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Inline styling of a run of text. Flags are optional and default to `false`; the server never
 * renders them, it only stores and validates the shape (see `docs/DATA-MODEL.md`).
 */
@Serializable
data class NoteSpan(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val strikethrough: Boolean = false,
    val code: Boolean = false,
    val underline: Boolean = false,
    val link: String? = null,
)

/** One line of a note. [checked] is only meaningful for `checklist` blocks and [depth] for lists. */
@Serializable
data class NoteBlock(
    val id: String,
    val type: String,
    val checked: Boolean = false,
    /** `0` is the top level of a list; a nested line sits one level deeper than its parent. */
    val depth: Int = 0,
    val spans: List<NoteSpan> = emptyList(),
)

/**
 * The internal content format: a structured block document, never HTML. The server validates the
 * shape on write but does not sanitize styling, because styling is only ever rendered as text
 * nodes plus a fixed set of CSS classes on the client.
 */
@Serializable
data class NoteDocument(
    val version: Int = CURRENT_VERSION,
    val blocks: List<NoteBlock> = emptyList(),
) {
    /** Throws [DomainException] when the document violates the format. */
    fun validate(): NoteDocument {
        if (version != CURRENT_VERSION) fail("Unsupported document version $version")
        if (blocks.isEmpty()) fail("A note document needs at least one block")
        val seenIds = mutableSetOf<String>()
        blocks.forEachIndexed { index, block ->
            if (block.id.isBlank()) fail("Block $index has no id")
            if (!seenIds.add(block.id)) fail("Duplicate block id '${block.id}'")
            if (block.type !in BLOCK_TYPES) fail("Block $index has unknown type '${block.type}'")
            if (block.depth !in 0..MAX_BLOCK_DEPTH) {
                fail("Block $index has depth ${block.depth}, allowed is 0..$MAX_BLOCK_DEPTH")
            }
            if (block.depth > 0 && block.type !in LIST_BLOCK_TYPES) {
                fail("Block $index is a '${block.type}' and cannot be indented")
            }
            block.spans.forEach { span ->
                if (span.link != null && !isSafeLink(span.link)) fail("Block $index links to a disallowed scheme")
            }
        }
        return this
    }

    private fun fail(message: String): Nothing =
        throw DomainException.validation(ErrorKeys.NOTE_INVALID_DOCUMENT, message)

    companion object {
        const val CURRENT_VERSION: Int = 1

        /** Block types map 1:1 to Markdown constructs, which keeps export a pure function. */
        val BLOCK_TYPES: Set<String> =
            setOf("paragraph", "heading1", "heading2", "heading3", "bulleted", "numbered", "checklist")

        /** Only these carry a [NoteBlock.depth]. */
        val LIST_BLOCK_TYPES: Set<String> = setOf("bulleted", "numbered", "checklist")

        /** Deep enough for Keep's indentation, shallow enough that a line is still readable. */
        /**
         * The deepest a list line may sit: **one level**, the way the original does it — the owner's
         * rule, "Google Keep only allows one level of nesting". A deeper line is refused here rather
         * than clamped, so no client can store one.
         */
        const val MAX_BLOCK_DEPTH: Int = 1

        /**
         * The schemes a link may use — the editor's own (Tiptap's default list), so nothing it
         * writes is refused. Anything else, `javascript:` and `data:` above all, would run in whoever
         * opens the note, and a collaborator's client is not ours to trust.
         */
        private val LINK_SCHEMES: Set<String> =
            setOf("http", "https", "ftp", "ftps", "mailto", "tel", "callto", "sms", "cid", "xmpp")

        private val SCHEME = Regex("^([a-z][a-z0-9+.-]*):")

        /** Browsers ignore whitespace and control characters inside a scheme, so the check does too. */
        fun isSafeLink(link: String): Boolean {
            val compact = link.filterNot { it.isWhitespace() || it.isISOControl() }.lowercase()
            val scheme = SCHEME.find(compact)?.groupValues?.get(1) ?: return true
            return scheme in LINK_SCHEMES
        }

        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

        fun parse(raw: String): NoteDocument = json.decodeFromString(serializer(), raw)

        fun write(document: NoteDocument): String = json.encodeToString(serializer(), document)

        /** The canonical representation of an empty note. */
        fun empty(): NoteDocument = NoteDocument(blocks = listOf(NoteBlock(id = "b1", type = "paragraph")))
    }
}
