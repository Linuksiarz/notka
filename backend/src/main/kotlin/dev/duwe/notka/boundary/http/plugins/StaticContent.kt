package dev.duwe.notka.boundary.http.plugins

import dev.duwe.notka.boundary.config.AppConfig
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.request.path
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import java.io.File

private const val INDEX_FILE = "index.html"
private const val API_PREFIX = "api"
private const val ASSETS_PREFIX = "assets/"

/** Named by their content, so a file there never changes under its name. */
private const val IMMUTABLE = "public, max-age=31536000, immutable"

/** The page, the service worker and the rest of what keeps its name across builds: asked again every time. */
private const val REVALIDATE = "no-cache"

/**
 * Serves the compiled SPA from `NOTKA_STATIC_DIR` with a history-API fallback: a GET for an app route
 * (`/archive`, `/labels/3`) that is not a real file returns `index.html`, so it survives a hard
 * refresh. A path naming a *file* — under `assets/`, or with an extension — that does not exist is a
 * 404, never the page: answered with the page, a script from an earlier build was HTML that the
 * browser refuses to run, and the service worker and Cloudflare kept that answer under the script's
 * name — the app started with no script at all, a grey screen.
 * A missing directory is not fatal — running the API alone is a supported development mode.
 */
fun Application.configureStaticServing(config: AppConfig) {
    val root = File(config.staticDir).absoluteFile.let { if (it.isDirectory) it.canonicalFile else it }
    val index = File(root, INDEX_FILE)
    if (!index.isFile) {
        environment.log.warn("No static directory at ${root.path}; serving the API only")
        return
    }
    routing {
        get("/") {
            call.response.header(HttpHeaders.CacheControl, REVALIDATE)
            call.respondFile(index)
        }
        get("/{path...}") {
            val relative = call.parameters.getAll("path")?.joinToString("/").orEmpty()
            if (relative == API_PREFIX || relative.startsWith("$API_PREFIX/")) {
                call.respond(HttpStatusCode.NotFound)
                return@get
            }
            val realFile = File(root, relative).takeIf { it.isFile }?.canonicalFile
            when {
                realFile != null && realFile.startsWith(root) -> {
                    call.response.header(HttpHeaders.CacheControl, if (relative.startsWith(ASSETS_PREFIX)) IMMUTABLE else REVALIDATE)
                    call.respondFile(realFile)
                }
                relative.startsWith(ASSETS_PREFIX) || '.' in relative.substringAfterLast('/') ->
                    call.respond(HttpStatusCode.NotFound)
                else -> {
                    call.response.header(HttpHeaders.CacheControl, REVALIDATE)
                    call.respondFile(index)
                }
            }
        }
    }
}
