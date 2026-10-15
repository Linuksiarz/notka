package dev.duwe.notka.boundary.http.plugins

import dev.duwe.notka.boundary.config.AppConfig
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.request.path
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import java.io.File

private const val INDEX_FILE = "index.html"
private const val API_PREFIX = "api"

/**
 * Serves the compiled SPA from `NOTKA_STATIC_DIR` with a history-API fallback: any non-`/api`
 * GET that does not hit a real file returns `index.html`, so `/archive` survives a hard refresh.
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
                realFile != null && realFile.startsWith(root) -> call.respondFile(realFile)
                else -> call.respondFile(index)
            }
        }
    }
}
