package dev.duwe.notka.boundary.http.dto

import dev.duwe.notka.control.ThemeChoice
import dev.duwe.notka.control.ThemeInfo
import dev.duwe.notka.entity.model.AccountUsage
import kotlinx.serialization.Serializable

@Serializable
data class ServerSettingsDto(
    val registrationOpen: Boolean,
    val defaultThemeId: String,
    /** Whether password resets can be e-mailed: an SMTP server and `NOTKA_PUBLIC_URL` are both set. */
    val mailConfigured: Boolean,
)

/** Every field is optional; what is left out stays as it is. */
@Serializable
data class PatchServerSettingsRequest(
    val registrationOpen: Boolean? = null,
    val defaultThemeId: String? = null,
)

@Serializable
data class AccountUsageDto(
    val user: UserDto,
    val createdAt: Long,
    val lastSeenAt: Long?,
    val notes: Long,
    val noteBytes: Long,
    val historyBytes: Long,
    val imageBytes: Long,
    val totalBytes: Long,
)

@Serializable
data class AccountsResponse(
    val accounts: List<AccountUsageDto>,
    /** The picture storage every account may use (`NOTKA_MAX_IMAGE_STORAGE_MB`), in bytes. */
    val imageQuotaBytes: Long,
    /** The size of the database file — everything the instance stores, in one number. */
    val databaseBytes: Long,
)

fun AccountUsage.toDto(): AccountUsageDto = AccountUsageDto(
    user = user.toDto(),
    createdAt = createdAt,
    lastSeenAt = lastSeenAt,
    notes = notes,
    noteBytes = noteBytes,
    historyBytes = historyBytes,
    imageBytes = imageBytes,
    totalBytes = totalBytes,
)

@Serializable
data class ThemeImagesDto(
    val light: String,
    val dark: String,
    val tint: String?,
    val tintDark: String?,
    val tonal: String?,
    val tonalDark: String?,
)

@Serializable
data class ThemeDto(
    val id: String,
    val name: String,
    val author: String?,
    val license: String?,
    /** Each background the theme draws, with the urls of its two pictures. */
    val backgrounds: Map<String, ThemeImagesDto>,
    /** The url of the app's logo in this theme, or `null` for Notka's own mark. */
    val logo: String?,
    /** The sidebar's active entry, `#rrggbb`, for the light and the dark colour scheme. */
    val highlight: String?,
    val highlightDark: String?,
)

@Serializable
data class ThemesResponse(
    val themes: List<ThemeDto>,
    val defaultThemeId: String,
    /** The account's own pick; `null` follows [defaultThemeId]. */
    val selectedThemeId: String?,
)

@Serializable
data class SelectThemeRequest(val themeId: String?)

fun ThemeInfo.toDto(): ThemeDto = ThemeDto(
    id = id,
    name = name,
    author = author,
    license = license,
    backgrounds = backgrounds.mapValues { (_, images) ->
        ThemeImagesDto(
            light = "/api/themes/$id/files/${images.lightFileId}",
            dark = "/api/themes/$id/files/${images.darkFileId}",
            tint = images.tint,
            tintDark = images.tintDark,
            tonal = images.tonal,
            tonalDark = images.tonalDark,
        )
    },
    logo = logoFileId?.let { "/api/themes/$id/files/$it" },
    highlight = highlight,
    highlightDark = highlightDark,
)

fun ThemeChoice.toDto(): ThemesResponse = ThemesResponse(themes.map { it.toDto() }, defaultThemeId, selectedThemeId)
