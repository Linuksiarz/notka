package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.Access
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import dev.duwe.notka.entity.model.NoteView
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NoteAccessControlTest {
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
    fun strangerCannotReadSomeoneElsesNote() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val stranger = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.notes.get(stranger.id, note.note.id) }

        // then
        assertEquals(ErrorKind.NOT_FOUND, failure.kind)
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
    }

    @Test
    fun strangerCannotPatchSomeoneElsesNote() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val stranger = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.patch(stranger.id, note.note.id, PatchNoteCommand(title = "Hacked"))
        }

        // then
        assertEquals(ErrorKind.NOT_FOUND, failure.kind)
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
    }

    @Test
    fun strangerCannotTrashSomeoneElsesNote() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val stranger = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.notes.trash(stranger.id, note.note.id) }

        // then
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
    }

    @Test
    fun strangerCannotPermanentlyDeleteSomeoneElsesNote() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val stranger = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.deletePermanently(stranger.id, note.note.id)
        }

        // then
        assertEquals(ErrorKind.NOT_FOUND, failure.kind)
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
    }

    @Test
    fun viewCollaboratorGetsForbiddenOnPatch() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.patch(viewer.id, note.note.id, PatchNoteCommand(title = "Renamed"))
        }

        // then
        assertEquals(ErrorKind.FORBIDDEN, failure.kind)
        assertEquals(ErrorKeys.NOTE_FORBIDDEN, failure.key)
    }

    @Test
    fun editCollaboratorCanPatch() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when
        val patched = fixture.services.notes.patch(editor.id, note.note.id, PatchNoteCommand(title = "Renamed"))

        // then
        assertEquals("Renamed", patched.note.title)
        assertEquals(Access.EDIT, patched.access)
        assertTrue(patched.access.canEdit)
        assertTrue(patched.access.canChangeAppearance)
    }

    @Test
    fun collaboratorCannotPermanentlyDelete() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.deletePermanently(editor.id, note.note.id)
        }

        // then
        assertEquals(ErrorKind.FORBIDDEN, failure.kind)
        assertEquals(ErrorKeys.SHARE_NOT_OWNER, failure.key)
    }

    @Test
    fun listReturnsOnlyVisibleNotes() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val stranger = fixture.registerUser(email = "carol@example.com")
        val owned = fixture.createNote(owner.id, title = "Owned")
        val shared = fixture.createNote(owner.id, title = "Shared")
        fixture.share(shared.note.id, owner.id, "bob@example.com", "EDIT")

        // when
        val editorNotes = fixture.services.notes.list(editor.id, NoteView.ACTIVE)
        val strangerNotes = fixture.services.notes.list(stranger.id, NoteView.ACTIVE)

        // then
        assertEquals(listOf(shared.note.id), editorNotes.map { it.note.id })
        assertTrue(strangerNotes.isEmpty())
        assertEquals(2, fixture.services.notes.list(owner.id, NoteView.ACTIVE).size)
        assertTrue(owned.note.id in fixture.services.notes.list(owner.id, NoteView.ACTIVE).map { it.note.id })
    }
}
