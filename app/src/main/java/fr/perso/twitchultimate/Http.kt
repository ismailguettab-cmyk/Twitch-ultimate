package fr.perso.twitchultimate

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

object Http {
    private const val UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

    fun open(method: String, url: String, headers: JSONObject?): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 10_000
        c.readTimeout = 20_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", UA)
        headers?.keys()?.forEach { k -> c.setRequestProperty(k, headers.getString(k)) }
        return c
    }

    fun text(method: String, url: String, headers: JSONObject, body: String): Pair<Int, String> {
        val c = open(method, url, headers)
        try {
            if (body.isNotEmpty() && method != "GET") {
                c.doOutput = true
                c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            val stream = if (code >= 400) c.errorStream else c.inputStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return code to text
        } finally {
            c.disconnect()
        }
    }
}

/**
 * Sert les playlists et segments vidéo Twitch au lecteur en ajoutant l’en-tête CORS,
 * pour que hls.js puisse les lire depuis l’interface locale.
 */
object MediaProxy {
    private fun handled(host: String) =
        host.endsWith("ttvnw.net") || host.endsWith("cloudfront.net") ||
        (host.startsWith("vod") && host.endsWith("twitch.tv"))

    fun intercept(req: WebResourceRequest): WebResourceResponse? {
        val host = req.url.host ?: return null
        if (req.method != "GET" || !handled(host)) return null
        val cors = mapOf("Access-Control-Allow-Origin" to "*", "Cache-Control" to "no-cache")
        return try {
            val c = Http.open("GET", req.url.toString(), null)
            req.requestHeaders["Range"]?.let { c.setRequestProperty("Range", it) }
            val code = c.responseCode
            val type = (c.contentType ?: "application/octet-stream").substringBefore(";").trim()
            val stream = (if (code >= 400) c.errorStream else c.inputStream) ?: ByteArrayInputStream(ByteArray(0))
            WebResourceResponse(type, null, code, reason(code), cors, stream)
        } catch (e: Exception) {
            WebResourceResponse("text/plain", "utf-8", 502, "Bad Gateway", cors, ByteArrayInputStream(ByteArray(0)))
        }
    }

    private fun reason(code: Int) = when (code) {
        200 -> "OK"; 206 -> "Partial Content"; 403 -> "Forbidden"; 404 -> "Not Found"; else -> "Status"
    }
}
