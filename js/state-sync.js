/* state-sync.js — keeps a team's progress in step between this browser and the server.

   Every page pulls the team's server copy on load and every 10 s, and pushes local changes.
   Several sessions of one team (and the admin dashboard) write the same server row, so
   both directions MERGE instead of overwriting (rules below, mirrored server side in
   netlify/functions/_shared/merge.js):
   - a room completed here stays completed even if a pull that left the server before the
     completion lands afterwards (that overwrite was the "Forensics stuck at 66%" bug);
   - a room completed on another device shows up here;
   - only an admin reset (a new vault.resetVersion) or an admin "reopen" of one room can take
     a completion away.
   Pushes use keepalive and are flushed when the page is hidden, so a completion still
   reaches the server when the player goes straight back to the Mission Hub. */

(function () {
  'use strict';

  // ---------- Merge rules (identical copy of netlify/functions/_shared/merge.js) ----------
  const StateMerge = (function () {
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
  window.stateMerge = StateMerge;

  const utils = window.utils;
  if (!utils || typeof utils.getUser !== 'function') return;

  const user = utils.getUser();
  if (!user || user.role !== 'team') return;

  const TEAM = String(user.username || '').toLowerCase();
  if (!TEAM) return;

  const ENDPOINT = '/.netlify/functions/team-state';
  const AUTO_PULL_MS = 10000;
  const KEEPALIVE_MAX = 50000; // browsers cap keepalive bodies at 64 KB
  const ROOM_KEYS = StateMerge.ROOMS;
  const DEFAULT_PROGRESS = Object.fromEntries(ROOM_KEYS.map(k => [k, false]));
  const STORAGE_KEYS = {
    progress: utils.progressKey(user),
    progressMeta: utils.progressMetaKey ? utils.progressMetaKey(user) : `${TEAM}_progress_meta`,
    times: utils.timesKey(user),
    score: `${TEAM}_score`,
    scoreLog: `${TEAM}_score_log`,
    activity: `${TEAM}_activity`,
    endless: `${TEAM}_endless_scores`,
    bonus: `${TEAM}_bonus`
  };
  const TEAM_VAULT_KEY = `${TEAM}_vault`;
  const RESET_VERSION_KEY = `${TEAM}_reset_version`;
  const VAULT_ENTRIES_KEY = `${TEAM}_vault_entries`;
  const wordKey = (room) => `vault_word_${room}`;

  function clearPuzzleState() {
    const globalKeys = ROOM_KEYS.map(wordKey).concat('vault_opened');
    globalKeys.forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
    const patterns = [
      /^phish_done_/,
      /^class_/,
      new RegExp(`^${TEAM}_phishing_`),
      new RegExp(`^${TEAM}_vuln_found_`),
      // Each room's saved in-room progress (e.g. osint_state, mfa_puzzle_state)
      /^(osint|incident|mfa|crypto|forensics)_/,
      new RegExp(`^${TEAM}_(osint|incident|mfa|crypto|forensics)_`),
      new RegExp(`^${TEAM}_progress$`),
      new RegExp(`^${TEAM}_progress_meta$`)
    ];
    Object.keys(localStorage).forEach(key => {
      if (patterns.some((regex) => regex.test(key))) {
        try { localStorage.removeItem(key); } catch (_) {}
      }
    });
    try { localStorage.removeItem(TEAM_VAULT_KEY); } catch (_) {}
    try { localStorage.removeItem(VAULT_ENTRIES_KEY); } catch (_) {}
    try { localStorage.removeItem(RESET_VERSION_KEY); } catch (_) {}
    try { window.vault?.refresh?.(); } catch (_) {}
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readTeamVault() {
    const v = readJSON(TEAM_VAULT_KEY, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  // The synced vault copy plus the code words this browser holds for rooms it has
  // completed (a stray word for an unfinished room, e.g. left by another team on a
  // shared computer, is not sent).
  function collectVault(progress) {
    const meta = { ...readTeamVault() };
    ROOM_KEYS.forEach(key => {
      let word = null;
      try { word = localStorage.getItem(wordKey(key)); } catch (_) {}
      if (word && word.trim() && progress?.[key] === true) meta[key] = word.trim().toUpperCase();
    });
    try {
      if (localStorage.getItem('vault_opened') === '1') meta.opened = true;
    } catch (_) { /* ignore */ }
    return meta;
  }

  function applyVault(vault = {}) {
    ROOM_KEYS.forEach(key => {
      if (vault[key]) localStorage.setItem(wordKey(key), String(vault[key]));
    });
    if (vault.opened) {
      try { localStorage.setItem('vault_opened', '1'); } catch (_) { /* ignore */ }
    }
  }

  function readLocalState() {
    const progress = { ...DEFAULT_PROGRESS, ...readJSON(STORAGE_KEYS.progress, DEFAULT_PROGRESS) };
    const vault = collectVault(progress);
    const appliedReset = localStorage.getItem(RESET_VERSION_KEY);
    if (appliedReset) vault.resetVersion = Number(appliedReset);
    // Typed vault words: send this browser's copy when it has one (even an empty one,
    // so "Clear" sticks); otherwise leave the server's copy alone.
    if (localStorage.getItem(VAULT_ENTRIES_KEY) != null) vault.entries = readJSON(VAULT_ENTRIES_KEY, {});
    else delete vault.entries;
    const score = Number(localStorage.getItem(STORAGE_KEYS.score));
    return {
      team: TEAM,
      progress,
      progressMeta: readJSON(STORAGE_KEYS.progressMeta, {}),
      times: readJSON(STORAGE_KEYS.times, []),
      score: Number.isFinite(score) && localStorage.getItem(STORAGE_KEYS.score) != null ? score : 100,
      scoreLog: readJSON(STORAGE_KEYS.scoreLog, []),
      activity: readJSON(STORAGE_KEYS.activity, []),
      endless: readJSON(STORAGE_KEYS.endless, []),
      bonus: readJSON(STORAGE_KEYS.bonus, {}),
      vault
    };
  }

  function captureState() {
    const state = readLocalState();
    if (Object.keys(state.vault).length) writeJSON(TEAM_VAULT_KEY, state.vault);
    return state;
  }

  function dispatch(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) { /* ignore */ }
  }

  function writeScore(score, scoreLog) {
    const before = localStorage.getItem(STORAGE_KEYS.score);
    const total = Math.max(0, Math.round(Number(score) || 0));
    localStorage.setItem(STORAGE_KEYS.score, String(total));
    if (Array.isArray(scoreLog)) writeJSON(STORAGE_KEYS.scoreLog, scoreLog);
    if (before != null && Number(before) !== total) {
      dispatch('score:change', { total, delta: 0, reason: 'sync' });
    }
  }

  // Admin reset (new resetVersion): the server copy wins outright, then the page reloads.
  function applyReset(remote) {
    resetPending = true;
    clearTimeout(stateSync.timer);
    clearPuzzleState();
    writeJSON(STORAGE_KEYS.progress, { ...DEFAULT_PROGRESS, ...(remote.progress || {}) });
    writeJSON(STORAGE_KEYS.progressMeta, remote.progressMeta || {});
    if (Array.isArray(remote.times)) writeJSON(STORAGE_KEYS.times, remote.times);
    if (Number.isFinite(remote.score)) writeScore(remote.score, Array.isArray(remote.scoreLog) ? remote.scoreLog : []);
    if (Array.isArray(remote.activity)) writeJSON(STORAGE_KEYS.activity, remote.activity);
    if (Array.isArray(remote.endless)) writeJSON(STORAGE_KEYS.endless, remote.endless);
    if (remote.bonus && typeof remote.bonus === 'object') writeJSON(STORAGE_KEYS.bonus, remote.bonus);
    const vault = remote.vault || {};
    writeJSON(TEAM_VAULT_KEY, vault);
    applyVault(vault);
    if (vault.entries && typeof vault.entries === 'object') writeJSON(VAULT_ENTRIES_KEY, vault.entries);
    localStorage.setItem(RESET_VERSION_KEY, String(vault.resetVersion));
    stateSync.lastRemote = remote;
    dispatch('state-sync:applied', { team: TEAM, state: remote, remote, reset: true });
    setTimeout(() => window.location.reload(), 120);
  }

  // opts.fromPush: the state came back from our own push (don't push again from here).
  function applyRemoteState(remote = {}, opts = {}) {
    if (resetPending) return;
    const remoteReset = remote.vault?.resetVersion;
    const localReset = localStorage.getItem(RESET_VERSION_KEY);
    if (remoteReset && String(remoteReset) !== localReset) {
      applyReset(remote);
      return;
    }

    const local = readLocalState();
    const merged = StateMerge.mergeStates(remote, local);

    writeJSON(STORAGE_KEYS.progress, merged.progress);
    writeJSON(STORAGE_KEYS.progressMeta, merged.progressMeta);
    writeJSON(STORAGE_KEYS.times, merged.times);
    writeScore(merged.score, merged.scoreLog);
    writeJSON(STORAGE_KEYS.activity, merged.activity);
    if (Array.isArray(remote.endless)) {
      writeJSON(STORAGE_KEYS.endless, merged.endless);
      dispatch('endless:sync', { entries: merged.endless });
    }
    if (remote.bonus && typeof remote.bonus === 'object') writeJSON(STORAGE_KEYS.bonus, remote.bonus);

    writeJSON(TEAM_VAULT_KEY, merged.vault);
    applyVault(merged.vault);
    // A room the admin reopened: drop this browser's code word and saved state for it.
    ROOM_KEYS.forEach(key => {
      if (local.progress[key] === true && merged.progress[key] !== true) {
        const roomState = [new RegExp(`^${key}_`), new RegExp(`^${TEAM}_${key}_`)];
        Object.keys(localStorage).forEach(k => {
          if (k === wordKey(key) || roomState.some(rx => rx.test(k))) {
            try { localStorage.removeItem(k); } catch (_) {}
          }
        });
      }
    });
    // Typed vault words: this browser's copy wins; adopt the team's copy on a fresh device.
    if (merged.vault.entries && localStorage.getItem(VAULT_ENTRIES_KEY) == null) {
      writeJSON(VAULT_ENTRIES_KEY, merged.vault.entries);
    }

    // Phishing room "reopened" by the facilitator (0% and not complete): drop its saved state.
    const phishPercent = merged.progressMeta?.phishing?.percent ?? null;
    if (!merged.progress.phishing && (phishPercent == null || phishPercent <= 0)) {
      Object.keys(localStorage).forEach(key => {
        if (/^phish_done_/.test(key) || /^class_Picture/.test(key) || key.startsWith(`${TEAM}_phishing_`) || key.startsWith(`${TEAM}_vuln_found_`)) {
          try { localStorage.removeItem(key); } catch (_) {}
        }
      });
    }

    stateSync.lastRemote = remote;
    dispatch('state-sync:applied', { team: TEAM, state: merged, remote });

    // This browser knows something the server doesn't (e.g. a completion whose push was
    // cut off by navigating away): send it now.
    if (!opts.fromPush && StateMerge.isAhead(merged, remote)) queueSave('sync-merge');
  }

  const stateSync = {
    pending: null,
    queued: null,
    timer: null,
    lastPull: 0,
    lastPush: 0,
    lastPushedBody: null,
    lastRemote: null,
    busy: false
  };
  let resetPending = false;

  async function pull(initial = false) {
    try {
      const url = new URL(ENDPOINT, window.location.origin);
      url.searchParams.set('team', TEAM);
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.state) {
        applyRemoteState(data.state);
        stateSync.lastPull = Date.now();
        if (initial) {
          dispatch('state-sync:ready', { team: TEAM });
        }
      }
    } catch (err) {
      console.warn('[state-sync] pull failed', err);
    }
  }

  function bodyFor(payload, reason) {
    return JSON.stringify({ ...payload, reason });
  }

  async function push(reason = 'auto') {
    if (resetPending) return;
    if (stateSync.busy) {
      stateSync.pending = reason;
      return;
    }
    stateSync.busy = true;
    try {
      const payload = captureState();
      stateSync.lastPayload = payload;
      const body = bodyFor(payload, reason);
      // keepalive lets the request finish even if the player navigates away right now.
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: body.length < KEEPALIVE_MAX
      });
      if (res.status === 409) {
        // Admin reset this team since our last pull; apply it instead of overwriting it.
        await pull(false);
        return;
      }
      if (!res.ok) {
        let detail = '';
        try {
          detail = await res.text();
        } catch (_) {}
        throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
      }
      stateSync.lastPush = Date.now();
      stateSync.lastPushedBody = JSON.stringify(payload);
      const data = await res.json().catch(() => null);
      if (data?.state) applyRemoteState(data.state, { fromPush: true });
    } catch (err) {
      console.warn('[state-sync] push failed', err);
    } finally {
      stateSync.busy = false;
      if (stateSync.pending) {
        const pendingReason = stateSync.pending;
        stateSync.pending = null;
        queueSave(pendingReason);
      }
    }
  }

  function queueSave(reason = 'auto') {
    if (resetPending) return;
    clearTimeout(stateSync.timer);
    stateSync.queued = reason;
    stateSync.timer = setTimeout(() => { stateSync.queued = null; push(reason); }, 1200);
  }

  function saveNow(reason = 'manual') {
    clearTimeout(stateSync.timer);
    stateSync.queued = null;
    return push(reason);
  }

  // Page is going away (navigation, tab hidden, app switch): send whatever is newer than the
  // last successful push, without waiting for a debounce timer or an in-flight push.
  function flush(reason) {
    if (resetPending) return;
    const outstanding = Boolean(stateSync.queued || stateSync.pending || stateSync.busy);
    clearTimeout(stateSync.timer);
    stateSync.queued = null;
    try {
      const payload = captureState();
      const snapshot = JSON.stringify(payload);
      if (!outstanding) {
        if (snapshot === stateSync.lastPushedBody) return;
        const remote = stateSync.lastRemote;
        if (remote && !StateMerge.isAhead(StateMerge.mergeStates(remote, payload), remote)) return;
      }
      const body = bodyFor(payload, reason);
      if (body.length >= KEEPALIVE_MAX) { push(reason); return; }
      stateSync.pending = null;
      fetch(ENDPOINT, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
        .then((res) => { if (res.ok) stateSync.lastPushedBody = snapshot; })
        .catch(() => {});
    } catch (_) { /* ignore */ }
  }

  window.stateSync = {
    queueSave,
    saveNow,
    refresh: () => pull(false),
    capture: captureState,
    get lastRemote() { return stateSync.lastRemote; }
  };

  window.addEventListener('pagehide', () => flush('unload'));

  pull(true);

  setInterval(() => {
    pull(false);
  }, AUTO_PULL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush('visibility');
    } else {
      pull(false);
    }
  });

  window.addEventListener('online', () => {
    pull(false);
    queueSave('online');
  });

  const ACTIVITY_PING_MS = 60000;
  let lastActivityPing = 0;

  function recordActivity(detail) {
    const now = Date.now();
    if (now - lastActivityPing < ACTIVITY_PING_MS) return;
    lastActivityPing = now;
    try {
      utils.pushActivity({
        type: 'session',
        status: 'active',
        detail: detail || 'User active',
        at: now
      });
      queueSave('activity');
    } catch (_) {
      /* ignore */
    }
  }

  ['pointerdown', 'keydown', 'scroll'].forEach(evt => {
    document.addEventListener(evt, () => recordActivity(evt), { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      recordActivity('Visible');
    }
  });
})();
