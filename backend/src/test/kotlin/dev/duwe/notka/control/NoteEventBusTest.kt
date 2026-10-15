package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NoteEventBusTest {
    @Test
    fun deliversAnEventOnlyToTheAccountsThatMaySeeTheNote() = runTest {
        // given: two listeners, each filtered to their own account the way the SSE route does it
        val bus = NoteEventBus()
        val forAda = mutableListOf<NoteChangedEvent>()
        val forBob = mutableListOf<NoteChangedEvent>()
        val ada = launch { bus.events().filter { 1 in it.audience }.collect { forAda += it } }
        val bob = launch { bus.events().filter { 2 in it.audience }.collect { forBob += it } }
        runCurrent()

        // when: a note shared only with Ada changes
        bus.publish(NoteChangedEvent(noteId = 7, version = 3, audience = setOf(1, 99)))
        runCurrent()

        // then
        assertEquals(1, forAda.size)
        assertEquals(7, forAda.single().noteId)
        assertEquals(3, forAda.single().version)
        assertTrue(forBob.isEmpty(), "Bob must not hear about a note he cannot see")

        ada.cancel()
        bob.cancel()
    }

    @Test
    fun deliversToEveryCollaboratorOfANote() = runTest {
        // given
        val bus = NoteEventBus()
        val forBob = mutableListOf<NoteChangedEvent>()
        val bob = launch { bus.events().filter { 2 in it.audience }.collect { forBob += it } }
        runCurrent()

        // when: a note shared with Bob and Ada is edited
        bus.publish(NoteChangedEvent(noteId = 7, version = 4, audience = setOf(1, 2)))

        // then
        runCurrent()
        assertEquals(4, forBob.single().version)
        bob.cancel()
    }

    @Test
    fun aWriteOnASharedNoteNotifiesOwnerAndCollaborators() = runTest {
        // given: a note shared with a collaborator, and a listener on the bus
        val fixture = TestFixture()
        try {
            val owner = fixture.registerUser(email = "ada@example.com")
            val collaborator = fixture.registerUser(email = "bob@example.com")
            val note = fixture.createNote(owner.id)
            fixture.share(noteId = note.note.id, ownerId = owner.id, email = "bob@example.com", permission = "EDIT")

            val received = mutableListOf<NoteChangedEvent>()
            val listener = launch { fixture.services.events.events().collect { received += it } }
            runCurrent()

            // when
            fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(title = "Renamed"))
            runCurrent()

            // then
            val event = received.single()
            assertEquals(note.note.id, event.noteId)
            assertEquals(setOf(owner.id, collaborator.id), event.audience)
            assertEquals(2, event.version)
            listener.cancel()
        } finally {
            fixture.close()
        }
    }

    @Test
    fun trashingANoteAlsoNotifies() = runTest {
        // given
        val fixture = TestFixture()
        try {
            val owner = fixture.registerUser(email = "ada@example.com")
            val note = fixture.createNote(owner.id)
            val received = mutableListOf<NoteChangedEvent>()
            val listener = launch { fixture.services.events.events().collect { received += it } }
            runCurrent()

            // when
            fixture.services.notes.trash(owner.id, note.note.id)
            runCurrent()

            // then
            assertEquals(setOf(owner.id), received.single().audience)
            listener.cancel()
        } finally {
            fixture.close()
        }
    }
}
