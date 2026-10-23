import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** The app's version is the project's: `version` in `package.json`, as in the other modules. */
val packageVersion: String = groovy.json.JsonSlurper()
    .parse(rootProject.file("../package.json"))
    .let { (it as Map<*, *>)["version"] as String }

android {
    namespace = "dev.duwe.notka"
    compileSdk = rootProject.extra["compileSdkVersion"] as Int

    defaultConfig {
        applicationId = "dev.duwe.notka"
        minSdk = rootProject.extra["minSdkVersion"] as Int
        targetSdk = rootProject.extra["targetSdkVersion"] as Int
        versionCode = 4
        versionName = packageVersion
    }

    androidResources {
        // Capacitor's own pattern: the default one would leave out files starting with `_`.
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~"
    }

    /** A release is signed with the keystore the environment names (`apk/README.md`); without one it is left unsigned. */
    val keystore = System.getenv("NOTKA_KEYSTORE")
    if (keystore != null) {
        signingConfigs.create("release") {
            storeFile = file(keystore)
            storePassword = System.getenv("NOTKA_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("NOTKA_KEY_ALIAS")
            keyPassword = System.getenv("NOTKA_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
    }
}

repositories {
    flatDir {
        dirs("../capacitor-cordova-android-plugins/src/main/libs", "libs")
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:${rootProject.extra["androidxAppCompatVersion"]}")
    implementation("androidx.core:core-splashscreen:${rootProject.extra["coreSplashScreenVersion"]}")
    implementation(project(":capacitor-android"))
    implementation(project(":capacitor-cordova-android-plugins"))
}

// Written by `cap sync` (Groovy, regenerated on every sync): the Capacitor plugins' dependencies.
apply(from = "capacitor.build.gradle")
