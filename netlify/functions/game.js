// The global game clock (one row for everyone).
//   GET  -> { ok, game, serverNow }   (anyone; polled by js/game-clock.js on every page)
//   POST -> same shape; body { action } with `Authorization: Bearer <admin token>`:
//     setMode { mode: 'free'|'competition' } - switching mode clears the clock
//     start      - competition mode, clock not started yet: startedAt = now
//     end        - only while running: endedAt = now (time's up early)
//     resetClock - startedAt = endedAt = null (back to "waiting")
// All times come from the database clock (see dbNowMs), so status math agrees everywhere.

import { createClient, ensureGameStateTable } from './_shared/db.js';
import { adminTokenSecret, bearerToken, parseAdminToken, verifyAdminToken } from './_shared/admin-token.js';
import { gameFromRow } from './_shared/game-state.js';

const ACTIONS = ['setMode', 'start', 'end', 'resetClock'];
const SELECT_GAME = `select mode, started_at, ended_at, duration_min,
  (extract(epoch from now()) * 1000)::float8 as now_ms
  from game_state where id = 1`;

const respond = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

// -> { game, serverNow }
async function readGame(client, lock = false) {
  const { rows } = await client.query(lock ? `${SELECT_GAME} for update` : SELECT_GAME);
  const serverNow = Math.floor(Number(rows[0].now_ms));
  return { game: gameFromRow(rows[0], serverNow), serverNow };
}

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return respond(405, { ok: false, error: 'Method Not Allowed' });
  }

  let body = null;
  let token = '';
  if (req.method === 'POST') {
    // Never accept an unsigned request: without a secret nothing can be verified.
    if (!adminTokenSecret()) {
      return respond(500, { ok: false, error: 'Admin tokens are not configured on the server (set ADMIN_TOKEN_SECRET or ADMIN_SEED_TOKEN), so the game clock cannot be changed.' });
    }
    token = bearerToken(req);
    const parsed = parseAdminToken(token);
    if (!parsed.ok) return respond(401, { ok: false, error: parsed.error });
    body = await req.json().catch(() => null);
  }

  let client;
  try {
    client = createClient();
    await client.connect();
    await ensureGameStateTable(client);

    if (req.method === 'GET') {
      return respond(200, { ok: true, ...(await readGame(client)) });
    }

    const { rows: admins } = await client.query(`select username from users where role = 'admin'`);
    const auth = verifyAdminToken(token, admins.map((r) => r.username));
    if (!auth.ok) return respond(401, { ok: false, error: auth.error });

    const action = body && typeof body === 'object' ? body.action : null;
    if (!ACTIONS.includes(action)) {
      return respond(400, { ok: false, error: `Unknown action. Use one of: ${ACTIONS.join(', ')}.` });
    }
    if (action === 'setMode' && body.mode !== 'free' && body.mode !== 'competition') {
      return respond(400, { ok: false, error: 'mode must be "free" or "competition".' });
    }

    await client.query('begin');
    try {
      const { game } = await readGame(client, true);
      let error = null;
      if (action === 'setMode') {
        // Same mode again (e.g. a double click) is a no-op, so it can't wipe a running clock.
        if (game.mode !== body.mode) {
          await client.query(`update game_state set mode = $1, started_at = null, ended_at = null, updated_at = now() where id = 1`, [body.mode]);
        }
      } else if (action === 'start') {
        if (game.mode !== 'competition') error = 'Switch to competition mode before starting the clock.';
        else if (game.status !== 'waiting') error = 'The clock has already been started. Reset the clock first to start again.';
        else await client.query(`update game_state set started_at = now(), ended_at = null, updated_at = now() where id = 1`);
      } else if (action === 'end') {
        if (game.status !== 'running') error = 'The clock is not running, so there is nothing to end.';
        else await client.query(`update game_state set ended_at = now(), updated_at = now() where id = 1`);
      } else if (action === 'resetClock') {
        await client.query(`update game_state set started_at = null, ended_at = null, updated_at = now() where id = 1`);
      }
      if (error) {
        await client.query('rollback');
        return respond(400, { ok: false, error, ...(await readGame(client)) });
      }
      await client.query('commit');
    } catch (err) {
      try { await client.query('rollback'); } catch (_) {}
      throw err;
    }
    console.log(`[game] ${auth.username}: ${action}${action === 'setMode' ? ` ${body.mode}` : ''}`);
    return respond(200, { ok: true, ...(await readGame(client)) });
  } catch (e) {
    console.error('[game] request failed', e);
    return respond(500, { ok: false, error: e.message || 'Game clock failure' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
