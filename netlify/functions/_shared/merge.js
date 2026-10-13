// Merge rules for a team's synced state. Used by team-state.js (PUT) and push.js.
// The SAME rules live in js/state-sync.js (window.stateMerge) for the browser side;
// keep the two copies identical (tools: scratch parity test compares them).
//
// Why: several sessions of one team (and the admin dashboard) all write the same
// row. A plain overwrite let any session holding an older copy wipe a room that
// another session had just completed (Tully's "Forensics stuck at 66%").
// Within one reset epoch (same vault.resetVersion) progress only moves forward:
//  - a room complete on either side stays complete, unless an admin reopened it
//    after that completion (vault.reopened[room] timestamp);
//  - per-room progress meta: the newer entry (updatedAt) wins;
//  - vault words / "opened": union; typed vault entries: the incoming side wins;
//  - vault.solvedAt / vault.openedAt (server time stamps): the remote side's, never the
//    incoming side's; a room's stamp goes when the room is reopened;
//  - score: union of both score logs (entries the other side lacks are applied
//    on top), or taken verbatim from the incoming side when mode is 'local' (admin);
//  - activity: union.
// An admin reset (new resetVersion) is never merged: the caller replaces instead.

export const StateMerge = (function () {
  const ROOMS = ['phishing', 'osint', 'incident', 'mfa', 'crypto', 'forensics'];
  const SCORE_LOG_KEEP = 60;
  const ACTIVITY_KEEP = 120;

  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const arr = (v) => (Array.isArray(v) ? v : []);
  const word = (v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : null);
  const clampScore = (v) => Math.max(0, Math.round(num(v, 100)));

  const logKey = (e) => `${num(e.at)}|${num(e.delta)}|${e.reason || ''}`;
  const activityKey = (e) => [num(e.at), e.type || '', e.status || '', e.puzzle || '', e.reason || '',
    e.delta == null ? '' : num(e.delta), e.detail || ''].join('|');

  function union(a, b, keyFn, keep) {
    const seen = new Set();
    const out = [];
    arr(a).concat(arr(b)).forEach((e) => {
      if (!e || typeof e !== 'object') return;
      const k = keyFn(e);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(e);
    });
    out.sort((x, y) => num(x.at) - num(y.at));
    return keep && out.length > keep ? out.slice(out.length - keep) : out;
  }

  function sortedJSON(v) {
    if (!v || typeof v !== 'object') return 'null';
    return JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]]));
  }

  function reopenedMap(a, b) {
    const out = {};
    [a, b].forEach((v) => Object.entries(obj(obj(v).reopened)).forEach(([k, at]) => {
      const n = num(at);
      if (n > 0 && n > (out[k] || 0)) out[k] = n;
    }));
    return out;
  }

  function mergeProgress(remote, local, reopened) {
    const out = {};
    const keys = new Set(ROOMS.concat(Object.keys(obj(remote.progress)), Object.keys(obj(local.progress))));
    keys.forEach((k) => {
      const since = reopened[k] || 0;
      const counts = (side) => obj(side.progress)[k] === true
        && (!since || num(obj(obj(side.progressMeta)[k]).updatedAt) > since);
      out[k] = counts(remote) || counts(local);
    });
    return out;
  }

  function mergeMeta(remote, local) {
    const out = { ...obj(remote) };
    Object.entries(obj(local)).forEach(([k, v]) => {
      if (!v || typeof v !== 'object') return;
      const cur = out[k];
      if (!cur || typeof cur !== 'object' || num(v.updatedAt) >= num(cur.updatedAt)) out[k] = v;
    });
    return out;
  }

  function mergeScore(remote, local, mode) {
    const R = arr(remote.scoreLog);
    const L = arr(local.scoreLog);
    if (mode === 'local') return { score: clampScore(local.score), scoreLog: L };
    const rKeys = new Set(R.map(logKey));
    const lKeys = new Set(L.map(logKey));
    // Entries older than the other side's oldest entry were trimmed off (or wiped by
    // an admin "clear log"), so they are already reflected in that side's score.
    const oldestR = R.length ? Math.min(...R.map((e) => num(e.at))) : -Infinity;
    const oldestL = L.length ? Math.min(...L.map((e) => num(e.at))) : -Infinity;
    const localOnly = L.filter((e) => !rKeys.has(logKey(e)) && num(e.at) >= oldestR);
    if (!localOnly.length) return { score: clampScore(remote.score), scoreLog: R };
    const remoteOnly = R.filter((e) => !lKeys.has(logKey(e)) && num(e.at) >= oldestL);
    if (!remoteOnly.length) return { score: clampScore(local.score), scoreLog: union(R, L, logKey, SCORE_LOG_KEEP) };
    const extra = localOnly.reduce((sum, e) => sum + num(e.delta), 0);
    return { score: clampScore(clampScore(remote.score) + extra), scoreLog: union(R, localOnly, logKey, SCORE_LOG_KEEP) };
  }

  function mergeVault(remote, local, progress, reopened) {
    const rv = obj(remote.vault);
    const lv = obj(local.vault);
    const out = { ...rv, ...lv };
    ROOMS.forEach((k) => {
      const w = word(lv[k]) || word(rv[k]);
      if (w && !(reopened[k] && !progress[k])) out[k] = w; else delete out[k];
    });
    if (rv.opened === true || lv.opened === true) out.opened = true; else delete out.opened;
    const reset = Math.max(num(rv.resetVersion), num(lv.resetVersion));
    if (reset) out.resetVersion = reset; else delete out.resetVersion;
    if (Object.keys(reopened).length) out.reopened = reopened; else delete out.reopened;
    if (lv.entries && typeof lv.entries === 'object') out.entries = lv.entries;
    else if (rv.entries && typeof rv.entries === 'object') out.entries = rv.entries;
    else delete out.entries;
    // Server time stamps (solvedAt per room, openedAt) are only ever written by the server:
    // keep the remote copy's, ignore the arriving side's, and drop a room's stamp once the
    // room is no longer complete (admin reopen).
    const solvedAt = {};
    Object.entries(obj(rv.solvedAt)).forEach(([k, at]) => {
      if (progress[k] === true && num(at) > 0) solvedAt[k] = num(at);
    });
    if (Object.keys(solvedAt).length) out.solvedAt = solvedAt; else delete out.solvedAt;
    if (out.opened === true && num(rv.openedAt) > 0) out.openedAt = num(rv.openedAt); else delete out.openedAt;
    return out;
  }

  // remote = the copy we are merging into (server row / pulled state),
  // local = the copy that arrives (PUT body / this browser's storage).
  // opts.score: 'merge' (default) or 'local'; opts.endless: 'remote' (default) or 'local'.
  function mergeStates(remote, local, opts = {}) {
    remote = obj(remote);
    local = obj(local);
    const reopened = reopenedMap(remote.vault, local.vault);
    const progress = mergeProgress(remote, local, reopened);
    const { score, scoreLog } = mergeScore(remote, local, opts.score);
    const rt = arr(remote.times);
    const lt = arr(local.times);
    return {
      progress,
      progressMeta: mergeMeta(remote.progressMeta, local.progressMeta),
      times: lt.length > rt.length ? lt : rt,
      score,
      scoreLog,
      activity: union(remote.activity, local.activity, activityKey, ACTIVITY_KEEP),
      endless: opts.endless === 'local' ? arr(local.endless) : arr(remote.endless),
      vault: mergeVault(remote, local, progress, reopened)
    };
  }

  // True when `merged` holds something `remote` does not (so it should be pushed).
  function isAhead(merged, remote) {
    remote = obj(remote);
    const rp = obj(remote.progress);
    if (Object.keys(merged.progress).some((k) => merged.progress[k] === true && rp[k] !== true)) return true;
    const rm = obj(remote.progressMeta);
    if (Object.entries(merged.progressMeta).some(([k, v]) => !rm[k] || num(obj(v).updatedAt) > num(obj(rm[k]).updatedAt))) return true;
    if (merged.score !== clampScore(remote.score)) return true;
    const rLog = new Set(arr(remote.scoreLog).map(logKey));
    if (merged.scoreLog.some((e) => !rLog.has(logKey(e)))) return true;
    const rAct = new Set(arr(remote.activity).map(activityKey));
    if (merged.activity.some((e) => !rAct.has(activityKey(e)))) return true;
    if (merged.times.length > arr(remote.times).length) return true;
    const rv = obj(remote.vault);
    const mv = merged.vault;
    if (ROOMS.some((k) => mv[k] && word(rv[k]) !== mv[k])) return true;
    if (mv.opened === true && rv.opened !== true) return true;
    if (sortedJSON(mv.entries) !== sortedJSON(rv.entries)) return true;
    return false;
  }

  return { ROOMS, mergeStates, isAhead };
})();

export const { mergeStates, isAhead } = StateMerge;
