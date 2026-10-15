package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.Label
import dev.duwe.notka.entity.model.Validation
import dev.duwe.notka.entity.persistence.LabelRepository

/** Far more than anybody sorts their notes into, and a ceiling on what one account can create. */
const val MAX_LABELS_PER_USER: Int = 500

/** Per-user labels. Labels are never shared with collaborators of a note. */
class LabelService(
    private val labels: LabelRepository,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun list(userId: Int): List<Label> = labels.listForUser(userId)

    fun create(userId: Int, name: String): Label {
        val normalized = Validation.labelName(name)
        if (labels.findOwnedByName(userId, normalized) != null) throw nameTaken(normalized)
        if (labels.countForUser(userId) >= MAX_LABELS_PER_USER) {
            throw DomainException.forbidden(
                ErrorKeys.LABEL_LIMIT_REACHED,
                "An account can have at most $MAX_LABELS_PER_USER labels",
                mapOf("limit" to MAX_LABELS_PER_USER.toString()),
            )
        }
        return labels.insert(userId, normalized, clock())
    }

    fun rename(userId: Int, labelId: Int, name: String): Label {
        val label = requireOwned(userId, labelId)
        val normalized = Validation.labelName(name)
        val existing = labels.findOwnedByName(userId, normalized)
        if (existing != null && existing.id != label.id) throw nameTaken(normalized)
        labels.rename(label.id, normalized)
        return checkNotNull(labels.find(label.id)) { "Label ${label.id} disappeared" }
    }

    /** Deleting a label also detaches it from every note, enforced by the schema cascade. */
    fun delete(userId: Int, labelId: Int) {
        labels.delete(requireOwned(userId, labelId).id)
    }

    fun requireOwned(userId: Int, labelId: Int): Label {
        val label = labels.find(labelId)
        if (label == null || label.ownerId != userId) {
            throw DomainException.notFound(
                ErrorKeys.LABEL_NOT_FOUND,
                "Label $labelId does not exist",
                mapOf("labelId" to labelId.toString()),
            )
        }
        return label
    }

    private fun nameTaken(name: String) = DomainException.conflict(
        ErrorKeys.LABEL_NAME_TAKEN,
        "Label '$name' already exists",
        mapOf("label" to name),
    )
}
