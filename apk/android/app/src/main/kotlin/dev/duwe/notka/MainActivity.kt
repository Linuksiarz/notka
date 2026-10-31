package dev.duwe.notka

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import com.getcapacitor.BridgeActivity
import com.getcapacitor.WebViewListener

/**
 * The app is a WebView on the reader's own Notka server. Which server is chosen at run time (it is
 * self-hosted, so no address can be built in), and Capacitor only gives its bridge — the status bar's
 * icons, the safe-area insets — to the origin its configuration names, so the configuration is built here,
 * from the stored address, before the bridge is.
 */
class MainActivity : BridgeActivity() {
    private companion object {
        const val SSO_RETURN_SCHEME = "dev.duwe.notka"
        val SSO_RETURN_PARAMETERS = listOf("ssoCode", "ssoError")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(InstancePlugin::class.java)
        registerPlugin(TextScalePlugin::class.java)
        config = Instance(this).capacitorConfig()
        super.onCreate(savedInstanceState)
        // The page is drawn under both system bars, as the original's notes are: Android 15 and newer
        // do this to every app that targets them, and this does the same on 12 to 14, so that there is
        // one layout to get right. The page keeps clear of the bars by their insets (`PageInsets`).
        enableEdgeToEdge()
        PageInsets(bridge).attach()
        // The system's font size reaches the page through `TextScalePlugin`, which scales the page's
        // root size. The WebView's own default is `textZoom` = the font scale, which enlarges the text
        // alone (see the plugin) — and on top of the page's own scaling it would count the setting twice.
        bridge.webView.settings.textZoom = 100
        onBackPressedDispatcher.addCallback(this, backThroughThePage)
        bridge.addWebViewListener(object : WebViewListener() {
            override fun onPageLoaded(webView: WebView) {
                if (forgetHistoryOnLoad) webView.clearHistory()
                forgetHistoryOnLoad = false
            }
        })
        openSsoReturn(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openSsoReturn(intent)
    }

    /**
     * The identity provider's answer (`dev.duwe.notka://sso?ssoCode=…`), on its way from the Custom Tab.
     * The page takes it from there, in the WebView, so that the session cookie lands there. Any app can
     * send this, so only these two parameters pass, and only to the reader's own server; the code is
     * worthless without the secret in that page (`docs/API.md`). Used once: `recreate()` replays the intent.
     * The sign-in screen it came from is no place for Back to return to.
     */
    private fun openSsoReturn(intent: Intent) {
        val answer = intent.data?.takeIf { it.scheme == SSO_RETURN_SCHEME } ?: return
        intent.data = null
        val server = Instance(this).server ?: return
        val page = Uri.parse(server).buildUpon().path("/")
        for (parameter in SSO_RETURN_PARAMETERS) {
            answer.getQueryParameter(parameter)?.let { page.appendQueryParameter(parameter, it) }
        }
        forgetHistoryOnLoad = true
        bridge.webView.loadUrl(page.build().toString())
    }

    private var forgetHistoryOnLoad = false

    /**
     * The system's Back is the page's own, as in a browser: it closes an open note (the editor keeps a
     * history entry while it is open), and leaves the app only from where the page cannot go back.
     */
    private val backThroughThePage = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            val webView = bridge.webView
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
                isEnabled = true
            }
        }
    }
}
