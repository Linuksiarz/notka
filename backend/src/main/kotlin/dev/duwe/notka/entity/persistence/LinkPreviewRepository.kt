package dev.duwe.notka.entity.persistence

import dev.duwe.notka.entity.model.LinkPreview
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

/**
 * The link-preview cache. It is keyed by url alone: a page's title and artwork are the same question
 * whichever note asks it, and sharing the answer is what keeps a burst of notes from hammering a
 * site.
 */
class LinkPreviewRepository(private val database: Database) {
    fun find(url: String): LinkPreview? = transaction(database) {
        LinkPreviews.selectAll().where { LinkPreviews.url eq url }.singleOrNull()?.toPreview()
    }

    fun findAll(urls: Collection<String>): List<LinkPreview> {
        if (urls.isEmpty()) return emptyList()
        val wanted = urls.toSet()
        return transaction(database) {
            LinkPreviews.selectAll().where { LinkPreviews.url inList wanted }.map { it.toPreview() }
        }
    }

    fun save(preview: LinkPreview) {
        transaction(database) {
            LinkPreviews.upsert {
                it[url] = preview.url
                it[title] = preview.title
                it[siteName] = preview.siteName
                it[imageUrl] = preview.imageUrl
                it[fetchedAt] = preview.fetchedAt
            }
        }
    }
}

private fun ResultRow.toPreview(): LinkPreview = LinkPreview(
    url = this[LinkPreviews.url],
    title = this[LinkPreviews.title],
    siteName = this[LinkPreviews.siteName],
    imageUrl = this[LinkPreviews.imageUrl],
    fetchedAt = this[LinkPreviews.fetchedAt],
)
