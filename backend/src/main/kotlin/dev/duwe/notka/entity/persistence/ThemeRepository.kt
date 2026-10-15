package dev.duwe.notka.entity.persistence

import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.statements.api.ExposedBlob
import org.jetbrains.exposed.sql.transactions.transaction

/** A theme as stored, without its pictures; [files] maps each file name to the id it is served under. */
data class StoredTheme(
    val id: String,
    val name: String,
    val author: String?,
    val license: String?,
    val manifest: String,
    val files: Map<String, Int>,
)

/** One picture of a theme, ready to store. */
class ThemeFile(val name: String, val contentType: String, val bytes: ByteArray)

class ThemeRepository(private val database: Database) {
    /** Stores the theme, replacing one with the same id — pictures and all — in one transaction. */
    fun replace(
        id: String,
        name: String,
        author: String?,
        license: String?,
        manifest: String,
        files: List<ThemeFile>,
        createdAt: Long,
    ) {
        transaction(database) {
            Themes.deleteWhere { Themes.id eq id }
            Themes.insert {
                it[Themes.id] = id
                it[Themes.name] = name
                it[Themes.author] = author
                it[Themes.license] = license
                it[Themes.manifest] = manifest
                it[Themes.createdAt] = createdAt
            }
            for (file in files) {
                ThemeFiles.insert {
                    it[themeId] = id
                    it[ThemeFiles.name] = file.name
                    it[contentType] = file.contentType
                    it[data] = ExposedBlob(file.bytes)
                }
            }
        }
    }

    fun list(): List<StoredTheme> = transaction(database) {
        val files = ThemeFiles.select(ThemeFiles.id, ThemeFiles.themeId, ThemeFiles.name)
            .groupBy({ it[ThemeFiles.themeId] }, { it[ThemeFiles.name] to it[ThemeFiles.id] })
        Themes.selectAll().orderBy(Themes.name to SortOrder.ASC).map { row ->
            StoredTheme(
                id = row[Themes.id],
                name = row[Themes.name],
                author = row[Themes.author],
                license = row[Themes.license],
                manifest = row[Themes.manifest],
                files = files[row[Themes.id]].orEmpty().toMap(),
            )
        }
    }

    fun exists(id: String): Boolean = transaction(database) {
        Themes.selectAll().where { Themes.id eq id }.limit(1).any()
    }

    /** The picture's type and bytes, but only under the theme it belongs to. */
    fun file(themeId: String, fileId: Int): Pair<String, ByteArray>? = transaction(database) {
        ThemeFiles.select(ThemeFiles.contentType, ThemeFiles.data)
            .where { (ThemeFiles.id eq fileId) and (ThemeFiles.themeId eq themeId) }
            .singleOrNull()
            ?.let { it[ThemeFiles.contentType] to it[ThemeFiles.data].bytes }
    }

    fun delete(id: String): Int = transaction(database) {
        Themes.deleteWhere { Themes.id eq id }
    }
}
