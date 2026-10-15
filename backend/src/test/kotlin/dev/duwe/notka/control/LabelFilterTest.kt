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
 * Filtering notes by label. A label belongs to one user, so the filter can only ever narrow what the
 * caller was already allowed to see — and asking for a label that is not theirs is a mistake, not an
 * empty list.
 */
class LabelFilterTest {
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
    fun onlyTheNotesCarryingTheLabelAreListed() {
        // given: three notes, one of them on the label
        val owner = fixture.registerUser()
        val label = fixture.services.labels.create(owner.id, "errands")
        val errand = fixture.createNote(owner.id, title = "pharmacy")
        fixture.createNote(owner.id, title = "shopping")
        fixture.createNote(owner.id, title = "reading")
        fixture.services.notes.patch(owner.id, errand.note.id, PatchNoteCommand(labelIds = listOf(label.id)))

        // when: the view is filtered by that label
        val filtered = fixture.services.notes.list(owner.id, NoteView.ACTIVE, label.id)

        // then: only the labelled note comes back, and the unfiltered view still has all three
        assertEquals(listOf("pharmacy"), filtered.map { it.note.title })
        assertEquals(3, fixture.services.notes.list(owner.id, NoteView.ACTIVE).size)
    }

    @Test
    fun theFilterKeepsTheViewsApart() {
        // given: an archived note and a live note on the same label
        val owner = fixture.registerUser()
        val label = fixture.services.labels.create(owner.id, "errands")
        val live = fixture.createNote(owner.id, title = "pharmacy")
        val stored = fixture.createNote(owner.id, title = "recycling")
        fixture.services.notes.patch(owner.id, live.note.id, PatchNoteCommand(labelIds = listOf(label.id)))
        fixture.services.notes.patch(owner.id, stored.note.id, PatchNoteCommand(labelIds = listOf(label.id)))
        fixture.services.notes.patch(owner.id, stored.note.id, PatchNoteCommand(archived = true))

        // when: each view is filtered by the same label
        val active = fixture.services.notes.list(owner.id, NoteView.ACTIVE, label.id)
        val archived = fixture.services.notes.list(owner.id, NoteView.ARCHIVED, label.id)

        // then: the filter narrows the view rather than replacing it
        assertEquals(listOf("pharmacy"), active.map { it.note.title })
        assertEquals(listOf("recycling"), archived.map { it.note.title })
    }

    @Test
    fun aLabelSomebodyElseOwnsIsNotFound() {
        // given: a label of one user and a note of another
        val owner = fixture.registerUser(email = "ada@example.com")
        val other = fixture.registerUser(email = "bob@example.com")
        val label = fixture.services.labels.create(owner.id, "errands")
        fixture.createNote(other.id, title = "shopping")

        // when: the other user filters by it
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.list(other.id, NoteView.ACTIVE, label.id)
        }

        // then: it is a not-found, not an empty list
        assertEquals(ErrorKeys.LABEL_NOT_FOUND, failure.key)
    }

    @Test
    fun aLabelThatWasDeletedFiltersNothing() {
        // given: a note on a label that is then deleted
        val owner = fixture.registerUser()
        val label = fixture.services.labels.create(owner.id, "errands")
        val note = fixture.createNote(owner.id, title = "pharmacy")
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(labelIds = listOf(label.id)))
        fixture.services.labels.delete(owner.id, label.id)

        // when: the view is filtered by the label that no longer exists
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.list(owner.id, NoteView.ACTIVE, label.id)
        }

        // then: it is a not-found, and the note itself is still there and unlabelled
        assertEquals(ErrorKeys.LABEL_NOT_FOUND, failure.key)
        val listed = fixture.services.notes.list(owner.id, NoteView.ACTIVE)
        assertEquals(1, listed.size)
        assertTrue(listed.single().labels.isEmpty())
    }
}
