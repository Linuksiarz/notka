package dev.duwe.notka.boundary.http

import dev.duwe.notka.TestFixture
import dev.duwe.notka.boundary.http.routes.mirrorToClient
import dev.duwe.notka.control.NoteChangedEvent
import dev.duwe.notka.control.NoteEventBus
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import io.ktor.utils.io.ClosedWriteChannelException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The live channel must never open for an anonymous caller, or it would leak note identifiers and
 * versions. The fan-out itself is covered by [dev.duwe.notka.control.NoteEventBusTest]; the
 * browser-level behaviour is covered by the Playwright run.
 */
class EventStreamTest {
    private lateinit var fixture: TestFixture

    @BeforeTest
    fun setUp() {
        fixture = TestFixture()
    }

    @AfterTest
    fun tearDown() {
        fixture.close()
    }

    @Test
    fun refusesToOpenAStreamWithoutASession() = testApplication {
        // given: no session cookie
        application { notkaModule(fixture.services) }

        // when
        val response = jsonClient().get("/api/events")

        // then
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun aClientThatGoesAwayEndsTheStreamQuietly() = runBlocking {
        // given: a stream whose writes land on a channel the browser has already closed
        val bus = NoteEventBus()
        var deliveries = 0
        val stream = launch(start = CoroutineStart.UNDISPATCHED) {
            mirrorToClient(bus.events(), userId = 1) { payload ->
                // Keep-alives are not what this test is about; the change is.
                if (payload == null) return@mirrorToClient
                deliveries += 1
                throw ClosedWriteChannelException(IllegalStateException("the browser went away"))
            }
        }

        // when: a change for that user is published
        bus.publish(NoteChangedEvent(noteId = 1, version = 2, audience = setOf(1)))

        // then: the stream ends instead of failing the request that is serving it
        stream.join()
        assertTrue(stream.isCompleted)
        assertEquals(1, deliveries)
    }

    @Test
    fun aStreamWithNothingToSayStillSendsAKeepAliveAtOnce() = runBlocking {
        // given: a stream whose note nobody is touching
        val bus = NoteEventBus()
        val lines = mutableListOf<String?>()
        val firstLine = CompletableDeferred<String?>()
        val stream = launch(start = CoroutineStart.UNDISPATCHED) {
            mirrorToClient(bus.events(), userId = 1, keepAliveEveryMs = 50) { line ->
                lines += line
                firstLine.complete(line)
            }
        }

        // when / then: the very first line arrives without any change, which is what commits the
        // response headers — a stream that waits for its first change is dropped by every proxy
        assertEquals(null, withTimeout(2_000) { firstLine.await() })

        // and: it keeps coming while the stream stays quiet
        withTimeout(2_000) {
            while (lines.size < 3) delay(10)
        }
        stream.cancel()
        assertTrue(lines.all { it == null }, lines.toString())
    }

    @Test
    fun aChangeForSomebodyElseIsNotDelivered() = runBlocking {
        // given: a stream belonging to user 1
        val bus = NoteEventBus()
        val received = mutableListOf<String>()
        val firstDelivery = CompletableDeferred<Unit>()
        val stream = launch(start = CoroutineStart.UNDISPATCHED) {
            mirrorToClient(bus.events(), userId = 1, keepAliveEveryMs = 50) { payload ->
                if (payload == null) return@mirrorToClient
                received += payload
                firstDelivery.complete(Unit)
            }
        }

        // when: a change user 1 cannot see is published, then one they can
        bus.publish(NoteChangedEvent(noteId = 1, version = 2, audience = setOf(99)))
        bus.publish(NoteChangedEvent(noteId = 2, version = 2, audience = setOf(1)))

        // then: only their own note reached them
        withTimeout(2_000) { firstDelivery.await() }
        stream.cancel()
        assertEquals(1, received.size, received.toString())
        assertTrue(received.single().contains("\"noteId\":2"), received.single())
    }
}
