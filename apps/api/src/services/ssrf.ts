import dns from "dns/promises";
import net from "net";

// Internal IP CIDR blocks to block
const BLOCKED_CIDRS = [
  { base: "127.0.0.0", prefix: 8 },
  { base: "10.0.0.0", prefix: 8 },
  { base: "172.16.0.0", prefix: 12 },
  { base: "192.168.0.0", prefix: 16 },
  { base: "169.254.0.0", prefix: 16 }, // link-local
  { base: "::1", prefix: 128 }, // IPv6 loopback
  { base: "fc00::", prefix: 7 }, // IPv6 unique local
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet), 0) >>> 0;
}

function cidrToRange(base: string, prefix: number): { start: number; end: number } {
  const baseInt = ipToInt(base);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { start: baseInt & mask, end: (baseInt & mask) | (~mask >>> 0) };
}

function isPrivateIpv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const ipInt = ipToInt(ip);
  return BLOCKED_CIDRS.filter((c) => !c.base.includes(":")).some((cidr) => {
    const { start, end } = cidrToRange(cidr.base, cidr.prefix);
    return ipInt >= start && ipInt <= end;
  });
}

function isPrivateIpv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  // Block localhost and unique local
  return ip === "::1" || ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd");
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * Validates a URL for SSRF safety:
 * 1. Must be http:// or https://
 * 2. No embedded credentials
 * 3. Hostname resolves to a public IP
 * Returns the parsed URL if safe.
 */
export async function validateMonitorUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError("Only http:// and https:// URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new SsrfError("URLs with embedded credentials are not allowed");
  }

  const hostname = parsed.hostname;

  // If hostname is already a raw IP, check it directly
  if (net.isIPv4(hostname)) {
    if (isPrivateIpv4(hostname)) throw new SsrfError("Private IP addresses are not allowed");
    return parsed;
  }
  if (net.isIPv6(hostname)) {
    if (isPrivateIpv6(hostname)) throw new SsrfError("Private IP addresses are not allowed");
    return parsed;
  }

  // Resolve hostname and check all returned IPs
  let addresses: string[];
  try {
    const results = await dns.resolve(hostname, "A").catch(async () => {
      const v6 = await dns.resolve(hostname, "AAAA");
      return v6;
    });
    addresses = results;
  } catch {
    throw new SsrfError(`Could not resolve hostname: ${hostname}`);
  }

  for (const addr of addresses) {
    if (isPrivateIpv4(addr) || isPrivateIpv6(addr)) {
      throw new SsrfError("URL resolves to a private/internal IP address");
    }
  }

  return parsed;
}
