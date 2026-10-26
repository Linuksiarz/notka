package dev.duwe.notka.control

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * PBKDF2-HMAC-SHA256 with a per-user random salt, JDK only.
 * Encoded form: `pbkdf2-sha256$<iterations>$<salt-b64>$<hash-b64>`.
 */
object PasswordHasher {
    private const val ALGORITHM = "PBKDF2WithHmacSHA256"
    private const val PREFIX = "pbkdf2-sha256"
    /** OWASP's figure for PBKDF2-HMAC-SHA256 (Password Storage Cheat Sheet, 2023). */
    const val ITERATIONS = 600_000
    private const val KEY_LENGTH_BITS = 256
    private const val SALT_BYTES = 16
    private const val PARTS = 4

    private val random = SecureRandom()

    fun hash(password: String): String {
        val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
        val hash = derive(password, salt, ITERATIONS)
        val encoder = Base64.getEncoder()
        return "$PREFIX\$$ITERATIONS\$${encoder.encodeToString(salt)}\$${encoder.encodeToString(hash)}"
    }

    /** Constant-time verification; a malformed or unknown encoding is simply "not verified". */
    fun verify(password: String, encoded: String): Boolean {
        val parts = encoded.split('$')
        if (parts.size != PARTS || parts[0] != PREFIX) return false
        val iterations = parts[1].toIntOrNull() ?: return false
        if (iterations <= 0) return false
        val decoder = Base64.getDecoder()
        val salt = runCatching { decoder.decode(parts[2]) }.getOrNull() ?: return false
        val expected = runCatching { decoder.decode(parts[3]) }.getOrNull() ?: return false
        return MessageDigest.isEqual(expected, derive(password, salt, iterations))
    }

    /** The raw PBKDF2 output; also what an account's key is wrapped with (`AccountKeys`). */
    fun derive(password: String, salt: ByteArray, iterations: Int = ITERATIONS): ByteArray {
        val spec = PBEKeySpec(password.toCharArray(), salt, iterations, KEY_LENGTH_BITS)
        try {
            return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }
}
