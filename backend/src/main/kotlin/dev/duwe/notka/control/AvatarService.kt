package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ImageFormats
import dev.duwe.notka.entity.model.UserSummary
import dev.duwe.notka.entity.persistence.AvatarRepository
import dev.duwe.notka.entity.persistence.UserRepository

/** A cropped, encoded avatar is a few dozen kilobytes; anything near this is not one. */
const val MAX_AVATAR_BYTES: Int = 512 * 1024

/** The browser uploads 512 × 512; a picture larger than this is drawn far bigger than any avatar is. */
const val MAX_AVATAR_SIDE: Int = 1024

/**
 * An account's own picture. It is stored as JPEG XL and nothing else: the browser crops and encodes
 * it before the upload, so the server keeps one format and converts nothing — no native encoder in the
 * container, nothing decoded on the server. The bytes are recognised by their own header, as a note's
 * pictures are, never by a name or a `Content-Type`.
 */
class AvatarService(
    private val avatars: AvatarRepository,
    private val users: UserRepository,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun set(userId: Int, bytes: ByteArray): UserSummary {
        if (bytes.size > MAX_AVATAR_BYTES) {
            throw DomainException.payloadTooLarge(
                ErrorKeys.AVATAR_TOO_LARGE,
                "An avatar can be at most $MAX_AVATAR_BYTES bytes",
                mapOf("limit" to (MAX_AVATAR_BYTES / 1024).toString()),
            )
        }
        val info = ImageFormats.sniffJpegXl(bytes)
        if (info == null || info.width > MAX_AVATAR_SIDE || info.height > MAX_AVATAR_SIDE) {
            throw DomainException.validation(
                ErrorKeys.AVATAR_UNSUPPORTED,
                "An avatar must be a JPEG XL picture of at most $MAX_AVATAR_SIDE pixels a side",
            )
        }
        avatars.put(userId, bytes, clock())
        return summary(userId)
    }

    fun remove(userId: Int): UserSummary {
        avatars.delete(userId)
        return summary(userId)
    }

    /** Anyone signed in may see an account's picture, as they see its name on a shared note. */
    fun bytes(userId: Int): ByteArray = avatars.bytes(userId) ?: throw DomainException.notFound(
        ErrorKeys.AVATAR_NOT_FOUND,
        "User $userId has no avatar",
        mapOf("userId" to userId.toString()),
    )

    private fun summary(userId: Int): UserSummary =
        checkNotNull(users.findById(userId)) { "User $userId disappeared" }.toSummary()
}
