package dev.duwe.notka.control

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PasswordHasherTest {
    @Test
    fun verifiesItsOwnHash() {
        // given
        val password = "correct horse battery"

        // when
        val encoded = PasswordHasher.hash(password)

        // then
        assertTrue(PasswordHasher.verify(password, encoded))
    }

    @Test
    fun rejectsWrongPassword() {
        // given
        val encoded = PasswordHasher.hash("correct horse battery")

        // when
        val verified = PasswordHasher.verify("correct horse batteru", encoded)

        // then
        assertFalse(verified)
    }

    @Test
    fun usesAFreshSaltForEveryHash() {
        // given
        val password = "correct horse battery"

        // when
        val first = PasswordHasher.hash(password)
        val second = PasswordHasher.hash(password)

        // then
        assertNotEquals(first, second)
        assertTrue(PasswordHasher.verify(password, first))
        assertTrue(PasswordHasher.verify(password, second))
    }

    @Test
    fun encodesAlgorithmIterationsSaltAndHash() {
        // given
        val password = "correct horse battery"

        // when
        val encoded = PasswordHasher.hash(password)

        // then
        val parts = encoded.split('$')
        assertEquals(4, parts.size)
        assertEquals("pbkdf2-sha256", parts[0])
        assertEquals(600_000, parts[1].toInt())
        assertTrue(parts[2].isNotEmpty())
        assertTrue(parts[3].isNotEmpty())
    }

    @Test
    fun rejectsMalformedEncodings() {
        // given
        val malformed = listOf("", "plain", "pbkdf2-sha256\$120000\$not-base64", "bcrypt\$1\$a\$b")

        // when
        val results = malformed.map { PasswordHasher.verify("correct horse battery", it) }

        // then
        assertTrue(results.none { it })
    }
}
