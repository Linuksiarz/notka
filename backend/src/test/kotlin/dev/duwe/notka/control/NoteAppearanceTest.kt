package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.Access
import dev.duwe.notka.entity.model.BackgroundChange
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/**
 * Appearance is a property of the note, not of a (note, user) pair.
 *
 * Everyone with access sees the same colour and background, and anyone who can edit changes it for
 * everyone. This is deliberately different from Google Keep, where colour is personal and a
 * collaborator's choice never changes what the owner sees — see `AGENTS.md`.
 */
class NoteAppearanceTest {
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
    fun aNewNoteStartsWithThePlainDefault() {
        // given
        val owner = fixture.registerUser()

        // when
        val note = fixture.createNote(owner.id)

        // then
        assertEquals("default", note.color)
        assertNull(note.background)
    }

    @Test
    fun anEditorChangesTheAppearanceForEveryone() {
        // given: a note shared with an EDIT collaborator
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when: the collaborator paints it
        fixture.services.notes.patch(
            editor.id,
            note.note.id,
            PatchNoteCommand(color = "teal", background = BackgroundChange.Set("travel")),
        )

        // then: the owner sees the same thing, because it is one appearance on one note
        val asOwnerSeesIt = fixture.services.notes.get(owner.id, note.note.id)
        assertEquals("teal", asOwnerSeesIt.color)
        assertEquals("travel", asOwnerSeesIt.background)
    }

    @Test
    fun aViewCollaboratorSeesTheSameAppearance() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")
        fixture.services.notes.patch(
            owner.id,
            note.note.id,
            PatchNoteCommand(color = "purple", background = BackgroundChange.Cleared),
        )

        // when
        val shared = fixture.services.notes.get(viewer.id, note.note.id)

        // then
        assertEquals(Access.VIEW, shared.access)
        assertEquals("purple", shared.color)
        assertNull(shared.background)
    }

    @Test
    fun aViewCollaboratorCannotChangeTheAppearance() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.patch(viewer.id, note.note.id, PatchNoteCommand(color = "red"))
        }

        // then
        assertEquals(ErrorKeys.NOTE_FORBIDDEN, failure.key)
        assertEquals("default", fixture.services.notes.get(owner.id, note.note.id).color)
    }

    @Test
    fun writingContentLeavesTheAppearanceAlone() {
        // given: a note the owner has painted
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)
        fixture.services.notes.patch(
            owner.id,
            note.note.id,
            PatchNoteCommand(color = "yellow", background = BackgroundChange.Set("places")),
        )

        // when: only the title changes
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "Renamed"))

        // then
        val read = fixture.services.notes.get(owner.id, note.note.id)
        assertEquals("yellow", read.color)
        assertEquals("places", read.background)
    }

    @Test
    fun aCopyKeepsTheAppearance() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)
        fixture.services.notes.patch(
            owner.id,
            note.note.id,
            PatchNoteCommand(color = "brown", background = BackgroundChange.Set("food")),
        )

        // when
        val copied = fixture.services.notes.copy(owner.id, note.note.id)

        // then
        assertEquals("brown", copied.color)
        assertEquals("food", copied.background)
    }

    @Test
    fun removingAShareLeavesTheAppearanceOnTheNote() {
        // given: a collaborator who painted the shared note
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")
        fixture.services.notes.patch(editor.id, note.note.id, PatchNoteCommand(color = "green"))

        // when
        fixture.services.sharing.remove(owner.id, note.note.id, editor.id)

        // then: access is gone, the appearance is not — it never belonged to the collaborator
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.get(editor.id, note.note.id)
        }
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
        assertEquals("green", fixture.services.notes.get(owner.id, note.note.id).color)
    }
}
