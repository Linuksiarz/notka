package dev.duwe.notka.control

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI

/** What this server may ask for when somebody other than its administrator chose the address. */
object PublicAddresses {
    /**
     * Only `http`/`https`, and only a host that resolves to public addresses. Loopback, site-local,
     * link-local, multicast and unique-local addresses are what a request forged by a user would be
     * aimed at, so they are refused before any connection is made.
     */
    fun uriOrNull(url: String): URI? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        if (uri.scheme?.lowercase() !in setOf("http", "https")) return null
        val host = uri.host?.takeIf { it.isNotBlank() } ?: return null
        val addresses = runCatching { InetAddress.getAllByName(host) }.getOrNull() ?: return null
        if (addresses.isEmpty() || addresses.any { !isPublic(it) }) return null
        return uri
    }

    private fun isPublic(address: InetAddress): Boolean {
        if (address.isAnyLocalAddress || address.isLoopbackAddress) return false
        if (address.isLinkLocalAddress || address.isSiteLocalAddress) return false
        if (address.isMulticastAddress) return false
        val bytes = address.address.map { it.toInt() and 0xff }
        return when (address) {
            is Inet4Address -> !isReservedV4(bytes)
            is Inet6Address -> !isReservedV6(bytes)
            else -> false
        }
    }

    /**
     * The IPv4 ranges Java has no accessor for: "this network" (0/8), carrier-grade NAT (100.64/10,
     * which is also where Tailscale puts a VPS's private peers), the benchmarking block (198.18/15)
     * and everything from 240/4 up, broadcast included.
     */
    private fun isReservedV4(b: List<Int>): Boolean =
        b[0] == 0 ||
            (b[0] == 100 && b[1] in 64..127) ||
            (b[0] == 198 && b[1] in 18..19) ||
            b[0] >= 240

    /**
     * Unique-local (fc00::/7), and the prefixes that carry an IPv4 address inside an IPv6 one —
     * NAT64 (64:ff9b::/96), 6to4 (2002::/16) and the deprecated IPv4-compatible form (::/96) —
     * because the address they carry may be a private one.
     */
    private fun isReservedV6(b: List<Int>): Boolean =
        (b[0] and 0xfe) == 0xfc ||
            (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b) ||
            (b[0] == 0x20 && b[1] == 0x02) ||
            b.subList(0, 12).all { it == 0 }
}
