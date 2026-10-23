package dev.duwe.notka.entity.model

/** A note is either a text note or a list note (checkboxes). */
enum class NoteKind { TEXT, LIST }

/** The three list views of `GET /api/notes`. */
enum class NoteView { ACTIVE, ARCHIVED, TRASH }

/** Spell out trash intent instead of overloading a nullable timestamp. */
enum class TrashAction { KEEP, TRASH, RESTORE }

data class Note(
    val id: Int,
    val ownerId: Int,
    val kind: NoteKind,
    val title: String,
    val document: NoteDocument,
    val archived: Boolean,
    /**
     * Where the note stands in its section, highest first. Google Keep's own order: a new note and a
     * note that is pinned or unpinned go to the top, and writing in a note does not move it. This is
     * the shared order; an account that pinned or unpinned the note has its own place for it
     * ([Filing]), as it has its own pin.
     */
    val position: Long,
    val trashedAt: Long?,
    val createdAt: Long,
    val updatedAt: Long,
    val version: Int,
    val color: String,
    val background: String?,
    /**
     * When the reminder fires, and how it comes back. A property of the note, like the archive
     * flag: everyone with access sees the same reminder, it is never version-guarded and it never
     * creates a history entry.
     */
    val reminderAt: Long?,
    val reminderRepeat: ReminderRepeat?,
    /** Who last wrote the note's content (title, kind, body); `null` once that account is gone. */
    val editedBy: Int?,
    /** When they did: a card's "edited by" marker compares it with what the reader last saw. */
    val editedAt: Long,
) {
    companion object {
        /** The plain card: no colour tint, no background pattern. */
        const val DEFAULT_COLOR: String = "default"
    }
}

/** How one account filed a note: whether it pinned it, and where it has it since it last did either. */
data class Filing(val pinned: Boolean, val position: Long)

/** Fields a note update may touch. `null` means "leave as is". */
data class NoteFields(
    val kind: NoteKind? = null,
    val title: String? = null,
    val document: NoteDocument? = null,
    val archived: Boolean? = null,
    /** Puts the note at the top of its section (see [Note.position]). */
    val toTop: Boolean = false,
    val trash: TrashAction = TrashAction.KEEP,
    val color: String? = null,
    val background: BackgroundChange = BackgroundChange.Unchanged,
    val reminder: ReminderChange = ReminderChange.Unchanged,
    val updatedAt: Long,
    /** The account writing the note's content, recorded as its last editor; `null` for any other change. */
    val editedBy: Int? = null,
    /**
     * When set, the write only lands if the stored row still carries this version. That is what
     * turns a concurrent edit into a `409` instead of a silent overwrite.
     */
    val expectedVersion: Int? = null,
)

/** One step of a note's body as an editor sent it: ProseMirror's own JSON, never read here, and its editor. */
data class NoteStep(val step: String, val clientId: String)

/**
 * What an editor at some body version needs to catch up: the version the body is at now and the
 * steps after the editor's. [steps] is `null` when the log no longer reaches back that far — the body
 * was replaced as a whole, or the steps were trimmed — and the editor reads the note instead.
 */
data class NoteStepLog(val docVersion: Int, val steps: List<NoteStep>?)
