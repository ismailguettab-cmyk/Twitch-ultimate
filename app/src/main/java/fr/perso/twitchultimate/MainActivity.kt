package fr.perso.twitchultimate

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * La coque Android : un WebView plein écran qui affiche l’interface (dossier assets/web).
 * Toute la logique de l’app est en JavaScript, ce qui la rend simple à corriger.
 * Ici on ne gère que : les touches de la télécommande, le réseau natif et les mises à jour.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(true)

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#120A1F"))
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
        }
        web.isFocusable = true
        web.isFocusableInTouchMode = true

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                assets.shouldInterceptRequest(request.url)?.let { return it }
                return MediaProxy.intercept(request)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // On ne quitte jamais l’app vers un autre site.
                return request.url.host != "appassets.androidplatform.net"
            }
        }
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(NativeBridge(this, web), "Android")

        setContentView(web)
        web.requestFocus()
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    /** Touches que le WebView ne transmet pas bien : Retour, lecture/pause, avance, recul, menu. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_BACK -> "back"
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE -> "playpause"
            KeyEvent.KEYCODE_MEDIA_REWIND -> "rew"
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "ff"
            KeyEvent.KEYCODE_MENU -> "menu"
            else -> return super.dispatchKeyEvent(event)
        }
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
            web.evaluateJavascript("(window.TU && TU.onKey(\"$key\")) ? \"y\" : \"n\"") { result ->
                if (key == "back" && result != "\"y\"") finish()
            }
        }
        return true
    }

    override fun onPause() {
        super.onPause()
        web.evaluateJavascript("window.TU && TU.onKey(\"suspend\")", null)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
