package dev.duwe.notka.boundary.http

import dev.duwe.notka.FakeOidcProvider
import dev.duwe.notka.FakeSignIn
import dev.duwe.notka.REGISTER_ADA
import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.boundary.config.AppConfig
import dev.duwe.notka.boundary.config.OidcConfig
import dev.duwe.notka.boundary.oidc.OidcIdentityProvider
import dev.duwe.notka.errorField
import dev.duwe.notka.notkaModule
import dev.duwe.notka.postJson
import dev.duwe.notka.stringField
import io.ktor.client.HttpClient
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.decodeURLQueryComponent
import io.ktor.http.encodeURLParameter
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.security.MessageDigest
import java.util.Base64
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

private const val APP_VERIFIER = "the secret that stays in the app's WebView"

class HttpSsoTest {
    private lateinit var provider: FakeOidcProvider
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        provider = FakeOidcProvider()
        fixture = fixtureFor(provider)
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
        provider.close()
    }

    private fun fixtureFor(oidc: FakeOidcProvider, registrationOpen: Boolean = true, cookieSecure: Boolean = false) = TestFixture(
        registrationOpen = registrationOpen,
        cookieSecure = cookieSecure,
        authAttemptsPerMinute = 1000,
        identityProvider = OidcIdentityProvider(
            OidcConfig(oidc.issuer, oidc.clientId, clientSecret = null, name = "Pocket ID"),
            "https://notes.example.com",
        ),
    )

    private fun ApplicationTestBuilder.browser(): HttpClient = createClient {
        install(HttpCookies)
        followRedirects = false
    }

    private suspend fun HttpClient.startSso(link: Boolean = false): String =
        postJson("/api/auth/sso/start", """{"link":$link}""").asJson().stringField("url")

    /** The whole trip: to the provider, signed in there, and back with its answer. */
    private suspend fun HttpClient.signInAt(signIn: FakeSignIn, link: Boolean = false): HttpResponse {
        val url = startSso(link)
        val code = provider.authorize(url, signIn)
        return callback(state(url), code)
    }

    private suspend fun HttpClient.callback(state: String, code: String): HttpResponse =
        get("/api/auth/sso/callback?state=${state.encodeURLParameter()}&code=${code.encodeURLParameter()}")

    private fun state(authorizationUrl: String): String = URI(authorizationUrl).rawQuery.split('&')
        .first { it.startsWith("state=") }.substringAfter('=')

    private fun HttpResponse.location(): String = headers[HttpHeaders.Location] ?: ""

    private suspend fun HttpClient.me(): JsonObject = get("/api/auth/me").asJson().getValue("user").jsonObject

    private fun JsonObject.flag(name: String): Boolean = getValue(name).jsonPrimitive.boolean

    @Test
    fun healthNamesTheProviderSoTheSignInScreenCanOfferIt() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val health = browser().get("/api/health").asJson()

        // then
        assertEquals("Pocket ID", health.stringField("ssoProvider"))
    }

    @Test
    fun theAuthorizationRequestCarriesPkceStateAndNonceAndAnswersToThePublicAddress() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val url = browser().startSso()

        // then
        val query = URI(url).rawQuery.split('&').associate { pair ->
            pair.substringBefore('=') to pair.substringAfter('=').decodeURLQueryComponent(plusIsSpace = true)
        }
        assertTrue(url.startsWith("${provider.issuer}/authorize?"))
        assertEquals("S256", query["code_challenge_method"])
        assertEquals(43, query["code_challenge"]?.length)
        assertTrue("nonce" in query && "state" in query)
        assertEquals("https://notes.example.com/api/auth/sso/callback", query["redirect_uri"])
        assertEquals(setOf("openid", "email", "profile"), query["scope"]?.split(' ')?.toSet())
    }

    @Test
    fun theAttemptCookieFollowsTheSessionCookiesRulesAndIsAHostCookieWhenSecure() = testApplication {
        // given
        val secure = fixtureFor(provider, cookieSecure = true)
        application { notkaModule(secure.services) }

        // when
        val response = createClient { followRedirects = false }.postJson("/api/auth/sso/start", "{}")

        // then
        val cookie = response.headers[HttpHeaders.SetCookie].orEmpty()
        assertTrue(cookie.startsWith("__Host-notka_sso="), cookie)
        assertTrue("HttpOnly" in cookie && "Secure" in cookie && "SameSite=Lax" in cookie && "Path=/" in cookie, cookie)
        secure.close()
    }

    @Test
    fun aNewSubjectBecomesAnAccountWithoutAPasswordAndComesBackToIt() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val browser = browser()

        // when
        val first = browser.signInAt(FakeSignIn("alice", email = "Alice@Example.com", name = "Alice A"))
        val account = browser.me()
        val session = first.headers.getAll(HttpHeaders.SetCookie).orEmpty().first { it.startsWith("notka_session=") }
        val again = browser().signInAt(FakeSignIn("alice", email = "somebody.else@example.com", name = "Renamed"))

        // then
        assertEquals(HttpStatusCode.Found, first.status)
        assertEquals("/", first.location())
        assertTrue("HttpOnly" in session && "SameSite=Lax" in session)
        assertEquals("alice@example.com", account.stringField("email"))
        assertEquals("Alice A", account.stringField("displayName"))
        assertFalse(account.flag("hasPassword"))
        assertTrue(account.flag("ssoLinked"))
        assertFalse(account.flag("admin"))
        assertEquals("/", again.location())
        assertEquals(1, fixture.services.admin.usage().size)
    }

    @Test
    fun theAddressMayComeFromTheUserInfoEndpointButOnlyForTheSameSubject() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val browser = browser()
        browser.signInAt(FakeSignIn("alice", emailOnlyInUserInfo = true))
        val foreign = browser().signInAt(FakeSignIn("bob", emailOnlyInUserInfo = true, userInfoSubject = "mallory"))

        // then
        assertEquals("alice@example.com", browser.me().stringField("email"))
        assertEquals("/?ssoError=auth.sso_failed", foreign.location())
    }

    @Test
    fun whileSignUpIsClosedANewSubjectIsTurnedAwayAndAKnownOneIsNot() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        browser().signInAt(FakeSignIn("alice"))
        fixture.services.settings.setRegistrationOpen(false)
        val stranger = browser()

        // when
        val refused = stranger.signInAt(FakeSignIn("mallory"))
        val known = browser().signInAt(FakeSignIn("alice"))

        // then
        assertEquals("/?ssoError=auth.registration_disabled", refused.location())
        assertEquals(HttpStatusCode.Unauthorized, stranger.get("/api/auth/me").status)
        assertEquals("/", known.location())
    }

    @Test
    fun anAddressThatIsAlreadyTakenNeverLinksToThatAccount() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        fixture.registerUser(email = "ada@example.com")
        val attacker = browser()

        // when
        val response = attacker.signInAt(FakeSignIn("mallory", email = "ada@example.com"))

        // then
        assertEquals("/?ssoError=auth.sso_email_taken", response.location())
        assertEquals(HttpStatusCode.Unauthorized, attacker.get("/api/auth/me").status)
    }

    @Test
    fun aProviderThatGivesNoAddressCannotMakeAnAccount() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val response = browser().signInAt(FakeSignIn("alice", email = null))

        // then
        assertEquals("/?ssoError=auth.sso_email_required", response.location())
    }

    @Test
    fun anAnswerThatDoesNotBelongToThisBrowserIsRefused() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val browser = browser()
        val url = browser.startSso()
        val code = provider.authorize(url, FakeSignIn("alice"))

        // when
        val wrongState = browser.callback("forged", code)
        val noAttempt = browser().callback(state(url), code)
        val replayed = browser.callback(state(url), code)

        // then
        assertEquals("/?ssoError=auth.sso_failed", wrongState.location())
        assertEquals("/?ssoError=auth.sso_failed", noAttempt.location())
        assertEquals("/?ssoError=auth.sso_failed", replayed.location())
        assertEquals(HttpStatusCode.Unauthorized, browser.get("/api/auth/me").status)
    }

    @Test
    fun anIdTokenThatDoesNotHoldIsRefusedWhateverIsWrongWithIt() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val forgeries = listOf(
            FakeSignIn("alice", signingKey = provider.strangerKey),
            FakeSignIn("alice", audience = "another-client"),
            FakeSignIn("alice", nonce = "another-nonce"),
            FakeSignIn("alice", issuer = "https://evil.example.com"),
        )

        // when
        val answers = forgeries.map { browser().signInAt(it).location() }

        // then
        assertEquals(List(forgeries.size) { "/?ssoError=auth.sso_failed" }, answers)
        assertEquals(0, fixture.services.admin.usage().size)
    }

    @Test
    fun aRefusalAtTheProviderComesBackAsSuch() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val browser = browser()
        val url = browser.startSso()

        // when
        val response = browser.get("/api/auth/sso/callback?state=${state(url)}&error=access_denied")

        // then
        assertEquals("/?ssoError=auth.sso_denied", response.location())
    }

    @Test
    fun aProviderThatIsDownOnlyStopsItsOwnSignIn() = testApplication {
        // given
        val down = FakeOidcProvider()
        val instance = fixtureFor(down)
        down.close()
        application { notkaModule(instance.services) }
        val browser = browser()

        // when
        val start = browser.postJson("/api/auth/sso/start", "{}")
        val register = browser.postJson("/api/auth/register", REGISTER_ADA)

        // then
        assertEquals(HttpStatusCode.ServiceUnavailable, start.status)
        assertEquals("auth.sso_unavailable", start.errorField("key"))
        assertEquals(HttpStatusCode.Created, register.status)
        instance.close()
    }

    @Test
    fun anInstanceWithoutAProviderSaysSo() = testApplication {
        // given
        val plain = TestFixture()
        application { notkaModule(plain.services) }

        // when
        val health = browser().get("/api/health").asJson()
        val start = browser().postJson("/api/auth/sso/start", "{}")

        // then
        assertEquals(JsonNull, health["ssoProvider"])
        assertEquals("auth.sso_not_configured", start.errorField("key"))
        plain.close()
    }

    @Test
    fun anAccountWithAPasswordConnectsFromInsideAndStaysWhatItWas() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        fixture.services.auth.createAdmin("admin", "administrator password", null)
        val browser = browser()
        browser.postJson("/api/auth/login", """{"login":"admin","password":"administrator password"}""")

        // when
        val linked = browser.signInAt(FakeSignIn("boss", email = "boss@example.com"), link = true)
        val account = browser.me()
        val elsewhere = browser()
        elsewhere.signInAt(FakeSignIn("boss", email = "boss@example.com"))
        val throughProvider = elsewhere.me()
        val withPassword = browser().postJson("/api/auth/login", """{"login":"admin","password":"administrator password"}""")

        // then
        assertEquals("/?sso=linked", linked.location())
        assertTrue(account.flag("ssoLinked"))
        assertTrue(account.flag("hasPassword"))
        assertEquals(account.stringField("id"), throughProvider.stringField("id"))
        assertTrue(throughProvider.flag("admin"))
        assertEquals(HttpStatusCode.OK, withPassword.status)
    }

    @Test
    fun connectingNeedsASessionAndAnIdentityNobodyElseHas() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        browser().signInAt(FakeSignIn("alice"))
        val ada = browser()
        ada.postJson("/api/auth/register", REGISTER_ADA)

        // when
        val anonymous = browser().postJson("/api/auth/sso/start", """{"link":true}""")
        val taken = ada.signInAt(FakeSignIn("alice"), link = true)
        ada.signInAt(FakeSignIn("ada"), link = true)
        val second = ada.signInAt(FakeSignIn("ada2"), link = true)

        // then
        assertEquals(HttpStatusCode.Unauthorized, anonymous.status)
        assertEquals("/?ssoError=auth.sso_identity_taken", taken.location())
        assertEquals("/?ssoError=auth.sso_already_linked", second.location())
    }

    @Test
    fun onlyAnAccountThatCanStillSignInMayDisconnect() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = browser()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        ada.signInAt(FakeSignIn("ada"), link = true)
        val alice = browser()
        alice.signInAt(FakeSignIn("alice"))

        // when
        val disconnected = ada.delete("/api/auth/me/sso").asJson().getValue("user").jsonObject
        val refused = alice.delete("/api/auth/me/sso")
        val cameBack = browser().signInAt(FakeSignIn("ada", email = "another@example.com"))

        // then
        assertFalse(disconnected.flag("ssoLinked"))
        assertEquals("auth.sso_password_required", refused.errorField("key"))
        assertEquals("/", cameBack.location())
        assertEquals(3, fixture.services.admin.usage().size)
    }

    @Test
    fun anAccountWithoutAPasswordCannotBeSignedIntoOrResetWithOne() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val alice = browser()
        alice.signInAt(FakeSignIn("alice"))
        val id = alice.me().stringField("id").toInt()
        fixture.services.auth.createAdmin("admin", "administrator password", null)

        // when
        val login = browser().postJson("/api/auth/login", """{"login":"alice@example.com","password":""}""")
        val change = alice.postJson("/api/auth/me/encryption", """{"password":""}""")
        val failure = assertFailsWith<dev.duwe.notka.entity.model.DomainException> { fixture.services.admin.resetPassword(id, "en") }

        // then
        assertEquals("auth.invalid_credentials", login.errorField("key"))
        assertEquals("auth.passphrase_too_short", change.errorField("key"))
        assertEquals("admin.user_has_no_password", failure.key)
    }

    @Test
    fun aPassphraseProtectsTheNotesFromAnotherDeviceThatOnlyHasTheProvidersSignIn() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val first = browser()
        first.signInAt(FakeSignIn("alice"))
        val enabled = first.postJson("/api/auth/me/encryption", """{"passphrase":"my long passphrase"}""").asJson()
        val note = first.postJson("/api/notes", """{"title":"Secret"}""").asJson()

        // when: the first device still has the key in memory while the second signs in
        val second = browser()
        second.signInAt(FakeSignIn("alice"))
        val locked = second.me()
        val refused = second.get("/api/notes")
        val wrong = second.postJson("/api/auth/me/encryption/unlock", """{"secret":"not the passphrase"}""")
        val unlocked = second.postJson("/api/auth/me/encryption/unlock", """{"secret":"my long passphrase"}""")
        val read = second.get("/api/notes/${note.stringField("id")}").asJson()
        val stillOpen = second.me()

        // then
        assertEquals(39, enabled.stringField("recoveryKey").length)
        assertEquals("ENCRYPTED", note.stringField("encryption"))
        assertTrue(locked.flag("encryptionLocked"))
        assertEquals(HttpStatusCode.Forbidden, refused.status)
        assertEquals("auth.encryption_locked", refused.errorField("key"))
        assertEquals("auth.encryption_secret_invalid", wrong.errorField("key"))
        assertEquals(HttpStatusCode.OK, unlocked.status)
        assertFalse(unlocked.asJson().getValue("user").jsonObject.flag("encryptionLocked"))
        assertEquals("Secret", read.stringField("title"))
        assertFalse(stillOpen.flag("encryptionLocked"))
    }

    @Test
    fun anUnlockedDeviceStaysUnlockedAfterAServerRestart() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val device = browser()
        device.signInAt(FakeSignIn("alice"))
        device.postJson("/api/auth/me/encryption", """{"passphrase":"my long passphrase"}""")
        val note = device.postJson("/api/notes", """{"title":"Secret"}""").asJson()
        val id = device.me().stringField("id").toInt()

        // when
        fixture.services.keyRing.forget(id)
        val read = device.get("/api/notes/${note.stringField("id")}").asJson()

        // then
        assertEquals("Secret", read.stringField("title"))
    }

    @Test
    fun aLockedDeviceMaySignOutButNotReachAnythingElse() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val first = browser()
        first.signInAt(FakeSignIn("alice"))
        first.postJson("/api/auth/me/encryption", """{"passphrase":"my long passphrase"}""")
        val second = browser()
        second.signInAt(FakeSignIn("alice"))

        // when
        val labels = second.get("/api/labels")
        val turnedOff = second.delete("/api/auth/me/encryption")
        val themes = second.get("/api/themes")
        val signedOut = second.postJson("/api/auth/logout", "{}")

        // then
        assertEquals("auth.encryption_locked", labels.errorField("key"))
        assertEquals("auth.encryption_locked", turnedOff.errorField("key"))
        assertEquals(HttpStatusCode.OK, themes.status)
        assertEquals(HttpStatusCode.NoContent, signedOut.status)
        assertEquals(HttpStatusCode.Unauthorized, second.get("/api/auth/me").status)
    }

    @Test
    fun aConnectedAccountWithAPasswordUnlocksWithThatPassword() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val ada = browser()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        ada.signInAt(FakeSignIn("ada"), link = true)
        ada.postJson("/api/auth/me/encryption", """{"password":"correct horse battery"}""")
        val note = ada.postJson("/api/notes", """{"title":"Secret"}""").asJson()

        // when
        val device = browser()
        device.signInAt(FakeSignIn("ada"))
        val locked = device.me()
        device.postJson("/api/auth/me/encryption/unlock", """{"secret":"correct horse battery"}""")
        val read = device.get("/api/notes/${note.stringField("id")}").asJson()

        // then
        assertTrue(locked.flag("encryptionLocked"))
        assertEquals("Secret", read.stringField("title"))
    }

    @Test
    fun theRecoveryKeySetsANewPassphraseAndSignsTheOtherDevicesOut() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val first = browser()
        first.signInAt(FakeSignIn("alice"))
        val recoveryKey = first.postJson("/api/auth/me/encryption", """{"passphrase":"forgotten passphrase"}""")
            .asJson().stringField("recoveryKey")
        val note = first.postJson("/api/notes", """{"title":"Secret"}""").asJson()
        val second = browser()
        second.signInAt(FakeSignIn("alice"))

        // when
        val mistyped = second.postJson(
            "/api/auth/me/encryption/recover",
            """{"recoveryKey":"0000-0000-0000-0000-0000-0000-0000-0000","newPassphrase":"a new passphrase"}""",
        )
        val noPassphrase = second.postJson("/api/auth/me/encryption/recover", """{"recoveryKey":"$recoveryKey"}""")
        val recovered = second.postJson(
            "/api/auth/me/encryption/recover",
            """{"recoveryKey":"$recoveryKey","newPassphrase":"a new passphrase"}""",
        )
        val read = second.get("/api/notes/${note.stringField("id")}").asJson()
        val third = browser()
        third.signInAt(FakeSignIn("alice"))
        val oldOne = third.postJson("/api/auth/me/encryption/unlock", """{"secret":"forgotten passphrase"}""")
        val newOne = third.postJson("/api/auth/me/encryption/unlock", """{"secret":"a new passphrase"}""")

        // then
        assertEquals("auth.recovery_key_invalid", mistyped.errorField("key"))
        assertEquals("auth.passphrase_too_short", noPassphrase.errorField("key"))
        assertEquals(HttpStatusCode.OK, recovered.status)
        assertEquals("Secret", read.stringField("title"))
        assertEquals(HttpStatusCode.Unauthorized, first.get("/api/auth/me").status)
        assertEquals("auth.encryption_secret_invalid", oldOne.errorField("key"))
        assertEquals(HttpStatusCode.OK, newOne.status)
    }

    @Test
    fun aChangedPassphraseIsAskedForTheOldOneAndWrapsTheSameKey() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val device = browser()
        device.signInAt(FakeSignIn("alice"))
        device.postJson("/api/auth/me/encryption", """{"passphrase":"my long passphrase"}""")
        val note = device.postJson("/api/notes", """{"title":"Secret"}""").asJson()

        // when
        val wrong = device.postJson("/api/auth/me/encryption/passphrase", """{"currentPassphrase":"nope","newPassphrase":"a new passphrase"}""")
        val changed = device.postJson("/api/auth/me/encryption/passphrase", """{"currentPassphrase":"my long passphrase","newPassphrase":"a new passphrase"}""")
        val other = browser()
        other.signInAt(FakeSignIn("alice"))
        other.postJson("/api/auth/me/encryption/unlock", """{"secret":"a new passphrase"}""")
        val read = other.get("/api/notes/${note.stringField("id")}").asJson()

        // then
        assertEquals("auth.encryption_secret_invalid", wrong.errorField("key"))
        assertEquals(HttpStatusCode.OK, changed.status)
        assertEquals("Secret", read.stringField("title"))
    }

    @Test
    fun givingUpTheNotesIsForALockedAccountWithoutAPasswordAlone() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val first = browser()
        first.signInAt(FakeSignIn("alice"))
        first.postJson("/api/auth/me/encryption", """{"passphrase":"my long passphrase"}""")
        val note = first.postJson("/api/notes", """{"title":"Secret"}""").asJson()
        val ada = browser()
        ada.postJson("/api/auth/register", REGISTER_ADA)
        ada.signInAt(FakeSignIn("ada"), link = true)
        ada.postJson("/api/auth/me/encryption", """{"password":"correct horse battery"}""")
        val adaLocked = browser()
        adaLocked.signInAt(FakeSignIn("ada"))
        val aliceLocked = browser()
        aliceLocked.signInAt(FakeSignIn("alice"))

        // when
        val unlockedRefused = first.postJson("/api/auth/me/encryption/discard", "{}")
        val withPasswordRefused = adaLocked.postJson("/api/auth/me/encryption/discard", "{}")
        val discarded = aliceLocked.postJson("/api/auth/me/encryption/discard", "{}").asJson().getValue("user").jsonObject
        val gone = aliceLocked.get("/api/notes/${note.stringField("id")}")

        // then
        assertEquals(HttpStatusCode.Forbidden, unlockedRefused.status)
        assertEquals(HttpStatusCode.Forbidden, withPasswordRefused.status)
        assertFalse(discarded.flag("encryption"))
        assertFalse(discarded.flag("encryptionLocked"))
        assertEquals(HttpStatusCode.NotFound, gone.status)
    }

    /** Android's app: the attempt held by the server, the answer brought back as a code. */
    private suspend fun HttpClient.startInApp(link: Boolean = false, verifier: String = APP_VERIFIER): String =
        postJson("/api/auth/sso/start", """{"link":$link,"appChallenge":"${challengeOf(verifier)}"}""").asJson().stringField("url")

    private fun challengeOf(verifier: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))

    private fun appCode(callback: HttpResponse): String {
        val location = callback.location()
        assertTrue(location.startsWith("dev.duwe.notka://sso?ssoCode="), location)
        return location.substringAfter("ssoCode=").decodeURLQueryComponent()
    }

    private suspend fun HttpClient.exchange(code: String, verifier: String = APP_VERIFIER): HttpResponse =
        postJson("/api/auth/sso/exchange", """{"code":"$code","verifier":"$verifier"}""")

    @Test
    fun theAppSignsInByExchangingTheCodeInItsOwnWebView() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val webView = browser()
        val customTab = browser()
        val url = webView.startInApp()

        // when
        val callback = customTab.callback(state(url), provider.authorize(url, FakeSignIn("ada")))
        val code = appCode(callback)
        val anonymousBeforeExchange = webView.get("/api/auth/me").status
        val exchange = webView.exchange(code)

        // then
        assertEquals(HttpStatusCode.Unauthorized, anonymousBeforeExchange)
        assertEquals(HttpStatusCode.OK, exchange.status)
        assertFalse(exchange.asJson().getValue("linked").jsonPrimitive.boolean)
        assertEquals("ada@example.com", webView.me().stringField("email"))
        assertEquals(HttpStatusCode.Unauthorized, customTab.get("/api/auth/me").status)
        assertTrue(callback.headers.getAll(HttpHeaders.SetCookie).orEmpty().isEmpty())
    }

    @Test
    fun theAppsStartLeavesNoAttemptCookieBehind() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val response = browser().postJson("/api/auth/sso/start", """{"appChallenge":"${challengeOf(APP_VERIFIER)}"}""")

        // then
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.headers.getAll(HttpHeaders.SetCookie).orEmpty().isEmpty())
    }

    @Test
    fun aCodeIsWorthlessWithoutTheVerifierAndIsUsedUpByTheFirstTry() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val webView = browser()
        val url = webView.startInApp()
        val code = appCode(browser().callback(state(url), provider.authorize(url, FakeSignIn("ada"))))

        // when
        val otherApp = browser().exchange(code, verifier = "somebody else's secret")
        val owner = webView.exchange(code)

        // then
        assertEquals(HttpStatusCode.BadRequest, otherApp.status)
        assertEquals("auth.sso_failed", otherApp.asJson().errorField("key"))
        assertEquals(HttpStatusCode.BadRequest, owner.status)
        assertEquals(HttpStatusCode.Unauthorized, webView.get("/api/auth/me").status)
    }

    @Test
    fun aCodeSignsInOnlyOnce() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val webView = browser()
        val url = webView.startInApp()
        val code = appCode(browser().callback(state(url), provider.authorize(url, FakeSignIn("ada"))))

        // when
        val first = webView.exchange(code)
        val second = browser().exchange(code)

        // then
        assertEquals(HttpStatusCode.OK, first.status)
        assertEquals(HttpStatusCode.BadRequest, second.status)
    }

    @Test
    fun anAppAnswerCanBeDeliveredOnlyOnce() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val url = browser().startInApp()
        val providerCode = provider.authorize(url, FakeSignIn("ada"))
        browser().callback(state(url), providerCode)

        // when
        val again = browser().callback(state(url), providerCode)

        // then
        assertEquals("/?ssoError=auth.sso_failed", again.location())
    }

    @Test
    fun aCodeExpiresWithinAMinute() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val webView = browser()
        val url = webView.startInApp()
        val code = appCode(browser().callback(state(url), provider.authorize(url, FakeSignIn("ada"))))

        // when
        fixture.now += 60_000L
        val late = webView.exchange(code)

        // then
        assertEquals(HttpStatusCode.BadRequest, late.status)
        assertEquals("auth.sso_failed", late.asJson().errorField("key"))
    }

    @Test
    fun aRefusalAtTheProviderReachesTheAppAsAKey() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val url = browser().startInApp()

        // when
        val callback = browser().get("/api/auth/sso/callback?state=${state(url)}&error=access_denied")

        // then
        assertEquals("dev.duwe.notka://sso?ssoError=auth.sso_denied", callback.location())
    }

    @Test
    fun aChallengeThatIsNotAHashIsRefused() = testApplication {
        // given
        application { notkaModule(fixture.services) }

        // when
        val response = browser().postJson("/api/auth/sso/start", """{"appChallenge":"short"}""")

        // then
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun theAppConnectsTheSignedInAccountOnlyAtTheExchange() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val webView = browser()
        webView.postJson("/api/auth/register", REGISTER_ADA)
        val url = webView.startInApp(link = true)
        val code = appCode(browser().callback(state(url), provider.authorize(url, FakeSignIn("ada-at-provider"))))
        val beforeExchange = webView.me().flag("ssoLinked")

        // when
        val exchange = webView.exchange(code)

        // then
        assertFalse(beforeExchange)
        assertEquals(HttpStatusCode.OK, exchange.status)
        val body = exchange.asJson()
        assertTrue(body.getValue("linked").jsonPrimitive.boolean)
        assertTrue(body.getValue("user").jsonObject.flag("ssoLinked"))
    }

    @Test
    fun connectingInTheAppNeedsTheSessionThatAskedForIt() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val webView = browser()
        webView.postJson("/api/auth/register", REGISTER_ADA)
        val url = webView.startInApp(link = true)
        val code = appCode(browser().callback(state(url), provider.authorize(url, FakeSignIn("ada-at-provider"))))

        // when
        val withoutSession = browser().exchange(code)

        // then
        assertEquals(HttpStatusCode.Unauthorized, withoutSession.status)
        assertFalse(webView.me().flag("ssoLinked"))
    }

    @Test
    fun anEncryptedAccountStaysLockedAfterTheExchangeUntilThisDeviceUnlocks() = testApplication {
        // given
        application { notkaModule(fixture.services) }
        val firstDevice = browser()
        firstDevice.signInAt(FakeSignIn("ada"))
        firstDevice.postJson("/api/auth/me/encryption", """{"passphrase":"a long encryption passphrase"}""")
        val webView = browser()
        val url = webView.startInApp()
        val code = appCode(browser().callback(state(url), provider.authorize(url, FakeSignIn("ada"))))

        // when
        val exchange = webView.exchange(code)
        val notesWhileLocked = webView.get("/api/notes").status
        val unlock = webView.postJson("/api/auth/me/encryption/unlock", """{"secret":"a long encryption passphrase"}""")

        // then
        assertTrue(exchange.asJson().getValue("user").jsonObject.flag("encryptionLocked"))
        assertEquals(HttpStatusCode.Forbidden, notesWhileLocked)
        assertEquals(HttpStatusCode.OK, unlock.status)
        assertEquals(HttpStatusCode.OK, webView.get("/api/notes").status)
    }

    @Test
    fun theConfigurationAsksForWhatASignInCannotDoWithout() {
        // given
        fun environment(vararg values: Pair<String, String>): (String) -> String? = values.toMap()::get

        // when
        val missingClient = assertFailsWith<IllegalArgumentException> {
            AppConfig.fromEnvironment(environment("NOTKA_OIDC_ISSUER" to "https://id.example.com", "NOTKA_PUBLIC_URL" to "https://n.example.com"))
        }
        val missingAddress = assertFailsWith<IllegalArgumentException> {
            AppConfig.fromEnvironment(environment("NOTKA_OIDC_ISSUER" to "https://id.example.com", "NOTKA_OIDC_CLIENT_ID" to "notka"))
        }
        val configured = AppConfig.fromEnvironment(
            environment(
                "NOTKA_OIDC_ISSUER" to "https://id.example.com",
                "NOTKA_OIDC_CLIENT_ID" to "notka",
                "NOTKA_OIDC_CLIENT_SECRET" to "s3cret",
                "NOTKA_PUBLIC_URL" to "https://n.example.com",
            ),
        )

        // then
        assertTrue("NOTKA_OIDC_CLIENT_ID" in missingClient.message.orEmpty())
        assertTrue("NOTKA_PUBLIC_URL" in missingAddress.message.orEmpty())
        assertEquals("SSO", configured.oidc?.name)
        assertNotEquals(true, configured.oidc.toString().contains("s3cret"))
    }
}
