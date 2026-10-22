package dev.duwe.notka

import android.net.Uri
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlin.concurrent.thread

private const val ACTIONS = "/instance/"

/**
 * Choosing the server, for the app's own pages (`www/`) and for Notka's settings. A change restarts
 * the activity, because the bridge belongs to the origin it was built for.
 */
@CapacitorPlugin(name = "Instance")
class InstancePlugin : Plugin() {
    private val instance by lazy { Instance(context) }

    /** Rejects with `invalid` (not an address this app opens) or `unreachable` (no Notka answers there). */
    @PluginMethod
    fun open(call: PluginCall) {
        val origin = Instance.originOf(call.getString("server").orEmpty()) ?: return call.reject("invalid", "invalid")
        thread {
            if (!Instance.isNotka(origin)) return@thread call.reject("unreachable", "unreachable")
            instance.remember(origin)
            call.resolve()
            restart()
        }
    }

    @PluginMethod
    fun forget(call: PluginCall) {
        instance.forget()
        call.resolve()
        restart()
    }

    /**
     * `www/index.html`'s two links. That page is the app's own and not on the server's origin, so it
     * has no bridge to call `forget` through.
     */
    override fun shouldOverrideLoad(url: Uri): Boolean? {
        if (url.scheme != bridge.scheme || url.authority != bridge.host || url.path?.startsWith(ACTIONS) != true) return null
        when (url.path?.removePrefix(ACTIONS)) {
            "retry" -> instance.server?.let { bridge.webView.loadUrl(it) }
            "change" -> {
                instance.forget()
                restart()
            }
        }
        return true
    }

    private fun restart() = activity.runOnUiThread { activity.recreate() }
}
