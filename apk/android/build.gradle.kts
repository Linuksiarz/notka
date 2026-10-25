plugins {
    id("com.android.application") version "9.4.1" apply false
    // AGP 9 compiles Kotlin itself; the plugin is declared only to choose the Kotlin version it uses.
    id("org.jetbrains.kotlin.android") version "2.4.21" apply false
}

/**
 * Android 12 (API 31, October 2021) and newer: the releases of the last five years. Read as
 * `rootProject.ext` by the Capacitor modules' own build files, which `cap sync` generates.
 */
extra["minSdkVersion"] = 31
extra["compileSdkVersion"] = 37
extra["targetSdkVersion"] = 36
extra["androidxAppCompatVersion"] = "1.8.0"
extra["androidxCoreVersion"] = "1.19.1"
extra["androidxWebkitVersion"] = "1.18.0"
extra["coreSplashScreenVersion"] = "1.2.0"

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
