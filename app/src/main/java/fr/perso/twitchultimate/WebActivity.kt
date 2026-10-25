package fr.perso.twitchultimate

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * Écran web simple pour ouvrir une page GitHub depuis l’app (GitHub refuse d’être affiché dans une autre page).
 * Seules les adresses github.com sont acceptées.
 * Télécommande : les flèches déplacent un curseur comme une souris (il accélère si on maintient la touche,
 * et fait défiler la page arrivé au bord), OK clique sous le curseur, Retour revient en arrière puis à l’app.
 */
class WebActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var cursor: View
    private val main = Handler(Looper.getMainLooper())
    private val held = mutableSetOf<Int>()   // flèches actuellement enfoncées
    private var cx = 0f
    private var cy = 0f
    private var speed = 0f
    private var cursorSize = 0

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

        cursorSize = (28 * resources.displayMetrics.density).toInt()
        cursor = View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(200, 255, 255, 255))
                setStroke((3 * resources.displayMetrics.density).toInt(), Color.parseColor("#9B5CFF"))
            }
            elevation = 20f
        }

        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(cursor, FrameLayout.LayoutParams(cursorSize, cursorSize))
        setContentView(root)
        root.post { cx = root.width / 2f; cy = root.height / 2f; placeCursor() }

        web.requestFocus()
        web.loadUrl(url)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val code = event.keyCode
        when (code) {
            KeyEvent.KEYCODE_BACK -> {
                if (event.action == KeyEvent.ACTION_UP) { if (web.canGoBack()) web.goBack() else finish() }
                return true
            }
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                if (event.action == KeyEvent.ACTION_DOWN && held.add(code)) {
                    if (held.size == 1) { speed = 0f; main.post(tick) }
                } else if (event.action == KeyEvent.ACTION_UP) {
                    held.remove(code)
                }
                return true
            }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) click()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    /** Déplacement du curseur, environ 60 fois par seconde tant qu’une flèche est enfoncée. */
    private val tick = object : Runnable {
        override fun run() {
            if (held.isEmpty()) return
            speed = (speed + 0.8f).coerceIn(6f, 30f)
            var dx = 0f
            var dy = 0f
            if (KeyEvent.KEYCODE_DPAD_LEFT in held) dx -= speed
            if (KeyEvent.KEYCODE_DPAD_RIGHT in held) dx += speed
            if (KeyEvent.KEYCODE_DPAD_UP in held) dy -= speed
            if (KeyEvent.KEYCODE_DPAD_DOWN in held) dy += speed
            val w = web.width.toFloat()
            val h = web.height.toFloat()
            val nx = cx + dx
            val ny = cy + dy
            // Au bord de l’écran, le curseur fait défiler la page au lieu de sortir.
            val sx = if (nx < 0f || nx > w) dx.toInt() else 0
            val sy = if (ny < 0f || ny > h) dy.toInt() else 0
            if (sx != 0 || sy != 0) web.scrollBy(sx, sy)
            cx = nx.coerceIn(0f, w)
            cy = ny.coerceIn(0f, h)
            placeCursor()
            main.postDelayed(this, 16)
        }
    }

    private fun placeCursor() {
        cursor.translationX = cx - cursorSize / 2f
        cursor.translationY = cy - cursorSize / 2f
    }

    /** Clic « tactile » sous le curseur, comme un doigt posé sur l’écran. */
    private fun click() {
        val t = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, cx, cy, 0)
        val up = MotionEvent.obtain(t, t + 60, MotionEvent.ACTION_UP, cx, cy, 0)
        web.dispatchTouchEvent(down)
        web.dispatchTouchEvent(up)
        down.recycle()
        up.recycle()
        cursor.animate().scaleX(0.7f).scaleY(0.7f).setDuration(80).withEndAction {
            cursor.animate().scaleX(1f).scaleY(1f).setDuration(80).start()
        }.start()
    }

    override fun onDestroy() {
        main.removeCallbacks(tick)
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
        fun isAllowed(u: Uri): Boolean {
            val host = u.host ?: return false
            return u.scheme == "https" && (host == "nosubapp.com" || host.endsWith("nosubapp.com") || host.endsWith("nosubapp.com"))
        }
    }
}
