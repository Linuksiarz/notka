package dev.duwe.notka.entity.model

/**
 * How a reminder comes back after it fires. A note with a reminder and no repeat simply does not
 * come back — the four rules are the original's own list, minus its "repeat until" (which needs a
 * second date and has no place in this model yet).
 */
enum class ReminderRepeat(val wire: String) {
    DAILY("daily"),
    WEEKLY("weekly"),
    MONTHLY("monthly"),
    YEARLY("yearly"),
    ;

    companion object {
        /** The rule a wire value names, or `null` when it names none this app knows. */
        fun fromWire(raw: String?): ReminderRepeat? =
            raw?.let { value -> entries.firstOrNull { it.wire == value } }
    }
}

/**
 * What a write does to a note's reminder. A reminder can legitimately be *taken away*, so "leave it
 * alone" and "there is none" are two different instructions — the same problem `BackgroundChange`
 * solves for the background.
 */
sealed interface ReminderChange {
    data object Unchanged : ReminderChange

    data object Cleared : ReminderChange

    data class Set(val at: Long, val repeat: ReminderRepeat?) : ReminderChange
}
