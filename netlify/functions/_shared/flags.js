// Tamper flags: when the server refuses something a browser tried (a room "solved" without its
// code word, points raised, another team's data, ...), it notes it in that team's activity log as
//   { type: 'security', status: 'rejected', detail: '<plain words>', at: <server ms> }
// for the admin dashboard. The same detail is written at most once per 5 minutes per team, so a
// stuck browser can't flood the log. Security entries are kept even when the activity log is
// trimmed, and a team's own writes can't add, change or push them out.

const ACTIVITY_KEEP = 120;     // same as merge.js
const SECURITY_KEEP = 50;      // newest security entries kept on top of that
export const FLAG_REPEAT_MS = 5 * 60 * 1000;

export const FLAGS = {
  roomWord: (label) => `Blocked: tried to mark ${label} as solved without its code word`,
  roomEarly: (label) => `Blocked: tried to solve ${label} before the game started`,
  points: 'Blocked: tried to raise points',
  vault: 'Blocked: tried to open the vault without the code words',
  reset: 'Blocked: tried to reset the team',
  adminOnly: 'Blocked: used admin-only access',
  otherTeam: "Blocked: tried to see or change another team's data"
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arr = (v) => (Array.isArray(v) ? v : []);
const isSecurity = (e) => Boolean(e) && e.type === 'security';

// Same key as merge.js uses for activity entries.
export const activityKey = (e) => [num(e.at), e.type || '', e.status || '', e.puzzle || '', e.reason || '',
  e.delta == null ? '' : num(e.delta), e.detail || ''].join('|');

export function securityEntry(detail, at) {
  return { type: 'security', detail, puzzle: null, status: 'rejected', delta: null, total: null, reason: null, at };
}

// `activity` plus one entry per new detail (skipping any already logged in the last 5 minutes).
export function addFlags(activity, details, nowMs) {
  const out = arr(activity).slice();
  const recent = new Set(out.filter((e) => isSecurity(e) && num(e.at) > nowMs - FLAG_REPEAT_MS).map((e) => e.detail));
  arr(details).forEach((detail) => {
    if (!detail || recent.has(detail)) return;
    recent.add(detail);
    out.push(securityEntry(detail, nowMs));
  });
  return out;
}

// After a merge trimmed the log to its newest 120 entries: put back the stored security entries
// that fell off (newest 50), so neither age nor a flood of new entries can hide a flag.
export function keepSecurity(storedActivity, nextActivity) {
  const out = arr(nextActivity).slice();
  const have = new Set(out.map(activityKey));
  arr(storedActivity).filter(isSecurity).forEach((e) => {
    if (!have.has(activityKey(e))) { have.add(activityKey(e)); out.push(e); }
  });
  out.sort((a, b) => num(a.at) - num(b.at));
  const security = out.filter(isSecurity);
  if (security.length <= SECURITY_KEEP) return out;
  const drop = new Set(security.slice(0, security.length - SECURITY_KEEP));
  return out.filter((e) => !drop.has(e));
}

// Append one entry (e.g. a vault attempt) and trim like a merge would, keeping security entries.
export function appendActivity(activity, entry) {
  const list = arr(activity).concat(entry).sort((a, b) => num(a.at) - num(b.at));
  const trimmed = list.length > ACTIVITY_KEEP ? list.slice(list.length - ACTIVITY_KEEP) : list;
  return keepSecurity(list, trimmed);
}

// Flag a team outside of a normal write (the request itself was refused). No row -> nothing.
export async function flagTeam(client, team, detail) {
  const name = String(team || '').trim().toLowerCase();
  if (!name || !detail) return;
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select activity, (extract(epoch from now()) * 1000)::float8 as now_ms from team_state where team = $1 for update`,
      [name]
    );
    if (!rows.length) { await client.query('rollback'); return; }
    const before = arr(rows[0].activity);
    const after = addFlags(before, [detail], Math.floor(Number(rows[0].now_ms)));
    if (after.length !== before.length) {
      await client.query('update team_state set activity = $2::jsonb where team = $1', [name, JSON.stringify(after)]);
    }
    await client.query('commit');
  } catch (err) {
    try { await client.query('rollback'); } catch (_) {}
    console.warn('[flags] could not flag', name, err.message);
  }
}
