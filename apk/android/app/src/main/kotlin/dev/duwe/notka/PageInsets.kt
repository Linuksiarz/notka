package dev.duwe.notka

import android.view.View
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.Bridge
import com.getcapacitor.WebViewListener

/**
 * Hands the page the system bars' insets, so that it can lie under them and keep its content clear.
 *
 * Capacitor's own `SystemBars` does this only for Android System WebView 140 and newer, which reports
 * `env(safe-area-inset-*)` itself; on an older one it lays the page out *between* the bars, and the
 * status bar is a plain strip of the window's background — not the note under it. Publishing the
 * insets as the same CSS variables it would (`--safe-area-inset-*`, read by `tokens.css`) works on
 * every WebView, so the page is always under the bars.
 *
 * The keyboard is the one inset the page does not draw under: the window is edge to edge, so nothing
 * resizes it for the keyboard, and the root view takes the keyboard's height as padding instead.
 */
class PageInsets(private val bridge: Bridge) {
    private var script = ""

    fun attach() {
        val root = bridge.activity.window.decorView
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets -> apply(view, insets) }
        bridge.addWebViewListener(object : WebViewListener() {
            override fun onPageCommitVisible(view: WebView, url: String) = publish()
        })
    }

    private fun apply(root: View, insets: WindowInsetsCompat): WindowInsetsCompat {
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val keyboard = insets.isVisible(WindowInsetsCompat.Type.ime())
        root.setPadding(0, 0, 0, if (keyboard) insets.getInsets(WindowInsetsCompat.Type.ime()).bottom else 0)
        val density = root.resources.displayMetrics.density
        val sides = mapOf(
            "top" to bars.top,
            "right" to bars.right,
            // Above the keyboard there is no gesture bar to keep clear of.
            "bottom" to if (keyboard) 0 else bars.bottom,
            "left" to bars.left
        )
        script = sides.entries.joinToString(" ", "if (document.documentElement) { ", " }") { (side, pixels) ->
            "document.documentElement.style.setProperty('--safe-area-inset-$side', '${(pixels / density).toInt()}px');"
        }
        publish()
        // The page has them; the WebView must not inset itself a second time.
        return WindowInsetsCompat.CONSUMED
    }

    private fun publish() {
        if (script.isNotEmpty()) bridge.webView.post { bridge.webView.evaluateJavascript(script, null) }
    }
}
