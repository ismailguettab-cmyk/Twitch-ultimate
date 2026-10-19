// Les valeurs ci-dessous sont fournies par GitHub Actions (voir .github/workflows/build.yml).
// En local, l’app se compile quand même : elle démarre alors en mode démo.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun env(name: String, default: String = "") = System.getenv(name)?.takeIf { it.isNotBlank() } ?: default

val keystorePath = env("KEYSTORE_PATH")

android {
    namespace = "fr.perso.twitchultimate"
    compileSdk = 34

    defaultConfig {
        applicationId = "fr.perso.twitchultimate"
        minSdk = 25
        targetSdk = 34
        versionCode = env("VERSION_CODE", "1").toInt()
        versionName = env("VERSION_NAME", "0.0.0-dev")
        buildConfigField("String", "TWITCH_CLIENT_ID", "\"${env("TWITCH_CLIENT_ID")}\"")
        buildConfigField("String", "UPDATE_REPO", "\"${env("GITHUB_REPOSITORY")}\"")
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        create("release") {
            if (keystorePath.isNotEmpty()) {
                storeFile = file(keystorePath)
                storePassword = env("KEYSTORE_PASSWORD")
                keyAlias = env("KEY_ALIAS", "twitchultimate")
                keyPassword = env("KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Toujours signer avec la même clé : sinon Android refuse la mise à jour.
            signingConfig = if (keystorePath.isNotEmpty()) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.11.0")
}
