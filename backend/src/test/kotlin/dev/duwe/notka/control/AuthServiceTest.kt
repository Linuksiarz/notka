package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import dev.duwe.notka.entity.persistence.SessionRepository
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AuthServiceTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    @Test
    fun registerCreatesAUserAndASession() {
        // given
        val email = "Ada@Example.com "

        // when
        val result = fixture.services.auth.register(email, "Ada Lovelace", "correct horse battery")
        val authenticated = fixture.services.auth.authenticate(result.token)

        // then
        assertEquals("ada@example.com", result.user.email)
        assertEquals(result.user.id, authenticated.id)
        assertTrue(result.token.length >= 43)
    }

    @Test
    fun duplicateEmailIsRejected() {
        // given
        fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.register("ADA@example.com", "Ada again", "correct horse battery")
        }

        // then
        assertEquals(ErrorKind.CONFLICT, failure.kind)
        assertEquals(ErrorKeys.AUTH_EMAIL_TAKEN, failure.key)
        assertEquals("ada@example.com", failure.params["email"])
    }

    @Test
    fun loginWithTheWrongPasswordFails() {
        // given
        fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.login("ada@example.com", "wrong password")
        }

        // then
        assertEquals(ErrorKind.UNAUTHORIZED, failure.kind)
        assertEquals(ErrorKeys.AUTH_INVALID_CREDENTIALS, failure.key)
    }

    @Test
    fun loginWithAnUnknownAccountFailsTheSameWay() {
        // given: no account exists

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.login("nobody@example.com", "correct horse battery")
        }

        // then
        assertEquals(ErrorKind.UNAUTHORIZED, failure.kind)
        assertEquals(ErrorKeys.AUTH_INVALID_CREDENTIALS, failure.key)
    }

    @Test
    fun logoutInvalidatesTheSession() {
        // given
        val result = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")

        // when
        fixture.services.auth.logout(result.token)

        // then
        val failure = assertFailsWith<DomainException> { fixture.services.auth.authenticate(result.token) }
        assertEquals(ErrorKind.UNAUTHORIZED, failure.kind)
        assertEquals(ErrorKeys.REQUEST_UNAUTHORIZED, failure.key)
    }

    @Test
    fun authenticateWithoutATokenIsUnauthorized() {
        // given: no session

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.auth.authenticate(null) }

        // then
        assertEquals(ErrorKind.UNAUTHORIZED, failure.kind)
        assertEquals(ErrorKeys.REQUEST_UNAUTHORIZED, failure.key)
    }

    @Test
    fun authenticateSlidesTheExpiryForward() {
        // given
        val sessions = SessionRepository(fixture.services.database)
        val result = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")
        val initial = assertNotNull(sessions.findByToken(AuthService.hashToken(result.token)))

        // when
        fixture.advanceDays(1)
        fixture.services.auth.authenticate(result.token)

        // then
        val slid = assertNotNull(sessions.findByToken(AuthService.hashToken(result.token)))
        assertTrue(slid.expiresAt > initial.expiresAt)
        assertEquals(fixture.now, slid.lastSeenAt)
    }

    @Test
    fun anExpiredSessionIsRejected() {
        // given
        val result = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")
        fixture.advanceDays(31)

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.auth.authenticate(result.token) }

        // then
        assertEquals(ErrorKind.UNAUTHORIZED, failure.kind)
        assertEquals(ErrorKeys.REQUEST_UNAUTHORIZED, failure.key)
    }

    @Test
    fun displayNameCanBeChanged() {
        // given
        val result = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")

        // when
        val updated = fixture.services.auth.updateProfile(result.user.id, result.token, "Ada L.", null, null)

        // then
        assertEquals("Ada L.", updated.displayName)
    }

    @Test
    fun changingThePasswordRequiresTheCurrentOne() {
        // given
        val result = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.updateProfile(result.user.id, result.token, null, "not the password", "a new secret")
        }

        // then
        assertEquals(ErrorKind.VALIDATION, failure.kind)
        assertEquals(ErrorKeys.AUTH_INVALID_CURRENT_PASSWORD, failure.key)
    }

    @Test
    fun changingThePasswordSignsOutEveryOtherSession() {
        // given
        val first = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")
        val second = fixture.services.auth.login("ada@example.com", "correct horse battery")

        // when
        fixture.services.auth.updateProfile(first.user.id, first.token, null, "correct horse battery", "a new secret")

        // then
        assertEquals(first.user.id, fixture.services.auth.authenticate(first.token).id)
        val signedOut = assertFailsWith<DomainException> { fixture.services.auth.authenticate(second.token) }
        assertEquals(ErrorKind.UNAUTHORIZED, signedOut.kind)
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.login("ada@example.com", "correct horse battery")
        }
        assertEquals(ErrorKeys.AUTH_INVALID_CREDENTIALS, failure.key)
    }

    @Test
    fun theDatabaseNeverHoldsTheCookieItself() {
        // given
        val sessions = SessionRepository(fixture.services.database)

        // when
        val result = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")

        // then
        assertNull(sessions.findByToken(result.token))
        assertNotNull(sessions.findByToken(AuthService.hashToken(result.token)))
    }

    @Test
    fun anEmptyProfilePatchIsRejected() {
        // given
        val result = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.updateProfile(result.user.id, result.token, null, null, null)
        }

        // then
        assertEquals(ErrorKind.VALIDATION, failure.kind)
        assertEquals(ErrorKeys.REQUEST_INVALID_BODY, failure.key)
    }

    @Test
    fun shortPasswordsAreRejected() {
        // given: nothing registered yet

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.register("ada@example.com", "Ada", "short")
        }

        // then
        assertEquals(ErrorKind.VALIDATION, failure.kind)
        assertEquals(ErrorKeys.AUTH_PASSWORD_TOO_SHORT, failure.key)
    }

    @Test
    fun malformedEmailsAreRejectedOnRegistration() {
        // given: nothing registered yet

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.register("not-an-email", "Ada", "correct horse battery")
        }

        // then
        assertEquals(ErrorKind.VALIDATION, failure.kind)
        assertEquals(ErrorKeys.AUTH_EMAIL_INVALID, failure.key)
    }

    @Test
    fun blankDisplayNamesAreRejected() {
        // given: nothing registered yet

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.register("ada@example.com", "  ", "correct horse battery")
        }

        // then
        assertEquals(ErrorKind.VALIDATION, failure.kind)
        assertEquals(ErrorKeys.AUTH_DISPLAY_NAME_INVALID, failure.key)
    }
}
