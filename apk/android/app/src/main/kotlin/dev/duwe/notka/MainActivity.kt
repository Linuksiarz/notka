package dev.duwe.notka

import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import com.getcapacitor.BridgeActivity
import kotlin.math.roundToInt

/**
 * The app is a WebView on the reader's own Notka server. Which server is chosen at run time (it is
 * self-hosted, so no address can be built in), and Capacitor only gives its bridge — the status bar's
 * icons, the safe-area insets — to the origin its configuration names, so the configuration is built here,
 * from the stored address, before the bridge is.
 */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(InstancePlugin::class.java)
        config = Instance(this).capacitorConfig()
        super.onCreate(savedInstanceState)
        // The page is drawn under both system bars, as the original's notes are: Android 15 and newer
        // do this to every app that targets them, and this does the same on 12 to 14, so that there is
        // one layout to get right. The page keeps clear of the bars by their insets (`PageInsets`).
        enableEdgeToEdge()
        PageInsets(bridge).attach()
        // The page's type is rem and its boxes px, which are the original's sp and dp only when the text
        // follows the system's font size: a WebView ignores it unless told (`textZoom` stays at 100),
        // and a phone set to smaller text then showed ours larger than Keep's beside it.
        bridge.webView.settings.textZoom = (resources.configuration.fontScale * 100).roundToInt()
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
