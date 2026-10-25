package fr.perso.twitchultimate

import android.content.Context
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
    private val prefs = activity.getSharedPreferences("tu", Context.MODE_PRIVATE)

    /** Sessions des comptes : écrites sur le disque immédiatement (commit), contrairement au stockage du WebView
     *  qui peut perdre les dernières écritures si l’app plante. Twitch n’accepte chaque jeton de rafraîchissement
     *  qu’une fois : en perdre un, c’est être déconnecté. */
    @JavascriptInterface
    fun prefGet(key: String): String? = prefs.getString(key, null)

    @JavascriptInterface
    fun prefSet(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.commit()
    }

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
