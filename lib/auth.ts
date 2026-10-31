// A single shared password (CRM_PASSWORD). Signing in stores a cookie holding
// a hash derived from it, so changing the password signs every device out.
export const COOKIE = "crm_session";

export async function sessionToken(password: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("crm-session-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isSignedIn(cookie: string | undefined) {
  const password = process.env.CRM_PASSWORD;
  if (!password || !cookie) return false;
  const expected = await sessionToken(password);
  if (cookie.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= cookie.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
