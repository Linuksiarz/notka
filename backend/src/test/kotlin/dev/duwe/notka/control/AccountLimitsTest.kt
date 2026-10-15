package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** What one account may do to an instance: sign up, keep sessions, and how much it may store. */
class AccountLimitsTest {
    @Test
    fun signUpStartsClosedAndTheAdministratorOpensIt() {
        // given: an instance as it is created, before anybody touched its settings
        val fixture = TestFixture(registrationOpen = false)
        val openBefore = fixture.services.settings.registrationOpen()

        // when
        fixture.services.settings.setRegistrationOpen(true)

        // then
        assertFalse(openBefore)
        assertTrue(fixture.services.settings.registrationOpen())
        fixture.close()
    }

    @Test
    fun expiredSessionsArePurgedAndLiveOnesKept() {
        // given
        val fixture = TestFixture()
        val stale = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")
        fixture.advanceDays(31)
        val fresh = fixture.services.auth.login("ada@example.com", "correct horse battery")

        // when
        val removed = fixture.services.auth.purgeExpiredSessions()

        // then
        assertEquals(1, removed)
        assertEquals(stale.user.id, fixture.services.auth.authenticate(fresh.token).id)
        fixture.close()
    }

    @Test
    fun loggingOutEverywhereEndsEverySession() {
        // given
        val fixture = TestFixture()
        val first = fixture.services.auth.register("ada@example.com", "Ada", "correct horse battery")
        val second = fixture.services.auth.login("ada@example.com", "correct horse battery")

        // when
        fixture.services.auth.logoutEverywhere(first.user.id)

        // then
        listOf(first.token, second.token).forEach { token ->
            val failure = assertFailsWith<DomainException> { fixture.services.auth.authenticate(token) }
            assertEquals(ErrorKind.UNAUTHORIZED, failure.kind)
        }
        fixture.close()
    }

    @Test
    fun anAccountCannotOwnMoreNotesThanTheLimit() {
        // given
        val fixture = TestFixture(maxNotesPerUser = 2)
        val user = fixture.registerUser()
        val first = fixture.createNote(user.id)
        fixture.createNote(user.id)

        // when
        val created = runCatching { fixture.createNote(user.id) }.exceptionOrNull()
        val copied = runCatching { fixture.services.notes.copy(user.id, first.note.id) }.exceptionOrNull()

        // then
        listOf(created, copied).forEach { failure ->
            assertEquals(ErrorKeys.NOTE_LIMIT_REACHED, (failure as DomainException).key)
            assertEquals(ErrorKind.FORBIDDEN, failure.kind)
        }
        fixture.close()
    }

    @Test
    fun anAccountCannotCreateMoreLabelsThanTheLimit() {
        // given
        val fixture = TestFixture()
        val user = fixture.registerUser()
        repeat(MAX_LABELS_PER_USER) { fixture.services.labels.create(user.id, "label $it") }

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.labels.create(user.id, "one more") }

        // then
        assertEquals(ErrorKeys.LABEL_LIMIT_REACHED, failure.key)
        fixture.close()
    }
}
