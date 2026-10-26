package dev.duwe.notka.entity.persistence

import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*

/** AES-GCM's own nonce size; every value sealed gets a fresh one. */
private const val NONCE_BYTES = 12
private const val TAG_BITS = 128
private const val KEY_BYTES = 32

/**
 * Encryption at rest, JDK only: AES-256-GCM, a random nonce in front of every ciphertext, and the
 * place a value is stored at (`notes.title:42`) as its associated data, so a sealed value copied into
 * another row or another note does not open there (`docs/ENCRYPTION.md`).
 */
object Sealing {
    private val random = SecureRandom()

    fun newKey(): SecretKey = keyOf(ByteArray(KEY_BYTES).also(random::nextBytes))

    fun keyOf(bytes: ByteArray): SecretKey {
        require(bytes.size == KEY_BYTES) { "An account key is $KEY_BYTES bytes" }
        return SecretKeySpec(bytes, "AES")
    }

    fun seal(key: SecretKey, plain: ByteArray, place: String): ByteArray {
        val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
        cipher.updateAAD(place.toByteArray(Charsets.UTF_8))
        return nonce + cipher.doFinal(plain)
    }

    /** Throws `AEADBadTagException` for the wrong key, a changed value or a value from another place. */
    fun open(key: SecretKey, sealed: ByteArray, place: String): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 0, NONCE_BYTES))
        cipher.updateAAD(place.toByteArray(Charsets.UTF_8))
        return cipher.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES)
    }

    fun sealText(key: SecretKey, text: String, place: String): String =
        Base64.getEncoder().encodeToString(seal(key, text.toByteArray(Charsets.UTF_8), place))

    fun openText(key: SecretKey, sealed: String, place: String): String =
        String(open(key, Base64.getDecoder().decode(sealed), place), Charsets.UTF_8)
}

/**
 * The keys of the accounts that are using the app, by account, in memory only. A request puts its
 * account's key here once the session has unlocked it, and the repositories take it from here to read
 * and write that account's sealed notes; a key nobody used for a while is let go
 * (`SessionCleanupJob`), and the next request of its account unlocks it again.
 */
class KeyRing(private val clock: () -> Long = System::currentTimeMillis) {
    private class Held(val key: SecretKey, @Volatile var usedAt: Long)

    private val held = ConcurrentHashMap<Int, Held>()

    fun hold(userId: Int, key: SecretKey) {
        held[userId] = Held(key, clock())
    }

    operator fun get(userId: Int): SecretKey? = held[userId]?.also { it.usedAt = clock() }?.key

    /** A sealed note is only ever read on behalf of its owner, whose request unlocked the key. */
    fun require(userId: Int): SecretKey =
        checkNotNull(get(userId)) { "The key of account $userId is not unlocked" }

    fun forget(userId: Int) {
        held.remove(userId)
    }

    /** Lets go of the keys nobody used for [idleMillis]; returns how many. */
    fun forgetIdle(idleMillis: Long): Int {
        val cutoff = clock() - idleMillis
        val idle = held.filterValues { it.usedAt < cutoff }.keys
        idle.forEach(held::remove)
        return idle.size
    }
}

/** The owner's key when [noteId] is sealed, `null` when it is stored in the clear. Inside a transaction. */
internal fun KeyRing.sealingKeyOf(noteId: Int): SecretKey? =
    Notes.join(SealedNotes, JoinType.LEFT, Notes.id, SealedNotes.noteId)
        .select(Notes.ownerId, SealedNotes.noteId)
        .where { Notes.id eq noteId }
        .singleOrNull()
        ?.takeIf { it.getOrNull(SealedNotes.noteId) != null }
        ?.let { require(it[Notes.ownerId]) }

/** Where each sealed value lives: the associated data that ties a ciphertext to its row's note. */
internal object SealedPlaces {
    fun noteTitle(noteId: Int) = "notes.title:$noteId"
    fun noteContent(noteId: Int) = "notes.content:$noteId"
    fun versionTitle(noteId: Int) = "note_versions.title:$noteId"
    fun versionContent(noteId: Int) = "note_versions.content:$noteId"
    fun step(noteId: Int) = "note_steps.step:$noteId"
    fun image(noteId: Int) = "note_images.data:$noteId"
}
