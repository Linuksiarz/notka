package dev.duwe.notka.boundary.oidc

import com.nimbusds.jose.JOSEException
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.jwk.source.JWKSourceBuilder
import com.nimbusds.jose.proc.BadJOSEException
import com.nimbusds.jose.proc.JWSVerificationKeySelector
import com.nimbusds.jose.proc.SecurityContext
import com.nimbusds.jose.util.DefaultResourceRetriever
import com.nimbusds.oauth2.sdk.AuthorizationCode
import com.nimbusds.oauth2.sdk.AuthorizationCodeGrant
import com.nimbusds.oauth2.sdk.GeneralException
import com.nimbusds.oauth2.sdk.ParseException
import com.nimbusds.oauth2.sdk.ResponseType
import com.nimbusds.oauth2.sdk.Scope
import com.nimbusds.oauth2.sdk.TokenRequest
import com.nimbusds.oauth2.sdk.auth.ClientSecretBasic
import com.nimbusds.oauth2.sdk.auth.Secret
import com.nimbusds.oauth2.sdk.http.HTTPRequest
import com.nimbusds.oauth2.sdk.id.ClientID
import com.nimbusds.oauth2.sdk.id.Issuer
import com.nimbusds.oauth2.sdk.id.State
import com.nimbusds.oauth2.sdk.pkce.CodeChallengeMethod
import com.nimbusds.oauth2.sdk.pkce.CodeVerifier
import com.nimbusds.oauth2.sdk.token.AccessToken
import com.nimbusds.openid.connect.sdk.AuthenticationRequest
import com.nimbusds.openid.connect.sdk.Nonce
import com.nimbusds.openid.connect.sdk.OIDCTokenResponse
import com.nimbusds.openid.connect.sdk.OIDCTokenResponseParser
import com.nimbusds.openid.connect.sdk.UserInfoRequest
import com.nimbusds.openid.connect.sdk.UserInfoResponse
import com.nimbusds.openid.connect.sdk.claims.UserInfo
import com.nimbusds.openid.connect.sdk.op.OIDCProviderMetadata
import com.nimbusds.openid.connect.sdk.validators.IDTokenValidator
import dev.duwe.notka.boundary.config.OidcConfig
import dev.duwe.notka.control.IdentityProvider
import dev.duwe.notka.control.ProviderIdentity
import dev.duwe.notka.control.SsoAttempt
import dev.duwe.notka.entity.model.DomainException
import dev.duwe.notka.entity.model.ErrorKeys
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.URI

private const val CONNECT_TIMEOUT_MILLIS = 5_000
private const val READ_TIMEOUT_MILLIS = 10_000
private const val JWK_SET_SIZE_LIMIT_BYTES = 512 * 1024

/**
 * Authorization code flow with PKCE against the provider's discovery document, on Nimbus's OpenID
 * Connect SDK: the protocol, the signature and every claim check of the ID token (`iss`, `aud`, `exp`,
 * `iat`, `nonce`) are the library's. Discovery happens at the first sign-in rather than at start, so a
 * provider that is down keeps nobody out of the password sign-in or the instance from booting.
 */
class OidcIdentityProvider(private val config: OidcConfig, publicUrl: String) : IdentityProvider {
    private val logger = KotlinLogging.logger {}

    private val redirectUri = URI("$publicUrl/api/auth/sso/callback")
    private val clientId = ClientID(config.clientId)

    private class Discovered(val metadata: OIDCProviderMetadata, val validator: IDTokenValidator)

    @Volatile
    private var discovered: Discovered? = null

    override val issuer: String get() = config.issuer
    override val name: String get() = config.name

    override suspend fun authorizationUrl(attempt: SsoAttempt): String = withContext(Dispatchers.IO) {
        AuthenticationRequest.Builder(ResponseType.CODE, Scope("openid", "email", "profile"), clientId, redirectUri)
            .endpointURI(discover().metadata.authorizationEndpointURI)
            .state(State(attempt.state))
            .nonce(Nonce(attempt.nonce))
            .codeChallenge(CodeVerifier(attempt.codeVerifier), CodeChallengeMethod.S256)
            .build()
            .toURI()
            .toString()
    }

    override suspend fun identify(code: String, attempt: SsoAttempt): ProviderIdentity = withContext(Dispatchers.IO) {
        val provider = discover()
        try {
            val tokens = exchange(provider.metadata, code, attempt)
            val claims = provider.validator.validate(tokens.oidcTokens.idToken, Nonce(attempt.nonce))
            val subject = claims.subject.value
            var email = claims.getStringClaim("email")
            var name = claims.getStringClaim("name") ?: claims.getStringClaim("preferred_username")
            // An ID token may leave the profile to the userinfo endpoint, whenever an access token came with it.
            if (email == null) {
                userInfo(provider.metadata, tokens.oidcTokens.accessToken, subject)?.let { info ->
                    email = info.emailAddress
                    name = name ?: info.name ?: info.preferredUsername
                }
            }
            ProviderIdentity(subject, email, name)
        } catch (failure: IOException) {
            throw unavailable(failure)
        } catch (failure: BadJOSEException) {
            throw failed(failure)
        } catch (failure: JOSEException) {
            throw failed(failure)
        } catch (failure: ParseException) {
            throw failed(failure)
        }
    }

    private fun exchange(metadata: OIDCProviderMetadata, code: String, attempt: SsoAttempt): OIDCTokenResponse {
        val grant = AuthorizationCodeGrant(AuthorizationCode(code), redirectUri, CodeVerifier(attempt.codeVerifier))
        val request = config.clientSecret
            ?.let { TokenRequest(metadata.tokenEndpointURI, ClientSecretBasic(clientId, Secret(it)), grant, null) }
            ?: TokenRequest(metadata.tokenEndpointURI, clientId, grant, null)
        val response = OIDCTokenResponseParser.parse(request.toHTTPRequest().withTimeouts().send())
        if (!response.indicatesSuccess()) {
            throw failed(IOException("The token endpoint answered ${response.toErrorResponse().errorObject?.code}"))
        }
        return response.toSuccessResponse() as OIDCTokenResponse
    }

    /** `null` when the provider has no userinfo endpoint or refuses; the caller deals with a missing address. */
    private fun userInfo(metadata: OIDCProviderMetadata, accessToken: AccessToken, subject: String): UserInfo? {
        val endpoint = metadata.userInfoEndpointURI ?: return null
        val response = UserInfoResponse.parse(UserInfoRequest(endpoint, accessToken).toHTTPRequest().withTimeouts().send())
        if (!response.indicatesSuccess()) return null
        val info = response.toSuccessResponse().userInfo
        // OpenID Connect Core 5.3.2: a userinfo response for another subject must not be used.
        if (info.subject.value != subject) throw failed(IOException("The userinfo endpoint answered for another subject"))
        return info
    }

    private fun discover(): Discovered = discovered ?: try {
        val metadata = OIDCProviderMetadata.resolve(Issuer(config.issuer), CONNECT_TIMEOUT_MILLIS, READ_TIMEOUT_MILLIS)
        val keys = JWKSourceBuilder.create<SecurityContext>(
            metadata.jwkSetURI.toURL(),
            DefaultResourceRetriever(CONNECT_TIMEOUT_MILLIS, READ_TIMEOUT_MILLIS, JWK_SET_SIZE_LIMIT_BYTES),
        ).build()
        // Only the provider's public keys can sign: no `none`, and no shared-secret algorithm a public key could forge.
        val algorithms = metadata.idTokenJWSAlgs.orEmpty().filterTo(mutableSetOf()) { it in JWSAlgorithm.Family.SIGNATURE }
            .ifEmpty { setOf(JWSAlgorithm.RS256) }
        val selector = JWSVerificationKeySelector(algorithms, keys)
        Discovered(metadata, IDTokenValidator(metadata.issuer, clientId, selector, null)).also { discovered = it }
    } catch (failure: IOException) {
        throw unavailable(failure)
    } catch (failure: GeneralException) {
        throw unavailable(failure)
    }

    private fun HTTPRequest.withTimeouts(): HTTPRequest = apply {
        connectTimeout = CONNECT_TIMEOUT_MILLIS
        readTimeout = READ_TIMEOUT_MILLIS
    }

    private fun unavailable(cause: Exception): DomainException {
        logger.warn(cause) { "The identity provider ${config.issuer} could not be reached" }
        return DomainException.unavailable(ErrorKeys.AUTH_SSO_UNAVAILABLE, "The identity provider could not be reached")
    }

    private fun failed(cause: Exception): DomainException {
        logger.warn { "A sign-in through ${config.issuer} failed: ${cause.message}" }
        return DomainException.validation(ErrorKeys.AUTH_SSO_FAILED, "The identity provider's answer could not be verified")
    }
}
