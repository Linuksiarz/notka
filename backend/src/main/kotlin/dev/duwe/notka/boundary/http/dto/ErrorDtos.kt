package dev.duwe.notka.boundary.http.dto

import dev.duwe.notka.entity.model.ErrorKind
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ErrorBody(
    val code: String,
    val key: String,
    val message: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val params: Map<String, String> = emptyMap(),
)

@Serializable
data class ErrorResponse(val error: ErrorBody)

/**
 * The boundary is the only place that knows HTTP statuses. `code` keeps the documented contract
 * (`docs/API.md`), `key` is what the frontend localizes.
 */
fun ErrorKind.toHttpStatus(): HttpStatusCode = when (this) {
    ErrorKind.VALIDATION -> HttpStatusCode.BadRequest
    ErrorKind.UNAUTHORIZED -> HttpStatusCode.Unauthorized
    ErrorKind.FORBIDDEN -> HttpStatusCode.Forbidden
    ErrorKind.NOT_FOUND -> HttpStatusCode.NotFound
    ErrorKind.CONFLICT -> HttpStatusCode.Conflict
    ErrorKind.PAYLOAD_TOO_LARGE -> HttpStatusCode.PayloadTooLarge
    ErrorKind.TOO_MANY_REQUESTS -> HttpStatusCode.TooManyRequests
    ErrorKind.INTERNAL -> HttpStatusCode.InternalServerError
    ErrorKind.UNAVAILABLE -> HttpStatusCode.ServiceUnavailable
}

fun ErrorKind.toCode(): String = when (this) {
    ErrorKind.VALIDATION -> "VALIDATION_ERROR"
    ErrorKind.INTERNAL -> "INTERNAL_ERROR"
    else -> name
}
