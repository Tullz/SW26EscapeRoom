// One team's synced state (js/state-sync.js on every team page; admin "mark complete" etc.).
//   GET ?team=X           -> { ok, state, token? }          team token for X, or an admin token
//   PUT { team: X, ... }  -> { ok, state, rejected?, token? } same; merges into the stored row
// Admin writes (admin token) behave as they always have; `source: 'admin'` (take the dashboard's
// points as the truth) is honoured only with an admin token. A team's own writes go through the
// referee (_shared/referee.js): rooms need their code word, the vault only opens through the
// vault endpoint, points only go down, and a team can never start a reset. Refused claims are
// taken back, flagged for the facilitator (_shared/flags.js) and listed in `rejected`, so the
// browser re-aligns with the returned state instead of pushing the same claim again.
// `token` = a fresh sign-in token when the caller's is past half its life.

import { createClient, ensureTeamStateTable, ensureGameStateTable, dbNowMs } from './_shared/db.js';
import { mergeStates } from './_shared/merge.js';
import { stampVault } from './_shared/stamps.js';
import { authorize, deniedBody } from './_shared/access.js';
import { readGame } from './_shared/game-state.js';
import { refereeTeamWrite } from './_shared/referee.js';
import { FLAGS, addFlags, keepSecurity, flagTeam } from './_shared/flags.js';
import { sanitizePayload, normalizeState, writeRow } from './_shared/team-row.js';

// A room solved in the first minute after the facilitator changes the clock (e.g. switches to
// competition while a team is finishing a room) is refused as usual but not flagged.
const CLOCK_GRACE_MS = 60000;

const respond = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

// Merge input (camelCase) from sanitised row values.
const asState = (row) => ({
  progress: row.progress,
  progressMeta: row.progress_meta,
  times: row.times,
  score: row.score,
  scoreLog: row.score_log,
  activity: row.activity,
  endless: row.endless,
  vault: row.vault
});

// 401/403: a real token used on another team (or a team token on admin-only data) is noted on
// the token owner's row.
async function refuse(client, auth) {
  if (auth.owner) await flagTeam(client, auth.owner, FLAGS.otherTeam);
  return respond(auth.status, deniedBody(auth));
}

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return respond(405, { ok: false, error: 'Method Not Allowed' });
  }
  let client;
  try {
    let body = null;
    let team = '';
    if (req.method === 'GET') {
      team = String(new URL(req.url).searchParams.get('team') || '').trim().toLowerCase();
      if (!team) return respond(400, { ok: false, error: 'Missing team parameter' });
    } else {
      body = await req.json().catch((err) => {
        console.error('[team-state] invalid JSON body', err);
        return null;
      });
      if (!body || typeof body !== 'object') return respond(400, { ok: false, error: 'Invalid JSON payload' });
      team = String(body.team || '').trim().toLowerCase();
      if (!team) return respond(400, { ok: false, error: 'Missing team' });
    }

    client = createClient();
    await client.connect();
    const auth = await authorize(req, client, { team });
    if (!auth.ok) return await refuse(client, auth);
    const withToken = (payload) => (auth.token ? { ...payload, token: auth.token } : payload);
    await ensureTeamStateTable(client);

    if (req.method === 'GET') {
      const { rows } = await client.query('select * from team_state where team = $1 limit 1', [team]);
      if (rows.length) {
        return respond(200, withToken({ ok: true, state: normalizeState(rows[0]) }));
      }
      const defaults = sanitizePayload({});
      await client.query(
        `insert into team_state (team, progress, progress_meta, times, score, score_log, activity, endless, vault, updated_at)
         values ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb, now())
         on conflict (team) do nothing`,
        [
          team,
          JSON.stringify(defaults.progress),
          JSON.stringify(defaults.progress_meta),
          JSON.stringify(defaults.times),
          defaults.score,
          JSON.stringify(defaults.score_log),
          JSON.stringify(defaults.activity),
          JSON.stringify(defaults.endless),
          JSON.stringify(defaults.vault)
        ]
      );
      return respond(200, withToken({ ok: true, state: normalizeState({ team, ...defaults }) }));
    }

    // ---- PUT ----
    const isAdmin = auth.role === 'admin';
    const extraFlags = [];
    // 'admin' mode (the dashboard's points are the truth) needs the admin's token.
    if (!isAdmin && body.source === 'admin') extraFlags.push(FLAGS.adminOnly);
    const incoming = sanitizePayload(body);
    // A team write is refereed against the game clock; the same query gives the server time.
    let game = null;
    let nowMs;
    let clockChangedAt = 0;
    if (isAdmin) {
      nowMs = await dbNowMs(client);
    } else {
      await ensureGameStateTable(client);
      ({ game, serverNow: nowMs, changedAt: clockChangedAt } = await readGame(client));
    }

    // Read-merge-write under a row lock so two sessions pushing at once can't drop each other's changes.
    await client.query('begin');
    try {
      const { rows: existing } = await client.query('select * from team_state where team = $1 limit 1 for update', [team]);
      const storedRow = existing[0] || null;
      // Reject pushes from a client that hasn't applied the latest admin reset yet,
      // otherwise its stale local progress would overwrite the reset.
      const storedReset = Number(storedRow?.vault?.resetVersion || 0);
      const incomingReset = Number(incoming.vault?.resetVersion || 0);
      if (storedReset > incomingReset) {
        await client.query('rollback');
        return respond(409, { ok: false, error: 'Team was reset; pull latest state first', resetVersion: storedReset });
      }
      // Only an admin starts a reset. A team claiming a newer epoch gets the same 409 (so its
      // browser re-pulls and adopts the stored one); it is flagged when the row has an epoch.
      if (!isAdmin && incomingReset > storedReset) {
        if (storedRow && storedReset > 0) {
          const activity = addFlags(storedRow.activity, [FLAGS.reset].concat(extraFlags), nowMs);
          await client.query('update team_state set activity = $2::jsonb where team = $1', [team, JSON.stringify(activity)]);
          await client.query('commit');
        } else {
          await client.query('rollback');
        }
        return respond(409, { ok: false, error: 'Team was reset; pull latest state first', resetVersion: storedReset });
      }

      let next = incoming;
      let priorVault = {};
      let rejected = null;
      if (isAdmin) {
        if (storedRow && incomingReset === storedReset) {
          // Same reset epoch: merge, so a session holding an older copy can never undo a
          // completion, a code word or a points change made elsewhere. A newer resetVersion
          // (admin reset) replaces the row instead.
          const merged = mergeStates(normalizeState(storedRow), asState(incoming),
            { score: body.source === 'admin' ? 'local' : 'merge', endless: 'local' });
          merged.activity = keepSecurity(storedRow.activity, merged.activity);
          next = sanitizePayload(merged);
          priorVault = storedRow.vault;
        }
      } else {
        // Team write, same epoch (or a brand-new row): merge, then let the referee take back
        // whatever the browser may not decide for itself.
        const stored = storedRow ? normalizeState(storedRow) : normalizeState({ team, ...sanitizePayload({}) });
        const merged = mergeStates(stored, asState(incoming), { score: 'merge', endless: 'local' });
        const verdict = refereeTeamWrite(stored, merged, {
          status: game.status,
          justChanged: nowMs - clockChangedAt < CLOCK_GRACE_MS
        });
        const state = verdict.state;
        state.activity = keepSecurity(stored.activity, addFlags(state.activity, verdict.flags.concat(extraFlags), nowMs));
        next = sanitizePayload(state);
        priorVault = storedRow ? storedRow.vault : {};
        rejected = verdict.rejected;
        if (verdict.flags.length || extraFlags.length) {
          console.warn(`[team-state] ${team}: ${verdict.flags.concat(extraFlags).join('; ')}`);
        }
      }
      // solvedAt / openedAt: the server's own clock, never the client's (see _shared/stamps.js).
      next.vault = stampVault(next.vault, next.progress, priorVault, nowMs);
      await writeRow(client, team, next);
      await client.query('commit');
      // Hand the stored (merged) state back so the pushing session is up to date at once.
      const state = normalizeState({ team, ...next, updated_at: new Date().toISOString() });
      return respond(200, withToken(rejected ? { ok: true, state, rejected } : { ok: true, state }));
    } catch (err) {
      try { await client.query('rollback'); } catch (_) {}
      throw err;
    }
  } catch (e) {
    console.error('[team-state] request failed', e);
    return respond(500, { ok: false, error: e.message || 'Team state failure' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
