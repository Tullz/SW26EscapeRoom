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
