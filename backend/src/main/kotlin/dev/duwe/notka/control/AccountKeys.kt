package dev.duwe.notka.control

import dev.duwe.notka.entity.persistence.AccountKeyRepository
import dev.duwe.notka.entity.persistence.KeyRing
import dev.duwe.notka.entity.persistence.KeyWrap
import dev.duwe.notka.entity.persistence.KeyWrapKind
import dev.duwe.notka.entity.persistence.NoteRepository
import dev.duwe.notka.entity.persistence.Sealing
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.AEADBadTagException
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

/** The recovery key's randomness: 160 bits, 32 characters to write down. */
private const val RECOVERY_KEY_BYTES = 20
private const val RECOVERY_GROUP_LENGTH = 4
private const val SALT_BYTES = 16

/**
 * An account's own key (`docs/ENCRYPTION.md`). It is made when the account turns encryption on and
 * stored only wrapped: by a key derived from the password or, for an account without one, a passphrase
 * (PBKDF2, like the password's hash but with a salt of its own, so the stored hash does not open it),
 * by the recovery key, and — for each
 * session — by a key derived from the session's cookie, which only the browser has. A request unlocks
 * it from its session into the [KeyRing], where the repositories find it.
 */
class AccountKeys(
    private val keys: AccountKeyRepository,
    private val ring: KeyRing,
    private val notes: NoteRepository,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    companion object {
        private val random = SecureRandom()

        /** Crockford's base32: no I, L, O or U, so what is written down reads back the same. */
        private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

        fun formatRecoveryKey(bytes: ByteArray): String {
            val bits = bytes.joinToString("") { (it.toInt() and 0xFF).toString(2).padStart(8, '0') }
            return bits.chunked(5).joinToString("") { ALPHABET[it.padEnd(5, '0').toInt(2)].toString() }
                .chunked(RECOVERY_GROUP_LENGTH).joinToString("-")
        }

        /** Forgiving about case, dashes, spaces and the letters people read as digits; `null` when it is not one. */
        fun parseRecoveryKey(text: String): ByteArray? {
            val symbols = text.uppercase().filter { it.isLetterOrDigit() }
                .replace('O', '0').replace('I', '1').replace('L', '1')
            if (symbols.length != (RECOVERY_KEY_BYTES * 8 + 4) / 5 || symbols.any { it !in ALPHABET }) return null
            val bits = symbols.map { ALPHABET.indexOf(it).toString(2).padStart(5, '0') }.joinToString("")
            return bits.chunked(8).take(RECOVERY_KEY_BYTES).map { it.toInt(2).toByte() }.toByteArray()
        }

        private fun hmacKey(secret: ByteArray, purpose: String): SecretKey {
            val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret, "HmacSHA256")) }
            return Sealing.keyOf(mac.doFinal(purpose.toByteArray(Charsets.UTF_8)))
        }

        /** A session's cookie is 256 random bits: one HMAC turns it into a key, no stretching needed. */
        private fun sessionKey(token: String): SecretKey = hmacKey(token.toByteArray(Charsets.UTF_8), "notka session key")

        private fun recoveryKey(bytes: ByteArray): SecretKey = hmacKey(bytes, "notka recovery key")

        private fun secretKey(secret: String, salt: ByteArray): SecretKey =
            Sealing.keyOf(PasswordHasher.derive(secret, salt))

        private fun place(userId: Int, kind: String) = "account_key:$userId:$kind"
    }

    fun enabled(userId: Int): Boolean = keys.hasKey(userId)

    /** The account's key while one of its requests unlocked it recently; `null` for an account without one. */
    fun unlocked(userId: Int): SecretKey? = ring[userId]

    /**
     * Makes the account's key, wraps it for [secret] — its password, or the passphrase of an account
     * without one — and for a new recovery key, and unlocks it in the session of [token]. Returns the
     * recovery key — the only time it ever exists outside a wrap.
     */
    fun create(userId: Int, kind: KeyWrapKind, secret: String, token: String): String {
        check(!keys.hasKey(userId)) { "Account $userId already has a key" }
        val key = Sealing.newKey()
        val recovery = ByteArray(RECOVERY_KEY_BYTES).also(random::nextBytes)
        keys.putWrap(userId, secretWrap(userId, kind, key, secret), clock())
        keys.putWrap(userId, KeyWrap(KeyWrapKind.RECOVERY, null, wrap(recoveryKey(recovery), key, place(userId, "RECOVERY"))), clock())
        intoSession(userId, key, token)
        return formatRecoveryKey(recovery)
    }

    /** Forgets the account's key everywhere; its notes must have been opened first. */
    fun destroy(userId: Int) {
        keys.deleteAll(userId)
        ring.forget(userId)
    }

    /** After a sign-in with a verified [password]: the new session of [token] holds the key. */
    fun unlockWithPassword(userId: Int, password: String, token: String) {
        val wrap = keys.wraps(userId)[KeyWrapKind.PASSWORD] ?: return
        intoSession(userId, openWrap(userId, wrap, password), token)
    }

    /**
     * A session that came from the identity provider holds no key until the account's own secret is
     * entered on that device: the provider vouches for who is asking, and never opens the notes.
     *
     * @return false when [secret] does not open the key.
     */
    fun unlockWithSecret(userId: Int, secret: String, token: String): Boolean {
        val wrap = keys.wraps(userId).let { it[KeyWrapKind.PASSPHRASE] ?: it[KeyWrapKind.PASSWORD] } ?: return false
        val key = try {
            openWrap(userId, wrap, secret)
        } catch (_: AEADBadTagException) {
            return false
        }
        intoSession(userId, key, token)
        return true
    }

    /**
     * Every request: whether the session of [token] may read the account's notes, and the key in
     * memory when it may. The answer is the session's own, never the [KeyRing]'s, which holds the key
     * of an account some other device unlocked.
     *
     * @return false for a session of an account with a key that holds none — it stays locked until
     *   the account's secret is entered ([unlockWithSecret]).
     */
    fun unlockSession(userId: Int, token: String): Boolean {
        val wrapped = keys.sessionKey(AuthService.hashToken(token)) ?: return !keys.hasKey(userId)
        if (ring[userId] == null) ring.hold(userId, unwrap(sessionKey(token), wrapped, place(userId, "SESSION")))
        return true
    }

    /** A changed password wraps the same key; the recovery key and the sessions' copies stay. */
    fun rewrapPassword(userId: Int, newPassword: String) {
        if (!keys.hasKey(userId)) return
        keys.putWrap(userId, secretWrap(userId, KeyWrapKind.PASSWORD, ring.require(userId), newPassword), clock())
    }

    /** Whether [passphrase] is the one that wraps the account's key. */
    fun passphraseMatches(userId: Int, passphrase: String): Boolean {
        val wrap = keys.wraps(userId)[KeyWrapKind.PASSPHRASE] ?: return false
        return try {
            openWrap(userId, wrap, passphrase)
            true
        } catch (_: AEADBadTagException) {
            false
        }
    }

    /** A changed passphrase wraps the same key, as a changed password does. */
    fun rewrapPassphrase(userId: Int, newPassphrase: String) {
        keys.putWrap(userId, secretWrap(userId, KeyWrapKind.PASSPHRASE, ring.require(userId), newPassphrase), clock())
    }

    /** After the recovery key opened [key]: a new passphrase wraps it, and the session of [token] holds it. */
    fun adoptPassphrase(userId: Int, key: SecretKey, newPassphrase: String, token: String) {
        keys.putWrap(userId, secretWrap(userId, KeyWrapKind.PASSPHRASE, key, newPassphrase), clock())
        intoSession(userId, key, token)
    }

    /** After the recovery key opened [key] on an account whose password still stands. */
    fun adoptIntoSession(userId: Int, key: SecretKey, token: String) = intoSession(userId, key, token)

    /** The account's key opened with a written-down recovery key, or `null` when it does not open it. */
    fun openWithRecoveryKey(userId: Int, recoveryKey: String): SecretKey? {
        val bytes = parseRecoveryKey(recoveryKey) ?: return null
        val wrap = keys.wraps(userId)[KeyWrapKind.RECOVERY] ?: return null
        return try {
            unwrap(recoveryKey(bytes), wrap.wrapped, place(userId, "RECOVERY"))
        } catch (_: AEADBadTagException) {
            null
        }
    }

    /** After a reset with the recovery key: the new password wraps [key], and the session of [token] holds it. */
    fun adoptPassword(userId: Int, key: SecretKey, newPassword: String, token: String) {
        keys.putWrap(userId, secretWrap(userId, KeyWrapKind.PASSWORD, key, newPassword), clock())
        intoSession(userId, key, token)
    }

    /**
     * A reset without the recovery key: the sealed notes can never be opened again, so they go, and
     * the account starts without encryption.
     */
    fun discard(userId: Int) {
        notes.deleteSealedOwnedBy(userId)
        destroy(userId)
    }

    /** Lets go of the key in memory; the next request of the account unlocks it again from its session. */
    fun lock(userId: Int) {
        ring.forget(userId)
    }

    private fun intoSession(userId: Int, key: SecretKey, token: String) {
        keys.putSessionKey(AuthService.hashToken(token), wrap(sessionKey(token), key, place(userId, "SESSION")))
        ring.hold(userId, key)
    }

    private fun secretWrap(userId: Int, kind: KeyWrapKind, key: SecretKey, secret: String): KeyWrap {
        val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
        return KeyWrap(
            kind,
            Base64.getEncoder().encodeToString(salt),
            wrap(secretKey(secret, salt), key, place(userId, kind.name)),
        )
    }

    private fun openWrap(userId: Int, wrap: KeyWrap, secret: String): SecretKey {
        val salt = Base64.getDecoder().decode(checkNotNull(wrap.salt) { "A ${wrap.kind} wrap carries its salt" })
        return unwrap(secretKey(secret, salt), wrap.wrapped, place(userId, wrap.kind.name))
    }

    private fun wrap(wrapping: SecretKey, key: SecretKey, place: String): String =
        Base64.getEncoder().encodeToString(Sealing.seal(wrapping, key.encoded, place))

    private fun unwrap(wrapping: SecretKey, wrapped: String, place: String): SecretKey =
        Sealing.keyOf(Sealing.open(wrapping, Base64.getDecoder().decode(wrapped), place))
}
