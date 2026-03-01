import tls from "tls";
import dns from "dns/promises";

export type CheckStatus = "UP" | "DOWN";

export type ErrorType =
  | "DNS_FAILURE"
  | "TCP_CONNECT_TIMEOUT"
  | "TCP_CONNECT_REFUSED"
  | "TLS_HANDSHAKE_FAILED"
  | "TLS_CERT_EXPIRED"
  | "TLS_CERT_EXPIRING_SOON"
  | "HTTP_TIMEOUT"
  | "HTTP_STATUS_UNEXPECTED"
  | "KEYWORD_NOT_FOUND"
  | "REDIRECT_LIMIT_EXCEEDED"
  | "UNKNOWN_ERROR";

export interface CheckResult {
  status: CheckStatus;
  httpStatusCode?: number;
  latencyMs?: number;
  errorType?: ErrorType;
  errorMessage?: string;
  tlsDaysRemaining?: number;
  tlsCertCn?: string;
  keywordMatch?: boolean;
  dnsResolvedIp?: string;
}

export interface CheckOptions {
  url: string;
  timeoutSeconds: number;
  expectedStatus: string; // e.g. '2xx_3xx' or '200'
  keyword?: string | null;
  keywordCaseInsensitive: boolean;
  tlsCheckEnabled: boolean;
  tlsWarnDays: number;
  dnsCheckEnabled: boolean;
}

function isExpectedStatus(code: number, expected: string): boolean {
  if (expected === "2xx_3xx") return code >= 200 && code < 400;
  if (expected === "2xx") return code >= 200 && code < 300;
  return code === parseInt(expected);
}

async function getTlsInfo(
  hostname: string,
  port: number,
  timeoutMs: number
): Promise<{ daysRemaining: number; cn: string } | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        if (!cert?.valid_to) return resolve(null);
        const expiry = new Date(cert.valid_to);
        const daysRemaining = Math.floor(
          (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        const rawCn = cert.subject?.CN;
        const cn = Array.isArray(rawCn) ? (rawCn[0] ?? "") : (rawCn ?? "");
        resolve({ daysRemaining, cn });
      }
    );
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("error", () => resolve(null));
  });
}

export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  const start = Date.now();
  const parsed = new URL(opts.url);
  const timeoutMs = opts.timeoutSeconds * 1000;
  const tag = `[checker] ${opts.url}`;

  console.log(`${tag} — starting check (timeout=${opts.timeoutSeconds}s tls=${opts.tlsCheckEnabled} dns=${opts.dnsCheckEnabled})`);

  // ── DNS check ─────────────────────────────────────────────────────────────
  let dnsResolvedIp: string | undefined;
  if (opts.dnsCheckEnabled) {
    try {
      const addrs = (await dns.resolve(parsed.hostname, "A").catch(() =>
        dns.resolve(parsed.hostname, "AAAA")
      )) as string[];
      dnsResolvedIp = addrs[0];
      console.log(`${tag} — DNS resolved: ${dnsResolvedIp}`);
    } catch (e) {
      const result: CheckResult = {
        status: "DOWN",
        latencyMs: Date.now() - start,
        errorType: "DNS_FAILURE",
        errorMessage: String(e),
      };
      console.log(`${tag} — DOWN dns_failure: ${result.errorMessage}`);
      return result;
    }
  }

  // ── HTTP request (Node 20 built-in fetch — follows redirects, no undici version issues)
  let httpStatusCode: number | undefined;
  let responseBody = "";

  try {
    const resp = await fetch(opts.url, {
      method: "GET",
      headers: { "User-Agent": "UptimeMonitor/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });

    httpStatusCode = resp.status;
    console.log(`${tag} — HTTP ${httpStatusCode} (${Date.now() - start}ms)`);

    if (opts.keyword) {
      const text = await resp.text();
      responseBody = text.slice(0, 500_000); // 500 KB cap
    } else {
      await resp.body?.cancel();
    }
  } catch (err: unknown) {
    const msg = String(err);
    const latencyMs = Date.now() - start;
    let errorType: ErrorType = "UNKNOWN_ERROR";
    if (err instanceof Error && err.name === "TimeoutError") {
      errorType = "HTTP_TIMEOUT";
    } else if (msg.includes("ECONNREFUSED")) {
      errorType = "TCP_CONNECT_REFUSED";
    } else if (msg.includes("Too many redirects") || msg.includes("redirect")) {
      errorType = "REDIRECT_LIMIT_EXCEEDED";
    }
    console.log(`${tag} — DOWN ${errorType}: ${msg}`);
    return { status: "DOWN", latencyMs, errorType, errorMessage: msg };
  }

  const latencyMs = Date.now() - start;

  // ── TLS check ─────────────────────────────────────────────────────────────
  let tlsDaysRemaining: number | undefined;
  let tlsCertCn: string | undefined;

  if (opts.tlsCheckEnabled && parsed.protocol === "https:") {
    const port = parsed.port ? parseInt(parsed.port) : 443;
    const tlsInfo = await getTlsInfo(parsed.hostname, port, timeoutMs);
    if (tlsInfo) {
      tlsDaysRemaining = tlsInfo.daysRemaining;
      tlsCertCn = tlsInfo.cn;
      console.log(`${tag} — TLS cert "${tlsCertCn}" expires in ${tlsDaysRemaining}d`);

      if (tlsDaysRemaining <= 0) {
        console.log(`${tag} — DOWN TLS_CERT_EXPIRED`);
        return {
          status: "DOWN",
          httpStatusCode,
          latencyMs,
          errorType: "TLS_CERT_EXPIRED",
          errorMessage: `TLS certificate expired ${Math.abs(tlsDaysRemaining)} days ago`,
          tlsDaysRemaining,
          tlsCertCn,
          dnsResolvedIp,
        };
      }
    } else {
      console.log(`${tag} — TLS info unavailable (skipped)`);
    }
  }

  // ── Status check ──────────────────────────────────────────────────────────
  if (!isExpectedStatus(httpStatusCode!, opts.expectedStatus)) {
    console.log(`${tag} — DOWN HTTP_STATUS_UNEXPECTED: expected ${opts.expectedStatus}, got ${httpStatusCode}`);
    return {
      status: "DOWN",
      httpStatusCode,
      latencyMs,
      errorType: "HTTP_STATUS_UNEXPECTED",
      errorMessage: `Expected ${opts.expectedStatus}, got ${httpStatusCode}`,
      tlsDaysRemaining,
      tlsCertCn,
      dnsResolvedIp,
    };
  }

  // ── Keyword check ─────────────────────────────────────────────────────────
  let keywordMatch: boolean | undefined;
  if (opts.keyword) {
    const haystack = opts.keywordCaseInsensitive
      ? responseBody.toLowerCase()
      : responseBody;
    const needle = opts.keywordCaseInsensitive
      ? opts.keyword.toLowerCase()
      : opts.keyword;
    keywordMatch = haystack.includes(needle);
    if (!keywordMatch) {
      console.log(`${tag} — DOWN KEYWORD_NOT_FOUND: "${opts.keyword}"`);
      return {
        status: "DOWN",
        httpStatusCode,
        latencyMs,
        errorType: "KEYWORD_NOT_FOUND",
        errorMessage: `Keyword "${opts.keyword}" not found in response`,
        tlsDaysRemaining,
        tlsCertCn,
        keywordMatch,
        dnsResolvedIp,
      };
    }
  }

  console.log(`${tag} — UP (${latencyMs}ms)`);
  return {
    status: "UP",
    httpStatusCode,
    latencyMs,
    tlsDaysRemaining,
    tlsCertCn,
    keywordMatch,
    dnsResolvedIp,
  };
}
