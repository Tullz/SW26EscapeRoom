// game_state row -> the game object every page sees (contract section 3). Pure, so the
// status math can be tested without a database.
//   status: free = free mode; waiting = competition, clock not started;
//           running = started and serverNow < endsAt; over = started and serverNow >= endsAt.
//   endsAt = endedAt ?? startedAt + durationMin minutes (null before the start).

const MINUTE = 60000;

const toMs = (v) => {
  if (v == null) return null;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
};

export function gameFromRow(row, serverNow) {
  const r = row && typeof row === 'object' ? row : {};
  const mode = r.mode === 'competition' ? 'competition' : 'free';
  const durationMin = Number(r.duration_min) > 0 ? Number(r.duration_min) : 60;
  const startedAt = toMs(r.started_at);
  const endedAt = toMs(r.ended_at);
  const endsAt = startedAt == null ? null : (endedAt ?? startedAt + durationMin * MINUTE);
  let status = 'free';
  if (mode === 'competition') {
    if (startedAt == null) status = 'waiting';
    else status = serverNow < endsAt ? 'running' : 'over';
  }
  return { mode, status, startedAt, endedAt, endsAt, durationMin };
}

// The game row and the database clock in one round trip -> { game, serverNow, changedAt }.
// changedAt = when the facilitator last changed the clock (ms). lock = true takes the row lock
// (game.js POST changes it inside a transaction).
export const SELECT_GAME = `select mode, started_at, ended_at, duration_min,
  (extract(epoch from updated_at) * 1000)::float8 as changed_ms,
  (extract(epoch from now()) * 1000)::float8 as now_ms
  from game_state where id = 1`;

export async function readGame(client, lock = false) {
  const { rows } = await client.query(lock ? `${SELECT_GAME} for update` : SELECT_GAME);
  const serverNow = Math.floor(Number(rows[0].now_ms));
  return { game: gameFromRow(rows[0], serverNow), serverNow, changedAt: Math.floor(Number(rows[0].changed_ms)) || 0 };
}
