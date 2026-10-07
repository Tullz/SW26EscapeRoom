(function () {
  'use strict';

  const utils = window.utils;
  if (!utils || typeof utils.getUser !== 'function') return;

  const user = utils.getUser();
  if (!user || user.role !== 'team') return;

  const TEAM = String(user.username || '').toLowerCase();
  if (!TEAM) return;

  const ENDPOINT = '/.netlify/functions/team-state';
  const AUTO_PULL_MS = 10000;
  const DEFAULT_PROGRESS = {
    phishing: false,
    osint: false,
    incident: false,
    mfa: false,
    supply: false,
    forensics: false
  };
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

  function clearPuzzleState() {
    const globalKeys = [
      'vault_word_phishing',
      'vault_word_osint',
      'vault_word_incident',
      'vault_word_mfa',
      'vault_word_supply',
      'vault_word_forensics',
      'vault_opened'
    ];
    globalKeys.forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
    const patterns = [
      /^phish_done_/,
      /^class_/,
      new RegExp(`^${TEAM}_phishing_`),
      new RegExp(`^${TEAM}_vuln_found_`),
      // Each room's saved in-room progress (e.g. osint_state, mfa_puzzle_state)
      /^(osint|incident|mfa|supply|forensics)_/,
      new RegExp(`^${TEAM}_(osint|incident|mfa|supply|forensics)_`),
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

  function collectVault() {
    const existing = readTeamVault();
    const digits = {
      phishing: localStorage.getItem('vault_word_phishing') || null,
      osint: localStorage.getItem('vault_word_osint') || null,
      incident: localStorage.getItem('vault_word_incident') || null,
      mfa: localStorage.getItem('vault_word_mfa') || null,
      supply: localStorage.getItem('vault_word_supply') || null,
      forensics: localStorage.getItem('vault_word_forensics') || null
    };
    const meta = { ...(existing || {}) };
    Object.entries(digits).forEach(([key, value]) => {
      if (value != null) meta[key] = value;
    });
    try {
      if (localStorage.getItem('vault_opened') === '1') {
        meta.opened = true;
      }
    } catch (_) {
      /* ignore */
    }
    return meta;
  }

  function readTeamVault() {
    return readJSON(TEAM_VAULT_KEY, {});
  }

  function applyVault(vault = {}) {
    if (vault.phishing) localStorage.setItem('vault_word_phishing', String(vault.phishing));
    if (vault.osint) localStorage.setItem('vault_word_osint', String(vault.osint));
    if (vault.incident) localStorage.setItem('vault_word_incident', String(vault.incident));
    if (vault.mfa) localStorage.setItem('vault_word_mfa', String(vault.mfa));
    if (vault.supply) localStorage.setItem('vault_word_supply', String(vault.supply));
    if (vault.forensics) localStorage.setItem('vault_word_forensics', String(vault.forensics));
    if (vault.opened) {
      try { localStorage.setItem('vault_opened', '1'); } catch (_) { /* ignore */ }
    }
  }

  function captureState() {
    // collectVault merges the synced copy with the words actually held locally.
    const latestVault = collectVault();
    const appliedReset = localStorage.getItem(RESET_VERSION_KEY);
    if (appliedReset) latestVault.resetVersion = Number(appliedReset);
    const typedEntries = readJSON(VAULT_ENTRIES_KEY, {});
    if (Object.keys(typedEntries).length) latestVault.entries = typedEntries;
    else delete latestVault.entries;
    if (Object.keys(latestVault).length) {
      writeJSON(TEAM_VAULT_KEY, latestVault);
    }
    return {
      team: TEAM,
      progress: readJSON(STORAGE_KEYS.progress, DEFAULT_PROGRESS),
      progressMeta: readJSON(STORAGE_KEYS.progressMeta, {}),
      times: readJSON(STORAGE_KEYS.times, []),
      score: Number(localStorage.getItem(STORAGE_KEYS.score) || 100),
      scoreLog: readJSON(STORAGE_KEYS.scoreLog, []),
      activity: readJSON(STORAGE_KEYS.activity, []),
      endless: readJSON(STORAGE_KEYS.endless, []),
      bonus: readJSON(STORAGE_KEYS.bonus, {}),
      vault: latestVault
    };
  }

  function applyRemoteState(state = {}) {
    const progress = { ...DEFAULT_PROGRESS, ...(state.progress || {}) };
    writeJSON(STORAGE_KEYS.progress, progress);
    if (state.progressMeta) writeJSON(STORAGE_KEYS.progressMeta, state.progressMeta);
    if (Array.isArray(state.times)) writeJSON(STORAGE_KEYS.times, state.times);
    if (Number.isFinite(state.score)) localStorage.setItem(STORAGE_KEYS.score, String(Math.max(0, Math.round(state.score))));
    if (Array.isArray(state.scoreLog)) writeJSON(STORAGE_KEYS.scoreLog, state.scoreLog);
    if (Array.isArray(state.activity)) writeJSON(STORAGE_KEYS.activity, state.activity);
    if (Array.isArray(state.endless)) {
      writeJSON(STORAGE_KEYS.endless, state.endless);
      window.dispatchEvent(new CustomEvent('endless:sync', { detail: { entries: state.endless } }));
    }
    if (state.bonus && typeof state.bonus === 'object') {
      writeJSON(STORAGE_KEYS.bonus, state.bonus);
    }
    const phishPercent = state.progressMeta?.phishing?.percent ?? null;
    if (!progress.phishing && (phishPercent == null || phishPercent <= 0)) {
      Object.keys(localStorage).forEach(key => {
        if (/^phish_done_/.test(key) || /^class_Picture/.test(key) || key.startsWith(`${TEAM}_phishing_`) || key.startsWith(`${TEAM}_vuln_found_`)) {
          try { localStorage.removeItem(key); } catch (_) {}
        }
      });
    }
    if (state.vault) {
      writeJSON(TEAM_VAULT_KEY, state.vault);
      applyVault(state.vault);
      // Typed vault words: local copy wins; adopt the server copy on a fresh device.
      if (state.vault.entries && localStorage.getItem(VAULT_ENTRIES_KEY) == null) {
        writeJSON(VAULT_ENTRIES_KEY, state.vault.entries);
      }
      const remoteReset = state.vault?.resetVersion;
      const localReset = localStorage.getItem(RESET_VERSION_KEY);
      if (remoteReset && String(remoteReset) !== localReset) {
        clearPuzzleState();
        localStorage.setItem(RESET_VERSION_KEY, String(remoteReset));
        setTimeout(() => window.location.reload(), 120);
      }
    }
    stateSync.lastRemote = state;
    try {
      window.dispatchEvent(new CustomEvent('state-sync:applied', { detail: { team: TEAM, state } }));
    } catch (_) {
      /* ignore event errors */
    }
  }

  const stateSync = {
    pending: null,
    timer: null,
    inflight: null,
    lastPull: 0,
    lastPush: 0,
    busy: false
  };

  async function pull(initial = false) {
    try {
      const url = new URL(ENDPOINT, window.location.origin);
      url.searchParams.set('team', TEAM);
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.state) {
        applyRemoteState(data.state);
        stateSync.lastPull = Date.now();
        if (initial) {
          window.dispatchEvent(new CustomEvent('state-sync:ready', { detail: { team: TEAM } }));
        }
      }
    } catch (err) {
      console.warn('[state-sync] pull failed', err);
    }
  }

  async function push(reason = 'auto') {
    if (stateSync.busy) {
      stateSync.pending = reason;
      return;
    }
    stateSync.busy = true;
    try {
      const payload = captureState();
      stateSync.lastPayload = payload;
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, reason })
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
    clearTimeout(stateSync.timer);
    stateSync.timer = setTimeout(() => push(reason), 1200);
  }

  function saveNow(reason = 'manual') {
    clearTimeout(stateSync.timer);
    return push(reason);
  }

  window.stateSync = {
    queueSave,
    saveNow,
    refresh: () => pull(false),
    capture: captureState
  };

  window.addEventListener('beforeunload', () => {
    if (stateSync.busy) return;
    saveNow('unload');
  });

  pull(true);

  setInterval(() => {
    pull(false);
  }, AUTO_PULL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      queueSave('visibility');
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
