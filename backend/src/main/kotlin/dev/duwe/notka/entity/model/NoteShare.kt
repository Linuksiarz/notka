package dev.duwe.notka.entity.model

/** A collaborator's permission on someone else's note. */
enum class Permission { VIEW, EDIT }

/** What the requesting user is to a note, from the point of view of one request. */
enum class Access {
    OWNER,
    VIEW,
    EDIT;

    val canEdit: Boolean get() = this != VIEW
    val canChangeAppearance: Boolean get() = this != VIEW

    companion object {
        fun from(permission: Permission): Access = when (permission) {
            Permission.EDIT -> EDIT
            Permission.VIEW -> VIEW
        }
    }
}

/** Owner must never have a row in `note_shares`; that is enforced by the control layer. */
data class NoteShare(
    val noteId: Int,
    val userId: Int,
    val permission: Permission,
    val createdAt: Long,
)
