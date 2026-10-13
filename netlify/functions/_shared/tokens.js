// Signed sign-in tokens for every account. login.js hands one out; the other functions check it.
//
// Format: `<expMs>.<hex HMAC-SHA256(secret, '<role>|' + username + '|' + expMs)>`, role 'admin'
// (valid 12 h) or 'team' (valid 24 h). The username is not in the token: a team token is checked
// against the team a request is for, an admin token against each admin account in the users
// table (see _shared/access.js), so deleting an account also kills its admin tokens.
// Secret: ADMIN_TOKEN_SECRET, or ADMIN_SEED_TOKEN (already set in the Netlify env).
// No secret configured -> no tokens are issued and every check fails (never accept unsigned).

import { createHmac, timingSafeEqual } from 'node:crypto';

const HOUR = 60 * 60 * 1000;
export const TOKEN_TTL_MS = { admin: 12 * HOUR, team: 24 * HOUR };
const CLOCK_SKEW_MS = 60000;

export function tokenSecret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_SEED_TOKEN || '';
}

const cleanName = (v) => String(v || '').trim().toLowerCase();

function mac(secret, role, username, exp) {
  return createHmac('sha256', secret).update(`${role}|${username}|${exp}`).digest('hex');
}

// Returns the token string, or null when no secret is configured.
export function signToken(role, username, now = Date.now()) {
  const secret = tokenSecret();
  const name = cleanName(username);
  const ttl = TOKEN_TTL_MS[role];
  if (!secret || !name || !ttl) return null;
  const exp = now + ttl;
  return `${exp}.${mac(secret, role, name, exp)}`;
}

// `Authorization: Bearer <token>` -> '<token>' (or '').
export function bearerToken(req) {
  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

// Cheap checks that need no secret or database: shape and expiry. `role` caps how far in the
// future the expiry may be. Returns { ok: true, exp, sig } or { ok: false, expired }.
export function parseToken(token, role = 'team', now = Date.now()) {
  const match = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(String(token || ''));
  if (!match) return { ok: false, expired: false };
  const exp = Number(match[1]);
  if (!Number.isSafeInteger(exp)) return { ok: false, expired: false };
  if (exp <= now) return { ok: false, expired: true };
  if (exp > now + (TOKEN_TTL_MS[role] || 0) + CLOCK_SKEW_MS) return { ok: false, expired: false };
  return { ok: true, exp, sig: match[2] };
}

// True when a parsed token was signed for this role + username (constant-time compare).
export function tokenMatches(parsed, role, username) {
  const secret = tokenSecret();
  const name = cleanName(username);
  if (!secret || !name || !parsed || !parsed.ok) return false;
  const expected = Buffer.from(mac(secret, role, name, parsed.exp), 'hex');
  const given = Buffer.from(parsed.sig, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
