package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.NoteView
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Folding a list's "N completed items" is the reader's own, like a pin: the owner's correction of
 * Google Keep, which keeps it on the note and folds a shared list for everybody. It is never
 * version-guarded, never a history entry and never an edit, and nobody else is told.
 */
class NoteCompletedSectionTest {
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
    fun aNewNoteShowsItsCompletedItems() {
        // given
        val owner = fixture.registerUser()

        // when
        val note = fixture.createNote(owner.id, kind = "LIST")

        // then
        assertEquals(false, note.completedCollapsed)
    }

    @Test
    fun aFoldIsRememberedForTheReader() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, kind = "LIST")

        // when
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(completedCollapsed = true))

        // then: the note reads back folded, alone and in its view
        assertEquals(true, fixture.services.notes.get(owner.id, note.note.id).completedCollapsed)
        assertEquals(listOf(true), fixture.services.notes.list(owner.id, NoteView.ACTIVE).map { it.completedCollapsed })
    }

    @Test
    fun unfoldingOpensTheSectionAgain() {
        // given: a folded list
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, kind = "LIST")
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(completedCollapsed = true))

        // when
        val unfolded = fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(completedCollapsed = false))

        // then
        assertEquals(false, unfolded.completedCollapsed)
    }

    @Test
    fun aFoldIsTheReadersOwn() {
        // given: a list shared with a collaborator
        val owner = fixture.registerUser(email = "ada@example.com")
        val collaborator = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id, kind = "LIST")
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when: the collaborator folds it
        fixture.services.notes.patch(collaborator.id, note.note.id, PatchNoteCommand(completedCollapsed = true))

        // then: it is folded for the collaborator and not for the owner
        assertEquals(true, fixture.services.notes.get(collaborator.id, note.note.id).completedCollapsed)
        assertEquals(false, fixture.services.notes.get(owner.id, note.note.id).completedCollapsed)
    }

    @Test
    fun aViewerCanFoldForThemself() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id, kind = "LIST")
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when
        val folded = fixture.services.notes.patch(viewer.id, note.note.id, PatchNoteCommand(completedCollapsed = true))

        // then
        assertEquals(true, folded.completedCollapsed)
    }

    @Test
    fun foldingIsNotAnEdit() {
        // given: a list written a day ago
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, kind = "LIST")
        fixture.advanceDays(1)

        // when
        val folded = fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(completedCollapsed = true))

        // then: the note itself is untouched
        assertEquals(note.note.version, folded.note.version)
        assertEquals(note.note.updatedAt, folded.note.updatedAt)
        assertEquals(note.note.editedAt, folded.note.editedAt)
        assertEquals(emptyList(), fixture.services.notes.history(owner.id, note.note.id))
    }

    @Test
    fun aFoldTravelsWithOtherChanges() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id, kind = "LIST")

        // when
        val patched = fixture.services.notes.patch(
            owner.id,
            note.note.id,
            PatchNoteCommand(color = "red", completedCollapsed = true),
        )

        // then
        assertEquals("red", patched.color)
        assertEquals(true, patched.completedCollapsed)
    }

    @Test
    fun losingAccessTakesTheFoldAway() {
        // given: a collaborator who folded a shared list
        val owner = fixture.registerUser(email = "ada@example.com")
        val collaborator = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id, kind = "LIST")
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")
        fixture.services.notes.patch(collaborator.id, note.note.id, PatchNoteCommand(completedCollapsed = true))

        // when: the note is shared again after the share was taken away
        fixture.services.sharing.remove(owner.id, note.note.id, collaborator.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // then: the old fold did not survive
        assertEquals(false, fixture.services.notes.get(collaborator.id, note.note.id).completedCollapsed)
    }

    @Test
    fun foldingTellsNobody() = runTest {
        // given: a shared list and a listener on the bus
        val owner = fixture.registerUser(email = "ada@example.com")
        fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id, kind = "LIST")
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")
        val received = mutableListOf<NoteChangedEvent>()
        val listener = launch { fixture.services.events.events().collect { received += it } }
        runCurrent()

        // when
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(completedCollapsed = true))
        runCurrent()

        // then: nobody else's view of the note changed
        assertTrue(received.isEmpty())
        listener.cancel()
    }
}
