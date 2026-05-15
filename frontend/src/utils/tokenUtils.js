/**
 * Decode JWT payload without verifying signature (client-side expiry checks only).
 */
export function parseJwtPayload(token) {
  if (!token || typeof token !== "string") {
    return null;
  }
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * @param {string} token
 * @param {number} bufferSeconds - treat token as expired this many seconds early
 */
export function isTokenExpired(token, bufferSeconds = 0) {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) {
    return true;
  }
  const expiresAtMs = payload.exp * 1000;
  return Date.now() >= expiresAtMs - bufferSeconds * 1000;
}
