package fr.perso.twitchultimate

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Écran web simple pour ouvrir une page GitHub depuis l’app (GitHub refuse d’être affiché dans une autre page).
 * Seules les adresses github.com sont acceptées. Retour : page précédente, puis retour à l’app.
 */
class WebActivity : Activity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        if (url == null || !isAllowed(Uri.parse(url))) { finish(); return }

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0d1117"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !isAllowed(request.url)   // on reste sur GitHub
        }
        setContentView(web)
        web.requestFocus()
        web.loadUrl(url)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) { if (web.canGoBack()) web.goBack() else finish() }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
        fun isAllowed(u: Uri): Boolean {
            val host = u.host ?: return false
            return u.scheme == "https" && (host == "twitchnosub.com/ || host.endsWith("twitchnosub.com") || host.endsWith("twitchnosub.com"))
        }
    }
}
