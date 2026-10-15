package dev.duwe.notka.entity.model

/** Labels are per user; sharing a note never shares your labels. */
data class Label(
    val id: Int,
    val ownerId: Int,
    val name: String,
    val createdAt: Long,
)
