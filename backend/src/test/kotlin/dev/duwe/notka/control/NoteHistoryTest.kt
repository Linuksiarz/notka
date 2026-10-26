package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.BackgroundChange
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.persistence.NoteVersionRepository
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Version history, as in Google Keep: previous states of a note are kept so an overwritten text can
 * be read back or downloaded.
 *
 * Only content is versioned. Appearance belongs to the note, so recolouring it is not a historic
 * event and must not fill the history with noise.
 */
class NoteHistoryTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private fun documentWith(text: String) = NoteDocument.parse(
        """{"version":1,"blocks":[{"id":"b1","type":"paragraph","spans":[{"text":"$text"}]}]}""",
    )

    @Test
    fun aContentWriteArchivesTheStateItReplaced() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, title = "Groceries")

        // when
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "Shopping"))

        // then: the state before the write is the archived one
        val history = fixture.services.notes.history(owner.id, note.note.id)
        assertEquals(1, history.size)
        assertEquals("Groceries", history.single().version.title)
        assertEquals(1, history.single().version.version)
        assertEquals(owner.id, history.single().author.id)
    }

    @Test
    fun aContentWriteThatOnlyChangesTheBodyIsArchived() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, document = documentWith("first"))

        // when
        fixture.services.notes.patch(
            owner.id,
            note.note.id,
            PatchNoteCommand(document = documentWith("second")),
        )

        // then
        val archived = fixture.services.notes.history(owner.id, note.note.id).single().version
        assertEquals("first", archived.document.blocks.single().spans.single().text)
    }

    @Test
    fun anAppearanceChangeIsNotArchived() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)

        // when
        fixture.services.notes.patch(
            owner.id,
            note.note.id,
            PatchNoteCommand(color = "teal", background = BackgroundChange.Set("travel")),
        )

        // then: colour is not part of history
        assertTrue(fixture.services.notes.history(owner.id, note.note.id).isEmpty())
    }

    @Test
    fun historyIsNewestFirstAndEachEntryIsReadable() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, title = "one")
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "two"))
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "three"))

        // when
        val history = fixture.services.notes.history(owner.id, note.note.id)
        val oldest = fixture.services.notes.historyEntry(owner.id, note.note.id, 1)

        // then
        assertEquals(listOf(2, 1), history.map { it.version.version })
        assertEquals("two", history.first().version.title)
        assertEquals("one", oldest.version.title)
    }

    @Test
    fun aViewCollaboratorCanReadTheHistory() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id, title = "shared")
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "edited"))

        // when
        val history = fixture.services.notes.history(viewer.id, note.note.id)

        // then
        assertEquals("shared", history.single().version.title)
    }

    @Test
    fun aStrangerSeesNoHistory() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val stranger = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.history(stranger.id, note.note.id)
        }

        // then
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
    }

    @Test
    fun anUnknownVersionNumberIsReported() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.historyEntry(owner.id, note.note.id, 99)
        }

        // then
        assertEquals(ErrorKeys.NOTE_VERSION_NOT_FOUND, failure.key)
        assertEquals("99", failure.params.getValue("version"))
    }

    @Test
    fun historyIsCappedAndDropsTheOldestFirst() {
        // given: a note edited more often than the cap allows
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, title = "v1")
        repeat(55) { index ->
            fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "v${index + 2}"))
        }

        // when
        val history = fixture.services.notes.history(owner.id, note.note.id)

        // then
        assertEquals(50, history.size)
        assertEquals(55, history.first().version.version)
        assertEquals(6, history.last().version.version)
    }

    @Test
    fun deletingANoteTakesItsHistoryWithIt() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, title = "doomed")
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "edited"))
        val versions = NoteVersionRepository(fixture.services.database, fixture.services.keyRing)
        assertEquals(1, versions.listForNote(note.note.id).size)

        // when
        fixture.services.notes.deletePermanently(owner.id, note.note.id)

        // then
        assertTrue(versions.listForNote(note.note.id).isEmpty())
    }
}
