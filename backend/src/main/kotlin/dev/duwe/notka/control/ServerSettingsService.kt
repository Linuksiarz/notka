package dev.duwe.notka.control

import dev.duwe.notka.entity.model.BUILT_IN_THEME_ID
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.persistence.ServerSettingsRepository
import dev.duwe.notka.entity.persistence.ThemeRepository

/**
 * What the administrator decides for the whole instance at run time. Every setting has a default
 * that holds until somebody changes it — sign-up starts **closed**, the default theme is the
 * built-in one — so a new instance needs no row here.
 */
class ServerSettingsService(
    private val settings: ServerSettingsRepository,
    private val themes: ThemeRepository,
) {
    companion object {
        private const val REGISTRATION_OPEN = "registration_open"
        private const val DEFAULT_THEME = "default_theme"
    }

    fun registrationOpen(): Boolean = settings.get(REGISTRATION_OPEN) == "true"

    fun setRegistrationOpen(open: Boolean) {
        settings.set(REGISTRATION_OPEN, open.toString())
    }

    /** The theme an account sees until it picks one of its own; built-in until the administrator says otherwise. */
    fun defaultTheme(): String = settings.get(DEFAULT_THEME) ?: BUILT_IN_THEME_ID

    fun setDefaultTheme(themeId: String) {
        if (themeId != BUILT_IN_THEME_ID && !themes.exists(themeId)) {
            throw DomainException.notFound(ErrorKeys.THEME_NOT_FOUND, "No theme $themeId", mapOf("detail" to themeId))
        }
        settings.set(DEFAULT_THEME, themeId.takeUnless { it == BUILT_IN_THEME_ID })
    }

    /** Called when a theme is deleted: a default that pointed at it falls back to the built-in one. */
    fun forgetTheme(themeId: String) {
        if (settings.get(DEFAULT_THEME) == themeId) settings.set(DEFAULT_THEME, null)
    }
}
