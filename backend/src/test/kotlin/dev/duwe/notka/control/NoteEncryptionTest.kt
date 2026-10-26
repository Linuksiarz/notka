package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.NoteBlock
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteSpan
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.sql.DriverManager
import javax.imageio.ImageIO
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val PASSWORD = "correct horse battery"
private const val SECRET = "launch codes"

class NoteEncryptionTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private fun text(value: String) = NoteDocument(blocks = listOf(NoteBlock(id = "b1", type = "paragraph", spans = listOf(NoteSpan(value)))))

    private fun register(email: String = "ada@example.com"): AuthResult = fixture.services.auth.register(email, "Ada", PASSWORD)

    private fun encrypting(email: String = "ada@example.com"): Pair<AuthResult, String> {
        val account = register(email)
        return account to fixture.services.encryption.enable(account.user.id, PASSWORD, account.token)
    }

    private fun secretNote(ownerId: Int, document: NoteDocument = text(SECRET)) =
        fixture.services.notes.create(ownerId, CreateNoteCommand(title = "Plan", document = document))

    /** Every text and blob the database file holds, the way an administrator opening it would read them. */
    private fun stored(): String = DriverManager.getConnection("jdbc:sqlite:${fixture.config.dbPath}").use { connection ->
        listOf(
            "SELECT title || content FROM notes",
            "SELECT title || content FROM note_versions",
            "SELECT step FROM note_steps",
            "SELECT CAST(data AS TEXT) FROM note_images",
        ).joinToString("\n") { query ->
            connection.createStatement().use { statement ->
                statement.executeQuery(query).use { rows ->
                    generateSequence { if (rows.next()) rows.getString(1) else null }.joinToString("\n")
                }
            }
        }
    }

    private fun png(): ByteArray = ByteArrayOutputStream()
        .also { ImageIO.write(BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "png", it) }
        .toByteArray()

    @Test
    fun aPrivateNoteIsStoredEncryptedAndReadInTheClear() {
        // given
        val (ada, _) = encrypting()

        // when
        val note = secretNote(ada.user.id)

        // then
        assertFalse(SECRET in stored())
        assertFalse("Plan" in stored())
        val read = fixture.services.notes.get(ada.user.id, note.note.id)
        assertEquals("Plan", read.note.title)
        assertEquals(SECRET, read.note.document.blocks.single().spans.single().text)
        assertEquals(NoteProtection.ENCRYPTED, read.protection)
    }

    @Test
    fun turningEncryptionOnSealsWhatWasWrittenBeforeHistoryIncluded() {
        // given
        val ada = register()
        val note = secretNote(ada.user.id)
        fixture.services.notes.patch(ada.user.id, note.note.id, PatchNoteCommand(title = "Plan B"))
        assertTrue(SECRET in stored())

        // when
        fixture.services.encryption.enable(ada.user.id, PASSWORD, ada.token)

        // then
        assertFalse(SECRET in stored())
        assertEquals("Plan", fixture.services.notes.history(ada.user.id, note.note.id).single().version.title)
    }

    @Test
    fun theTextANoteHadBeforeItWasSealedIsNotLeftInTheFile() {
        // given: a note rewritten in the clear many times, longer and shorter, which leaves old copies
        // of its row in the file's free space
        val ada = register()
        val note = secretNote(ada.user.id)
        (1..30).forEach { round ->
            val body = text("$SECRET ".repeat(if (round % 2 == 0) 400 else 3))
            fixture.services.notes.patch(ada.user.id, note.note.id, PatchNoteCommand(document = body))
        }

        // when
        fixture.services.encryption.enable(ada.user.id, PASSWORD, ada.token)
        transaction(fixture.services.database) { exec("PRAGMA wal_checkpoint(TRUNCATE)") }

        // then: neither the rows nor the pages they were freed from hold it
        val file = java.io.File(fixture.config.dbPath).readBytes().toString(Charsets.ISO_8859_1)
        assertFalse(SECRET in file)
    }

    @Test
    fun withoutEncryptionTheLockSaysItIsOff() {
        // given
        val ada = register()

        // when
        val note = secretNote(ada.user.id)

        // then
        assertEquals(NoteProtection.DISABLED, note.protection)
        assertTrue(SECRET in stored())
    }

    @Test
    fun stepsAndPicturesAreSealedWithTheirNote() {
        // given
        val (ada, _) = encrypting()
        val note = secretNote(ada.user.id)
        val picture = png()

        // when
        fixture.services.notes.submitSteps(
            ada.user.id,
            note.note.id,
            SubmitStepsCommand(docVersion = 0, clientId = "ada", steps = listOf("""{"text":"$SECRET"}"""), document = text(SECRET)),
        )
        val withPicture = fixture.services.notes.addImage(ada.user.id, note.note.id, picture)

        // then
        assertFalse(SECRET in stored())
        assertFalse("IHDR" in stored())
        assertEquals("""{"text":"$SECRET"}""", fixture.services.notes.stepsSince(ada.user.id, note.note.id, 0).steps?.single()?.step)
        val (_, bytes) = fixture.services.notes.imageBytes(ada.user.id, note.note.id, withPicture.images.single().id)
        assertContentEquals(picture, bytes)
    }

    @Test
    fun sharingStoresTheNoteInTheClearAndTheLastShareGoingSealsItAgain() {
        // given
        val (ada, _) = encrypting()
        val bob = register("bob@example.com")
        val note = secretNote(ada.user.id)

        // when
        fixture.share(note.note.id, ada.user.id, "bob@example.com")

        // then
        assertTrue(SECRET in stored())
        assertEquals(NoteProtection.SHARED, fixture.services.notes.get(ada.user.id, note.note.id).protection)
        assertEquals(NoteProtection.SHARED, fixture.services.notes.get(bob.user.id, note.note.id).protection)

        // when
        fixture.services.sharing.remove(ada.user.id, note.note.id, bob.user.id)

        // then
        assertFalse(SECRET in stored())
        assertEquals(NoteProtection.ENCRYPTED, fixture.services.notes.get(ada.user.id, note.note.id).protection)
    }

    @Test
    fun aNoteWithLinksIsSealedOnlyOnceLinkPreviewsAreOff() {
        // given
        val (ada, _) = encrypting()
        val note = secretNote(ada.user.id, text("$SECRET at https://example.com/plan"))

        // then: the server reads the link for its card
        assertEquals(NoteProtection.LINK_PREVIEWS, note.protection)
        assertTrue(SECRET in stored())

        // when
        fixture.services.encryption.setLinkPreviews(ada.user.id, false)

        // then
        assertFalse(SECRET in stored())
        val read = fixture.services.notes.get(ada.user.id, note.note.id)
        assertEquals(NoteProtection.ENCRYPTED, read.protection)
        assertTrue(read.linkPreviews.isEmpty())
        assertFalse(fixture.services.encryption.settings(ada.user.id).linkPreviews)
    }

    @Test
    fun aSessionOpensTheNotesAfterTheKeyWasLetGo() {
        // given: a server that restarted, or a key nobody used for a while
        val (ada, _) = encrypting()
        val note = secretNote(ada.user.id)
        fixture.services.keyRing.forget(ada.user.id)

        // when
        fixture.services.auth.authenticate(ada.token)

        // then
        assertEquals("Plan", fixture.services.notes.get(ada.user.id, note.note.id).note.title)
    }

    @Test
    fun turningEncryptionOnSignsTheOtherDevicesOut() {
        // given
        val ada = register()
        val phone = fixture.services.auth.login("ada@example.com", PASSWORD)

        // when
        fixture.services.encryption.enable(ada.user.id, PASSWORD, ada.token)

        // then
        assertFailsWith<DomainException> { fixture.services.auth.authenticate(phone.token) }
        assertEquals(ada.user.id, fixture.services.auth.authenticate(ada.token).id)
    }

    @Test
    fun turningEncryptionOnAsksForThePassword() {
        // given
        val ada = register()

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.encryption.enable(ada.user.id, "not the password", ada.token) }

        // then
        assertEquals(ErrorKeys.AUTH_INVALID_CURRENT_PASSWORD, failure.key)
        assertFalse(fixture.services.encryption.settings(ada.user.id).encryption)
    }

    @Test
    fun turningEncryptionOffStoresEveryNoteInTheClear() {
        // given
        val (ada, _) = encrypting()
        val note = secretNote(ada.user.id)

        // when
        fixture.services.encryption.disable(ada.user.id)

        // then
        assertTrue(SECRET in stored())
        assertEquals(NoteProtection.DISABLED, fixture.services.notes.get(ada.user.id, note.note.id).protection)
        assertFalse(fixture.services.encryption.settings(ada.user.id).encryption)
    }

    @Test
    fun aSignInWithTheNewPasswordOpensTheNotesAfterAChange() {
        // given
        val (ada, _) = encrypting()
        val note = secretNote(ada.user.id)
        fixture.services.auth.updateProfile(ada.user.id, ada.token, null, PASSWORD, "a brand new password")
        fixture.services.keyRing.forget(ada.user.id)

        // when
        val signedIn = fixture.services.auth.login("ada@example.com", "a brand new password")
        fixture.services.keyRing.forget(ada.user.id)
        fixture.services.auth.authenticate(signedIn.token)

        // then
        assertEquals("Plan", fixture.services.notes.get(ada.user.id, note.note.id).note.title)
    }

    @Test
    fun aPasswordResetKeepsTheNotesWithTheRecoveryKey() {
        // given
        val (ada, recoveryKey) = encrypting()
        val note = secretNote(ada.user.id)
        val reset = fixture.services.auth.issuePasswordReset(ada.user.id)
        fixture.services.keyRing.forget(ada.user.id)

        // when: written down by hand, in lower case and without its dashes
        val signedIn = fixture.services.auth.completePasswordReset(reset, "a brand new password", recoveryKey.lowercase().replace("-", ""))
        fixture.services.keyRing.forget(ada.user.id)
        fixture.services.auth.authenticate(signedIn.token)

        // then
        assertEquals("Plan", fixture.services.notes.get(ada.user.id, note.note.id).note.title)
    }

    @Test
    fun aPasswordResetWithoutTheRecoveryKeyDeletesTheSealedNotesOnlyWhenAskedTo() {
        // given
        val (ada, _) = encrypting()
        val bob = register("bob@example.com")
        val sealed = secretNote(ada.user.id)
        val shared = secretNote(ada.user.id).also { fixture.share(it.note.id, ada.user.id, "bob@example.com") }
        val reset = fixture.services.auth.issuePasswordReset(ada.user.id)

        // when
        val refused = assertFailsWith<DomainException> { fixture.services.auth.completePasswordReset(reset, "a brand new password") }
        val wrong = assertFailsWith<DomainException> {
            fixture.services.auth.completePasswordReset(reset, "a brand new password", "0000-0000-0000-0000-0000-0000-0000-0000")
        }

        // then
        assertEquals(ErrorKeys.AUTH_RECOVERY_KEY_REQUIRED, refused.key)
        assertEquals(ErrorKeys.AUTH_RECOVERY_KEY_INVALID, wrong.key)
        assertNotNull(fixture.services.notes.get(ada.user.id, sealed.note.id))

        // when
        fixture.services.auth.completePasswordReset(reset, "a brand new password", discardEncrypted = true)

        // then: only what nobody can open any more is gone
        assertFailsWith<DomainException> { fixture.services.notes.get(ada.user.id, sealed.note.id) }
        assertEquals("Plan", fixture.services.notes.get(bob.user.id, shared.note.id).note.title)
        assertFalse(fixture.services.encryption.settings(ada.user.id).encryption)
    }

    @Test
    fun aStrangerAskingForASealedNoteGetsNotFoundEvenWithTheKeyLetGo() {
        // given
        val (ada, _) = encrypting()
        val eve = register("eve@example.com")
        val note = secretNote(ada.user.id)
        fixture.services.keyRing.forget(ada.user.id)

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.notes.get(eve.user.id, note.note.id) }

        // then
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
    }

    @Test
    fun aRecoveryKeyReadsBackAsWrittenDown() {
        // given
        val bytes = ByteArray(20) { (it * 37).toByte() }

        // when
        val written = AccountKeys.formatRecoveryKey(bytes)

        // then
        assertEquals(39, written.length)
        assertContentEquals(bytes, AccountKeys.parseRecoveryKey(written))
        assertContentEquals(bytes, AccountKeys.parseRecoveryKey(written.lowercase().replace('0', 'o').replace("-", " ")))
        assertNull(AccountKeys.parseRecoveryKey(written.dropLast(1)))
    }

    @Test
    fun freedPagesAreOverwritten() {
        // given: no fixtures required

        // when
        val secureDelete = transaction(fixture.services.database) {
            exec("PRAGMA secure_delete") { rows -> rows.next(); rows.getInt(1) }
        }

        // then
        assertEquals(1, secureDelete)
    }
}
