plugins {
    id("com.android.application") version "8.13.0" apply false
    id("org.jetbrains.kotlin.android") version "2.4.0" apply false
}

/**
 * Android 12 (API 31, October 2021) and newer: the releases of the last five years. Read as
 * `rootProject.ext` by the Capacitor modules' own build files, which `cap sync` generates.
 */
extra["minSdkVersion"] = 31
extra["compileSdkVersion"] = 36
extra["targetSdkVersion"] = 36
extra["androidxAppCompatVersion"] = "1.7.1"
extra["androidxCoreVersion"] = "1.17.0"
extra["androidxWebkitVersion"] = "1.14.0"
extra["coreSplashScreenVersion"] = "1.2.0"

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
