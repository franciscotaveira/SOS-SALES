import dns from "node:dns";
import net from "node:net";

export interface SsrfGuardOptions {
  readonly allowLocalTest?: boolean;
  readonly allowedInternalHosts?: string[];
  readonly allowedProtocols?: string[];
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
  readonly fetchFn?: typeof fetch;
}

const BLOCKED_METADATA_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
export function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid format considered blocked
  }

  const [a, b] = parts as [number, number, number, number];

  // 0.0.0.0/8 (Current network / "this" host)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared Address Space / Carrier-Grade NAT RFC 6598: 100.64.0.0 to 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback RFC 1122)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata RFC 3927)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 to 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments RFC 6890)
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1 Documentation RFC 5737)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  // 192.88.99.0/24 (6to4 Relay Anycast RFC 7526)
  if (a === 192 && b === 88 && parts[2] === 99) return true;
  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Network Interconnect Device Benchmark Testing RFC 2544: 198.18.0.0 to 198.19.255.255)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2 Documentation RFC 5737)
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3 Documentation RFC 5737)
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 (Multicast RFC 5771: 224.0.0.0 to 239.255.255.255)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (Reserved / Future Use RFC 1112, includes 255.255.255.255)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, link-local, or IPv4-mapped blocked range.
 */
export function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Loopback & unspecified (RFC 4291)
  if (normalized === "::1" || normalized === "::") return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1, ::ffff:169.254.169.254, etc.)
  const ipv4MappedMatch = normalized.match(/^(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (ipv4MappedMatch) {
    return isBlockedIpv4(ipv4MappedMatch[1]!);
  }

  // IPv4/IPv6 translation (64:ff9b::/96 RFC 6052 & 64:ff9b:1::/48 RFC 8215)
  if (normalized.startsWith("64:ff9b::") || normalized.startsWith("64:ff9b:1::")) {
    return true;
  }

  // Documentation (2001:db8::/32 RFC 3849)
  if (normalized.startsWith("2001:db8:") || normalized === "2001:db8::") {
    return true;
  }

  // ORCHIDv2 (2001:20::/28 RFC 7343)
  if (normalized.startsWith("2001:20::") || normalized.startsWith("2001:2") || normalized.startsWith("2001:3")) {
    return true;
  }

  // Unique Local Address (fc00::/7 -> fc00 to fdff RFC 4193)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  // Link-Local (fe80::/10 -> fe80 to febf RFC 4291)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // Multicast (ff00::/8 RFC 4291)
  if (normalized.startsWith("ff")) return true;

  return false;
}

/**
 * Validates a single IP string (IPv4 or IPv6) against SSRF rules.
 */
export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }
  if (version === 6) {
    return isBlockedIpv6(ip);
  }
  return true;
}

/**
 * Detects alternative IP notations (octal like 0177.0.0.1, hex like 0x7f.0.0.1, integer like 2130706433).
 */
export function hasAlternativeIpFormat(input: string): boolean {
  let decoded = input;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    // If malformed URI encoding, treat as suspicious
    return true;
  }

  const hostOnly = decoded.replace(/^https?:\/\//i, "").split(/[/:]/)[0] || decoded;

  // 1. Pure integer representation without dots (e.g. 2130706433)
  if (/^\d+$/.test(hostOnly)) {
    return true;
  }

  // 2. Hexadecimal notation in host (e.g. 0x7f000001 or 0x7f.0.0.1)
  if (/0x[0-9a-f]+/i.test(hostOnly)) {
    return true;
  }

  // 3. Octal dot segments (e.g. 0177.0.0.1 or 127.01.0.1 or 127.00.0.1)
  // Any segment with length > 1 that starts with '0'
  const parts = hostOnly.split(".");
  for (const part of parts) {
    if (part.length > 1 && part.startsWith("0")) {
      return true;
    }
  }

  // 4. Non-standard dotted notation with fewer than 4 segments (e.g. 127.1, 10.1)
  if (parts.length > 1 && parts.length < 4 && parts.every((p) => /^\d+$/.test(p))) {
    return true;
  }

  return false;
}

export const DEFAULT_INTERNAL_HOSTS: readonly string[] = Object.freeze([
  "waha",
  "sos-sales-waha",
  "chat-sales-waha",
  "sos-v3-waha",
  "evolution",
  "evolution-api",
  "sos-sales-evolution",
  "chat-sales-evolution",
  "command-tower-evolution",
]);

export function getInternalAllowedHosts(): string[] {
  const envHosts =
    process.env.INTERNAL_SERVICE_ALLOWLIST?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) || [];
  return Array.from(new Set([...DEFAULT_INTERNAL_HOSTS, ...envHosts]));
}

/**
 * Resolves all DNS records for a given hostname and validates every resolved address against SSRF rules.
 */
export async function resolveAndValidateHost(
  hostname: string,
  options: SsrfGuardOptions = {}
): Promise<string[]> {
  const lowerHost = hostname.toLowerCase();

  // 1. Direct metadata block
  if (BLOCKED_METADATA_HOSTS.has(lowerHost) || lowerHost.startsWith("169.254.")) {
    throw new Error(`SSRF_VIOLATION: Destination '${hostname}' matches blocked metadata service`);
  }

  // 2. Alternative IP format block
  if (hasAlternativeIpFormat(lowerHost)) {
    throw new Error(`SSRF_VIOLATION: Destination '${hostname}' uses alternative IP notation`);
  }

  // 3. Check allowed internal infrastructure allowlist (e.g. Docker service names)
  const allowedInternal = options.allowedInternalHosts || getInternalAllowedHosts();
  if (allowedInternal.includes(lowerHost)) {
    return [lowerHost];
  }

  // 4. Check explicit test mode exemption (strict options.allowLocalTest only, never NODE_ENV)
  if (options.allowLocalTest && (lowerHost === "localhost" || lowerHost === "127.0.0.1" || lowerHost === "::1")) {
    return [lowerHost];
  }

  // 5. If hostname is a direct IP
  const directIpVersion = net.isIP(lowerHost);
  if (directIpVersion !== 0) {
    if (isBlockedIp(lowerHost)) {
      throw new Error(`SSRF_VIOLATION: Direct IP destination '${lowerHost}' is in a blocked range`);
    }
    return [lowerHost];
  }

  // 6. Block localhost in non-test mode
  if (lowerHost === "localhost" || lowerHost === "127.0.0.1" || lowerHost === "::1") {
    throw new Error(`SSRF_VIOLATION: Loopback host '${lowerHost}' is prohibited in production`);
  }

  // 7. Resolve DNS records at connection time
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SSRF_VIOLATION: DNS resolution failed for '${hostname}': ${message}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new Error(`SSRF_VIOLATION: No DNS records found for '${hostname}'`);
  }

  const resolvedIps: string[] = [];
  for (const addr of addresses) {
    if (isBlockedIp(addr.address)) {
      throw new Error(
        `SSRF_VIOLATION: Host '${hostname}' resolves to blocked IP address '${addr.address}'`
      );
    }
    resolvedIps.push(addr.address);
  }

  return resolvedIps;
}

/**
 * Validates a target URL against SSRF rules, protocol requirements, and DNS resolution.
 */
export async function validateTargetUrl(
  urlStr: string,
  options: SsrfGuardOptions = {}
): Promise<URL> {
  if (hasAlternativeIpFormat(urlStr)) {
    throw new Error(`SSRF_VIOLATION: Destination '${urlStr}' uses alternative IP notation`);
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`SSRF_VIOLATION: Invalid URL format: '${urlStr}'`);
  }

  const protocol = parsed.protocol.toLowerCase();
  const allowedProtocols = options.allowedProtocols || ["https:", "http:"];

  if (!allowedProtocols.includes(protocol)) {
    throw new Error(
      `SSRF_VIOLATION: Protocol '${protocol}' is not permitted. Allowed: ${allowedProtocols.join(", ")}`
    );
  }

  // Enforce HTTPS in production unless explicitly allowed for internal/test
  if (!options.allowLocalTest && protocol !== "https:") {
    const allowedInternal = options.allowedInternalHosts || getInternalAllowedHosts();
    const isAllowedInternal = allowedInternal.includes(parsed.hostname.toLowerCase());
    if (!isAllowedInternal) {
      throw new Error(`SSRF_VIOLATION: Destination '${urlStr}' must use HTTPS in production`);
    }
  }

  await resolveAndValidateHost(parsed.hostname, options);
  return parsed;
}

/**
 * Safe fetch wrapper with SSRF guard and manual redirect verification (max redirects capped).
 */
export async function safeFetchWithSsrfGuard(
  targetUrl: string,
  init: RequestInit = {},
  options: SsrfGuardOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = targetUrl;
  let redirectCount = 0;

  while (true) {
    await validateTargetUrl(currentUrl, options);

    const fetchFn = options.fetchFn || globalThis.fetch;
    const timeoutSignal = options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;
    const combinedSignal = init.signal && timeoutSignal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : (init.signal || timeoutSignal);

    const fetchInit: RequestInit = {
      ...init,
      redirect: "manual",
      signal: combinedSignal,
    };

    const response = await fetchFn(currentUrl, fetchInit);

    // If not a redirect, return response
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    redirectCount++;
    if (redirectCount > maxRedirects) {
      throw new Error(`SSRF_VIOLATION: Exceeded maximum allowed redirects (${maxRedirects})`);
    }

    const locationHeader = response.headers.get("location");
    if (!locationHeader) {
      throw new Error(`SSRF_VIOLATION: Redirect response missing Location header`);
    }

    // Resolve relative redirect against current URL
    const nextUrl = new URL(locationHeader, currentUrl).toString();

    // Re-validate next destination before following
    await validateTargetUrl(nextUrl, options);
    currentUrl = nextUrl;
  }
}

export type ValidatedMediaType = "image" | "audio" | "video" | "document";

export function detectMediaType(pathnameOrUrl: string): ValidatedMediaType {
  let path = pathnameOrUrl;
  try {
    const parsed = new URL(pathnameOrUrl);
    path = parsed.pathname;
  } catch {
    path = pathnameOrUrl.split("?")[0] || pathnameOrUrl;
  }
  const lower = path.toLowerCase();
  if (
    lower.endsWith(".mp3") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".oga") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".aac") ||
    lower.endsWith(".opus") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".weba") ||
    lower.endsWith(".flac") ||
    lower.endsWith(".amr")
  ) {
    return "audio";
  }
  if (
    lower.endsWith(".mp4") ||
    lower.endsWith(".3gp") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".qt") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".mkv") ||
    lower.endsWith(".avi") ||
    lower.endsWith(".m4v")
  ) {
    return "video";
  }
  if (
    lower.endsWith(".pdf") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".pptx") ||
    lower.endsWith(".ppt") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".zip")
  ) {
    return "document";
  }
  return "image";
}

/**
 * Validates a media URL: requires HTTPS, no private/metadata IP, valid media extension.
 * Returns the validated URL string or throws INSECURE_MEDIA_URL / SSRF_VIOLATION.
 */
export function validateMediaUrl(
  urlStr: string,
  options: { allowLocalTest?: boolean } = {}
): string {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`INSECURE_MEDIA_URL: Malformed URL '${urlStr}'`);
  }

  const isTest = options.allowLocalTest === true;
  if (!isTest && parsed.protocol !== "https:") {
    throw new Error(`INSECURE_MEDIA_URL: Media URL must use HTTPS. Received '${parsed.protocol}'`);
  }

  const lowerHost = parsed.hostname.toLowerCase();
  if (BLOCKED_METADATA_HOSTS.has(lowerHost) || lowerHost.startsWith("169.254.")) {
    throw new Error(`SSRF_VIOLATION: Destination '${lowerHost}' matches blocked metadata service`);
  }

  if (hasAlternativeIpFormat(lowerHost)) {
    throw new Error(`SSRF_VIOLATION: Destination '${lowerHost}' uses alternative IP notation`);
  }

  if (lowerHost === "localhost" || lowerHost === "127.0.0.1" || lowerHost === "::1") {
    if (!isTest) {
      throw new Error(`SSRF_VIOLATION: Loopback host '${lowerHost}' is prohibited in production`);
    }
  }

  const ipVer = net.isIP(lowerHost);
  if (ipVer !== 0 && isBlockedIp(lowerHost)) {
    throw new Error(`SSRF_VIOLATION: Direct IP destination '${lowerHost}' is in a blocked range`);
  }

  return urlStr;
}
