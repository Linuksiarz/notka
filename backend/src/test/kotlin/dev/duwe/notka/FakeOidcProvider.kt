package dev.duwe.notka

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.util.Base64
import java.util.Date
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** What the provider says about whoever signs in, and what a test wants it to get wrong. */
data class FakeSignIn(
    val subject: String,
    val email: String? = "$subject@example.com",
    val name: String? = "User $subject",
    val audience: String? = null,
    val nonce: String? = null,
    val issuer: String? = null,
    val signingKey: RSAKey? = null,
    /** Keeps the address out of the ID token, where a provider may leave it to the userinfo endpoint. */
    val emailOnlyInUserInfo: Boolean = false,
    val userInfoSubject: String? = null,
)

/**
 * A real OpenID Connect provider over HTTP, as far as a client can tell: discovery, a signed ID token,
 * a JWK set, PKCE enforced at the token endpoint, a userinfo endpoint. The browser's part is
 * [authorize], which takes the address the application sent the browser to.
 */
class FakeOidcProvider(val clientId: String = "notka", private val clientSecret: String? = null) : AutoCloseable {
    private val key: RSAKey = RSAKeyGenerator(2048).keyID("test-key").generate()
    val strangerKey: RSAKey = RSAKeyGenerator(2048).keyID("test-key").generate()

    private class Grant(val signIn: FakeSignIn, val nonce: String, val challenge: String, val redirectUri: String)

    private val grants = ConcurrentHashMap<String, Grant>()
    private val accessTokens = ConcurrentHashMap<String, FakeSignIn>()
    private val server: HttpServer = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)

    val issuer: String get() = "http://127.0.0.1:${server.address.port}"

    init {
        server.createContext("/.well-known/openid-configuration") { exchange ->
            exchange.respond(
                200,
                """{"issuer":"$issuer","authorization_endpoint":"$issuer/authorize","token_endpoint":"$issuer/token",
                "userinfo_endpoint":"$issuer/userinfo","jwks_uri":"$issuer/jwks","response_types_supported":["code"],
                "subject_types_supported":["public"],"id_token_signing_alg_values_supported":["RS256"]}""",
            )
        }
        server.createContext("/jwks") { it.respond(200, JWKSet(key.toPublicJWK()).toString()) }
        server.createContext("/token", ::token)
        server.createContext("/userinfo", ::userInfo)
        server.start()
    }

    /** The reader signs in at the provider: returns the code the provider redirects back with. */
    fun authorize(authorizationUrl: String, signIn: FakeSignIn): String {
        val query = parameters(URI(authorizationUrl).rawQuery)
        check(query["response_type"] == "code" && query["code_challenge_method"] == "S256")
        val code = UUID.randomUUID().toString()
        grants[code] = Grant(signIn, query.getValue("nonce"), query.getValue("code_challenge"), query.getValue("redirect_uri"))
        return code
    }

    private fun token(exchange: HttpExchange) {
        val form = parameters(exchange.requestBody.readAllBytes().decodeToString())
        val grant = grants.remove(form["code"])
        val challenge = form["code_verifier"]?.let { verifier ->
            Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        }
        val authorized = clientSecret == null ||
            exchange.requestHeaders.getFirst("Authorization") ==
            "Basic " + Base64.getEncoder().encodeToString("$clientId:$clientSecret".toByteArray())
        if (grant == null || challenge != grant.challenge || form["redirect_uri"] != grant.redirectUri || !authorized) {
            exchange.respond(400, """{"error":"invalid_grant"}""")
            return
        }
        val signIn = grant.signIn
        val claims = JWTClaimsSet.Builder()
            .issuer(signIn.issuer ?: issuer)
            .subject(signIn.subject)
            .audience(signIn.audience ?: clientId)
            .issueTime(Date())
            .expirationTime(Date(System.currentTimeMillis() + 60_000))
            .claim("nonce", signIn.nonce ?: grant.nonce)
        if (!signIn.emailOnlyInUserInfo) {
            signIn.email?.let { claims.claim("email", it) }
            signIn.name?.let { claims.claim("name", it) }
        }
        val idToken = SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.keyID).build(), claims.build())
            .apply { sign(RSASSASigner(signIn.signingKey ?: key)) }
            .serialize()
        val accessToken = UUID.randomUUID().toString()
        accessTokens[accessToken] = signIn
        exchange.respond(200, """{"access_token":"$accessToken","token_type":"Bearer","id_token":"$idToken","expires_in":60}""")
    }

    private fun userInfo(exchange: HttpExchange) {
        val signIn = accessTokens[exchange.requestHeaders.getFirst("Authorization")?.removePrefix("Bearer ")]
        if (signIn == null) {
            exchange.respond(401, """{"error":"invalid_token"}""")
            return
        }
        exchange.respond(200, """{"sub":"${signIn.userInfoSubject ?: signIn.subject}","email":"${signIn.email}","name":"${signIn.name}"}""")
    }

    private fun parameters(encoded: String): Map<String, String> = encoded.split('&').associate { pair ->
        val (name, value) = pair.split('=', limit = 2)
        URLDecoder.decode(name, Charsets.UTF_8) to URLDecoder.decode(value, Charsets.UTF_8)
    }

    private fun HttpExchange.respond(status: Int, body: String) {
        responseHeaders.add("Content-Type", "application/json")
        val bytes = body.toByteArray()
        sendResponseHeaders(status, bytes.size.toLong())
        responseBody.use { it.write(bytes) }
    }

    override fun close() = server.stop(0)
}
