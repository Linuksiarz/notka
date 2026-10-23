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
 * A pin is the reader's own, as in Google Keep: it sorts a note to the top of that account's views and
 * nobody else's, anyone who can see the note may pin it, and it is never blocked by somebody else's
 * typing.
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
        assertEquals(false, note.pinned)
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
    fun aPinIsTheReadersOwn() {
        // given: a note shared with a collaborator
        val owner = fixture.registerUser(email = "ada@example.com")
        val collaborator = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when: the owner pins it
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(pinned = true))

        // then: it is pinned for the owner and not for the collaborator
        assertEquals(true, fixture.services.notes.get(owner.id, note.note.id).pinned)
        assertEquals(false, fixture.services.notes.get(collaborator.id, note.note.id).pinned)
    }

    @Test
    fun aPinLeadsOnlyItsOwnersView() {
        // given: two notes the collaborator can see, the older one pinned by the owner
        val owner = fixture.registerUser(email = "ada@example.com")
        val collaborator = fixture.registerUser(email = "bob@example.com")
        val older = fixture.createNote(owner.id, title = "older")
        val newer = fixture.createNote(owner.id, title = "newer")
        fixture.share(older.note.id, owner.id, "bob@example.com", "EDIT")
        fixture.share(newer.note.id, owner.id, "bob@example.com", "EDIT")
        fixture.services.notes.patch(collaborator.id, newer.note.id, PatchNoteCommand(pinned = true))

        // when
        val ownersView = fixture.services.notes.list(owner.id, NoteView.ACTIVE)
        val collaboratorsView = fixture.services.notes.list(collaborator.id, NoteView.ACTIVE)

        // then: the collaborator's pin is theirs alone
        assertEquals(listOf(false, false), ownersView.map { it.pinned })
        assertEquals(listOf("newer" to true, "older" to false), collaboratorsView.map { it.note.title to it.pinned })
    }

    @Test
    fun aPinMovesTheNoteOnlyForThePinner() {
        // given: two shared notes, the newer one first for both accounts
        val owner = fixture.registerUser(email = "ada@example.com")
        val collaborator = fixture.registerUser(email = "bob@example.com")
        val older = fixture.createNote(owner.id, title = "older")
        val newer = fixture.createNote(owner.id, title = "newer")
        fixture.share(older.note.id, owner.id, "bob@example.com", "EDIT")
        fixture.share(newer.note.id, owner.id, "bob@example.com", "EDIT")
        val versionBefore = fixture.services.notes.get(owner.id, older.note.id).note.version

        // when: the collaborator pins the older note and unpins it again
        fixture.services.notes.patch(collaborator.id, older.note.id, PatchNoteCommand(pinned = true))
        fixture.services.notes.patch(collaborator.id, older.note.id, PatchNoteCommand(pinned = false))

        // then: it leads the collaborator's others, and the owner's order and the note's version are untouched
        val collaboratorsView = fixture.services.notes.list(collaborator.id, NoteView.ACTIVE).map { it.note.title }
        val ownersView = fixture.services.notes.list(owner.id, NoteView.ACTIVE).map { it.note.title }
        assertEquals(listOf("older", "newer"), collaboratorsView)
        assertEquals(listOf("newer", "older"), ownersView)
        assertEquals(versionBefore, fixture.services.notes.get(owner.id, older.note.id).note.version)
    }

    @Test
    fun aViewerCanPinForThemself() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when
        val pinned = fixture.services.notes.patch(viewer.id, note.note.id, PatchNoteCommand(pinned = true))

        // then
        assertEquals(true, pinned.pinned)
        assertEquals(false, fixture.services.notes.get(owner.id, note.note.id).pinned)
    }

    @Test
    fun aViewerStillCannotChangeTheNoteAlongWithThePin() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.patch(viewer.id, note.note.id, PatchNoteCommand(pinned = true, color = "red"))
        }

        // then
        assertEquals(ErrorKeys.NOTE_FORBIDDEN, failure.key)
    }

    @Test
    fun losingAccessTakesThePinAway() {
        // given: a collaborator who pinned a shared note
        val owner = fixture.registerUser(email = "ada@example.com")
        val collaborator = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")
        fixture.services.notes.patch(collaborator.id, note.note.id, PatchNoteCommand(pinned = true))

        // when: the note is shared again after the share was taken away
        fixture.services.sharing.remove(owner.id, note.note.id, collaborator.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // then: the old pin did not survive
        assertEquals(false, fixture.services.notes.get(collaborator.id, note.note.id).pinned)
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
        assertEquals(true, pinned.pinned)
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
