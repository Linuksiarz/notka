pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

rootProject.name = "notka-android"

include(":app")
include(":capacitor-cordova-android-plugins")
project(":capacitor-cordova-android-plugins").projectDir = file("capacitor-cordova-android-plugins")

// Written by `cap sync` (Groovy, and regenerated on every sync): the Capacitor modules in node_modules.
apply(from = "capacitor.settings.gradle")
