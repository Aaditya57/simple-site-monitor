import { request as undiciRequest, Agent } from "undici";
import tls from "tls";
import dns from "dns/promises";
import net from "net";

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
        const cn = cert.subject?.CN ?? "";
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

  // ── DNS check ─────────────────────────────────────────────────────────────
  let dnsResolvedIp: string | undefined;
  if (opts.dnsCheckEnabled) {
    try {
      const addrs = await dns.resolve(parsed.hostname, "A").catch(() =>
        dns.resolve(parsed.hostname, "AAAA")
      );
      dnsResolvedIp = addrs[0];
    } catch (e) {
      return {
        status: "DOWN",
        latencyMs: Date.now() - start,
        errorType: "DNS_FAILURE",
        errorMessage: String(e),
      };
    }
  }

  // ── HTTP request ──────────────────────────────────────────────────────────
  const agent = new Agent({
    connect: { timeout: timeoutMs },
    maxRedirections: 10,
  });

  let httpStatusCode: number | undefined;
  let responseBody = "";

  try {
    const resp = await undiciRequest(opts.url, {
      method: "GET",
      headers: { "User-Agent": "UptimeMonitor/1.0" },
      dispatcher: agent,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });

    httpStatusCode = resp.statusCode;
    if (opts.keyword) {
      // Only read body if keyword check is needed
      const chunks: Buffer[] = [];
      for await (const chunk of resp.body) {
        chunks.push(chunk as Buffer);
        if (Buffer.concat(chunks).length > 500_000) break; // 500KB cap
      }
      responseBody = Buffer.concat(chunks).toString("utf-8");
    } else {
      // Drain body to free socket
      await resp.body.dump();
    }
  } catch (err: unknown) {
    const msg = String(err);
    const latencyMs = Date.now() - start;
    if (msg.includes("UND_ERR_CONNECT_TIMEOUT") || msg.includes("UND_ERR_HEADERS_TIMEOUT")) {
      return { status: "DOWN", latencyMs, errorType: "HTTP_TIMEOUT", errorMessage: msg };
    }
    if (msg.includes("ECONNREFUSED")) {
      return { status: "DOWN", latencyMs, errorType: "TCP_CONNECT_REFUSED", errorMessage: msg };
    }
    if (msg.includes("max redirects")) {
      return { status: "DOWN", latencyMs, errorType: "REDIRECT_LIMIT_EXCEEDED", errorMessage: msg };
    }
    return { status: "DOWN", latencyMs, errorType: "UNKNOWN_ERROR", errorMessage: msg };
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

      if (tlsDaysRemaining <= 0) {
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
    }
  }

  // ── Status check ──────────────────────────────────────────────────────────
  if (!isExpectedStatus(httpStatusCode!, opts.expectedStatus)) {
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
