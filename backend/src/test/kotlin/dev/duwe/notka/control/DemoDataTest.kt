package dev.duwe.notka.control

import dev.duwe.notka.entity.model.NOTE_BACKGROUNDS
import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.NoteView
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The sample instance behind `DEMO=true`. What matters is that a fresh instance has something to
 * look at as both accounts, and that restarting the server does not leave a second copy behind.
 */
class DemoDataTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    private fun seed(): Boolean =
        DemoData.seed(fixture.services.auth, fixture.services.notes, fixture.services.sharing)

    private fun titlesFor(email: String, password: String): List<String> {
        val session = fixture.services.auth.login(email, password)
        return fixture.services.notes.list(session.user.id, NoteView.ACTIVE).map { it.note.title }.sorted()
    }

    @Test
    fun seedsTwoAccountsThatCanSignIn() {
        // given: an empty instance
        // when
        val seeded = seed()

        // then: both sample accounts exist and their passwords work
        assertTrue(seeded)
        assertEquals("Alice Nowak", fixture.services.auth.login(DemoData.ALICE_EMAIL, DemoData.ALICE_PASSWORD).user.displayName)
        assertEquals("Bob Kowalski", fixture.services.auth.login(DemoData.BOB_EMAIL, DemoData.BOB_PASSWORD).user.displayName)
        // and: Alice administers the demo, Bob does not
        assertTrue(fixture.services.auth.login(DemoData.ALICE_EMAIL, DemoData.ALICE_PASSWORD).user.admin)
        assertFalse(fixture.services.auth.login(DemoData.BOB_EMAIL, DemoData.BOB_PASSWORD).user.admin)
    }

    @Test
    fun eachAccountHasNotesOfItsOwn() {
        // given
        seed()

        // when
        val alice = titlesFor(DemoData.ALICE_EMAIL, DemoData.ALICE_PASSWORD)
        val bob = titlesFor(DemoData.BOB_EMAIL, DemoData.BOB_PASSWORD)

        // then: both have something to open, and neither list is the other's
        assertTrue(alice.contains("Reading list"), alice.toString())
        assertTrue(bob.contains("Standup notes"), bob.toString())
        assertFalse(alice.contains("Standup notes"), alice.toString())
        assertFalse(bob.contains("Reading list"), bob.toString())
    }

    @Test
    fun twoNotesAreSharedBetweenThem() {
        // given
        seed()

        // when: each account lists what it can see
        val alice = titlesFor(DemoData.ALICE_EMAIL, DemoData.ALICE_PASSWORD)
        val bob = titlesFor(DemoData.BOB_EMAIL, DemoData.BOB_PASSWORD)

        // then: one checklist and one text note show up for both
        val shared = listOf("Apartment ideas", "Groceries together")
        assertTrue(alice.containsAll(shared), alice.toString())
        assertTrue(bob.containsAll(shared), bob.toString())

        val session = fixture.services.auth.login(DemoData.ALICE_EMAIL, DemoData.ALICE_PASSWORD)
        val groceries = fixture.services.notes.list(session.user.id, NoteView.ACTIVE)
            .single { it.note.title == "Groceries together" }
        assertEquals("LIST", groceries.note.kind.name)
        val apartment = fixture.services.notes.list(session.user.id, NoteView.ACTIVE)
            .single { it.note.title == "Apartment ideas" }
        assertEquals("TEXT", apartment.note.kind.name)
    }

    @Test
    fun theCollaboratorMayTickItemsOnTheSharedChecklist() {
        // given: the shared checklist, seen by Bob, with something still to buy
        seed()
        val bob = fixture.services.auth.login(DemoData.BOB_EMAIL, DemoData.BOB_PASSWORD).user
        val shared = fixture.services.notes.list(bob.id, NoteView.ACTIVE)
            .single { it.note.title == "Groceries together" }
        val document = shared.note.document
        assertFalse(document.blocks.all { it.checked })

        // when: he ticks everything off
        val ticked = document.copy(blocks = document.blocks.map { it.copy(checked = true) })
        fixture.services.notes.patch(bob.id, shared.note.id, PatchNoteCommand(document = ticked))

        // then: the owner sees his change, because the note is shared rather than copied
        val alice = fixture.services.auth.login(DemoData.ALICE_EMAIL, DemoData.ALICE_PASSWORD).user
        val seen = fixture.services.notes.list(alice.id, NoteView.ACTIVE)
            .single { it.note.title == "Groceries together" }
        assertTrue(seen.note.document.blocks.all { it.checked }, seen.note.document.toString())
    }

    @Test
    fun theSampleNotesShowOffColoursAndBackgrounds() {
        // given
        seed()
        val alice = fixture.services.auth.login(DemoData.ALICE_EMAIL, DemoData.ALICE_PASSWORD).user

        // when
        val notes = fixture.services.notes.list(alice.id, NoteView.ACTIVE)

        // then: between the two accounts, every background the app offers is on display
        val bob = fixture.services.auth.login(DemoData.BOB_EMAIL, DemoData.BOB_PASSWORD).user
        val bobNotes = fixture.services.notes.list(bob.id, NoteView.ACTIVE)
        val backgrounds = (notes + bobNotes).mapNotNull { it.note.background }.toSet()
        assertEquals(
            NOTE_BACKGROUNDS,
            backgrounds,
            "every background the app offers should be on display",
        )

        // and: the pinned welcome note carries a colour rather than a background
        val welcome = notes.single { it.note.title == "Welcome to Notka" }
        assertTrue(welcome.pinned)
        assertEquals("yellow", welcome.note.color)
        assertNull(welcome.note.background)
        assertTrue(bobNotes.any { it.note.color == "teal" }, bobNotes.map { it.note.color }.toString())
    }

    @Test
    fun seedingIsIdempotent() {
        // given: an instance that has already been seeded
        assertTrue(seed())

        // when: the server is started again
        val second = seed()

        // then: nothing was added twice
        assertFalse(second)
        val alice = fixture.services.auth.login(DemoData.ALICE_EMAIL, DemoData.ALICE_PASSWORD).user
        val titles = fixture.services.notes.list(alice.id, NoteView.ACTIVE).map { it.note.title }
        assertEquals(titles.distinct().size, titles.size, titles.toString())
    }

    @Test
    fun seedingStopsOnceAnybodyHasRegistered() {
        // given: an instance with an account of its own, and no demo data
        fixture.registerUser(email = "real@example.com")

        // when
        val seeded = seed()

        // then: demo mode never touches an instance that is already in use
        assertFalse(seeded)
        val real = fixture.services.auth.login("real@example.com", "correct horse battery").user
        assertEquals(emptyList(), fixture.services.notes.list(real.id, NoteView.ACTIVE).map { it.note.title })
    }
}
