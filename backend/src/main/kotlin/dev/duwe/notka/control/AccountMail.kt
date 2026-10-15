package dev.duwe.notka.control

/** The e-mail this instance sends to an account. The boundary writes and delivers it. */
fun interface AccountMail {
    /**
     * Sends [link] to [to]. [locale] is the language the administrator who asked for the reset uses —
     * the only one this server knows the reader is likely to read. Throws when the mail server refuses.
     */
    fun sendPasswordReset(to: String, displayName: String, link: String, locale: String)
}
