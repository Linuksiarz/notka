package dev.duwe.notka

import io.ktor.client.HttpClient
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

const val REGISTER_ADA: String =
    """{"email":"ada@example.com","displayName":"Ada Lovelace","password":"correct horse battery"}"""
const val REGISTER_BOB: String =
    """{"email":"bob@example.com","displayName":"Bob Builder","password":"correct horse battery"}"""

val JSON: ContentType = ContentType.Application.Json

/** A fresh client per caller, so each one keeps its own session cookie jar. */
fun ApplicationTestBuilder.jsonClient(): HttpClient = createClient { install(HttpCookies) }

suspend fun HttpClient.postJson(path: String, body: String): HttpResponse =
    post(path) {
        contentType(JSON)
        setBody(body)
    }

suspend fun HttpClient.patchJson(path: String, body: String): HttpResponse =
    patch(path) {
        contentType(JSON)
        setBody(body)
    }

suspend fun HttpResponse.asJson(): JsonObject = Json.parseToJsonElement(bodyAsText()).jsonObject

fun HttpResponse.setCookieHeader(): String = headers[HttpHeaders.SetCookie] ?: ""

fun JsonObject.errorField(name: String): String = getValue("error").jsonObject.stringField(name)

/** Convenience for asserting the error envelope straight off a response. */
suspend fun HttpResponse.errorField(name: String): String = asJson().errorField(name)

fun JsonObject.errorParams(): JsonObject = getValue("error").jsonObject["params"]?.jsonObject ?: JsonObject(emptyMap())

fun JsonObject.intField(name: String): Int = getValue(name).jsonPrimitive.content.toInt()

fun JsonObject.hasField(name: String): Boolean = containsKey(name)
