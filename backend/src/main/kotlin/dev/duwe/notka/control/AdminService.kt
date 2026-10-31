package dev.duwe.notka.control

import dev.duwe.notka.entity.model.AccountUsage
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.UserSummary
import dev.duwe.notka.entity.persistence.UserRepository
import io.github.oshai.kotlinlogging.KotlinLogging

/**
 * What the administrator does to other accounts: look at what they store, remove them, and send them
 * a link to choose a new password. The administrator's own account is out of reach of all three —
 * an instance without its administrator would have nobody left to manage it.
 */
class AdminService(
    private val users: UserRepository,
    private val auth: AuthService,
    /** `null` when the instance has no mail server or no public address to put in a link. */
    private val mail: AccountMail?,
    private val publicUrl: String?,
) {
    private val logger = KotlinLogging.logger {}

    /** Whether a reset can be sent at all; the server settings say so rather than letting it fail. */
    val mailConfigured: Boolean get() = mail != null && publicUrl != null

    fun requireAdmin(user: UserSummary) {
        if (!user.admin) throw DomainException.forbidden(ErrorKeys.AUTH_ADMIN_REQUIRED, "Only the administrator may do this")
    }

    fun usage(): List<AccountUsage> = users.usage()

    /** Removes the account with everything it owns; notes it was only given access to stay with their owners. */
    fun deleteUser(userId: Int) {
        managedAccount(userId)
        users.delete(userId)
        logger.info { "Administrator removed account $userId" }
    }

    /**
     * E-mails the account a link to choose a new password, and only once the mail is on its way locks
     * the old password out and signs every device off. A mail server that refuses leaves the account
     * exactly as it was.
     */
    fun resetPassword(userId: Int, locale: String) {
        val account = managedAccount(userId)
        // The identity provider is where that account signs in; a password here would be a second way in.
        if (users.findById(userId)?.hasPassword != true) {
            throw DomainException.conflict(ErrorKeys.ADMIN_USER_HAS_NO_PASSWORD, "Account $userId signs in through the identity provider")
        }
        val address = account.email
            ?: throw DomainException.conflict(ErrorKeys.ADMIN_USER_HAS_NO_EMAIL, "Account $userId has no e-mail address")
        if (mail == null || publicUrl == null) {
            throw DomainException.conflict(ErrorKeys.MAIL_NOT_CONFIGURED, "This instance has no mail server configured")
        }
        val token = auth.issuePasswordReset(userId)
        try {
            mail.sendPasswordReset(address, account.displayName, "$publicUrl/reset-password#$token", locale)
        } catch (failure: Exception) {
            auth.cancelPasswordReset(userId)
            logger.warn(failure) { "Password reset mail for account $userId could not be sent" }
            throw DomainException.unavailable(ErrorKeys.MAIL_SEND_FAILED, "The mail server did not accept the message")
        }
        auth.lockOut(userId)
        logger.info { "Administrator sent a password reset to account $userId" }
    }

    private fun managedAccount(userId: Int): UserSummary {
        val account = users.findById(userId)?.toSummary()
            ?: throw DomainException.notFound(ErrorKeys.ADMIN_USER_NOT_FOUND, "No account $userId")
        if (account.admin) {
            throw DomainException.forbidden(ErrorKeys.ADMIN_CANNOT_CHANGE_ADMIN, "The administrator's account is not managed here")
        }
        return account
    }
}
