package dev.duwe.notka.entity.model

/** Tri-state used by a patch to tell "field absent" apart from "field explicitly cleared". */
sealed interface BackgroundChange {
    data object Unchanged : BackgroundChange
    data object Cleared : BackgroundChange
    data class Set(val value: String) : BackgroundChange
}
