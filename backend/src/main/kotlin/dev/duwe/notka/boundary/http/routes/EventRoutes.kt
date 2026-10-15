package dev.duwe.notka.boundary.http.routes

import dev.duwe.notka.boundary.http.plugins.requireUser
import dev.duwe.notka.control.AuthService
import dev.duwe.notka.control.NoteChangedEvent
import dev.duwe.notka.control.NoteEventBus
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import io.ktor.server.application.createRouteScopedPlugin
import io.ktor.server.application.install
import io.ktor.server.routing.Route
import io.ktor.server.routing.route
import io.ktor.server.sse.sse
import io.ktor.sse.ServerSentEvent
import io.ktor.util.cio.ChannelWriteException
import io.ktor.utils.io.ClosedWriteChannelException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * How often a stream with nothing to say says so anyway.
 *
 * The first keep-alive is sent immediately, and that is the important one: the response commits
 * nothing until something is written, so a stream that waits for its first change sends no headers
 * at all. Anything in front of the server then decides the connection is dead — the Vite dev proxy
 * measured ten seconds, nginx defaults to sixty — and the browser silently reconnects for ever.
 * Five seconds keeps the stream inside both.
 */
private const val KEEP_ALIVE_INTERVAL_MS: Long = 5_000

/**
 * Open streams one account may hold. A browser keeps one per tab, so this is many tabs on several
 * devices; beyond it a stream is a connection held open for nothing.
 */
private const val MAX_STREAMS_PER_USER = 16

/** The comment line a keep-alive is made of; `EventSource.onmessage` never sees it. */
private const val KEEP_ALIVE = "keep-alive"

/**
 * One Server-Sent Events stream per signed-in user.
 *
 * It only ever says "this note moved to version N"; the client re-reads the note through the REST
 * endpoint it already uses. Writes stay on REST as well, so the channel is one-directional by
 * construction — which is why SSE fits better here than a WebSocket.
 */
fun Route.eventRoutes(bus: NoteEventBus, auth: AuthService) {
    val openStreams = ConcurrentHashMap<Int, AtomicInteger>()
    fun streamsOf(userId: Int): AtomicInteger = openStreams.computeIfAbsent(userId) { AtomicInteger() }

    route("/api/events") {
        // Authentication must run *before* the SSE handler: the plugin commits the response headers
        // as soon as the handler starts, so a check inside it would answer an anonymous caller with
        // an open `200` stream instead of a `401`.
        install(
            createRouteScopedPlugin("RequireSessionForEvents") {
                onCall { call ->
                    val user = call.requireUser(auth)
                    if (streamsOf(user.id).get() >= MAX_STREAMS_PER_USER) {
                        throw DomainException(
                            ErrorKind.TOO_MANY_REQUESTS,
                            ErrorKeys.REQUEST_TOO_MANY,
                            message = "Too many open event streams",
                        )
                    }
                }
            },
        )

        sse {
            val user = call.requireUser(auth)
            val streams = streamsOf(user.id)
            streams.incrementAndGet()
            try {
                mirrorToClient(bus.events(), user.id) { payload ->
                    if (payload == null) send(ServerSentEvent(comments = KEEP_ALIVE))
                    else send(ServerSentEvent(data = payload))
                }
            } finally {
                streams.decrementAndGet()
            }
        }
    }
}

/**
 * Copies the changes meant for one user into their stream, and treats a closed channel as the end of
 * that stream.
 *
 * That end is the normal one — the browser navigated away, reloaded, or went to sleep, and the next
 * write lands on a channel nobody is reading. Letting it escape logged an ERROR and answered an
 * already-finished stream with `500`, which is why the policy lives here instead of inside the route:
 * it takes a plain `send`, so the ending is testable without standing up an SSE session.
 *
 * A `null` line is a keep-alive: it goes out before the first change and every few seconds after, so
 * the response is committed at once and no proxy mistakes a quiet note for a dead connection.
 */
internal suspend fun mirrorToClient(
    events: Flow<NoteChangedEvent>,
    userId: Int,
    keepAliveEveryMs: Long = KEEP_ALIVE_INTERVAL_MS,
    send: suspend (String?) -> Unit,
) {
    try {
        coroutineScope {
            val keepAlive = launch { keepAlives(keepAliveEveryMs).collect { send(null) } }
            try {
                // Subscribed before the keep-alive gets a turn on purpose: `merge` would leave the
                // event stream unsubscribed until the next dispatch, and a change published in that
                // window is dropped.
                events.filter { event -> userId in event.audience }.collect { event ->
                    send(event.toPayload())
                }
            } finally {
                keepAlive.cancel()
            }
        }
    } catch (_: ClosedWriteChannelException) {
        // The client is gone.
    } catch (_: ChannelWriteException) {
        // Ktor wraps the same condition while flushing the response body.
    }
}

private fun keepAlives(everyMs: Long): Flow<String?> = flow {
    while (true) {
        emit(null)
        delay(everyMs)
    }
}

private fun NoteChangedEvent.toPayload(): String =
    """{"type":"note.changed","noteId":$noteId,"version":$version}"""
