package dev.duwe.notka.control

import dev.duwe.notka.TestFixture
import dev.duwe.notka.entity.model.Access
import dev.duwe.notka.entity.model.BackgroundChange
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class SharingLifecycleTest {
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
    fun shareThenChangePermissionThenRemove() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val collaborator = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")
        fixture.services.notes.patch(
            collaborator.id,
            note.note.id,
            PatchNoteCommand(color = "green", background = BackgroundChange.Set("food")),
        )
        // when: the collaborator sees the shared note with EDIT access
        val shared = fixture.services.notes.get(collaborator.id, note.note.id)

        // then
        assertEquals(Access.EDIT, shared.access)
        assertEquals("green", shared.color)
        assertEquals("food", shared.background)
        assertEquals(listOf("bob@example.com"), shared.shares.map { it.user.email })

        // when: the owner downgrades the permission to VIEW
        fixture.services.sharing.update(owner.id, note.note.id, collaborator.id, "VIEW")
        val downgraded = fixture.services.notes.get(collaborator.id, note.note.id)

        // then: the appearance is the note's, so it does not change with the permission
        assertEquals(Access.VIEW, downgraded.access)
        assertEquals("green", downgraded.color)
        assertEquals("food", downgraded.background)

        // when: the owner removes the share
        fixture.services.sharing.remove(owner.id, note.note.id, collaborator.id)

        // then: the note is gone for the collaborator, and the appearance stays with the note
        val failure = assertFailsWith<DomainException> {
            fixture.services.notes.get(collaborator.id, note.note.id)
        }
        assertEquals(ErrorKeys.NOTE_NOT_FOUND, failure.key)
        assertEquals("green", fixture.services.notes.get(owner.id, note.note.id).color)
    }

    @Test
    fun ownerSeesTheCollaboratorList() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when
        val read = fixture.services.notes.get(owner.id, note.note.id)

        // then
        val share = read.shares.single()
        assertEquals("bob@example.com", share.user.email)
        assertEquals("EDIT", share.permission)
    }

    @Test
    fun sharingWithAnUnknownEmailFails() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.sharing.add(owner.id, note.note.id, "nobody@example.com", "VIEW")
        }

        // then
        assertEquals(ErrorKind.NOT_FOUND, failure.kind)
        assertEquals(ErrorKeys.SHARE_RECIPIENT_NOT_FOUND, failure.key)
        assertEquals("nobody@example.com", failure.params["email"])
    }

    @Test
    fun sharingWithYourselfFails() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.sharing.add(owner.id, note.note.id, "ada@example.com", "VIEW")
        }

        // then
        assertEquals(ErrorKind.VALIDATION, failure.kind)
        assertEquals(ErrorKeys.SHARE_CANNOT_SHARE_WITH_SELF, failure.key)
        assertEquals("ada@example.com", failure.params["email"])
    }

    @Test
    fun sharingTwiceFails() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.sharing.add(owner.id, note.note.id, "bob@example.com", "EDIT")
        }

        // then
        assertEquals(ErrorKind.CONFLICT, failure.kind)
        assertEquals(ErrorKeys.SHARE_ALREADY_SHARED, failure.key)
        assertEquals("bob@example.com", failure.params["email"])
    }

    @Test
    fun anEditingCollaboratorManagesTheCollaborators() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val newcomer = fixture.registerUser(email = "cyd@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when
        fixture.services.sharing.add(editor.id, note.note.id, "cyd@example.com", "VIEW")
        fixture.services.sharing.update(editor.id, note.note.id, newcomer.id, "EDIT")
        val listed = fixture.services.sharing.list(editor.id, note.note.id)
        fixture.services.sharing.remove(editor.id, note.note.id, newcomer.id)

        // then
        assertEquals(listOf("bob@example.com" to "EDIT", "cyd@example.com" to "EDIT"), listed.map { it.user.email to it.permission })
        assertEquals(listOf("bob@example.com"), fixture.services.sharing.list(owner.id, note.note.id).map { it.user.email })
    }

    @Test
    fun aViewingCollaboratorSeesTheCollaboratorsButCannotChangeThem() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val viewer = fixture.registerUser(email = "bob@example.com")
        fixture.registerUser(email = "cyd@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "VIEW")

        // when
        val listed = fixture.services.sharing.list(viewer.id, note.note.id)
        val failure = assertFailsWith<DomainException> {
            fixture.services.sharing.add(viewer.id, note.note.id, "cyd@example.com", "EDIT")
        }

        // then
        assertEquals(listOf("bob@example.com"), listed.map { it.user.email })
        assertEquals(ErrorKind.FORBIDDEN, failure.kind)
        assertEquals(ErrorKeys.NOTE_FORBIDDEN, failure.key)
    }

    @Test
    fun nobodyCanShareTheNoteWithItsOwner() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val editor = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.sharing.add(editor.id, note.note.id, "ada@example.com", "VIEW")
        }

        // then: the owner already has the note
        assertEquals(ErrorKind.CONFLICT, failure.kind)
        assertEquals(ErrorKeys.SHARE_ALREADY_SHARED, failure.key)
    }

    @Test
    fun removingAMissingShareFails() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        val stranger = fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id)

        // when
        val failure = assertFailsWith<DomainException> {
            fixture.services.sharing.remove(owner.id, note.note.id, stranger.id)
        }

        // then
        assertEquals(ErrorKind.NOT_FOUND, failure.kind)
        assertEquals(ErrorKeys.SHARE_NOT_FOUND, failure.key)
    }

    @Test
    fun copyingANoteKeepsContentAndLabelsButNotShares() {
        // given
        val owner = fixture.registerUser(email = "ada@example.com")
        fixture.registerUser(email = "bob@example.com")
        val note = fixture.createNote(owner.id, title = "Groceries")
        val label = fixture.services.labels.create(owner.id, "work")
        fixture.services.notes.patch(owner.id, note.note.id, PatchNoteCommand(labelIds = listOf(label.id)))
        fixture.share(note.note.id, owner.id, "bob@example.com", "EDIT")

        // when
        val copy = fixture.services.notes.copy(owner.id, note.note.id)

        // then
        assertEquals("Groceries", copy.note.title)
        assertTrue(copy.note.id != note.note.id)
        assertEquals(0, copy.shares.size)
        assertEquals(listOf("work"), copy.labels.map { it.name })
    }
}
