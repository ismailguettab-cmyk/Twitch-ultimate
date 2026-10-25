package fr.perso.twitchultimate

import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Fonctions appelables depuis le JavaScript via window.Android.
 * Les requêtes passent par ici pour éviter les blocages CORS des API Twitch.
 */
class NativeBridge(private val activity: MainActivity, private val web: WebView) {

    private val pool = Executors.newFixedThreadPool(8)

    @JavascriptInterface
    fun config(): String = JSONObject().apply {
        put("clientId", BuildConfig.TWITCH_CLIENT_ID)
        put("repo", BuildConfig.UPDATE_REPO)
        put("version", BuildConfig.VERSION_NAME)
        put("versionCode", BuildConfig.VERSION_CODE)
        put("device", Build.MODEL)
        put("android", Build.VERSION.RELEASE)
    }.toString()

    @JavascriptInterface
    fun http(id: String, method: String, url: String, headersJson: String, body: String) {
        pool.execute {
            val (status, text) = try {
                Http.text(method, url, JSONObject(headersJson.ifBlank { "{}" }), body)
            } catch (e: Exception) {
                0 to (e.message ?: e.toString())
            }
            post("window.__nb && __nb.resolve(${JSONObject.quote(id)}, $status, ${JSONObject.quote(text)})")
        }
    }

    @JavascriptInterface
    fun installUpdate(url: String) {
        Updater.downloadAndInstall(
            activity, url,
            onProgress = { pct -> post("window.__nb && __nb.updateProgress($pct)") },
            onError = { msg -> post("window.__nb && __nb.updateError(${JSONObject.quote(msg)})") }
        )
    }

    @JavascriptInterface
    fun exit() {
        activity.runOnUiThread { activity.finish() }
    }

    private fun post(js: String) {
        activity.runOnUiThread { web.evaluateJavascript(js, null) }
    }
}
