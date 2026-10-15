package dev.duwe.notka.boundary.http

import dev.duwe.notka.TestFixture
import dev.duwe.notka.asJson
import dev.duwe.notka.jsonClient
import dev.duwe.notka.notkaModule
import io.ktor.client.request.get
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The sign-in screen has to know whether it is looking at a demo instance, so it can offer the
 * sample credentials. The answer comes from configuration, never from the database.
 */
class DemoHealthTest {
    @Test
    fun reportsDemoModeOnADemoInstance() = testApplication {
        // given: an instance started with the demo flag
        val demo = TestFixture(demo = true)
        application { notkaModule(demo.services) }

        // when
        val response = jsonClient().get("/api/health").asJson()

        // then
        assertEquals(true, response["demo"]?.jsonPrimitive?.boolean)
        demo.close()
    }

    @Test
    fun reportsNoDemoModeOnAnOrdinaryInstance() = testApplication {
        // given: an instance started without it
        val plain = TestFixture()
        application { notkaModule(plain.services) }

        // when
        val response = jsonClient().get("/api/health").asJson()

        // then
        assertEquals(false, response["demo"]?.jsonPrimitive?.boolean)
        plain.close()
    }

    @Test
    fun reportsWhetherSignUpIsOpenAndHowLongTheTrashKeepsNotes() = testApplication {
        // given: an instance whose administrator has not opened sign-up
        val instance = TestFixture(registrationOpen = false)
        application { notkaModule(instance.services) }

        // when
        val response = jsonClient().get("/api/health").asJson()

        // then
        assertEquals(false, response["registrationOpen"]?.jsonPrimitive?.boolean)
        assertEquals(30, response["trashRetentionDays"]?.jsonPrimitive?.int)
        instance.close()
    }
}
