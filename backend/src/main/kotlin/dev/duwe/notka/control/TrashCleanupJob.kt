package dev.duwe.notka.control

import dev.duwe.notka.entity.persistence.NoteRepository
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

const val TRASH_CLEANUP_INTERVAL_MILLIS: Long = 6L * 60L * 60L * 1000L

/**
 * Purges trashed notes once they are older than the retention window. Runs immediately at startup
 * and then every six hours; a failed run is logged and the loop keeps going.
 */
class TrashCleanupJob(
    private val notes: NoteRepository,
    private val retentionMillis: Long,
    private val clock: () -> Long = System::currentTimeMillis,
    private val intervalMillis: Long = TRASH_CLEANUP_INTERVAL_MILLIS,
) {
    private val logger = KotlinLogging.logger {}

    /** Returns how many notes were permanently deleted. */
    fun purgeExpired(now: Long = clock()): Int {
        val deleted = notes.purgeTrashedBefore(now - retentionMillis)
        if (deleted > 0) logger.info { "Purged $deleted note(s) from the trash" }
        return deleted
    }

    fun start(scope: CoroutineScope): Job = scope.launch(Dispatchers.IO) {
        while (isActive) {
            try {
                purgeExpired()
            } catch (failure: Exception) {
                logger.error(failure) { "Trash cleanup run failed; retrying on the next interval" }
            }
            delay(intervalMillis)
        }
    }
}
