package dev.duwe.notka.entity.model

/**
 * What a link in a note turns into: the card the page describes itself with.
 *
 * It is *derived* data — the note's own text holds the URL and no client ever writes one of these —
 * so the stored document stays the only source of truth for what a note contains.
 */
data class LinkPreview(
    val url: String,
    val title: String,
    /** The site's own name when it publishes one, otherwise its host. */
    val siteName: String,
    val imageUrl: String?,
    /** When this was fetched, which is what the cache's ttl is measured against. */
    val fetchedAt: Long,
)
