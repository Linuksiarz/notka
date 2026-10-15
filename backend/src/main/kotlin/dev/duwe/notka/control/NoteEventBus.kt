package dev.duwe.notka.control

import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

/**
 * In-memory fan-out telling clients that a note they can see has changed.
 *
 * It carries a version, never content: the client decides whether to re-read the note it already
 * knows how to fetch. Nothing is persisted, because a client that misses an event is caught by the
 * next one or by its own re-read on reconnect.
 *
 * This is per process. One container is the deployment model; several replicas would need a shared
 * bus (see `docs/COLLABORATION.md`).
 */
class NoteEventBus {
    private val logger = KotlinLogging.logger {}
    private val flow = MutableSharedFlow<NoteChangedEvent>(extraBufferCapacity = EVENT_BUFFER)

    /** Everyone with access to a note: its owner plus every collaborator. */
    fun events(): SharedFlow<NoteChangedEvent> = flow

    /**
     * Best effort by design: a dropped notification only means a client re-reads later than it
     * could have, and re-reading is idempotent.
     */
    fun publish(event: NoteChangedEvent) {
        if (!flow.tryEmit(event)) {
            logger.debug { "dropped note.changed for note ${event.noteId}" }
        }
    }

    companion object {
        private const val EVENT_BUFFER = 1024
    }
}

/** `audience` is the set of user ids allowed to see the note, so subscribers can filter cheaply. */
data class NoteChangedEvent(
    val noteId: Int,
    val version: Int,
    val audience: Set<Int>,
)
