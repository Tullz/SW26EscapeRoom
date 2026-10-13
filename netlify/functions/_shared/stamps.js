// Server time stamps inside team_state.vault (no extra columns). Used by team-state.js (PUT)
// and push.js. The scoring (js/scoring.js) trusts only these, never a team's device clock:
//   vault.solvedAt = { <room>: ms } - when the server first saw progress[room] === true
//   vault.openedAt = ms             - when the server first saw vault.opened === true
// Whatever the request sent for these is ignored: the stored stamps are kept, new ones get the
// server's now, and a room's stamp is removed when the room is no longer complete (reopen).
// `prior` is the stored vault of the SAME reset epoch, or {} when the row is new or replaced
// by an admin reset (new resetVersion), so the stamps go with the reset.

import { DEFAULT_PROGRESS } from './db.js';

const ROOMS = Object.keys(DEFAULT_PROGRESS);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const stamp = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

export function stampVault(vault, progress, prior, nowMs) {
  const out = { ...obj(vault) };
  const before = obj(prior);
  const beforeSolved = obj(before.solvedAt);
  const flags = obj(progress);
  const solvedAt = {};
  ROOMS.forEach((room) => {
    if (flags[room] !== true) return;
    solvedAt[room] = stamp(beforeSolved[room]) || nowMs;
  });
  if (Object.keys(solvedAt).length) out.solvedAt = solvedAt; else delete out.solvedAt;
  if (out.opened === true) out.openedAt = stamp(before.openedAt) || nowMs;
  else delete out.openedAt;
  return out;
}
