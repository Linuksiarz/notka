package dev.duwe.notka.control

import dev.duwe.notka.entity.persistence.KeyRing
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

const val SESSION_CLEANUP_INTERVAL_MILLIS: Long = 6L * 60L * 60L * 1000L

/** How long an account's key stays in memory after its last request; the next one unlocks it again. */
const val KEY_IDLE_MILLIS: Long = 60L * 60L * 1000L

/**
 * Removes expired sessions at startup and then every six hours. An expired session is already
 * refused at sign-in time; this keeps the table from growing with every device that never came back.
 * It also lets go of the account keys nobody used for [KEY_IDLE_MILLIS].
 */
class SessionCleanupJob(
    private val auth: AuthService,
    private val keys: KeyRing,
    private val intervalMillis: Long = SESSION_CLEANUP_INTERVAL_MILLIS,
) {
    private val logger = KotlinLogging.logger {}

    fun start(scope: CoroutineScope): Job = scope.launch(Dispatchers.IO) {
        while (isActive) {
            try {
                val removed = auth.purgeExpiredSessions()
                if (removed > 0) logger.info { "Removed $removed expired session(s)" }
                keys.forgetIdle(KEY_IDLE_MILLIS)
            } catch (failure: Exception) {
                logger.error(failure) { "Session cleanup run failed; retrying on the next interval" }
            }
            delay(intervalMillis)
        }
    }
}
