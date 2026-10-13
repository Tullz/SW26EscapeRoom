// Signed admin tokens. login.js hands one to an admin; game.js (POST) checks it.
//
// Format: `<expMs>.<hex HMAC-SHA256(secret, 'admin|' + username + '|' + expMs)>`, valid 12 h.
// The username is not in the token, so the verifier tries each admin account from the users
// table (there is normally one). Deleting an admin account therefore also kills its tokens.
// Secret: ADMIN_TOKEN_SECRET, or ADMIN_SEED_TOKEN (already set in the Netlify env).
// No secret configured -> no tokens are issued and every check fails (never accept unsigned).

import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export function adminTokenSecret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_SEED_TOKEN || '';
}

function mac(secret, username, exp) {
  return createHmac('sha256', secret).update(`admin|${username}|${exp}`).digest('hex');
}

// Returns the token string, or null when no secret is configured.
export function signAdminToken(username, now = Date.now()) {
  const secret = adminTokenSecret();
  const name = String(username || '').trim().toLowerCase();
  if (!secret || !name) return null;
  const exp = now + ADMIN_TOKEN_TTL_MS;
  return `${exp}.${mac(secret, name, exp)}`;
}

// `Authorization: Bearer <token>` -> '<token>' (or '').
export function bearerToken(req) {
  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

// Cheap checks that need no database: shape and expiry.
// Returns { ok: true, exp, sig } or { ok: false, error }.
export function parseAdminToken(token, now = Date.now()) {
  const match = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(String(token || ''));
  if (!match) return { ok: false, error: 'Missing or invalid admin token. Log in again as admin.' };
  const exp = Number(match[1]);
  if (!Number.isSafeInteger(exp) || exp <= now) {
    return { ok: false, error: 'Admin session expired. Log in again as admin.' };
  }
  if (exp > now + ADMIN_TOKEN_TTL_MS + 60000) {
    return { ok: false, error: 'Missing or invalid admin token. Log in again as admin.' };
  }
  return { ok: true, exp, sig: match[2] };
}

// Full check against the admin usernames (from the users table).
// Returns { ok: true, username } or { ok: false, error }.
export function verifyAdminToken(token, adminUsernames, now = Date.now()) {
  const secret = adminTokenSecret();
  if (!secret) return { ok: false, error: 'Admin tokens are not configured on the server.' };
  const parsed = parseAdminToken(token, now);
  if (!parsed.ok) return parsed;
  const given = Buffer.from(parsed.sig, 'hex');
  let matched = null;
  // Check every name (no early exit) so timing does not reveal which one matched.
  (Array.isArray(adminUsernames) ? adminUsernames : []).forEach((raw) => {
    const name = String(raw || '').trim().toLowerCase();
    if (!name) return;
    const expected = Buffer.from(mac(secret, name, parsed.exp), 'hex');
    if (expected.length === given.length && timingSafeEqual(expected, given) && !matched) matched = name;
  });
  return matched
    ? { ok: true, username: matched }
    : { ok: false, error: 'Missing or invalid admin token. Log in again as admin.' };
}
