// The server is the referee for a TEAM's own writes (team-state PUT with a team token). Admin
// writes never come through here. After the normal merge (merge.js), this takes back anything a
// browser may not decide for itself:
//   - a core room only becomes solved with its code word (answers.js), and not while the game
//     is waiting to start; the bonus room (forensics) only once the vault is open (no flag);
//   - the vault is only ever opened by the vault endpoint;
//   - points only go down: score = min(stored, merged) and new positive score-log entries go;
//   - forged security entries and "+points" activity entries are dropped.
// Pure (no database), so it can be tested on its own.
//
// refereeTeamWrite(stored, merged, { status, justChanged })
//   stored = the row before this write (state shape, camelCase), merged = mergeStates(stored, incoming)
//   status = game status; justChanged = the facilitator changed the clock moments ago, so a room
//   solved during 'waiting' is still refused but not flagged (the team was mid-room at the switch)
//   -> { state, rejected, flags }
//      state    = merged with the refused claims taken back
//      rejected = { rooms: [...], opened, score, activity }: which fields the browser must take
//                 back from the response (state-sync re-aligns them), or null when nothing was
//      flags    = flag details for the admin (see flags.js)

import { CORE_ROOMS, ROOM_LABELS, checkWord } from './answers.js';
import { FLAGS, activityKey } from './flags.js';

const BONUS_ROOM = 'forensics';

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const logKey = (e) => `${num(e.at)}|${num(e.delta)}|${e.reason || ''}`; // as in merge.js

export function refereeTeamWrite(stored, merged, { status = 'free', justChanged = false } = {}) {
  stored = obj(stored);
  const storedProgress = obj(stored.progress);
  const storedMeta = obj(stored.progressMeta);
  const storedVault = obj(stored.vault);
  const state = {
    ...merged,
    progress: { ...obj(merged.progress) },
    progressMeta: { ...obj(merged.progressMeta) },
    vault: { ...obj(merged.vault) },
    scoreLog: arr(merged.scoreLog),
    activity: arr(merged.activity)
  };
  const rooms = new Set();
  const flags = [];
  let opened = false;
  let score = false;
  let activity = false;

  // Put a room back exactly as it was stored (flag, percent, code word).
  const takeBack = (room) => {
    rooms.add(room);
    state.progress[room] = storedProgress[room] === true;
    if (storedMeta[room]) state.progressMeta[room] = storedMeta[room]; else delete state.progressMeta[room];
    if (storedVault[room]) state.vault[room] = storedVault[room]; else delete state.vault[room];
  };

  CORE_ROOMS.forEach((room) => {
    if (storedProgress[room] === true || state.progress[room] !== true) return;
    const label = ROOM_LABELS[room] || room;
    if (!checkWord(room, state.vault[room])) {
      takeBack(room);
      flags.push(FLAGS.roomWord(label));
    } else if (status === 'waiting') {
      takeBack(room);
      if (!justChanged) flags.push(FLAGS.roomEarly(label));
    }
  });
  if (storedProgress[BONUS_ROOM] !== true && state.progress[BONUS_ROOM] === true && storedVault.opened !== true) {
    takeBack(BONUS_ROOM); // not scored, so no flag
  }

  if (state.vault.opened === true && storedVault.opened !== true) {
    delete state.vault.opened;
    delete state.vault.openedAt;
    opened = true;
    flags.push(FLAGS.vault);
  }

  // Points can only go down. "New" log entries are the ones the merge applied on top of the
  // stored log (not stored, and not older than its oldest entry).
  const storedLog = arr(stored.scoreLog);
  const storedKeys = new Set(storedLog.map(logKey));
  const oldest = storedLog.length ? Math.min(...storedLog.map((e) => num(e.at))) : -Infinity;
  const raised = state.scoreLog.filter((e) => num(e.delta) > 0 && !storedKeys.has(logKey(e)) && num(e.at) >= oldest);
  const storedScore = Math.max(0, Math.round(num(stored.score, 100)));
  const mergedScore = Math.max(0, Math.round(num(state.score, storedScore)));
  if (raised.length || mergedScore > storedScore) {
    score = true;
    flags.push(FLAGS.points);
    state.scoreLog = state.scoreLog.filter((e) => !raised.includes(e));
  }
  state.score = Math.min(storedScore, mergedScore);

  // Activity is the team's own diary, except for these two kinds of entry.
  const storedActivity = new Set(arr(stored.activity).map(activityKey));
  const forged = (e) => !storedActivity.has(activityKey(e))
    && (e.type === 'security' || (e.type === 'points' && num(e.delta) > 0));
  if (state.activity.some(forged)) {
    activity = true;
    state.activity = state.activity.filter((e) => !forged(e));
  }

  const rejected = rooms.size || opened || score || activity
    ? { rooms: Array.from(rooms), opened, score, activity }
    : null;
  return { state, rejected, flags: Array.from(new Set(flags)) };
}
