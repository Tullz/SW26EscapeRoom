// Signed admin tokens: the admin side of _shared/tokens.js, with the API game.js (POST) uses.
//
// Format: `<expMs>.<hex HMAC-SHA256(secret, 'admin|' + username + '|' + expMs)>`, valid 12 h.
// The username is not in the token, so the verifier tries each admin account from the users
// table (there is normally one). Deleting an admin account therefore also kills its tokens.
// Secret: ADMIN_TOKEN_SECRET, or ADMIN_SEED_TOKEN (already set in the Netlify env).
// No secret configured -> no tokens are issued and every check fails (never accept unsigned).

import { TOKEN_TTL_MS, tokenSecret, signToken, bearerToken, parseToken, tokenMatches } from './tokens.js';

export const ADMIN_TOKEN_TTL_MS = TOKEN_TTL_MS.admin;
export const adminTokenSecret = tokenSecret;
export { bearerToken };

const MSG_INVALID = 'Missing or invalid admin token. Log in again as admin.';
const MSG_EXPIRED = 'Admin session expired. Log in again as admin.';

// Returns the token string, or null when no secret is configured.
export function signAdminToken(username, now = Date.now()) {
  return signToken('admin', username, now);
}

// Cheap checks that need no database: shape and expiry.
// Returns { ok: true, exp, sig } or { ok: false, error }.
export function parseAdminToken(token, now = Date.now()) {
  const parsed = parseToken(token, 'admin', now);
  if (parsed.ok) return parsed;
  return { ok: false, error: parsed.expired ? MSG_EXPIRED : MSG_INVALID };
}

// Full check against the admin usernames (from the users table).
// Returns { ok: true, username } or { ok: false, error }.
export function verifyAdminToken(token, adminUsernames, now = Date.now()) {
  if (!tokenSecret()) return { ok: false, error: 'Admin tokens are not configured on the server.' };
  const parsed = parseAdminToken(token, now);
  if (!parsed.ok) return parsed;
  let matched = null;
  // Check every name (no early exit) so timing does not reveal which one matched.
  (Array.isArray(adminUsernames) ? adminUsernames : []).forEach((raw) => {
    const name = String(raw || '').trim().toLowerCase();
    if (!name) return;
    if (tokenMatches(parsed, 'admin', name) && !matched) matched = name;
  });
  return matched ? { ok: true, username: matched } : { ok: false, error: MSG_INVALID };
}
