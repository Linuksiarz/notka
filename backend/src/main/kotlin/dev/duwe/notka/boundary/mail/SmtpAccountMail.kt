package dev.duwe.notka.boundary.mail

import dev.duwe.notka.boundary.config.SmtpConfig
import dev.duwe.notka.boundary.config.SmtpSecurity
import dev.duwe.notka.control.AccountMail
import jakarta.mail.Message
import jakarta.mail.Session
import jakarta.mail.Transport
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import java.util.Date
import java.util.Properties

/**
 * Delivers the instance's e-mail through an external SMTP server, configured the way Vaultwarden's
 * is (`NOTKA_SMTP_*`): the server, how the connection is secured, and an optional login. Nothing is
 * queued — a message the server refuses fails the request that wanted it sent.
 */
class SmtpAccountMail(private val smtp: SmtpConfig) : AccountMail {
    private val session: Session = Session.getInstance(
        Properties().apply {
            val timeout = (smtp.timeoutSeconds * 1000).toString()
            put("mail.smtp.host", smtp.host)
            put("mail.smtp.port", smtp.port.toString())
            put("mail.smtp.connectiontimeout", timeout)
            put("mail.smtp.timeout", timeout)
            put("mail.smtp.writetimeout", timeout)
            put("mail.smtp.auth", (smtp.username != null).toString())
            when (smtp.security) {
                SmtpSecurity.STARTTLS -> {
                    put("mail.smtp.starttls.enable", "true")
                    put("mail.smtp.starttls.required", "true")
                    put("mail.smtp.ssl.checkserveridentity", "true")
                }
                SmtpSecurity.FORCE_TLS -> {
                    put("mail.smtp.ssl.enable", "true")
                    put("mail.smtp.ssl.checkserveridentity", "true")
                }
                SmtpSecurity.OFF -> Unit
            }
        },
    )

    override fun sendPasswordReset(to: String, displayName: String, link: String, locale: String) {
        val text = PasswordResetMail.compose(locale, displayName, link)
        val message = MimeMessage(session).apply {
            setFrom(InternetAddress(smtp.from, smtp.fromName, Charsets.UTF_8.name()))
            setRecipients(Message.RecipientType.TO, InternetAddress.parse(to))
            setSubject(text.subject, Charsets.UTF_8.name())
            setText(text.body, Charsets.UTF_8.name())
            sentDate = Date()
        }
        if (smtp.username != null) {
            Transport.send(message, smtp.username, smtp.password.orEmpty())
        } else {
            Transport.send(message)
        }
    }
}

/**
 * The text of the reset e-mail. The one place the backend writes words for people to read: an e-mail
 * leaves the app, so there is no frontend to localize it. It is written in the language of the
 * administrator who asked for the reset — `pl`, or English for everything else (`en-GB` has the same
 * words as `en-US`).
 */
object PasswordResetMail {
    data class Text(val subject: String, val body: String)

    fun compose(locale: String, displayName: String, link: String): Text =
        if (locale.lowercase().startsWith("pl")) {
            Text(
                subject = "Ustaw nowe hasło do Notki",
                body = """
                    Cześć $displayName,

                    administrator Twojej Notki zresetował Twoje hasło. Ustaw nowe tutaj:

                    $link

                    Link działa przez 24 godziny i tylko raz. Do tego czasu nie zalogujesz się starym hasłem.

                    Jeśli się tego nie spodziewasz, skontaktuj się z administratorem.
                """.trimIndent(),
            )
        } else {
            Text(
                subject = "Choose a new Notka password",
                body = """
                    Hello $displayName,

                    the administrator of your Notka has reset your password. Choose a new one here:

                    $link

                    The link works for 24 hours, once. Until you use it, your old password no longer signs you in.

                    If you did not expect this, contact your administrator.
                """.trimIndent(),
            )
        }
}
