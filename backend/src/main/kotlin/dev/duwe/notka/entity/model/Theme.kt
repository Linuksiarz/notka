package dev.duwe.notka.entity.model

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/** The theme that ships with the app's own pictures; it is never uploaded and cannot be replaced. */
const val BUILT_IN_THEME_ID = "notka"

/** The `format` a `theme.json` declares; see `docs/THEMES.md`. */
const val THEME_FORMAT = 1

private const val NAME_MAX_LENGTH = 80
private const val AUTHOR_MAX_LENGTH = 120
private const val LICENSE_MAX_LENGTH = 400
private const val ID_MAX_LENGTH = 40

/** The pictures one note background is drawn with in a theme, by file name inside the theme. */
data class ThemeBackground(val light: String, val dark: String, val tint: String?, val tintDark: String?)

/** A `theme.json`, checked. */
data class ThemeManifest(
    val id: String,
    val name: String,
    val author: String?,
    val license: String?,
    val backgrounds: Map<String, ThemeBackground>,
)

/**
 * Reads and checks a theme's `theme.json` against the files its archive holds. A theme with nothing
 * usable is refused, and so is one that names a background this app does not have — rather than
 * half-imported, so whoever uploads it learns the theme does not fit.
 */
object ThemeManifests {
    /** The picture formats a theme may carry, by file extension: anything a browser draws as a background. */
    val IMAGE_TYPES: Map<String, String> = mapOf(
        "svg" to "image/svg+xml",
        "png" to "image/png",
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "webp" to "image/webp",
    )

    private val HEX = Regex("^#[0-9a-fA-F]{6}$")

    fun imageType(fileName: String): String? = IMAGE_TYPES[fileName.substringAfterLast('.', "").lowercase()]

    fun parse(raw: JsonElement?, files: Set<String>): ThemeManifest {
        val data = raw as? JsonObject ?: fail(ErrorKeys.THEME_MANIFEST)
        val format = (data["format"] as? JsonPrimitive)?.intOrNull
        if (format != THEME_FORMAT) fail(ErrorKeys.THEME_FORMAT, format?.toString() ?: "?")

        val name = data.string("name")?.trim()?.take(NAME_MAX_LENGTH).orEmpty()
        if (name.isEmpty()) fail(ErrorKeys.THEME_NAME)
        val id = slug(data.string("id")?.takeIf { it.isNotBlank() } ?: name)
        if (id.isEmpty() || id == BUILT_IN_THEME_ID) fail(ErrorKeys.THEME_NAME)

        val entries = data["backgrounds"] as? JsonObject ?: fail(ErrorKeys.THEME_EMPTY)
        val backgrounds = entries.mapValues { (key, value) ->
            if (key !in NOTE_BACKGROUNDS) fail(ErrorKeys.THEME_UNKNOWN_BACKGROUND, key)
            val entry = value as? JsonObject ?: JsonObject(emptyMap())
            val light = entry.string("light").orEmpty()
            val dark = entry.string("dark")?.takeIf { it.isNotEmpty() } ?: light
            for (file in listOf(light, dark)) {
                if (file.isEmpty() || file !in files) fail(ErrorKeys.THEME_MISSING_FILE, file.ifEmpty { key })
                if (imageType(file) == null) fail(ErrorKeys.THEME_FILE_TYPE, file)
            }
            ThemeBackground(light, dark, entry.colour("tint", key), entry.colour("tintDark", key))
        }
        if (backgrounds.isEmpty()) fail(ErrorKeys.THEME_EMPTY)

        return ThemeManifest(
            id = id,
            name = name,
            author = data.string("author")?.trim()?.take(AUTHOR_MAX_LENGTH)?.ifEmpty { null },
            license = data.string("license")?.trim()?.take(LICENSE_MAX_LENGTH)?.ifEmpty { null },
            backgrounds = backgrounds,
        )
    }

    /** The checked manifest as it is stored: only what [parse] accepted, in its own shape. */
    fun toJson(manifest: ThemeManifest): JsonObject = buildJsonObject {
        put("format", THEME_FORMAT)
        put("id", manifest.id)
        put("name", manifest.name)
        manifest.author?.let { put("author", it) }
        manifest.license?.let { put("license", it) }
        put(
            "backgrounds",
            JsonObject(
                manifest.backgrounds.mapValues { (_, background) ->
                    buildJsonObject {
                        put("light", background.light)
                        put("dark", background.dark)
                        background.tint?.let { put("tint", it) }
                        background.tintDark?.let { put("tintDark", it) }
                    }
                },
            ),
        )
    }

    private fun slug(value: String): String = java.text.Normalizer.normalize(value.lowercase(), java.text.Normalizer.Form.NFKD)
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
        .take(ID_MAX_LENGTH)
        .trim('-')

    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun JsonObject.colour(field: String, background: String): String? {
        val value = this[field] ?: return null
        if (value is JsonNull) return null
        val colour = (value as? JsonPrimitive)?.takeIf { it.isString }?.content
        if (colour == null || !HEX.matches(colour)) fail(ErrorKeys.THEME_TINT, "$background.$field")
        return colour.lowercase()
    }

    private fun fail(key: String, detail: String = ""): Nothing =
        throw DomainException.validation(key, "Theme refused: $key $detail".trim(), mapOf("detail" to detail))
}
