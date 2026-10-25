package fr.perso.twitchultimate

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import kotlin.concurrent.thread

/** Télécharge le nouvel APK publié sur GitHub et lance l’installeur Android. */
object Updater {
    fun downloadAndInstall(
        activity: Activity,
        url: String,
        onProgress: (Int) -> Unit,
        onError: (String) -> Unit
    ) {
        thread {
            try {
                if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
                    activity.runOnUiThread {
                        try {
                            activity.startActivity(
                                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
                            )
                        } catch (_: Exception) { }
                    }
                    onError("Autorisez d’abord Twitch Ultimate à installer des applis inconnues (Paramètres > Ma Fire TV > Options pour les développeurs), puis relancez la mise à jour.")
                    return@thread
                }
                val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
                val file = File(dir, "update.apk").apply { delete() }
                val c = Http.open("GET", url, null)
                val total = c.contentLengthLong
                c.inputStream.use { input ->
                    file.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        var done = 0L
                        var last = -1
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val p = (done * 100 / total).toInt()
                                if (p != last) { last = p; onProgress(p) }
                            }
                        }
                    }
                }
                c.disconnect()
                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", file)
                val intent = Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.runOnUiThread { activity.startActivity(intent) }
                onProgress(100)
            } catch (e: Exception) {
                onError(e.message ?: "Téléchargement impossible")
            }
        }
    }
}
