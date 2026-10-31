package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import dev.duwe.notka.entity.model.Validation
import dev.duwe.notka.entity.persistence.SsoIdentityRepository
import dev.duwe.notka.entity.persistence.UserRepository
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap

private const val DISPLAY_NAME_MAX_LENGTH = 80

/** How long a reader of Android's app has at the identity provider, as a browser's attempt cookie gives. */
private const val APP_ATTEMPT_TTL_MILLIS = 10 * 60 * 1000L

/** The code is on its way from the system's browser to the app on the same phone: moments, not minutes. */
private const val APP_HANDOFF_TTL_MILLIS = 60 * 1000L

/** One sign-in under way: what the provider's answer has to match. [link] connects a signed-in account instead. */
data class SsoAttempt(val state: String, val nonce: String, val codeVerifier: String, val link: Boolean)

/** Who the provider says this is, from an ID token it verified. Only [subject] identifies them. */
data class ProviderIdentity(val subject: String, val email: String?, val name: String?)

/** An OpenID Connect provider, as far as this application cares (`boundary/oidc`). */
interface IdentityProvider {
    val issuer: String

    /** What the sign-in button calls it. */
    val name: String

    /** The page to send the browser to. */
    suspend fun authorizationUrl(attempt: SsoAttempt): String

    /**
     * Trades [code] for a verified identity. Fails with `auth.sso_unavailable` when the provider cannot
     * be reached and `auth.sso_failed` when what it answered does not hold.
     */
    suspend fun identify(code: String, attempt: SsoAttempt): ProviderIdentity
}

data class SsoStart(val attempt: SsoAttempt, val url: String)

/** The provider's answer to an attempt, redeemed by the device that started it. */
data class SsoHandoff(val attempt: SsoAttempt, val providerCode: String)

/**
 * Signing in through an identity provider. An account is found by the provider's subject and never by
 * its address, so whoever controls an address at the provider gets no account here that way. A subject
 * seen for the first time is a sign-up, under the same switch as any other (`docs/API.md`); the provider
 * never makes anybody an administrator. An existing account joins only from inside, signed in ([link]).
 */
class SsoService(
    private val provider: IdentityProvider?,
    private val identities: SsoIdentityRepository,
    private val users: UserRepository,
    private val auth: AuthService,
    private val settings: ServerSettingsService,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    companion object {
        /** A base64url SHA-256, unpadded. */
        private val APP_CHALLENGE = Regex("[A-Za-z0-9_-]{43}")
    }

    private class AppAttempt(val attempt: SsoAttempt, val challenge: String, val expiresAt: Long)
    private class AppHandoff(val handoff: SsoHandoff, val challenge: String, val expiresAt: Long)

    /**
     * Android's app signs in through a Custom Tab, whose cookies are not its WebView's, so its attempts
     * are held here rather than in a cookie. In memory: they last minutes, and a restart only means
     * pressing the button again.
     */
    private val appAttempts = ConcurrentHashMap<String, AppAttempt>()
    private val appHandoffs = ConcurrentHashMap<String, AppHandoff>()

    val providerName: String? get() = provider?.name

    /** With [appChallenge] the attempt is held for Android's app, and that challenge's verifier redeems it. */
    suspend fun begin(link: Boolean, appChallenge: String? = null): SsoStart {
        if (appChallenge != null && !APP_CHALLENGE.matches(appChallenge)) {
            throw DomainException.validation(ErrorKeys.AUTH_SSO_FAILED, "Not a SHA-256 challenge")
        }
        val attempt = SsoAttempt(AuthService.newToken(), AuthService.newToken(), AuthService.newToken(), link)
        val start = SsoStart(attempt, configured().authorizationUrl(attempt))
        if (appChallenge != null) {
            forgetExpired()
            appAttempts[attempt.state] = AppAttempt(attempt, appChallenge, clock() + APP_ATTEMPT_TTL_MILLIS)
        }
        return start
    }

    /** Whether [state] answers an attempt of the app rather than of a browser, which has its cookie. */
    fun isAppAttempt(state: String): Boolean = appAttempts.containsKey(state)

    /**
     * Stands a code in for the provider's answer, for the app to be sent. Nothing is signed in or
     * connected yet and the provider's code is not spent: all of that waits for [redeem], so a provider
     * page opened from somebody else's link, or a code that reaches another app, achieves nothing.
     */
    fun handOff(state: String, providerCode: String): String {
        val held = appAttempts.remove(state)
        if (held == null || held.expiresAt <= clock()) {
            throw DomainException.validation(ErrorKeys.AUTH_SSO_FAILED, "The sign-in has expired")
        }
        val code = AuthService.newToken()
        appHandoffs[code] = AppHandoff(SsoHandoff(held.attempt, providerCode), held.challenge, clock() + APP_HANDOFF_TTL_MILLIS)
        return code
    }

    /** The provider refused or sent nothing, so this attempt is over. */
    fun abandon(state: String) {
        appAttempts.remove(state)
    }

    /**
     * What [code] stands for, for the holder of the attempt's verifier. A code can be tried once: whoever
     * guesses wrong has used it up, and the reader only has to sign in again.
     */
    fun redeem(code: String, verifier: String): SsoHandoff {
        val held = appHandoffs.remove(code)
        if (held == null || held.expiresAt <= clock() || !answersChallenge(verifier, held.challenge)) {
            throw DomainException.validation(ErrorKeys.AUTH_SSO_FAILED, "The code does not belong to a sign-in of this device")
        }
        return held.handoff
    }

    private fun answersChallenge(verifier: String, challenge: String): Boolean {
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray())
        val expected = Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
        return MessageDigest.isEqual(expected.toByteArray(), challenge.toByteArray())
    }

    private fun forgetExpired() {
        val now = clock()
        appAttempts.values.removeIf { it.expiresAt <= now }
        appHandoffs.values.removeIf { it.expiresAt <= now }
    }

    /** The account the provider's answer belongs to, created when sign-up is open, with a new session. */
    suspend fun signIn(code: String, attempt: SsoAttempt): AuthResult {
        val provider = configured()
        val identity = provider.identify(code, attempt)
        val userId = identities.findUserId(provider.issuer, identity.subject) ?: createAccount(provider.issuer, identity)
        return auth.startProviderSession(checkNotNull(users.findById(userId)) { "User $userId disappeared" })
    }

    /** Connects the signed-in account to the identity that just signed in at the provider. */
    suspend fun link(userId: Int, code: String, attempt: SsoAttempt) {
        val provider = configured()
        val identity = provider.identify(code, attempt)
        val owner = identities.findUserId(provider.issuer, identity.subject)
        if (owner != null && owner != userId) {
            throw DomainException.conflict(ErrorKeys.AUTH_SSO_IDENTITY_TAKEN, "That identity belongs to another account")
        }
        if (owner == userId) return
        if (identities.isLinked(userId)) {
            throw DomainException.conflict(ErrorKeys.AUTH_SSO_ALREADY_LINKED, "The account is already connected")
        }
        identities.link(provider.issuer, identity.subject, userId, clock())
    }

    /** Only an account that can still sign in afterwards may let go of the provider. */
    fun unlink(userId: Int) {
        if (users.findById(userId)?.hasPassword != true) {
            throw DomainException.conflict(ErrorKeys.AUTH_SSO_PASSWORD_REQUIRED, "The account has no password to sign in with")
        }
        identities.unlink(userId)
    }

    private fun createAccount(issuer: String, identity: ProviderIdentity): Int {
        if (!settings.registrationOpen()) {
            throw DomainException(ErrorKind.FORBIDDEN, ErrorKeys.AUTH_REGISTRATION_DISABLED, message = "Registration is disabled on this instance")
        }
        val email = identity.email?.let(Validation::normalizedEmailOrNull)
            ?: throw DomainException.validation(ErrorKeys.AUTH_SSO_EMAIL_REQUIRED, "The identity provider gave no e-mail address")
        // Never linked, whatever the address says: its owner connects the account from Settings.
        if (users.findByEmail(email) != null) {
            throw DomainException.conflict(ErrorKeys.AUTH_SSO_EMAIL_TAKEN, "Another account has that address")
        }
        val name = identity.name?.trim()?.take(DISPLAY_NAME_MAX_LENGTH)?.takeIf { it.isNotEmpty() } ?: email.substringBefore('@')
        return identities.createAccount(issuer, identity.subject, email, Validation.displayName(name), clock())
    }

    private fun configured(): IdentityProvider = provider
        ?: throw DomainException.notFound(ErrorKeys.AUTH_SSO_NOT_CONFIGURED, "This instance has no identity provider")
}
