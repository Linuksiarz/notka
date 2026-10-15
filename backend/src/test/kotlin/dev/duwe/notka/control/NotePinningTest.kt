package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.NoteView
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Pinning is metadata, exactly like the archive flag: it sorts a note to the top of a view, it is
 * shared by everyone with access, and it must never be blocked by somebody else's typing.
 */
class NotePinningTest {
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
    fun aNewNoteIsNotPinned() {
        // given
        val owner = fixture.registerUser()

        // when
        val note = fixture.createNote(owner.id)

        // then
        assertEquals(false, note.note.pinned)
    }

    @Test
    fun aPinnedNoteComesFirstInTheView() {
        // given: three notes, the oldest pinned last
        val owner = fixture.registerUser()
        val first = fixture.createNote(owner.id, title = "first")
        fixture.createNote(owner.id, title = "second")
        fixture.createNote(owner.id, title = "third")

        // when: the oldest one is pinned
        fixture.services.notes.patch(owner.id, first.note.id, PatchNoteCommand(pinned = true))

        // then: it leads the list, and nothing else is lost or duplicated
        val titles = fixture.services.notes.list(owner.id, NoteView.ACTIVE).map { it.note.title }
        assertEquals("first", titles.first())
        assertEquals(setOf("first", "second", "third"), titles.toSet())
    }

    @Test
    fun writingInANoteLeavesItWhereItIs() {
        // given: three notes, the newest first
        val owner = fixture.registerUser()
        val first = fixture.createNote(owner.id, title = "first")
        fixture.createNote(owner.id, title = "second")
        fixture.createNote(owner.id, title = "third")

        // when: the oldest one is written in
        fixture.services.notes.patch(owner.id, first.note.id, PatchNoteCommand(title = "first, edited"))

        // then: it keeps its place, the way the original's notes do
        val titles = fixture.services.notes.list(owner.id, NoteView.ACTIVE).map { it.note.title }
        assertEquals(listOf("third", "second", "first, edited"), titles)
    }

    @Test
    fun anUnpinnedNoteGoesToTheTopOfTheOthers() {
        // given: the oldest of three notes, pinned
        val owner = fixture.registerUser()
        val first = fixture.createNote(owner.id, title = "first")
        fixture.createNote(owner.id, title = "second")
        fixture.createNote(owner.id, title = "third")
        fixture.services.notes.patch(owner.id, first.note.id, PatchNoteCommand(pinned = true))

        // when: it is unpinned again
        fixture.services.notes.patch(owner.id, first.note.id, PatchNoteCommand(pinned = false))

        // then: it leads the others instead of going back to where it was
        val titles = fixture.services.notes.list(owner.id, NoteView.ACTIVE).map { it.note.title }
        assertEquals(listOf("first", "third", "second"), titles)
    }

    @Test
    fun everyoneWithAccessSeesThePin() {
        // given: a note shared with a VIEW collaborator
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when: the owner pins it
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(pinned = true))

        // then: the collaborator sees the same pin
        val seen = fixture.services.notes.get(viewer.id, note.note.id)
        assertEquals(true, seen.note.pinned)
    }

    @Test
    fun aViewerCannotPin() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.patch(viewer.id, note.note.id, PatchNoteCommand(pinned = true))
        }

        // then
        assertEquals(ErrorKeys.NOTE_FORBIDDEN, failure.key)
    }

    @Test
    fun pinningIsNotBlockedBySomebodyElsesTyping() {
        // given: a note the collaborator has since edited
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")
        fixture.services.notes.patch(editor.id, note.note.id, PatchNoteCommand(title = "edited by bob"))

        // when: the owner pins it without sending a version, the way the client does for appearance,
        // labels and the archive flag — those cannot lose anybody's text
        val pinned = fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(pinned = true))

        // then: the pin lands and the collaborator's text is untouched
        assertEquals(true, pinned.note.pinned)
        assertEquals("edited by bob", pinned.note.title)
    }

    @Test
    fun pinningDoesNotCreateAHistoryEntry() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)

        // when
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(pinned = true))

        // then: only a content write is archived
        val history = fixture.services.notes.history(owner.id, note.note.id)
        assertTrue(history.isEmpty(), "pinning must not archive a version")
    }
}
