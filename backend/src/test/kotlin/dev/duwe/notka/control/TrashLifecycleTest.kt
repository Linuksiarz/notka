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
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TrashLifecycleTest {
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
    fun trashingMovesTheNoteOutOfActiveIntoTrash() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)

        // when
        val trashed = fixture.services.notes.trash(owner.id, note.note.id)

        // then
        assertTrue(trashed.note.trashedAt != null)
        assertTrue(fixture.services.notes.list(owner.id, NoteView.ACTIVE).isEmpty())
        assertEquals(listOf(note.note.id), fixture.services.notes.list(owner.id, NoteView.TRASH).map { it.note.id })
    }

    @Test
    fun archivingIsIndependentOfTrashing() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)

        // when
        val archived = fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(archived = true))

        // then
        assertTrue(archived.note.archived)
        assertNull(archived.note.trashedAt)
        assertTrue(fixture.services.notes.list(owner.id, NoteView.ACTIVE).isEmpty())
        assertEquals(listOf(note.note.id), fixture.services.notes.list(owner.id, NoteView.ARCHIVED).map { it.note.id })
    }

    @Test
    fun restoreBringsTheNoteBackToActive() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)
        fixture.services.notes.trash(owner.id, note.note.id)

        // when
        val restored = fixture.services.notes.restore(owner.id, note.note.id)

        // then
        assertNull(restored.note.trashedAt)
        assertEquals(listOf(note.note.id), fixture.services.notes.list(owner.id, NoteView.ACTIVE).map { it.note.id })
        assertTrue(fixture.services.notes.list(owner.id, NoteView.TRASH).isEmpty())
    }

    @Test
    fun trashFlagOnPatchRestoresTheNoteToo() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(trashed = true))

        // when
        val restored = fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(trashed = false))

        // then
        assertNull(restored.note.trashedAt)
        assertEquals(1, fixture.services.notes.list(owner.id, NoteView.ACTIVE).size)
    }

    @Test
    fun permanentDeleteRemovesTheRow() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)

        // when
        fixture.services.notes.deletePermanently(owner.id, note.note.id)

        // then
        val failure = assertFailsWith<DomainException> { fixture.services.notes.get(owner.id, note.note.id) }
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
        assertTrue(fixture.services.notes.list(owner.id, NoteView.TRASH).isEmpty())
    }

    @Test
    fun cleanupPurgesOnlyNotesOlderThanTheRetentionWindow() {
        // given: one note trashed 31 days ago, one trashed today
        val owner = fixture.registerUser()
        val oldNote = fixture.createNote(owner.id, title = "Old")
        fixture.services.notes.trash(owner.id, oldNote.note.id)
        fixture.advanceDays(31)
        val recentNote = fixture.createNote(owner.id, title = "Recent")
        fixture.services.notes.trash(owner.id, recentNote.note.id)

        // when
        val purged = fixture.services.trashCleanup.purgeExpired()

        // then
        assertEquals(1, purged)
        assertTrue(fixture.services.notes.list(owner.id, NoteView.TRASH).map { it.note.id } == listOf(recentNote.note.id))
        val failure = assertFailsWith<DomainException> { fixture.services.notes.get(owner.id, oldNote.note.id) }
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
    }

    @Test
    fun cleanupKeepsNotesExactlyInsideTheRetentionWindow() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)
        fixture.services.notes.trash(owner.id, note.note.id)
        fixture.advanceDays(29)

        // when
        val purged = fixture.services.trashCleanup.purgeExpired()

        // then
        assertEquals(0, purged)
        assertEquals(1, fixture.services.notes.list(owner.id, NoteView.TRASH).size)
    }

    @Test
    fun trashPurgeIsDeterministicWithAnInjectedNow() {
        // given
        val owner = fixture.registerUser()
        val note = fixture.createNote(owner.id)
        val trashedAt = fixture.now
        fixture.services.notes.trash(owner.id, note.note.id)
        val retention = fixture.config.trashRetentionMillis

        // when: still inside the window
        val keptEarly = fixture.services.trashCleanup.purgeExpired(now = trashedAt + retention - 1)
        // and: past the window
        val purgedLate = fixture.services.trashCleanup.purgeExpired(now = trashedAt + retention + 1)

        // then
        assertEquals(0, keptEarly)
        assertEquals(1, purgedLate)
    }
}
