// Who is calling? Every protected function asks this before touching a team's data.
//   authorize(req, client, { team })            team token for `team`, or an admin token
//   authorize(req, client, { adminOnly: true })  admin token only (pull, push)
// -> { ok: true, role: 'team'|'admin', username, token? }   token = a fresh team token when the
//                                                           caller's is past half its life
// or { ok: false, status, reason, error, owner? }           owner = the team a valid token
//                                                           belongs to (403: wrong team/role)
// A missing, broken or expired token is 401; a real token used on the wrong team or on an
// admin-only call is 403 (and the caller flags `owner`). A team token for the team named in the
// request needs no database lookup, so the regular sync polls stay cheap.

import { TOKEN_TTL_MS, tokenSecret, signToken, bearerToken, parseToken, tokenMatches } from './tokens.js';

const MSG = {
  config: 'Sign-in tokens are not configured on the server (set ADMIN_TOKEN_SECRET or ADMIN_SEED_TOKEN).',
  missing: 'You are not signed in. Please log in again.',
  expired: 'Your sign-in has expired. Please log in again.',
  invalid: 'Your sign-in is not valid. Please log in again.',
  otherTeam: 'This sign-in belongs to a different team.',
  adminOnly: 'Only the facilitator (admin) can do this.'
};

const fail = (status, reason, extra = {}) => ({ ok: false, status, reason, error: MSG[reason] || MSG.invalid, ...extra });

async function accounts(client) {
  const { rows } = await client.query(`select lower(username) as username, role from users`);
  return {
    admins: rows.filter((r) => r.role === 'admin').map((r) => r.username),
    teams: rows.filter((r) => r.role !== 'admin').map((r) => r.username)
  };
}

export async function authorize(req, client, { team = null, adminOnly = false } = {}) {
  if (!tokenSecret()) return fail(500, 'config');
  const token = bearerToken(req);
  if (!token) return fail(401, 'missing');
  const now = Date.now();
  const asTeam = parseToken(token, 'team', now);
  if (!asTeam.ok) return fail(401, asTeam.expired ? 'expired' : 'invalid');
  const teamKey = String(team || '').trim().toLowerCase();
  if (teamKey && !adminOnly && tokenMatches(asTeam, 'team', teamKey)) {
    // Past half its life: hand out a fresh one, so a team that keeps playing never expires.
    const fresh = asTeam.exp - now < TOKEN_TTL_MS.team / 2 ? signToken('team', teamKey, now) : null;
    return fresh ? { ok: true, role: 'team', username: teamKey, token: fresh } : { ok: true, role: 'team', username: teamKey };
  }
  const { admins, teams } = await accounts(client);
  const asAdmin = parseToken(token, 'admin', now);
  if (asAdmin.ok) {
    let matched = null;
    admins.forEach((name) => { if (tokenMatches(asAdmin, 'admin', name) && !matched) matched = name; });
    if (matched) return { ok: true, role: 'admin', username: matched };
  }
  const owner = teams.find((name) => tokenMatches(asTeam, 'team', name)) || null;
  if (owner) return fail(403, adminOnly ? 'adminOnly' : 'otherTeam', { owner });
  return fail(401, 'invalid');
}

// The 401/403 body every protected function sends.
export function deniedBody(auth) {
  return { ok: false, reason: auth.reason, error: auth.error };
}
