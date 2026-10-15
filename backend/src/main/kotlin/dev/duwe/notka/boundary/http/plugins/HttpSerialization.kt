package dev.duwe.notka.boundary.http.plugins

import kotlinx.serialization.json.Json

/**
 * The one JSON configuration of the app. Defaults are always encoded (so `color: "default"` and
 * `background: null` reach the client) while empty optional fields opt out through `@EncodeDefault`.
 */
object HttpSerialization {
    val json: Json = Json {
        encodeDefaults = true
        explicitNulls = true
        ignoreUnknownKeys = true
        prettyPrint = false
    }
}
