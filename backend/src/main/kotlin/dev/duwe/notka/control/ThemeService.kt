package dev.duwe.notka.control

import dev.duwe.notka.entity.model.BUILT_IN_THEME_ID
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ImageFormats
import dev.duwe.notka.entity.model.ThemeBackground
import dev.duwe.notka.entity.model.ThemeManifests
import dev.duwe.notka.entity.persistence.ThemeFile
import dev.duwe.notka.entity.persistence.ThemeRepository
import dev.duwe.notka.entity.persistence.UserRepository
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.io.ByteArrayInputStream
import java.io.IOException
import java.util.zip.ZipInputStream

/** Largest picture a theme may carry. */
const val MAX_THEME_FILE_BYTES: Int = 5 * 1024 * 1024

/** Largest theme archive, packed or unpacked. */
const val MAX_THEME_ARCHIVE_BYTES: Int = 30 * 1024 * 1024

/** An uploaded theme as the app shows it: each picture by the id it is served under. */
data class ThemeInfo(
    val id: String,
    val name: String,
    val author: String?,
    val license: String?,
    val backgrounds: Map<String, ThemeImages>,
    val logoFileId: Int?,
    val highlight: String?,
    val highlightDark: String?,
)

data class ThemeImages(val lightFileId: Int, val darkFileId: Int, val tint: String?, val tintDark: String?)

/** What an account sees of the themes: all of them, the instance's default, and its own pick. */
data class ThemeChoice(val themes: List<ThemeInfo>, val defaultThemeId: String, val selectedThemeId: String?)

/**
 * Background themes (`docs/THEMES.md`): the administrator uploads and removes them and decides the
 * instance's default; every account picks one of them for itself, or follows the default.
 */
class ThemeService(
    private val themes: ThemeRepository,
    private val users: UserRepository,
    private val settings: ServerSettingsService,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun choice(userId: Int): ThemeChoice {
        val all = list()
        val selected = users.findById(userId)?.backgroundTheme?.takeIf { id -> id == BUILT_IN_THEME_ID || all.any { it.id == id } }
        return ThemeChoice(all, settings.defaultTheme(), selected)
    }

    /** [themeId] `null` follows the instance's default. */
    fun select(userId: Int, themeId: String?) {
        if (themeId != null && themeId != BUILT_IN_THEME_ID && !themes.exists(themeId)) {
            throw DomainException.notFound(ErrorKeys.THEME_NOT_FOUND, "No theme $themeId", mapOf("detail" to themeId))
        }
        users.updateBackgroundTheme(userId, themeId)
    }

    /** Stores the theme a `.zip` carries, replacing one with the same id, and returns it. */
    fun upload(archive: ByteArray): ThemeInfo {
        val entries = unpack(archive)
        val manifestPath = entries.keys.filter { it == "theme.json" || it.endsWith("/theme.json") }.minByOrNull { it.length }
            ?: throw DomainException.validation(ErrorKeys.THEME_MANIFEST, "The archive has no theme.json")
        val base = manifestPath.removeSuffix("theme.json")
        val files = entries.filterKeys { it != manifestPath && it.startsWith(base) }.mapKeys { it.key.removePrefix(base) }

        val raw = try {
            Json.parseToJsonElement(entries.getValue(manifestPath).decodeToString())
        } catch (_: SerializationException) {
            throw DomainException.validation(ErrorKeys.THEME_MANIFEST, "theme.json is not JSON")
        }
        val manifest = ThemeManifests.parse(raw, files.keys)
        themes.replace(
            id = manifest.id,
            name = manifest.name,
            author = manifest.author,
            license = manifest.license,
            manifest = ThemeManifests.toJson(manifest).toString(),
            files = manifest.files.map { name -> picture(name, files.getValue(name)) },
            createdAt = clock(),
        )
        return list().first { it.id == manifest.id }
    }

    fun delete(themeId: String) {
        if (themes.delete(themeId) == 0) {
            throw DomainException.notFound(ErrorKeys.THEME_NOT_FOUND, "No theme $themeId", mapOf("detail" to themeId))
        }
        users.forgetBackgroundTheme(themeId)
        settings.forgetTheme(themeId)
    }

    fun file(themeId: String, fileId: Int): Pair<String, ByteArray> = themes.file(themeId, fileId)
        ?: throw DomainException.notFound(ErrorKeys.THEME_NOT_FOUND, "No such theme file")

    fun list(): List<ThemeInfo> = themes.list().map { stored ->
        val manifest = ThemeManifests.parse(Json.parseToJsonElement(stored.manifest), stored.files.keys)
        ThemeInfo(
            id = stored.id,
            name = stored.name,
            author = stored.author,
            license = stored.license,
            backgrounds = manifest.backgrounds.mapValues { (_, background) -> background.images(stored.files) },
            logoFileId = manifest.logo?.let { stored.files.getValue(it) },
            highlight = manifest.highlight,
            highlightDark = manifest.highlightDark,
        )
    }

    private fun ThemeBackground.images(files: Map<String, Int>) =
        ThemeImages(files.getValue(light), files.getValue(dark), tint, tintDark)

    /**
     * Unpacks the archive into memory, counting what it unpacks rather than trusting the sizes its
     * directory claims, so a small zip that expands into gigabytes is stopped at the limit.
     */
    private fun unpack(archive: ByteArray): Map<String, ByteArray> {
        if (archive.size > MAX_THEME_ARCHIVE_BYTES) throw tooLarge()
        val entries = linkedMapOf<String, ByteArray>()
        var unpacked = 0L
        try {
            ZipInputStream(ByteArrayInputStream(archive)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    val name = entry.name
                    val hidden = name.split('/').any { it.startsWith('.') || it == "__MACOSX" }
                    if (entry.isDirectory || hidden) continue
                    val bytes = zip.readNBytes(MAX_THEME_FILE_BYTES + 1)
                    if (bytes.size > MAX_THEME_FILE_BYTES) throw tooLarge()
                    unpacked += bytes.size
                    if (unpacked > MAX_THEME_ARCHIVE_BYTES) throw tooLarge()
                    entries[name] = bytes
                }
            }
        } catch (_: IOException) {
            throw DomainException.validation(ErrorKeys.THEME_ARCHIVE, "The theme is not a readable zip archive")
        } catch (_: IllegalArgumentException) {
            throw DomainException.validation(ErrorKeys.THEME_ARCHIVE, "The theme is not a readable zip archive")
        }
        if (entries.isEmpty()) {
            throw DomainException.validation(ErrorKeys.THEME_ARCHIVE, "The theme is not a readable zip archive")
        }
        return entries
    }

    /**
     * Checks that a picture is what its extension says. A raster image is recognised by its own
     * bytes; an SVG has to be one. It is served from this origin, so `ThemeRoutes` sends it with a
     * sandboxing policy that keeps any script in it from running even when opened on its own.
     */
    private fun picture(name: String, bytes: ByteArray): ThemeFile {
        val type = ThemeManifests.imageType(name)
            ?: throw DomainException.validation(ErrorKeys.THEME_FILE_TYPE, "Unsupported file $name", mapOf("detail" to name))
        val matches = if (type == "image/svg+xml") {
            bytes.copyOf(minOf(bytes.size, 4096)).decodeToString().contains("<svg")
        } else {
            ImageFormats.sniff(bytes)?.contentType == type
        }
        if (!matches) throw DomainException.validation(ErrorKeys.THEME_FILE_TYPE, "$name is not a $type", mapOf("detail" to name))
        return ThemeFile(name, type, bytes)
    }

    private fun tooLarge() = DomainException.payloadTooLarge(
        ErrorKeys.THEME_TOO_LARGE,
        "A theme may hold up to ${MAX_THEME_ARCHIVE_BYTES / (1024 * 1024)} MB, and a picture up to ${MAX_THEME_FILE_BYTES / (1024 * 1024)} MB",
    )
}

