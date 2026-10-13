// The vault on the Mission Hub. The only way a team's vault opens: the five code words are
// checked here, on the server, so they never have to be in the browser.
//   POST { team, words: { phishing, osint, incident, mfa, crypto } }   team token for `team`
//   -> 200 { ok: true, opened, correct, total: 5, state, serverNow }   state = as team-state GET
//      409 { ok: false, reason: 'waiting' | 'over', message }          game clock says no
//      429 { ok: false, reason: 'slow', message }                      > 10 tries a minute
// Every check is logged on the team's row ({ type: 'vault', status: 'attempt' | 'opened' }).
// All five right: vault.opened = true, openedAt stamped (server time), the words stored.

import { createClient, ensureTeamStateTable, ensureGameStateTable } from './_shared/db.js';
import { authorize, deniedBody } from './_shared/access.js';
import { readGame } from './_shared/game-state.js';
import { CORE_ROOMS, checkWord, normalizeWord } from './_shared/answers.js';
import { stampVault } from './_shared/stamps.js';
import { FLAGS, appendActivity, flagTeam } from './_shared/flags.js';
import { sanitizePayload, normalizeState, writeRow } from './_shared/team-row.js';

const TOTAL = CORE_ROOMS.length;
const MAX_TRIES_PER_MINUTE = 10;
const MESSAGES = {
  waiting: 'Not yet! The vault opens when the facilitator starts the game.',
  over: "Time's up: the vault can't be opened any more.",
  slow: 'Too many tries. Wait a moment and try again.'
};

const respond = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

// The brute-force brake counts checks per team here (server-only, so a browser can't reset it).
let attemptsTableReady = false;
async function ensureAttemptsTable(client) {
  if (attemptsTableReady) return;
  await client.query(`create table if not exists vault_attempts (
    team text not null,
    at timestamptz not null default now()
  )`);
  await client.query(`create index if not exists vault_attempts_team_at on vault_attempts (team, at)`);
  attemptsTableReady = true;
}

export default async (req) => {
  if (req.method !== 'POST') return respond(405, { ok: false, error: 'Method Not Allowed' });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return respond(400, { ok: false, error: 'Invalid JSON payload' });
  const team = String(body.team || '').trim().toLowerCase();
  if (!team) return respond(400, { ok: false, error: 'Missing team' });
  const words = body.words && typeof body.words === 'object' ? body.words : {};

  let client;
  try {
    client = createClient();
    await client.connect();
    const auth = await authorize(req, client, { team });
    if (!auth.ok) {
      if (auth.owner) await flagTeam(client, auth.owner, FLAGS.otherTeam);
      return respond(auth.status, deniedBody(auth));
    }
    await ensureTeamStateTable(client);
    await ensureGameStateTable(client);
    await ensureAttemptsTable(client);
    const { game, serverNow } = await readGame(client);

    await client.query('begin');
    try {
      // The row lock also serialises the try counter, so parallel requests can't sneak past it.
      const { rows } = await client.query('select * from team_state where team = $1 limit 1 for update', [team]);
      const storedRow = rows[0] || null;
      const state = storedRow ? normalizeState(storedRow) : normalizeState({ team, ...sanitizePayload({}) });
      const alreadyOpen = state.vault.opened === true;

      if (game.status === 'waiting') {
        await client.query('rollback');
        return respond(409, { ok: false, reason: 'waiting', message: MESSAGES.waiting, serverNow });
      }
      if (alreadyOpen) {
        await client.query('rollback');
        return respond(200, { ok: true, opened: true, correct: TOTAL, total: TOTAL, state, serverNow });
      }
      if (game.status === 'over') {
        await client.query('rollback');
        return respond(409, { ok: false, reason: 'over', message: MESSAGES.over, serverNow });
      }

      const { rows: recent } = await client.query(
        `select count(*)::int as n from vault_attempts where team = $1 and at > now() - interval '1 minute'`,
        [team]
      );
      // Just a brake, not a security flag: a flustered team can hit it without cheating.
      if (recent[0].n >= MAX_TRIES_PER_MINUTE) {
        await client.query('commit');
        return respond(429, { ok: false, reason: 'slow', message: MESSAGES.slow, serverNow });
      }
      await client.query('insert into vault_attempts (team) values ($1)', [team]);
      await client.query(`delete from vault_attempts where team = $1 and at < now() - interval '1 hour'`, [team]);

      // A slot only counts with the right word for THAT room (a right word in the wrong slot doesn't).
      const right = CORE_ROOMS.filter((room) => checkWord(room, words[room]));
      const opened = right.length === TOTAL;
      const vault = { ...state.vault };
      if (opened) {
        vault.opened = true;
        CORE_ROOMS.forEach((room) => { vault[room] = normalizeWord(words[room]); });
      }
      const entry = {
        type: 'vault',
        detail: opened ? 'Vault cracked' : `Vault attempt: ${right.length} of ${TOTAL} words correct`,
        puzzle: null,
        status: opened ? 'opened' : 'attempt',
        delta: null,
        total: null,
        reason: null,
        at: serverNow
      };
      const next = sanitizePayload({ ...state, vault, activity: appendActivity(state.activity, entry) });
      next.vault = stampVault(next.vault, next.progress, storedRow ? storedRow.vault : {}, serverNow);
      await writeRow(client, team, next);
      await client.query('commit');
      if (opened) console.log(`[vault] ${team}: vault cracked`);
      return respond(200, {
        ok: true,
        opened,
        correct: right.length,
        total: TOTAL,
        state: normalizeState({ team, ...next, updated_at: new Date().toISOString() }),
        serverNow
      });
    } catch (err) {
      try { await client.query('rollback'); } catch (_) {}
      throw err;
    }
  } catch (e) {
    console.error('[vault] request failed', e);
    return respond(500, { ok: false, error: e.message || 'Vault check failed' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
