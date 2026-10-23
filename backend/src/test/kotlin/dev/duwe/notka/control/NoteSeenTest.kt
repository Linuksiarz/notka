package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.BackgroundChange
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteView
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * A card names the collaborator who last edited a shared note, as in Google Keep, until the reader
 * opens it — for that reader alone — and the reader's own edits never mark a note.
 */
class NoteSeenTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private fun tick() {
        fixture.now += 1000
    }

    @Test
    fun theReadersOwnEditNeverMarksANote() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)

        // when
        tick()
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "Mine"))

        // then
        assertNull(fixture.services.notes.get(owner.id, note.note.id).unseenEdit)
    }

    @Test
    fun aCollaboratorsEditMarksTheNoteForTheOwner() {
        // given: Ada shares a note with Bob, who may edit it
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val note = fixture.createNote(ada.id)
        fixture.share(note.note.id, ada.id, "bob@example.com", "EDIT")

        // when: Bob renames it
        tick()
        fixture.services.notes.patch(bob.id, note.note.id, PatchNoteCommand(title = "Bob's"))

        // then: Ada's card names Bob and the moment, in the list and in a single read
        val listed = fixture.services.notes.list(ada.id, NoteView.ACTIVE).single()
        val edit = assertNotNull(listed.unseenEdit)
        assertEquals("Bob Builder", edit.editor.displayName)
        assertEquals(fixture.now, edit.at)
        assertEquals(edit, fixture.services.notes.get(ada.id, note.note.id).unseenEdit)
        assertNull(fixture.services.notes.get(bob.id, note.note.id).unseenEdit)
    }

    @Test
    fun openingTheNoteClearsTheMarkerForThatReaderAlone() {
        // given: a note Ada shares with Bob and Cleo, last written by Bob
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val cleo = fixture.registerUser("cleo@example.com", "Cleo")
        val note = fixture.createNote(ada.id)
        fixture.share(note.note.id, ada.id, "bob@example.com", "EDIT")
        fixture.share(note.note.id, ada.id, "cleo@example.com", "VIEW")
        tick()
        fixture.services.notes.patch(bob.id, note.note.id, PatchNoteCommand(title = "Bob's"))
        val versionBefore = fixture.services.notes.get(ada.id, note.note.id).note.version

        // when: Ada opens it
        val seen = fixture.services.notes.markSeen(ada.id, note.note.id)

        // then: hers is gone, Cleo's stays, and the note itself did not move on
        assertNull(seen.unseenEdit)
        assertNotNull(fixture.services.notes.get(cleo.id, note.note.id).unseenEdit)
        assertEquals(versionBefore, seen.note.version)
    }

    @Test
    fun theMarkerComesBackWhenSomebodyElseEditsAgain() {
        // given: Ada has seen Bob's edit
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val note = fixture.createNote(ada.id)
        fixture.share(note.note.id, ada.id, "bob@example.com", "EDIT")
        tick()
        fixture.services.notes.patch(bob.id, note.note.id, PatchNoteCommand(title = "Bob's"))
        fixture.services.notes.markSeen(ada.id, note.note.id)

        // when: Bob writes the body again, as the editor does, through steps
        tick()
        fixture.services.notes.submitSteps(
            bob.id,
            note.note.id,
            SubmitStepsCommand(docVersion = 0, clientId = "bob", steps = listOf("{}"), document = NoteDocument.empty()),
        )

        // then
        assertEquals(fixture.now, fixture.services.notes.get(ada.id, note.note.id).unseenEdit?.at)
    }

    @Test
    fun appearanceIsNotAnEdit() {
        // given: Ada has seen the note as it is
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val note = fixture.createNote(ada.id)
        fixture.share(note.note.id, ada.id, "bob@example.com", "EDIT")

        // when: Bob only recolours it
        tick()
        fixture.services.notes.patch(
            bob.id,
            note.note.id,
            PatchNoteCommand(color = "green", background = BackgroundChange.Set("food")),
        )

        // then: nobody wrote anything Ada has not seen
        assertNull(fixture.services.notes.get(ada.id, note.note.id).unseenEdit)
    }

    @Test
    fun aNoteSharedWithYouNamesItsLastEditorUntilYouOpenIt() {
        // given
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val note = fixture.createNote(ada.id)

        // when
        fixture.share(note.note.id, ada.id, "bob@example.com", "VIEW")

        // then
        assertEquals("Ada Lovelace", fixture.services.notes.get(bob.id, note.note.id).unseenEdit?.editor?.displayName)
        assertNull(fixture.services.notes.markSeen(bob.id, note.note.id).unseenEdit)
    }

    @Test
    fun aNoteYouCannotSeeCannotBeMarkedSeen() {
        // given
        val ada = fixture.registerUser()
        val bob = fixture.registerUser("bob@example.com", "Bob Builder")
        val note = fixture.createNote(ada.id)

        // when / then
        assertFailsWith<DomainException> { fixture.services.notes.markSeen(bob.id, note.note.id) }
    }
}
