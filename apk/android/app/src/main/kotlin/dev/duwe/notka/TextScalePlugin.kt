package dev.duwe.notka

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * The reader's system font size, for the page to scale its own type by (`boundary/textScale.ts`).
 *
 * The WebView applies the font size itself by default (`textZoom` = the font scale), but it enlarges
 * the *text* while the page is laid out, after every `em` and `rem` length has been worked out: the
 * words grew and the checkbox and the line beside them did not, so a list's text stood off its checkboxes. Scaling the page's root size instead
 * scales the type and everything measured from it together, the way `sp` and `dp` work in a native app.
 */
@CapacitorPlugin(name = "TextScale")
class TextScalePlugin : Plugin() {
    @PluginMethod
    fun fontScale(call: PluginCall) {
        call.resolve(JSObject().put("scale", context.resources.configuration.fontScale.toDouble()))
    }
}
