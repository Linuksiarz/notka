package dev.duwe.notka

import android.content.Context
import com.getcapacitor.CapConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

private const val PREFERENCES = "notka"
private const val SERVER_KEY = "server"
private const val HEALTH_TIMEOUT_MS = 10_000

/** The Notka server this app opens: chosen once by the reader, kept on the device. */
class Instance(private val context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    val server: String?
        get() = preferences.getString(SERVER_KEY, null)

    fun remember(server: String) = preferences.edit().putString(SERVER_KEY, server).apply()

    fun forget() = preferences.edit().remove(SERVER_KEY).apply()

    /**
     * `capacitor.config.json` as `cap sync` wrote it, with the server's address added. Without one the
     * app shows its own page (`www/index.html`), which asks for it.
     */
    fun capacitorConfig(): CapConfig {
        val file = context.assets.open("capacitor.config.json").bufferedReader().use { JSONObject(it.readText()) }
        val builder = CapConfig.Builder(context)
            .setPluginsConfiguration(file.optJSONObject("plugins") ?: JSONObject())
            .setErrorPath(file.getJSONObject("server").getString("errorPath"))
        server?.let { builder.setServerUrl(it) }
        return builder.create()
    }

    companion object {
        /**
         * The address as the reader typed it, made into an origin: `https://` when no scheme was given,
         * no path. Plain `http` is accepted only for this device itself (a server forwarded with
         * `adb reverse` while developing): anywhere else the session cookie would cross the network in
         * the clear, and the page would not be a secure context for its service worker.
         */
        fun originOf(typed: String): String? {
            val text = typed.trim().trimEnd('/')
            if (text.isEmpty()) return null
            val uri = runCatching { URI(if ("://" in text) text else "https://$text") }.getOrNull() ?: return null
            val host = uri.host ?: return null
            val local = host == "localhost" || host == "127.0.0.1"
            if (uri.scheme != "https" && !(uri.scheme == "http" && local)) return null
            val port = if (uri.port == -1) "" else ":${uri.port}"
            return "${uri.scheme}://$host$port"
        }

        /** Whether a Notka server answers at that origin: its health endpoint, read off the main thread. */
        fun isNotka(origin: String): Boolean = runCatching {
            val connection = URI("$origin/api/health").toURL().openConnection() as HttpURLConnection
            connection.connectTimeout = HEALTH_TIMEOUT_MS
            connection.readTimeout = HEALTH_TIMEOUT_MS
            try {
                connection.responseCode == HttpURLConnection.HTTP_OK &&
                    JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).optString("status") == "ok"
            } finally {
                connection.disconnect()
            }
        }.getOrDefault(false)
    }
}
