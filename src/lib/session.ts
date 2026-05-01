import crypto from "crypto";

export type SessionPayload = {
  employee_id: string;
  employee_name: string;
  exp: number; // unix seconds
};

function b64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(str: string) {
  const padLen = (4 - (str.length % 4)) % 4;
  const padded = str + "=".repeat(padLen);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET env var");
  return secret;
}

export function signSession(payload: Omit<SessionPayload, "exp">, ttlDays = 30) {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  const full: SessionPayload = { ...payload, exp };
  const body = Buffer.from(JSON.stringify(full), "utf8");
  const bodyB64 = b64urlEncode(body);
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(bodyB64)
    .digest();
  const sigB64 = b64urlEncode(sig);
  return `${bodyB64}.${sigB64}`;
}

export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts;
  try {
    const expected = crypto
      .createHmac("sha256", getSecret())
      .update(bodyB64)
      .digest();
    const expectedB64 = b64urlEncode(expected);
    // timingSafeEqual requires buffers of equal length
    if (expectedB64.length !== sigB64.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expectedB64), Buffer.from(sigB64))) return null;

    const payload = JSON.parse(b64urlDecode(bodyB64).toString("utf8")) as SessionPayload;
    if (!payload?.employee_id || !payload?.employee_name || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined) {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("="));
  });
  return out;
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production";
  const pieces = [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProd) pieces.push("Secure");
  return pieces.join("; ");
}
