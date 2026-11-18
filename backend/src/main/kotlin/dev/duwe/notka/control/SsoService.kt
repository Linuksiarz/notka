package dev.duwe.notka.control

import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import dev.duwe.notka.entity.model.ErrorKind
import dev.duwe.notka.entity.model.UserSummary
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

/**
 * Who the provider says this is, from an ID token it verified. Only [subject] identifies them. [idToken]
 * is that token, for signing out at the provider later; like a session's token it is never logged.
 */
data class ProviderIdentity(
    val subject: String,
    val email: String?,
    val name: String?,
    val picture: String? = null,
    val idToken: String? = null,
)

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

    /**
     * Where to send the browser to end its session at the provider, or `null` when that cannot be done:
     * the provider has no such endpoint, or cannot be reached. Never fails, because signing out here has
     * already happened by then.
     */
    suspend fun endSessionUrl(idToken: String): String?
}

data class SsoStart(val attempt: SsoAttempt, val url: String)

/** The provider's answer to an attempt, redeemed by the device that started it. */
data class SsoHandoff(val attempt: SsoAttempt, val providerCode: String)

/**
 * Signing in through an identity provider. An account is found by the provider's subject and never by
 * its address, so whoever controls an address at the provider gets no account here that way. A subject
 * seen for the first time is a sign-up, under the same switch as any other (`docs/API.md`); the provider
 * never makes anybody an administrator. An existing account joins only from inside, signed in ([link]).
 * While it is connected, its name and picture are the provider's: they follow every sign-in and nothing
 * else changes them ([requireUnmanaged]). Its address stays its own, because accounts are told apart by it.
 */
class SsoService(
    private val provider: IdentityProvider?,
    private val identities: SsoIdentityRepository,
    private val users: UserRepository,
    private val auth: AuthService,
    private val settings: ServerSettingsService,
    private val pictures: ProviderPictures,
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

    /**
     * Whether a password may create an account now. "Only through the provider" counts only while there
     * is a provider: an instance that lost its configuration would otherwise have no way in at all.
     */
    fun passwordSignUpOpen(): Boolean = settings.registrationOpen() && !(provider != null && settings.registrationSsoOnly())

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
        follow(userId, identity)
        return auth.startProviderSession(checkNotNull(users.findById(userId)) { "User $userId disappeared" }, identity.idToken)
    }

    /** See [IdentityProvider.endSessionUrl]; `null` too on an instance that no longer has a provider. */
    suspend fun endSessionUrl(idToken: String): String? = provider?.endSessionUrl(idToken)

    /** Connects the signed-in account to the identity that just signed in at the provider. */
    suspend fun link(userId: Int, code: String, attempt: SsoAttempt): UserSummary {
        val provider = configured()
        val identity = provider.identify(code, attempt)
        val owner = identities.findUserId(provider.issuer, identity.subject)
        if (owner != null && owner != userId) {
            throw DomainException.conflict(ErrorKeys.AUTH_SSO_IDENTITY_TAKEN, "That identity belongs to another account")
        }
        if (owner == null) {
            if (identities.isLinked(userId)) {
                throw DomainException.conflict(ErrorKeys.AUTH_SSO_ALREADY_LINKED, "The account is already connected")
            }
            identities.link(provider.issuer, identity.subject, userId, clock())
        }
        follow(userId, identity)
        return checkNotNull(users.findById(userId)) { "User $userId disappeared" }.toSummary()
    }

    /** A connected account takes its name and picture from the provider; what the provider leaves out stays. */
    private fun follow(userId: Int, identity: ProviderIdentity) {
        nameOf(identity)?.let { users.updateDisplayName(userId, Validation.displayName(it)) }
        pictures.remember(userId, identity.picture)
    }

    private fun nameOf(identity: ProviderIdentity): String? =
        identity.name?.trim()?.take(DISPLAY_NAME_MAX_LENGTH)?.takeIf { it.isNotEmpty() }

    /** Refuses a change to what the provider decides for a connected account. */
    fun requireUnmanaged(userId: Int) {
        if (provider != null && identities.isLinked(userId)) {
            throw DomainException(ErrorKind.FORBIDDEN, ErrorKeys.AUTH_SSO_MANAGED, message = "The identity provider manages this")
        }
    }

    /** The provider's picture for the page to encode; `null` when no sign-in left one. */
    suspend fun takePicture(userId: Int): ProviderPicture? = pictures.take(userId)

    /** An upload is the account's own choice, unless it is the page's answer to [takePicture]. */
    fun requireMayUploadAvatar(userId: Int) {
        if (!pictures.answered(userId)) requireUnmanaged(userId)
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
        val name = nameOf(identity) ?: email.substringBefore('@')
        return identities.createAccount(issuer, identity.subject, email, Validation.displayName(name), clock())
    }

    private fun configured(): IdentityProvider = provider
        ?: throw DomainException.notFound(ErrorKeys.AUTH_SSO_NOT_CONFIGURED, "This instance has no identity provider")
}
