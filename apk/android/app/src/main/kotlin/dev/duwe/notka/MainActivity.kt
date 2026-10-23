package dev.duwe.notka

import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import com.getcapacitor.BridgeActivity

/**
 * The app is a WebView on the reader's own Notka server. Which server is chosen at run time (it is
 * self-hosted, so no address can be built in), and Capacitor only gives its bridge — the status bar's
 * icons, the safe-area insets — to the origin its configuration names, so the configuration is built here,
 * from the stored address, before the bridge is.
 */
class MainActivity : BridgeActivity() {
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
    }

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
