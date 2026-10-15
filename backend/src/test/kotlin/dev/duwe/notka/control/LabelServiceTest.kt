package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import dev.duwe.notka.entity.persistence.LabelRepository
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class LabelServiceTest {
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
    fun createAndListLabelsSortedByName() {
        // given
        val user = fixture.registerUser()

        // when
        fixture.services.labels.create(user.id, "zebra")
        fixture.services.labels.create(user.id, "Apple")
        val labels = fixture.services.labels.list(user.id)

        // then
        assertEquals(listOf("Apple", "zebra"), labels.map { it.name })
    }

    @Test
    fun duplicateNameIsRejectedCaseInsensitively() {
        // given
        val user = fixture.registerUser()
        fixture.services.labels.create(user.id, "work")

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.labels.create(user.id, "WORK") }

        // then
        assertEquals(ErrorKind.CONFLICT, failure.kind)
        assertEquals(ErrorKeys.LABEL_NAME_TAKEN, failure.key)
        assertEquals("WORK", failure.params["label"])
    }

    @Test
    fun theSameNameIsAllowedForAnotherUser() {
        // given
        val ada = fixture.registerUser(email = "ada@example.com")
        val bob = fixture.registerUser(email = "bob@example.com")

        // when
        fixture.services.labels.create(ada.id, "work")
        val bobs = fixture.services.labels.create(bob.id, "work")

        // then
        assertEquals("work", bobs.name)
    }

    @Test
    fun invalidNameIsRejected() {
        // given
        val user = fixture.registerUser()

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.labels.create(user.id, "   ") }

        // then
        assertEquals(ErrorKind.VALIDATION, failure.kind)
        assertEquals(ErrorKeys.LABEL_NAME_INVALID, failure.key)
    }

    @Test
    fun renameRejectsAnotherExistingName() {
        // given
        val user = fixture.registerUser()
        fixture.services.labels.create(user.id, "work")
        val home = fixture.services.labels.create(user.id, "home")

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.labels.rename(user.id, home.id, "work") }

        // then
        assertEquals(ErrorKind.CONFLICT, failure.kind)
        assertEquals(ErrorKeys.LABEL_NAME_TAKEN, failure.key)
    }

    @Test
    fun labelsAreAttachedPerNote() {
        // given
        val user = fixture.registerUser()
        val note = fixture.createNote(user.id)
        val work = fixture.services.labels.create(user.id, "work")
        val home = fixture.services.labels.create(user.id, "home")

        // when
        val attached = fixture.services.notes.patch(user.id, note.note.id, PatchNoteCommand(labelIds = listOf(work.id)))
        val replaced = fixture.services.notes.patch(
            user.id,
            note.note.id,
            PatchNoteCommand(labelIds = listOf(home.id, work.id)),
        )

        // then
        assertEquals(listOf("work"), attached.labels.map { it.name })
        assertEquals(listOf("home", "work"), replaced.labels.map { it.name })
    }

    @Test
    fun aCollaboratorSeesOnlyTheirOwnLabels() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")
        val ownersLabel = fixture.services.labels.create(owner.id, "work")
        val editorsLabel = fixture.services.labels.create(editor.id, "private")

        // when
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(labelIds = listOf(ownersLabel.id)))
        fixture.services.notes.patch(editor.id, note.note.id, PatchNoteCommand(labelIds = listOf(editorsLabel.id)))
        val ownerRead = fixture.services.notes.get(owner.id, note.note.id)
        val editorRead = fixture.services.notes.get(editor.id, note.note.id)

        // then
        assertEquals(listOf("work"), ownerRead.labels.map { it.name })
        assertEquals(listOf("private"), editorRead.labels.map { it.name })
    }

    @Test
    fun attachingSomeoneElsesLabelFails() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val stranger = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        val strangersLabel = fixture.services.labels.create(stranger.id, "not-yours")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(labelIds = listOf(strangersLabel.id)))
        }

        // then
        assertEquals(ErrorKind.NOT_FOUND, failure.kind)
        assertEquals(ErrorKeys.LABEL_NOT_FOUND, failure.key)
    }

    @Test
    fun deletingALabelDetachesItEverywhere() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")
        val ownersLabel = fixture.services.labels.create(owner.id, "work")
        val editorsLabel = fixture.services.labels.create(editor.id, "mine")
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(labelIds = listOf(ownersLabel.id)))
        fixture.services.notes.patch(editor.id, note.note.id, PatchNoteCommand(labelIds = listOf(editorsLabel.id)))

        // when
        fixture.services.labels.delete(owner.id, ownersLabel.id)

        // then
        val ownerRead = fixture.services.notes.get(owner.id, note.note.id)
        val editorRead = fixture.services.notes.get(editor.id, note.note.id)
        assertTrue(ownerRead.labels.isEmpty())
        assertEquals(listOf("mine"), editorRead.labels.map { it.name })
        assertTrue(LabelRepository(fixture.services.database).labelsForNote(note.note.id, owner.id).isEmpty())
    }

    @Test
    fun detachingASingleLabelKeepsTheOthers() {
        // given
        val user = fixture.registerUser()
        val note = fixture.createNote(user.id)
        val work = fixture.services.labels.create(user.id, "work")
        val home = fixture.services.labels.create(user.id, "home")
        fixture.services.notes.patch(user.id, note.note.id, PatchNoteCommand(labelIds = listOf(work.id, home.id)))

        // when
        val updated = fixture.services.notes.detachLabel(user.id, note.note.id, work.id)

        // then
        assertEquals(listOf("home"), updated.labels.map { it.name })
    }

    @Test
    fun labelsOfAnotherUserAreInvisible() {
        // given
        val ada = fixture.registerUser(email = "ada@example.com")
        val bob = fixture.registerUser(email = "bob@example.com")
        val label = fixture.services.labels.create(ada.id, "work")

        // when
        val failure = assertFailsWith<DomainException> { fixture.services.labels.rename(bob.id, label.id, "hacked") }

        // then
        assertEquals(ErrorKind.NOT_FOUND, failure.kind)
        assertEquals(ErrorKeys.LABEL_NOT_FOUND, failure.key)
    }
}
