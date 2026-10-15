package dev.duwe.notka.control

import dev.duwe.notka.RecordingMail
import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The administrator's account and what it does to the others. */
class AdministrationTest {
    private val mail = RecordingMail()
    private val fixture = TestFixture(mail = mail)

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    @Test
    fun theAdministratorSignsInWithAUsernameInAnyCase() {
        // given
        fixture.services.auth.createAdmin("Root", "a long admin password", email = null)

        // when
        val result = fixture.services.auth.login("ROOT", "a long admin password")

        // then
        assertEquals("root", result.user.username)
        assertNull(result.user.email)
        assertTrue(result.user.admin)
        assertTrue(fixture.services.auth.hasAdmin())
    }

    @Test
    fun anAddressIsNotAUsername() {
        // given: no fixtures required

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.auth.createAdmin("root@example.com", "a long admin password", email = null)
        }

        // then
        assertEquals(ErrorKeys.AUTH_USERNAME_INVALID, failure.key)
    }

    @Test
    fun aResetMailsALinkAndOnlyThenLocksTheOldPasswordOut() {
        // given
        val ada = fixture.registerUser()
        val laptop = fixture.services.auth.login("ada@example.com", "correct horse battery")

        // when
        fixture.services.admin.resetPassword(ada.id, "pl-PL")

        // then: the mail went to Ada, with a link under the public address
        val sent = mail.sent.single()
        assertEquals("ada@example.com", sent.to)
        assertEquals("pl-PL", sent.locale)
        assertTrue(sent.link.startsWith("https://notes.example.com/reset-password#"), sent.link)
        // and: her old password and her sessions no longer work
        assertFailsWith<DomainException> { fixture.services.auth.login("ada@example.com", "correct horse battery") }
        assertFailsWith<DomainException> { fixture.services.auth.authenticate(laptop.token) }

        // when: she follows the link
        val token = sent.link.substringAfter('#')
        val signedIn = fixture.services.auth.completePasswordReset(token, "a brand new password")

        // then: the new password works, and the link only worked once
        assertEquals(ada.id, signedIn.user.id)
        assertNotNull(fixture.services.auth.login("ada@example.com", "a brand new password"))
        val reused = assertFailsWith<DomainException> { fixture.services.auth.completePasswordReset(token, "yet another password") }
        assertEquals(ErrorKeys.AUTH_RESET_INVALID, reused.key)
    }

    @Test
    fun aResetLinkExpiresAfterADay() {
        // given
        val ada = fixture.registerUser()
        fixture.services.admin.resetPassword(ada.id, "en-US")
        val token = mail.sent.single().link.substringAfter('#')

        // when
        fixture.advanceDays(2)
        val failure = assertFailsWith<DomainException> { fixture.services.auth.completePasswordReset(token, "a brand new password") }

        // then
        assertEquals(ErrorKeys.AUTH_RESET_INVALID, failure.key)
    }

    @Test
    fun aMailServerThatRefusesLeavesTheAccountAsItWas() {
        // given
        val refusing = TestFixture(mail = RecordingMail(failing = true))
        val ada = refusing.registerUser()

        // when
        val failure = assertFailsWith<DomainException> { refusing.services.admin.resetPassword(ada.id, "en-US") }

        // then
        assertEquals(ErrorKeys.MAIL_SEND_FAILED, failure.key)
        assertNotNull(refusing.services.auth.login("ada@example.com", "correct horse battery"))
        refusing.close()
    }

    @Test
    fun withoutAMailServerAResetIsRefusedUpFront() {
        // given
        val silent = TestFixture(mail = null)
        val ada = silent.registerUser()

        // when
        val failure = assertFailsWith<DomainException> { silent.services.admin.resetPassword(ada.id, "en-US") }

        // then
        assertFalse(silent.services.admin.mailConfigured)
        assertEquals(ErrorKeys.MAIL_NOT_CONFIGURED, failure.key)
        silent.close()
    }

    @Test
    fun removingAnAccountTakesItsNotesButNotTheAdministrator() {
        // given
        val admin = fixture.services.auth.createAdmin("root", "a long admin password", email = null)
        val ada = fixture.registerUser()
        fixture.createNote(ada.id, title = "Mine")

        // when
        fixture.services.admin.deleteUser(ada.id)
        val refused = assertFailsWith<DomainException> { fixture.services.admin.deleteUser(admin.id) }

        // then
        assertEquals(ErrorKeys.ADMIN_CANNOT_CHANGE_ADMIN, refused.key)
        assertEquals(listOf(admin.id), fixture.services.admin.usage().map { it.user.id })
    }

    @Test
    fun usageCountsNotesHistoryAndPicturesPerOwner() {
        // given
        val ada = fixture.registerUser()
        val note = fixture.createNote(ada.id, title = "Trip")
        fixture.services.notes.patch(ada.id, note.note.id, PatchNoteCommand(title = "Trip to Crete", expectedVersion = note.note.version))

        // when
        val usage = fixture.services.admin.usage().single { it.user.id == ada.id }

        // then
        assertEquals(1, usage.notes)
        assertTrue(usage.noteBytes > "Trip to Crete".length, "${usage.noteBytes}")
        assertTrue(usage.historyBytes >= "Trip".length, "${usage.historyBytes}")
        assertEquals(0, usage.imageBytes)
        assertEquals(usage.noteBytes + usage.historyBytes, usage.totalBytes)
    }
}
