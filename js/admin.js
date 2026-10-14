/* admin.js — Cyber Escape Rooms (Admin Dashboard)
   - Admin-only auth guard
   - Game control: free roam (testing) or competition, and the shared 60-minute clock
     (POST /.netlify/functions/game with the admin token; js/game-clock.js keeps it current)
   - Leaderboard by the one scoring formula (js/scoring.js)
   - Team cards: 5 core rooms + the Forensics bonus room (not scored); mark complete / reopen
   - Charts (Chart.js), activity feed, sessions, points-kept adjustments
   - Neon sync via Netlify Functions; every call sends the admin token (401 → "log in again")
   - Security flags: changes the server refused from a team's browser ("⚠ n" + activity feed)
*/

(function () {
  'use strict';

  // ---------- Helpers ------------------------------------------------------

  // Seed list (usernames are lower-case); any team found in the database is added on each Neon pull.
  const TEAMS = ['testteam', 'rajasinghanp', 'morganl', 'claxtonj', 'bakert', 'diazj'];

  // The 5 core rooms are in the vault and earn room points. Forensics is a bonus room: it opens
  // after the vault, never changes the score, but its completion is still recorded (and shown).
  const CORE_ROOMS = ['phishing', 'osint', 'incident', 'mfa', 'crypto'];
  const BONUS_ROOM = 'forensics';
  const PUZZLES = [...CORE_ROOMS, BONUS_ROOM];
  const PUZZLE_LABELS = {
    phishing: 'Phishing Spotter',
    osint: 'OSINT Investigation',
    incident: 'Incident Management',
    mfa: 'MFA / Authentication',
    crypto: 'Encryption',
    forensics: 'Network Forensics'
  };
  const BONUS_LABEL = 'Bonus: Forensics';

  // Same numbers as scoring.CONFIG; only used to explain the formula if js/scoring.js is missing.
  const SCORE_RULES = window.scoring?.CONFIG || { roomPoints: 20, vaultPoints: 50, timeBonusPerMinute: 2, durationMin: 60 };

  const GAME_ENDPOINT = '/.netlify/functions/game';
  const LOGIN_EXPIRED_MSG = 'Your admin login has expired. Log out and log in again.';

  // Every call to pull, push, team-state and the game POST carries the admin's sign-in token
  // (js/utils.js authHeaders; the saved token if that helper isn't there).
  function authHeaders(extra = {}) {
    let headers = null;
    try { headers = window.utils?.authHeaders?.(); } catch (_) { headers = null; }
    if (!headers || typeof headers !== 'object' || !headers.Authorization) {
      let token = '';
      try { token = JSON.parse(localStorage.getItem('user') || 'null')?.token || ''; } catch { token = ''; }
      headers = token ? { Authorization: `Bearer ${token}` } : {};
    }
    return { ...extra, ...headers };
  }

  const isAuthStatus = (status) => status === 401 || status === 403;

  function loginExpiredError() {
    const err = new Error(LOGIN_EXPIRED_MSG);
    err.loginExpired = true;
    return err;
  }

  // The server refused the token: show the banner, and announce it once (not on every
  // 25-second pull). It goes away by itself once a call gets through again.
  let loginExpired = false;
  function noteLoginExpired() {
    const banner = qs('#adminAuthNotice');
    if (banner) banner.hidden = false;
    if (loginExpired) return;
    loginExpired = true;
    announce(LOGIN_EXPIRED_MSG);
  }

  function noteLoginOk() {
    if (!loginExpired) return;
    loginExpired = false;
    const banner = qs('#adminAuthNotice');
    if (banner) banner.hidden = true;
  }

  const SCORE_BASE = 100;
  const SCORE_LOG_LIMIT = 60;
  const STALLED_MS = 15 * 60 * 1000; // 15 minutes of no progress
  const MINUTE = 60000;

  const DEFAULT_PROGRESS = {
    phishing: false,
    osint: false,
    incident: false,
    mfa: false,
    crypto: false,
    forensics: false
  };

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const scoreKey = (team) => `${team}_score`;
  const scoreLogKey = (team) => `${team}_score_log`;
  const vaultKey = (team) => `${team}_vault`;
  const activityKey = (team) => `${team}_activity`;
  const activityFilter = { team: 'all', type: 'all' };
  let activityFiltersReady = false;
  let activityTeamCount = 0;
  const syncDiagnosticsEl = qs('#syncDiagnostics');

  function noteSync(type, message, tone = 'info') {
    if (!syncDiagnosticsEl) return;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    syncDiagnosticsEl.textContent = `[${timestamp}] ${type}: ${message}`;
    syncDiagnosticsEl.dataset.tone = tone;
  }

  // Team names and log reasons come from other devices: never trust them as HTML.
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function normalizeProgress(raw, issues) {
    const cleaned = { ...DEFAULT_PROGRESS };
    PUZZLES.forEach(puzzle => {
      const value = !!raw?.[puzzle];
      if (raw && typeof raw[puzzle] !== 'boolean' && raw[puzzle] != null) {
        issues.push(`Progress.${puzzle} normalized`);
      }
      cleaned[puzzle] = value;
    });
    return cleaned;
  }

  function normalizeProgressMeta(raw, issues) {
    const meta = {};
    if (!raw || typeof raw !== 'object') return meta;
    Object.entries(raw).forEach(([key, value]) => {
      const percent = Math.max(0, Math.min(100, Math.round(Number(value?.percent ?? value ?? 0))));
      const updated = Number(value?.updatedAt ?? Date.now());
      if (!Number.isFinite(percent)) issues.push(`Progress meta ${key} percent reset`);
      if (!Number.isFinite(updated)) issues.push(`Progress meta ${key} timestamp reset`);
      meta[key] = {
        percent: Number.isFinite(percent) ? percent : 0,
        updatedAt: Number.isFinite(updated) ? updated : Date.now()
      };
    });
    return meta;
  }

  function normalizeTimes(raw, issues) {
    if (!Array.isArray(raw)) {
      if (raw != null) issues.push('Time log reset (invalid shape)');
      return [];
    }
    const filtered = raw
      .map(n => Number(n))
      .filter(n => Number.isFinite(n) && n >= 0);
    if (filtered.length !== raw.length) issues.push('Time log sanitized');
    return filtered;
  }

  function normalizeScore(raw, issues) {
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      issues.push('Score reset to base');
      return SCORE_BASE;
    }
    return Math.max(0, Math.round(num));
  }

  function normalizeScoreLog(raw, issues, fallbackTotal) {
    if (!Array.isArray(raw)) {
      if (raw != null) issues.push('Score log reset (invalid shape)');
      return [];
    }
    const sanitized = raw.map(entry => {
      const delta = Number(entry?.delta ?? 0);
      const total = Number(entry?.total ?? fallbackTotal);
      const at = Number(entry?.at ?? Date.now());
      const reason = entry?.reason || 'update';
      if (!Number.isFinite(delta) || !Number.isFinite(total) || !Number.isFinite(at)) {
        issues.push('Score log entry normalized');
      }
      return {
        delta: Number.isFinite(delta) ? Math.round(delta) : 0,
        total: Number.isFinite(total) ? Math.max(0, Math.round(total)) : fallbackTotal,
        at: Number.isFinite(at) ? at : Date.now(),
        reason
      };
    });
    return sanitized.slice(-SCORE_LOG_LIMIT);
  }

  function normalizeActivity(raw, issues) {
    if (!Array.isArray(raw)) {
      if (raw != null) issues.push('Activity log reset (invalid shape)');
      return [];
    }
    return raw.map(entry => {
      const at = Number(entry?.at ?? Date.now());
      const normalized = {
        type: entry?.type || 'event',
        detail: entry?.detail || '',
        puzzle: entry?.puzzle || null,
        status: entry?.status || null,
        delta: Number.isFinite(Number(entry?.delta)) ? Number(entry.delta) : null,
        total: Number.isFinite(Number(entry?.total)) ? Number(entry.total) : null,
        reason: entry?.reason || null,
        at: Number.isFinite(at) ? at : Date.now()
      };
      if (!Number.isFinite(at)) issues.push('Activity entry timestamp normalized');
      return normalized;
    });
  }

  function getJSON(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }

  function setJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function announce(msg) {
    // Use global a11y helper if present, else simple console
    if (window.a11y && typeof window.a11y.announce === 'function') {
      window.a11y.announce(msg);
    } else {
      console.log('[a11y]', msg);
    }
  }

  function timeAgo(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }
    if (diff < 86400000) {
      const hrs = Math.floor(diff / 3600000);
      return `${hrs}h ago`;
    }
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }

  // Time of day, e.g. "2:41 pm".
  function fmtClockTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // 'mm:ss' for a duration (scoring.fmtDuration when available).
  function fmtDuration(ms) {
    if (window.scoring?.fmtDuration) return window.scoring.fmtDuration(ms);
    if (ms == null || !Number.isFinite(Number(ms))) return '—';
    const total = Math.max(0, Math.floor(Number(ms) / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  // Countdown display: always minutes:seconds (60:00, not 1:00:00), rounded up like a clock.
  function fmtCountdown(ms) {
    const total = Math.max(0, Math.ceil(Number(ms) / 1000) || 0);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function readVault(team) {
    return getJSON(vaultKey(team), {});
  }

  function writeVault(team, value) {
    setJSON(vaultKey(team), value || {});
  }

  function logTeamActivity(team, entry) {
    const key = activityKey(team);
    const list = getJSON(key, []);
    const normalized = {
      type: entry?.type || 'event',
      detail: entry?.detail || '',
      puzzle: entry?.puzzle || null,
      status: entry?.status || null,
      delta: entry?.delta ?? null,
      reason: entry?.reason || null,
      total: entry?.total ?? null,
      at: entry?.at || Date.now()
    };
    list.push(normalized);
    if (list.length > SCORE_LOG_LIMIT * 2) {
      list.splice(0, list.length - SCORE_LOG_LIMIT * 2);
    }
    setJSON(key, list);
    return list;
  }

  function getTeamStateSnapshot(team) {
    return {
      team,
      progress: getJSON(`${team}_progress`, { ...DEFAULT_PROGRESS }),
      progressMeta: getJSON(`${team}_progress_meta`, {}),
      times: getJSON(`${team}_times`, []),
      score: readScore(team),
      scoreLog: readScoreLog(team),
      activity: getJSON(activityKey(team), []),
      vault: readVault(team)
    };
  }

  const pendingPushes = new Map();

  async function pushTeamState(team, reason = 'admin-update') {
    if (!team) return;
    pendingPushes.delete(team);
    const snapshot = getTeamStateSnapshot(team);
    try {
      const res = await fetch('/.netlify/functions/team-state', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        // source 'admin': the server merges progress (so a stale dashboard copy can't undo a
        // room a team just finished) but takes the dashboard's points as the truth.
        body: JSON.stringify({ ...snapshot, reason, source: 'admin' })
      });
      if (isAuthStatus(res.status)) {
        noteLoginExpired();
        throw loginExpiredError();
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      noteLoginOk();
    } catch (err) {
      console.warn('Team sync failed', team, err);
      noteSync('Auto push', `${team} sync failed: ${err.message}`, 'warn');
    }
  }

  function queueTeamPush(team, reason = 'admin-update') {
    if (!team) return;
    if (pendingPushes.has(team)) clearTimeout(pendingPushes.get(team));
    const timer = setTimeout(() => pushTeamState(team, reason), 800);
    pendingPushes.set(team, timer);
  }

  // ---------- Points helpers ----------------------------------------------
  // "Points kept" = the team's running score (starts at 100; hints and mistakes subtract).
  // Room, vault and time-bonus points are added on top by js/scoring.js, never stored here.

  function readScore(team) {
    const raw = localStorage.getItem(scoreKey(team));
    if (raw == null || Number.isNaN(Number(raw))) {
      localStorage.setItem(scoreKey(team), String(SCORE_BASE));
      return SCORE_BASE;
    }
    return Math.max(0, Math.round(Number(raw)));
  }

  function readScoreLog(team) {
    try {
      const log = JSON.parse(localStorage.getItem(scoreLogKey(team)) || '[]');
      return Array.isArray(log) ? log : [];
    } catch {
      return [];
    }
  }

  function persistScore(team, total, delta, reason) {
    const entry = {
      delta,
      reason: reason || (delta >= 0 ? 'Adjustment' : 'Deduction'),
      at: Date.now(),
      total
    };
    let log = readScoreLog(team);
    log.push(entry);
    if (log.length > SCORE_LOG_LIMIT) {
      log = log.slice(log.length - SCORE_LOG_LIMIT);
    }
    localStorage.setItem(scoreLogKey(team), JSON.stringify(log));
    localStorage.setItem(scoreKey(team), String(total));
    logTeamActivity(team, { type: 'points', delta, total, reason: entry.reason });
    queueTeamPush(team, 'points');
    return { total, delta, log };
  }

  function adjustTeamScore(team, delta, reason) {
    const adj = Math.round(Number(delta) || 0);
    const current = readScore(team);
    const updated = Math.max(0, current + adj);
    return persistScore(team, updated, adj, reason || 'Manual adjustment');
  }

  function setTeamScore(team, total, reason) {
    const target = Math.max(0, Math.round(Number(total) || 0));
    const current = readScore(team);
    const delta = target - current;
    return persistScore(team, target, delta, reason || 'Set total');
  }

  // Points back to 100 with a fresh log. Only a full team reset (resetVault) also bumps the
  // resetVersion, which makes the team's devices wipe their rooms and code words; clearing
  // the points log on its own must not take away rooms the team has solved.
  function resetTeamScore(team, reason = 'Log cleared', { resetVault = false } = {}) {
    const entry = {
      delta: 0,
      reason,
      at: Date.now(),
      total: SCORE_BASE
    };
    localStorage.setItem(scoreKey(team), String(SCORE_BASE));
    localStorage.setItem(scoreLogKey(team), JSON.stringify([entry]));
    logTeamActivity(team, { type: 'points', delta: 0, total: SCORE_BASE, reason });
    if (resetVault) {
      const resetVersion = Date.now();
      writeVault(team, { resetVersion });
      [
        'vault_word_phishing',
        'vault_word_osint',
        'vault_word_incident',
        'vault_word_mfa',
        'vault_word_crypto',
        'vault_word_forensics'
      ].forEach(key => localStorage.removeItem(key));
    }
    queueTeamPush(team, resetVault ? 'vault-reset' : 'points-reset');
    return { total: SCORE_BASE, delta: 0, log: [entry] };
  }

  function setTeamPuzzleProgress(team, puzzle, value) {
    const now = Date.now();
    const key = `${team}_progress`;
    const progress = getJSON(key, { ...DEFAULT_PROGRESS });
    progress[puzzle] = !!value;
    setJSON(key, progress);
    const metaKey = `${team}_progress_meta`;
    const meta = getJSON(metaKey, {});
    meta[puzzle] = {
      percent: value ? 100 : 0,
      updatedAt: now
    };
    setJSON(metaKey, meta);
    if (!value) {
      // Team devices keep completed rooms through sync hiccups; a "reopened at" time is what
      // tells them (and the server) that this completion was taken back on purpose.
      const vault = readVault(team);
      vault.reopened = { ...(vault.reopened || {}), [puzzle]: now };
      delete vault[puzzle];
      // The server drops the room's solved-at stamp too; drop our copy so the leaderboard
      // doesn't count it in the meantime.
      if (vault.solvedAt && typeof vault.solvedAt === 'object') {
        vault.solvedAt = { ...vault.solvedAt };
        delete vault.solvedAt[puzzle];
      }
      writeVault(team, vault);
    }
    logTeamActivity(team, {
      type: 'progress',
      puzzle,
      status: value ? 'complete' : 'reset',
      detail: value ? 'Marked complete via admin' : 'Reopened via admin'
    });
    queueTeamPush(team, 'progress');
    announce(`${team.toUpperCase()} ${value ? 'completed' : 'reopened'} ${roomLabel(puzzle)}.`);
    refreshAll();
  }

  function roomLabel(puzzle) {
    if (puzzle === BONUS_ROOM) return `${BONUS_LABEL} (not scored)`;
    return PUZZLE_LABELS[puzzle] || (puzzle ? puzzle.charAt(0).toUpperCase() + puzzle.slice(1) : 'Room');
  }

  let teamRows = [];
  let rankedRows = [];
  let activePointsTeam = null;
  let pointsModalChart = null;
  let chartsAnimated = false;
  let forceChartAnimation = false;
  let booted = false;

  // ---------- Auth guard ---------------------------------------------------

  function guardAdmin() {
    const user = getJSON('user', null);
    if (!user || user.role !== 'admin') {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  }

  // ---------- Data loading -------------------------------------------------

  function loadTeamData() {
    const rows = [];

    TEAMS.forEach(team => {
      const issues = [];
      const progress = normalizeProgress(getJSON(`${team}_progress`, DEFAULT_PROGRESS), issues);
      setJSON(`${team}_progress`, progress);

      const progressMeta = normalizeProgressMeta(getJSON(`${team}_progress_meta`, {}), issues);
      setJSON(`${team}_progress_meta`, progressMeta);

      // A seed team that has never synced has no score yet: it starts at 100, not 0.
      const rawScore = localStorage.getItem(scoreKey(team));
      const score = rawScore == null ? SCORE_BASE : normalizeScore(rawScore, issues);
      localStorage.setItem(scoreKey(team), String(score));

      const scoreLog = normalizeScoreLog(readScoreLog(team), issues, score);
      localStorage.setItem(scoreLogKey(team), JSON.stringify(scoreLog));

      const activity = normalizeActivity(getJSON(activityKey(team), []), issues);
      setJSON(activityKey(team), activity);

      const vault = readVault(team);
      const sessionEvents = activity.filter(entry => entry.type === 'session');
      const lastSession = sessionEvents.length ? sessionEvents[sessionEvents.length - 1] : null;
      const lastActiveEvent = [...sessionEvents].reverse().find(entry => entry.status === 'active' || entry.status === 'login');
      const lastActiveTs = Number(lastActiveEvent?.at) || 0;
      const sessionActive = lastActiveTs ? (Date.now() - lastActiveTs < 120000) : false;
      const lastEvent = activity.length ? activity[activity.length - 1] : null;
      // Changes the server refused from this team's browser (see "Security flags" below).
      const flags = activity.filter(entry => entry.type === 'security');

      const completed = CORE_ROOMS.reduce((acc, p) => acc + (progress[p] ? 1 : 0), 0);
      const bonusDone = progress[BONUS_ROOM] === true;
      const vaultOpened = vault?.opened === true;
      const progressPercent = Math.round((completed / CORE_ROOMS.length) * 100);
      const lastProgressAt = Object.values(progressMeta || {}).reduce((max, entry) => {
        const ts = Number(entry?.updatedAt) || 0;
        return ts > max ? ts : max;
      }, 0);
      const lastActivityAt = activity.reduce((max, entry) => {
        const ts = Number(entry?.at) || 0;
        return ts > max ? ts : max;
      }, 0);
      const lastMovement = Math.max(lastProgressAt, lastActivityAt, scoreLog[scoreLog.length - 1]?.at || 0);
      const isStalled = !vaultOpened && completed < CORE_ROOMS.length && lastProgressAt > 0 && Date.now() - lastProgressAt > STALLED_MS;

      rows.push({
        team,
        progress,
        progressMeta,
        completed,
        bonusDone,
        vaultOpened,
        score,
        scoreLog,
        activity,
        progressPercent,
        lastLog: scoreLog[scoreLog.length - 1] || null,
        lastProgressAt,
        lastActivityAt,
        lastMovement,
        stalled: isStalled,
        issues,
        flags,
        vault,
        result: null,
        rank: null,
        session: {
          active: sessionActive,
          lastSession,
          lastEvent
        }
      });
    });

    return rows;
  }

  // Score every team with the shared formula and rank them. Adds row.result and row.rank.
  function scoreAndRank(rows) {
    const scoring = window.scoring;
    if (!scoring || typeof scoring.compute !== 'function') return [];
    const game = gameState.game;
    rows.forEach(row => {
      // Same shape as a pull.js row: progress, score (points kept), vault incl. solvedAt / openedAt.
      row.result = scoring.compute({ progress: row.progress, score: row.score, vault: row.vault }, game);
    });
    const ranked = typeof scoring.rank === 'function'
      ? scoring.rank(rows.map(row => ({ team: row.team, result: row.result, row })))
      : rows.map(row => ({ team: row.team, result: row.result, row }));
    ranked.forEach((entry, index) => { entry.row.rank = index + 1; });
    return ranked;
  }

  // ---------- UI Rendering -------------------------------------------------

  function renderWelcome(user) {
    const welcomeEl = qs('#adminWelcome');
    if (welcomeEl) welcomeEl.textContent = `Welcome, ${user.username.toUpperCase()}!`;
  }

  function metaItem(label, value) {
    const span = document.createElement('span');
    span.append(`${label} `);
    const strong = document.createElement('strong');
    strong.textContent = value;
    span.appendChild(strong);
    return span;
  }

  // ---------- Security flags -----------------------------------------------
  // The server ignores changes a browser isn't allowed to make (e.g. points or rooms edited
  // in the browser's developer tools) and logs each one on the team's row as
  // { type: 'security', status: 'rejected', detail }. Teams with flags get a small "⚠ n"
  // in the leaderboard and on their card; hover for a tooltip, click for the list.

  const FLAGS_SHOWN = 8;
  const openFlagPanels = new Set(); // panels the facilitator opened, kept across refreshes

  function flagSummary(count) {
    return `Blocked ${count} attempt${count === 1 ? '' : 's'} to change the game from the browser`;
  }

  const flagDetail = (entry) => entry?.detail || 'Blocked a change from the browser';
  const newestFirst = (flags) => flags.slice().sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  const idSlug = (team) => String(team).replace(/[^a-z0-9_-]/gi, '_');

  // The "⚠ n" button; it shows / hides the element with id targetId.
  function makeFlagButton(row, key, targetId) {
    const flags = newestFirst(row.flags || []);
    const open = openFlagPanels.has(key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-flag';
    btn.dataset.flagKey = key;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-controls', targetId);
    btn.setAttribute('aria-label', `${row.team.toUpperCase()}: ${flagSummary(flags.length)}`);
    btn.title = [`${flagSummary(flags.length)}:`]
      .concat(flags.slice(0, FLAGS_SHOWN).map(f => `${fmtClockTime(f.at)}  ${flagDetail(f)}`))
      .concat(flags.length > FLAGS_SHOWN ? [`…and ${flags.length - FLAGS_SHOWN} earlier`] : [])
      .join('\n');
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚠';
    btn.append(icon, ` ${flags.length}`);
    const setOpen = (show) => {
      const target = document.getElementById(targetId);
      if (target) target.hidden = !show;
      btn.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (show) openFlagPanels.add(key); else openFlagPanels.delete(key);
    };
    btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
    btn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
        ev.stopPropagation();
        setOpen(false);
      }
    });
    return btn;
  }

  // The list behind the button, newest first, in the facilitator's words.
  function makeFlagPanel(row) {
    const flags = newestFirst(row.flags || []);
    const panel = document.createElement('div');
    panel.className = 'admin-flags';
    const title = document.createElement('p');
    title.className = 'admin-flags__title';
    title.textContent = `${row.team.toUpperCase()}: ${flagSummary(flags.length)}`;
    const list = document.createElement('ul');
    list.className = 'admin-flags__list';
    flags.slice(0, FLAGS_SHOWN).forEach(entry => {
      const li = document.createElement('li');
      const when = document.createElement('span');
      when.className = 'admin-flags__time';
      when.textContent = fmtClockTime(entry.at);
      li.append(when, document.createTextNode(` ${flagDetail(entry)}`));
      list.appendChild(li);
    });
    if (flags.length > FLAGS_SHOWN) {
      const more = document.createElement('li');
      more.className = 'admin-flags__more';
      more.textContent = `…and ${flags.length - FLAGS_SHOWN} earlier`;
      list.appendChild(more);
    }
    const note = document.createElement('p');
    note.className = 'admin-flags__note';
    note.textContent = 'The game ignored these changes, so scores and rooms are not affected.';
    panel.append(title, list, note);
    return panel;
  }

  // Short vault status for a team card.
  function vaultSummary(row) {
    const result = row.result;
    if (result?.finishMs != null) return `Cracked in ${fmtDuration(result.finishMs)}`;
    if (result?.vaultCracked) return result.openedAt ? `Cracked ${fmtClockTime(result.openedAt)}` : 'Cracked';
    if (row.vaultOpened) return 'Opened too late';
    return 'Locked';
  }

  function makeRoomBadge(row, puzzle) {
    const { team, progress } = row;
    const done = !!progress[puzzle];
    const isBonus = puzzle === BONUS_ROOM;
    const label = isBonus ? BONUS_LABEL : (PUZZLE_LABELS[puzzle] || (puzzle.charAt(0).toUpperCase() + puzzle.slice(1)));
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = `badge ${done ? 'ok' : 'dim'} badge--interactive${isBonus ? ' badge--bonus' : ''}`;
    badge.textContent = label;
    if (isBonus) {
      const note = document.createElement('span');
      note.className = 'badge__note';
      note.textContent = 'not scored';
      badge.appendChild(note);
    }
    badge.dataset.team = team;
    badge.dataset.puzzle = puzzle;
    badge.setAttribute('aria-pressed', done ? 'true' : 'false');
    badge.setAttribute('aria-label', `${isBonus ? 'Bonus room, not scored: Network Forensics' : label} ${done ? 'complete' : 'incomplete'}. Click to ${done ? 'reopen' : 'mark complete'}.`);
    badge.addEventListener('click', () => {
      setTeamPuzzleProgress(team, puzzle, !done);
    });
    return badge;
  }

  function renderTeamCards(rows) {
    const listEl = qs('#teamProgressList');
    if (!listEl) return;
    listEl.innerHTML = '';

    rows.forEach(row => {
      const { team, completed, score, progressPercent, lastLog, issues, session, result } = row;
      const roomCount = CORE_ROOMS.length;
      const percent = Math.max(0, Math.min(100, Number(progressPercent) || 0));

      const card = document.createElement('article');
      card.className = 'team-card';
      card.dataset.team = team;
      if (issues?.length) card.classList.add('has-issues');
      if (session?.active) card.classList.add('is-live');

      // Header with team name + total score / action
      const header = document.createElement('div');
      header.className = 'team-card__header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'team-card__title';

      const h3 = document.createElement('h3');
      h3.textContent = team.toUpperCase();

      const subtitle = document.createElement('small');
      const bits = [`${completed}/${roomCount} rooms`];
      if (row.vaultOpened) bits.push('vault open');
      if (session?.active) bits.push('online');
      subtitle.textContent = bits.join(' • ');

      titleWrap.append(h3, subtitle);
      const flagged = row.flags?.length > 0;
      const flagsId = `cardFlags-${idSlug(team)}`;
      if (row.stalled || flagged) {
        const badgeWrap = document.createElement('div');
        badgeWrap.className = 'team-card__badges-inline';
        if (row.stalled) {
          const stalledTag = document.createElement('span');
          stalledTag.className = 'team-card__status is-stalled';
          stalledTag.textContent = 'Needs nudge';
          badgeWrap.appendChild(stalledTag);
        }
        if (flagged) badgeWrap.appendChild(makeFlagButton(row, `card:${team}`, flagsId));
        titleWrap.appendChild(badgeWrap);
      }

      const actionWrap = document.createElement('div');
      actionWrap.className = 'team-card__action';

      const totalWrap = document.createElement('span');
      totalWrap.className = 'team-card__total';
      const pointsSpan = document.createElement('span');
      pointsSpan.className = 'team-card__points';
      pointsSpan.textContent = result ? String(result.total) : '—';
      const totalLabel = document.createElement('small');
      totalLabel.textContent = row.rank ? `total • #${row.rank}` : 'total';
      totalWrap.append(pointsSpan, totalLabel);
      totalWrap.setAttribute('aria-label', result ? `Total score ${result.total}${row.rank ? `, rank ${row.rank}` : ''}` : 'Total score unavailable');

      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn ghost sm';
      viewBtn.type = 'button';
      viewBtn.dataset.team = team;
      viewBtn.textContent = 'Points kept';
      viewBtn.setAttribute('aria-label', `View or adjust ${team.toUpperCase()} points kept`);
      viewBtn.addEventListener('click', () => openPointsModal(team));

      actionWrap.append(totalWrap, viewBtn);
      header.append(titleWrap, actionWrap);
      card.appendChild(header);

      // Progress bar (core rooms only; the bonus room is not part of the game's 5)
      const progressWrap = document.createElement('div');
      progressWrap.className = 'team-card__progress';

      const track = document.createElement('div');
      track.className = 'team-card__progress-track';

      const fill = document.createElement('div');
      fill.className = 'team-card__progress-fill';
      fill.style.setProperty('--progress', `${percent}%`);
      fill.style.width = `${percent}%`;
      track.appendChild(fill);

      const progressInfo = document.createElement('span');
      progressInfo.className = 'muted';
      progressInfo.textContent = `${completed}/${roomCount} core rooms solved`;

      progressWrap.append(track, progressInfo);
      card.appendChild(progressWrap);

      // Meta stats
      const meta = document.createElement('div');
      meta.className = 'team-card__meta';

      let lastText = 'none yet';
      if (lastLog) {
        const change = lastLog.delta || 0;
        lastText = `${change >= 0 ? '+' : '−'}${Math.abs(change)}`;
      }

      meta.append(
        metaItem('Points kept', String(score)),
        metaItem('Vault', vaultSummary(row)),
        metaItem('Last change', lastText),
        metaItem('Last activity', timeAgo(row.lastMovement))
      );
      card.appendChild(meta);

      const badges = document.createElement('div');
      badges.className = 'team-card__badges';
      CORE_ROOMS.forEach(p => badges.appendChild(makeRoomBadge(row, p)));
      badges.appendChild(makeRoomBadge(row, BONUS_ROOM));
      card.appendChild(badges);

      if (result?.notes?.length) {
        const note = document.createElement('p');
        note.className = 'team-card__note';
        note.textContent = result.notes.join(' • ');
        card.appendChild(note);
      }

      if (session?.lastEvent) {
        const statusRow = document.createElement('div');
        statusRow.className = 'team-card__session';
        const statusLabel = document.createElement('span');
        statusLabel.textContent = session.active ? 'Active now' : 'Last seen';
        const when = document.createElement('span');
        when.textContent = timeAgo(session.lastSession?.at || session.lastEvent.at);
        const what = document.createElement('span');
        what.textContent = describeActivity(session.lastEvent);
        statusRow.append(statusLabel, when, what);
        card.appendChild(statusRow);
      }

      if (issues?.length) {
        const warn = document.createElement('p');
        warn.className = 'team-card__issues';
        warn.textContent = `Data checks: ${issues.join('; ')}`;
        card.appendChild(warn);
      }

      if (flagged) {
        const flagsPanel = makeFlagPanel(row);
        flagsPanel.id = flagsId;
        flagsPanel.classList.add('team-card__flags');
        flagsPanel.hidden = !openFlagPanels.has(`card:${team}`);
        card.appendChild(flagsPanel);
      }

      listEl.appendChild(card);
    });
  }

  function describeActivity(entry) {
    if (!entry) return 'Updated';
    if (entry.type === 'progress') {
      const label = entry.puzzle === BONUS_ROOM ? BONUS_LABEL : (PUZZLE_LABELS[entry.puzzle] || (entry.puzzle || '').toUpperCase());
      return `${label}: ${entry.status === 'complete' ? 'Completed' : 'Reset'}`;
    }
    if (entry.type === 'points') {
      const delta = Number(entry.delta) || 0;
      const sign = delta >= 0 ? '+' : '−';
      const amount = Math.abs(delta);
      return `${sign}${amount} pts — ${entry.reason || 'Score change'}`;
    }
    if (entry.type === 'security') return flagDetail(entry);
    return entry.detail || entry.reason || 'Updated';
  }

  function renderActivityFeed(rows) {
    const container = qs('#recentActivityList');
    if (!container) return;
    const events = [];
    rows.forEach(row => {
      (row.activity || []).forEach(entry => {
        events.push({ ...entry, team: row.team });
      });
    });
    events.sort((a, b) => (b.at || 0) - (a.at || 0));
    const filtered = events.filter(event => {
      if (activityFilter.team !== 'all' && event.team !== activityFilter.team) return false;
      if (activityFilter.type !== 'all' && event.type !== activityFilter.type) return false;
      return true;
    }).slice(0, 40);

    container.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No recent activity for this filter.';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'activity-list';

    filtered.forEach(event => {
      const li = document.createElement('li');
      li.className = 'activity-list__item';
      const summary = describeActivity(event);
      // Security flags (changes the server refused) stand out in a warning style.
      const flag = event.type === 'security'
        ? '<span class="activity-list__flag" aria-hidden="true">⚠</span><span class="sr-only">Security flag: </span>'
        : '';
      if (flag) li.classList.add('activity-list__item--security');
      li.innerHTML = `
        <span class="activity-list__time">${esc(timeAgo(event.at))}</span>
        <span class="activity-list__team">${esc(event.team.toUpperCase())}</span>
        <span class="activity-list__summary">${flag}${esc(summary)}</span>
      `;
      list.appendChild(li);
    });

    container.appendChild(list);
  }

  function fillActivityTeamOptions(teamSelect) {
    teamSelect.innerHTML = '<option value="all">All teams</option>' + TEAMS.map(t => `<option value="${esc(t)}">${esc(t.toUpperCase())}</option>`).join('');
    teamSelect.value = TEAMS.includes(activityFilter.team) ? activityFilter.team : 'all';
    activityFilter.team = teamSelect.value;
    activityTeamCount = TEAMS.length;
  }

  function initActivityFilters() {
    const teamSelect = qs('#activityTeamFilter');
    // Teams found in the database later still show up in the filter.
    if (activityFiltersReady) {
      if (teamSelect && activityTeamCount !== TEAMS.length) fillActivityTeamOptions(teamSelect);
      return;
    }
    if (teamSelect) {
      fillActivityTeamOptions(teamSelect);
      teamSelect.addEventListener('change', () => {
        activityFilter.team = teamSelect.value;
        renderActivityFeed(teamRows);
      });
    }
    const typeSelect = qs('#activityTypeFilter');
    if (typeSelect) {
      const typeOptions = [
        { value: 'all', label: 'All events' },
        { value: 'progress', label: 'Progress only' },
        { value: 'points', label: 'Points only' },
        { value: 'security', label: 'Security flags' }
      ];
      typeSelect.innerHTML = typeOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      typeSelect.value = activityFilter.type;
      typeSelect.addEventListener('change', () => {
        activityFilter.type = typeSelect.value;
        renderActivityFeed(teamRows);
      });
    }
    activityFiltersReady = true;
  }

  function renderSessionList(rows) {
    const list = qs('#sessionList');
    if (!list) return;
    list.innerHTML = '';
    const sorted = rows.slice().sort((a, b) => {
      const aActive = a.session?.active ? 1 : 0;
      const bActive = b.session?.active ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      const aAt = a.session?.lastSession?.at || a.session?.lastEvent?.at || 0;
      const bAt = b.session?.lastSession?.at || b.session?.lastEvent?.at || 0;
      return bAt - aAt;
    });

    sorted.forEach(row => {
      const li = document.createElement('li');
      li.className = `session-list__item ${row.session?.active ? 'is-online' : 'is-offline'}`;
      const name = document.createElement('strong');
      name.textContent = row.team.toUpperCase();

      const status = document.createElement('span');
      status.className = 'session-list__status';
      status.textContent = row.session?.active ? 'Online' : 'Offline';

      const time = document.createElement('span');
      time.className = 'session-list__time';
      const refTs = row.session?.lastSession?.at || row.session?.lastEvent?.at;
      time.textContent = refTs ? timeAgo(refTs) : '—';

      const detail = document.createElement('span');
      detail.className = 'session-list__detail';
      detail.textContent = row.session?.lastEvent ? describeActivity(row.session.lastEvent) : 'No activity recorded.';

      li.append(name, status, time, detail);
      list.appendChild(li);
    });
  }

  function renderStats(rows) {
    const summaryEl = qs('#statsSummary');
    const statTotalTeams = qs('#statTotalTeams');
    const statTotalCompleted = qs('#statTotalCompleted');
    const statVaults = qs('#statVaults');
    const statBonus = qs('#statBonus');

    const totalTeams = rows.length;
    const totalCompleted = rows.reduce((a, r) => a + r.completed, 0);
    const vaults = rows.filter(r => r.vaultOpened).length;
    const bonus = rows.filter(r => r.bonusDone).length;
    const averageKept = rows.reduce((acc, r) => acc + (r.score || 0), 0) / (totalTeams || 1);

    if (summaryEl) {
      summaryEl.textContent = totalTeams
        ? `Teams: ${totalTeams} • Avg rooms solved: ${(totalCompleted / totalTeams).toFixed(1)} of ${CORE_ROOMS.length} • Avg points kept: ${Math.round(averageKept)}`
        : 'No teams yet.';
    }
    if (statTotalTeams) statTotalTeams.textContent = String(totalTeams);
    if (statTotalCompleted) statTotalCompleted.textContent = String(totalCompleted);
    if (statVaults) statVaults.textContent = String(vaults);
    if (statBonus) statBonus.textContent = String(bonus);
  }

  // ---------- Leaderboard --------------------------------------------------

  function renderFormula() {
    const el = qs('#scoreFormula');
    if (!el) return;
    const r = SCORE_RULES;
    el.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Total';
    el.append(
      strong,
      ` = points kept (starts at ${SCORE_BASE}) + ${r.roomPoints} per core room solved + ${r.vaultPoints} for cracking the vault`
      + ` + ${r.timeBonusPerMinute} per whole minute left on the clock when the vault was cracked (competition only).`
      + ' Ties go to the team that cracked the vault first. The bonus room is not scored.'
    );
  }

  function td(text, className) {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    if (text != null) cell.textContent = text;
    return cell;
  }

  function renderLeaderboard(ranked) {
    const body = qs('#leaderboardBody');
    if (!body) return;
    const game = gameState.game;
    const started = clockStarted(game);
    const status = gameStatus(game);

    const vaultHead = qs('#lbVaultHead');
    if (vaultHead) {
      vaultHead.textContent = started ? 'Vault cracked (time from start)' : 'Vault cracked (time of day)';
    }
    const meta = qs('#leaderboardMeta');
    if (meta) {
      meta.textContent = {
        free: 'Free roam: no time bonus.',
        waiting: 'Competition, not started yet: no time bonus until you press Start.',
        running: 'Live: refreshes every 25 seconds.',
        over: "Final: time's up.",
        unknown: ''
      }[status] || '';
    }

    body.innerHTML = '';
    if (!window.scoring?.compute) {
      const tr = document.createElement('tr');
      const cell = td('The scoring script (js/scoring.js) did not load. Reload the page.', 'admin-lb__empty');
      cell.colSpan = 8;
      tr.appendChild(cell);
      body.appendChild(tr);
      return;
    }
    if (!ranked.length) {
      const tr = document.createElement('tr');
      const cell = td('No teams yet.', 'admin-lb__empty');
      cell.colSpan = 8;
      tr.appendChild(cell);
      body.appendChild(tr);
      return;
    }

    ranked.forEach((entry, index) => {
      const r = entry.result;
      const rank = index + 1;
      const tr = document.createElement('tr');
      tr.dataset.rank = String(rank);
      tr.dataset.team = entry.team;

      const rankCell = td(null, 'admin-lb__rank-cell');
      const chip = document.createElement('span');
      chip.className = 'admin-lb__rank';
      chip.textContent = String(rank);
      rankCell.appendChild(chip);

      const teamCell = document.createElement('th');
      teamCell.scope = 'row';
      teamCell.className = 'admin-lb__team';
      const name = document.createElement('span');
      name.textContent = entry.team.toUpperCase();
      const flagged = entry.row?.flags?.length ? entry.row : null;
      const flagsId = `lbFlags-${idSlug(entry.team)}`;
      if (flagged) name.append(' ', makeFlagButton(flagged, `lb:${entry.team}`, flagsId));
      teamCell.appendChild(name);
      (r.notes || []).forEach(text => {
        const note = document.createElement('span');
        note.className = 'admin-lb__note';
        note.textContent = text;
        teamCell.appendChild(note);
      });

      let vaultText = '—';
      let vaultTitle = 'Vault not cracked';
      if (r.finishMs != null) {
        vaultText = fmtDuration(r.finishMs);
        vaultTitle = `Cracked ${fmtDuration(r.finishMs)} after the start (at ${fmtClockTime(r.openedAt)})`;
      } else if (r.vaultCracked) {
        vaultText = r.openedAt ? fmtClockTime(r.openedAt) : 'Cracked';
        vaultTitle = r.openedAt ? `Cracked at ${fmtClockTime(r.openedAt)}` : 'Cracked (no time recorded)';
      }
      const vaultCell = td(vaultText, 'num');
      vaultCell.title = vaultTitle;

      let bonusText = '—';
      let bonusTitle = 'Time bonus only counts in competition mode once the clock has started';
      if (started) {
        if (r.minutesLeft != null) {
          bonusText = `+${r.timeBonus}`;
          bonusTitle = `${r.minutesLeft} whole minute${r.minutesLeft === 1 ? '' : 's'} left × ${SCORE_RULES.timeBonusPerMinute}`;
        } else {
          bonusTitle = 'No time bonus: the vault was not cracked while the clock was running';
        }
      }
      const timeCell = td(bonusText, 'num');
      timeCell.title = bonusTitle;

      const bonusRoomCell = td(null, 'center-col');
      const tick = document.createElement('span');
      tick.className = r.bonusDone ? 'admin-lb__tick' : 'admin-lb__dash';
      tick.textContent = r.bonusDone ? '✓' : '—';
      tick.setAttribute('aria-label', r.bonusDone ? 'Bonus room done' : 'Bonus room not done');
      bonusRoomCell.appendChild(tick);

      tr.append(
        rankCell,
        teamCell,
        td(String(r.pot), 'num'),
        td(`${r.roomsSolved}/${CORE_ROOMS.length}`, 'num'),
        vaultCell,
        timeCell,
        td(String(r.total), 'num admin-lb__total'),
        bonusRoomCell
      );
      body.appendChild(tr);

      // The team's security flags, in a full-width row under it (opened by the ⚠ button).
      if (flagged) {
        const flagRow = document.createElement('tr');
        flagRow.className = 'admin-lb__flags-row';
        flagRow.id = flagsId;
        flagRow.hidden = !openFlagPanels.has(`lb:${entry.team}`);
        const cell = td(null, 'admin-lb__flags-cell');
        cell.colSpan = 8;
        cell.appendChild(makeFlagPanel(flagged));
        flagRow.appendChild(cell);
        body.appendChild(flagRow);
      }
    });
  }

  function renderPodium(ranked) {
    const list = qs('#adminPodiumList');
    if (!list) return;
    list.innerHTML = '';

    const top = ranked.slice(0, 3);
    const started = clockStarted(gameState.game);

    if (!top.length) {
      const empty = document.createElement('li');
      empty.className = 'admin-podium__empty';
      empty.textContent = 'Play a round to populate the podium.';
      list.appendChild(empty);
      return;
    }

    top.forEach((entry, index) => {
      const rank = index + 1;
      const r = entry.result;
      const li = document.createElement('li');
      li.className = 'admin-podium__item';
      li.dataset.rank = String(rank);

      const column = document.createElement('div');
      column.className = 'admin-podium__column';

      const rankEl = document.createElement('span');
      rankEl.className = 'admin-podium__rank';
      rankEl.textContent = `#${rank}`;

      const teamEl = document.createElement('strong');
      teamEl.className = 'admin-podium__team';
      teamEl.textContent = entry.team.toUpperCase();

      const scoreEl = document.createElement('span');
      scoreEl.className = 'admin-podium__score';
      scoreEl.textContent = `${r.total} pts`;

      const metaEl = document.createElement('span');
      metaEl.className = 'admin-podium__meta';
      metaEl.textContent = started && r.finishMs != null
        ? `Cracked in ${fmtDuration(r.finishMs)}`
        : `${r.roomsSolved}/${CORE_ROOMS.length} rooms`;

      column.append(rankEl, teamEl, scoreEl, metaEl);
      li.appendChild(column);
      list.appendChild(li);
    });
  }

  // ---------- Game control (mode + shared clock) ---------------------------

  const gameState = { game: null, offset: 0, failed: false, busy: false, key: '', status: 'unknown' };
  const gameRefs = {};

  const validGame = (g) => !!(g && typeof g === 'object' && (g.mode === 'free' || g.mode === 'competition'));
  const clockStarted = (g) => validGame(g) && g.mode === 'competition' && Number(g.startedAt) > 0;
  const gameDuration = (g) => (Number(g?.durationMin) > 0 ? Number(g.durationMin) : SCORE_RULES.durationMin);

  function serverNow() {
    const clock = window.gameClock;
    if (clock && typeof clock.now === 'function') {
      const n = Number(clock.now());
      if (Number.isFinite(n)) return n;
    }
    return Date.now() + gameState.offset;
  }

  function gameEndsAt(g) {
    if (!clockStarted(g)) return null;
    return Number(g.endsAt) || Number(g.endedAt) || Number(g.startedAt) + gameDuration(g) * MINUTE;
  }

  // free | waiting | running | over | unknown — running flips to over locally when time runs out.
  function gameStatus(g) {
    if (!validGame(g)) return 'unknown';
    if (g.mode === 'free') return 'free';
    if (!clockStarted(g)) return 'waiting';
    if (g.status === 'over' || serverNow() >= gameEndsAt(g)) return 'over';
    return 'running';
  }

  function adoptGame(game, serverNowMs) {
    if (!validGame(game)) return;
    const sn = Number(serverNowMs);
    if (Number.isFinite(sn) && sn > 0) gameState.offset = sn - Date.now();
    gameState.game = game;
    gameState.failed = false;
    const key = [game.mode, game.startedAt, game.endedAt, game.durationMin, gameStatus(game)].join('|');
    const changed = key !== gameState.key;
    gameState.key = key;
    renderGamePanel();
    // The leaderboard depends on the clock (time bonus, rooms solved after time's up).
    if (changed && booted) refreshAll();
  }

  function noteClockProblem() {
    if (gameState.game) return;
    gameState.failed = true;
    renderGamePanel();
  }

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function renderGamePanel() {
    const panel = gameRefs.panel;
    if (!panel) return;
    const g = gameState.game;
    const status = gameStatus(g);
    const minutes = gameDuration(g);
    gameState.status = status;
    panel.dataset.status = status;
    panel.setAttribute('aria-busy', gameState.busy ? 'true' : 'false');

    let modeName = 'Checking the game clock…';
    let text = '';
    let hint = '';
    if (status === 'unknown' && gameState.failed) {
      modeName = 'Game clock unavailable';
      text = "Can't reach the game clock right now. It keeps trying; the buttons come back when it answers.";
    } else if (status === 'free') {
      modeName = 'Free roam (testing)';
      text = 'Practice mode: every room is open, there is no clock and no time bonus.';
      hint = 'Switch to Competition to use the clock.';
    } else if (status === 'waiting') {
      modeName = 'Competition: waiting to start';
      text = `Rooms are locked for every team until you press Start. Then everyone gets the same ${minutes} minutes.`;
      hint = 'Press Start when every team is ready.';
    } else if (status === 'running') {
      modeName = 'Competition: game running';
      text = `Started at ${fmtClockTime(g.startedAt)}, ends at ${fmtClockTime(gameEndsAt(g))}. Teams earn ${SCORE_RULES.timeBonusPerMinute} points for every whole minute left when they crack the vault.`;
      hint = 'End the game early only if you need to stop everyone at once.';
    } else if (status === 'over') {
      const scheduledEnd = Number(g.startedAt) + minutes * MINUTE;
      const endedEarly = Number(g.endedAt) > 0 && Number(g.endedAt) < scheduledEnd;
      modeName = "Competition: time's up";
      text = `${endedEarly ? 'You ended the game' : 'The clock ran out'} at ${fmtClockTime(gameEndsAt(g))}. Core rooms are locked and the leaderboard is final. The bonus room stays open.`;
      hint = 'Press “Reset the clock” only if you want to run the game again.';
    }
    setText(gameRefs.modeName, modeName);
    setText(gameRefs.statusText, text);
    setText(gameRefs.hint, hint);
    renderCountdown();

    const known = status !== 'unknown';
    gameRefs.modeBtns.forEach(btn => {
      const active = known && g.mode === btn.dataset.gameMode;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.disabled = !known;
    });
    setText(gameRefs.start, `Start the ${minutes}-minute game`);
    gameRefs.start.disabled = status !== 'waiting';
    gameRefs.end.disabled = status !== 'running';
    gameRefs.reset.disabled = !(status === 'running' || status === 'over');
  }

  function renderCountdown() {
    const face = gameRefs.face;
    if (!face) return;
    const g = gameState.game;
    const status = gameStatus(g);
    let time = '--:--';
    let sub = gameState.failed ? 'No answer yet' : 'Checking…';
    let urgency = '';
    if (status === 'free') {
      time = 'No clock';
      sub = 'Rooms always open';
    } else if (status === 'waiting') {
      time = fmtCountdown(gameDuration(g) * MINUTE);
      sub = 'Not started';
    } else if (status === 'running') {
      const left = Math.max(0, gameEndsAt(g) - serverNow());
      time = fmtCountdown(left);
      sub = 'left on the clock';
      urgency = left <= 2 * MINUTE ? 'danger' : left <= 10 * MINUTE ? 'warn' : '';
    } else if (status === 'over') {
      time = '00:00';
      sub = "Time's up";
    }
    setText(gameRefs.time, time);
    setText(gameRefs.sub, sub);
    if (face.dataset.urgency !== urgency) face.dataset.urgency = urgency;
  }

  // Once a second: keep the countdown moving and notice when time runs out.
  function tickGame() {
    const status = gameStatus(gameState.game);
    if (status !== gameState.status) {
      adoptGame(gameState.game);
      return;
    }
    if (status === 'running') renderCountdown();
  }

  function showGameFeedback(message, tone = 'info') {
    const el = gameRefs.feedback;
    if (el) {
      el.textContent = message;
      el.dataset.tone = tone;
    }
  }

  function setGameBusy(busy) {
    gameState.busy = busy;
    gameRefs.panel?.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  // POST an action to the game function with the admin token. Returns the new game or null.
  async function postGame(payload) {
    const headers = authHeaders({ 'Content-Type': 'application/json' });
    try {
      const res = await fetch(GAME_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (isAuthStatus(res.status)) {
        showGameFeedback(LOGIN_EXPIRED_MSG, 'warn');
        noteLoginExpired();
        return null;
      }
      noteLoginOk();
      // A refused action (e.g. already started) still sends the current game back.
      if (data && validGame(data.game)) adoptGame(data.game, data.serverNow);
      if (!res.ok || !data?.ok || !validGame(data.game)) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      // Let game-clock.js (and everything listening to it) catch up straight away.
      try { window.gameClock?.refresh?.(); } catch (_) { /* polling catches up */ }
      return data.game;
    } catch (err) {
      const msg = `Couldn't change the game: ${err.message}`;
      showGameFeedback(msg, 'warn');
      announce(msg);
      return null;
    }
  }

  async function runGameAction(payload, successMessage) {
    if (gameState.busy) return;
    setGameBusy(true);
    showGameFeedback('Saving…');
    try {
      const game = await postGame(payload);
      if (game) {
        showGameFeedback(successMessage, 'ok');
        announce(successMessage);
      }
    } finally {
      setGameBusy(false);
      renderGamePanel();
    }
  }

  function minutesLeftText() {
    const left = Math.max(0, gameEndsAt(gameState.game) - serverNow());
    return fmtCountdown(left);
  }

  function onModeClick(mode) {
    const g = gameState.game;
    const status = gameStatus(g);
    if (gameState.busy || status === 'unknown' || g.mode === mode) return;
    let question;
    if (mode === 'competition') {
      question = 'Switch to Competition mode?\n\n'
        + `Every core room locks for every team until you press "Start the ${gameDuration(g)}-minute game". `
        + "Anyone playing right now will see \"The game hasn't started yet\".";
    } else if (status === 'running') {
      question = `The game is still running (${minutesLeftText()} left).\n\n`
        + 'Switching to Free roam stops the clock for everyone and removes the time bonus from the leaderboard. Switch anyway?';
    } else if (status === 'over') {
      question = 'Switch to Free roam?\n\n'
        + "The finished game's clock is cleared, so the leaderboard loses everyone's time bonus. Rooms open again for practice.";
    } else {
      question = 'Switch to Free roam?\n\nRooms open for everyone and there is no clock.';
    }
    if (!window.confirm(question)) return;
    runGameAction({ action: 'setMode', mode }, mode === 'competition'
      ? 'Competition mode is on. Rooms are locked until you press Start.'
      : 'Free roam is on. Rooms are open and there is no clock.');
  }

  // Teams whose practice progress would count once the clock starts.
  function teamsWithPracticeProgress() {
    return teamRows
      .filter(row => PUZZLES.some(p => row.progress?.[p]) || row.score !== SCORE_BASE || row.vault?.opened === true)
      .map(row => row.team);
  }

  async function onStartClick() {
    if (gameState.busy || gameStatus(gameState.game) !== 'waiting') return;
    const minutes = gameDuration(gameState.game);
    // Check against the latest progress before warning about practice runs.
    setGameBusy(true);
    showGameFeedback('Checking every team’s progress…');
    try {
      await syncFromNeon();
      refreshAll();
    } catch (_) {
      // Fall back to what the dashboard already has.
    } finally {
      setGameBusy(false);
      showGameFeedback('');
    }
    const busyTeams = teamsWithPracticeProgress();
    let question = `Start the ${minutes}-minute game now?\n\n`
      + 'The clock starts for every team at the same moment and the core rooms unlock.';
    if (busyTeams.length) {
      const shown = busyTeams.slice(0, 6).map(t => t.toUpperCase()).join(', ');
      const more = busyTeams.length > 6 ? ` and ${busyTeams.length - 6} more` : '';
      question += `\n\nHeads up: ${busyTeams.length} team${busyTeams.length === 1 ? ' already has' : 's already have'} practice progress `
        + `(${shown}${more}): solved rooms, changed points or an open vault. It will count towards their score.`
        + '\n\nFor a clean start press Cancel, use "Reset All Teams" under Controls, then start the game.';
    }
    if (!window.confirm(question)) return;
    runGameAction({ action: 'start' }, `The game has started: ${minutes}:00 on the clock. Good luck to every team!`);
  }

  function onEndClick() {
    if (gameState.busy || gameStatus(gameState.game) !== 'running') return;
    const question = `End the game now? (${minutesLeftText()} left)\n\n`
      + 'The clock stops for every team and the core rooms lock. '
      + "Teams that haven't cracked the vault get no vault points or time bonus.";
    if (!window.confirm(question)) return;
    runGameAction({ action: 'end' }, 'The game has ended. The leaderboard is final.');
  }

  function onResetClockClick() {
    const status = gameStatus(gameState.game);
    if (gameState.busy || !(status === 'running' || status === 'over')) return;
    const question = status === 'running'
      ? `Reset the clock while the game is running? (${minutesLeftText()} left)\n\n`
        + "The countdown stops, the core rooms lock again and the leaderboard loses everyone's time bonus until you start again."
      : "Reset the clock?\n\nThe finished game's start time is cleared, so the leaderboard loses everyone's time bonus. "
        + 'Only do this if you want to run the game again.';
    if (!window.confirm(question)) return;
    runGameAction({ action: 'resetClock' }, 'Clock reset. Competition is waiting to start.');
  }

  async function fetchGameDirect() {
    try {
      const res = await fetch(GAME_ENDPOINT, { method: 'GET', cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !validGame(data.game)) throw new Error(`HTTP ${res.status}`);
      adoptGame(data.game, data.serverNow);
    } catch (_) {
      noteClockProblem();
    }
  }

  function initGameControl() {
    gameRefs.panel = qs('#gamePanel');
    if (!gameRefs.panel) return;
    gameRefs.modeName = qs('#gameModeName');
    gameRefs.statusText = qs('#gameStatusText');
    gameRefs.face = qs('#gameClockFace');
    gameRefs.time = qs('#gameClockTime');
    gameRefs.sub = qs('#gameClockSub');
    gameRefs.hint = qs('#gameControlsHint');
    gameRefs.feedback = qs('#gameFeedback');
    gameRefs.modeBtns = qsa('[data-game-mode]', gameRefs.panel);
    gameRefs.start = qs('#gameStartBtn');
    gameRefs.end = qs('#gameEndBtn');
    gameRefs.reset = qs('#gameResetClockBtn');

    gameRefs.modeBtns.forEach(btn => btn.addEventListener('click', () => onModeClick(btn.dataset.gameMode)));
    gameRefs.start?.addEventListener('click', onStartClick);
    gameRefs.end?.addEventListener('click', onEndClick);
    gameRefs.reset?.addEventListener('click', onResetClockClick);

    const clock = window.gameClock;
    if (clock && typeof clock.get === 'function') {
      if (typeof clock.onChange === 'function') clock.onChange(g => adoptGame(g));
      else window.addEventListener('game:change', ev => adoptGame(ev.detail));
      const current = clock.get();
      if (current) adoptGame(current);
      if (typeof clock.refresh === 'function') {
        Promise.resolve()
          .then(() => clock.refresh())
          .then(g => { if (validGame(g)) adoptGame(g); else noteClockProblem(); })
          .catch(noteClockProblem);
      }
    } else {
      // js/game-clock.js missing: poll the game function ourselves.
      fetchGameDirect();
      setInterval(fetchGameDirect, 15000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') fetchGameDirect();
      });
    }
    setTimeout(noteClockProblem, 10000);
    setInterval(tickGame, 1000);
    renderGamePanel();
  }

  // ---------- Points modal -------------------------------------------------

  const modalRefs = {
    wrapper: null,
    title: null,
    subtitle: null,
    chart: null,
    log: null,
    form: null,
    amount: null,
    totalInput: null,
    reason: null,
    feedback: null,
    resetBtn: null
  };

  function sanitizeScoreLog(team, log = []) {
    const sorted = log.slice().sort((a, b) => (a?.at || 0) - (b?.at || 0));
    const sanitized = [];
    sorted.forEach((entry, idx) => {
      const delta = Math.round(Number(entry?.delta) || 0);
      let total = Number(entry?.total);
      if (!Number.isFinite(total)) {
        if (idx === 0) {
          total = readScore(team);
        } else {
          total = sanitized[idx - 1].total + delta;
        }
      }
      sanitized.push({
        delta,
        total: Math.max(0, Math.round(total)),
        reason: entry?.reason || (delta >= 0 ? 'Adjustment' : 'Deduction'),
        at: entry?.at || Date.now()
      });
    });
    if (!sanitized.length) {
      sanitized.push({
        delta: 0,
        total: readScore(team),
        reason: 'No adjustments yet',
        at: Date.now()
      });
    }
    return sanitized;
  }

  function formatLogTime(ts) {
    const date = new Date(ts);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const day = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${day} ${time}`;
  }

  function renderPointsLogTable(container, team, log) {
    if (!container) return;
    container.innerHTML = '';
    if (!log.length) {
      container.textContent = 'No adjustments recorded yet.';
      return;
    }

    const table = document.createElement('table');

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['When', 'Change', 'Reason', 'Points kept'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    log.slice().reverse().forEach(entry => {
      const tr = document.createElement('tr');
      const delta = entry.delta || 0;
      const sign = delta >= 0 ? '+' : '−';
      const abs = Math.abs(delta);

      const when = document.createElement('td');
      when.textContent = formatLogTime(entry.at);

      const change = document.createElement('td');
      change.textContent = `${sign}${abs}`;

      const reason = document.createElement('td');
      reason.textContent = entry.reason || (delta >= 0 ? 'Adjustment' : 'Deduction');

      const total = document.createElement('td');
      total.textContent = String(entry.total);

      tr.append(when, change, reason, total);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
    container.setAttribute('aria-label', `${team} points kept log`);
  }

  function renderPointsChart(canvas, log) {
    if (!canvas || typeof window.Chart !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (pointsModalChart) {
      pointsModalChart.destroy();
      pointsModalChart = null;
    }
    const sorted = log.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const labels = sorted.map(entry => formatLogTime(entry.at));
    const totals = sorted.map(entry => entry.total);

    pointsModalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Points kept',
            data: totals,
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88,166,255,0.18)',
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#58a6ff'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  function hydratePointsModal(row) {
    const { wrapper, title, subtitle, chart, log, amount, totalInput, reason, feedback } = modalRefs;
    if (!wrapper || !row) return;
    const { team, score, scoreLog } = row;
    const friendlyTeam = team.toUpperCase();
    const entries = sanitizeScoreLog(team, scoreLog);

    if (title) title.textContent = `${friendlyTeam} — Points Kept`;
    if (subtitle) {
      const total = row.result ? ` • Total score: ${row.result.total}` : '';
      subtitle.textContent = `Points kept: ${score}${total} • Log entries: ${entries.length}`;
    }
    renderPointsLogTable(log, friendlyTeam, entries);
    renderPointsChart(chart, entries);

    if (amount) amount.value = '0';
    if (totalInput) totalInput.value = '';
    if (reason) reason.value = '';
    if (feedback) feedback.textContent = '';
  }

  function openPointsModal(team) {
    if (!modalRefs.wrapper) return;
    activePointsTeam = team;
    const data = teamRows.find(r => r.team === team);
    if (!data) return;
    hydratePointsModal(data);
    modalRefs.wrapper.classList.add('is-open');
    modalRefs.wrapper.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const closeBtn = modalRefs.wrapper.querySelector('.admin-modal__close');
    if (closeBtn) {
      if (window.utils?.safeFocus) window.utils.safeFocus(closeBtn);
      else closeBtn.focus();
    }
  }

  function closePointsModal() {
    if (!modalRefs.wrapper) return;
    modalRefs.wrapper.classList.remove('is-open');
    modalRefs.wrapper.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    activePointsTeam = null;
  }

  function onPointsAdjustSubmit(ev) {
    ev.preventDefault();
    if (!activePointsTeam) return;
    const amountVal = Number(modalRefs.amount?.value || 0);
    const totalValRaw = modalRefs.totalInput?.value?.trim() || '';
    const reasonVal = modalRefs.reason?.value?.trim() || '';
    if (!reasonVal) {
      if (modalRefs.feedback) modalRefs.feedback.textContent = 'Provide a reason for the adjustment.';
      return;
    }
    if (!totalValRaw && amountVal === 0) {
      if (modalRefs.feedback) modalRefs.feedback.textContent = 'Enter a change or set new points kept.';
      return;
    }

    try {
      if (totalValRaw) {
        setTeamScore(activePointsTeam, Number(totalValRaw), reasonVal);
      } else {
        adjustTeamScore(activePointsTeam, amountVal, reasonVal);
      }
      const team = activePointsTeam;
      refreshAll();
      const updatedRow = teamRows.find(r => r.team === team);
      hydratePointsModal(updatedRow);
      if (modalRefs.feedback) {
        modalRefs.feedback.textContent = `Saved. Points kept: ${readScore(team)}.`;
      }
      announce(`Updated ${team} points kept.`);
    } catch (err) {
      if (modalRefs.feedback) modalRefs.feedback.textContent = `Adjustment failed: ${err.message}`;
    }
  }

  function onPointsResetClick() {
    if (!activePointsTeam) return;
    const confirmed = window.confirm(`Clear ${activePointsTeam.toUpperCase()}'s points log and set points kept back to ${SCORE_BASE}? Their rooms and vault are not changed.`);
    if (!confirmed) return;
    resetTeamScore(activePointsTeam, 'Log reset by admin');
    announce(`Reset ${activePointsTeam} points kept.`);
    refreshAll();
    const updatedRow = teamRows.find(r => r.team === activePointsTeam);
    hydratePointsModal(updatedRow);
    if (modalRefs.feedback) modalRefs.feedback.textContent = `Log cleared and points kept reset to ${SCORE_BASE}.`;
  }

  function setupPointsModal() {
    modalRefs.wrapper = qs('#pointsModal');
    if (!modalRefs.wrapper) return;
    modalRefs.title = qs('#pointsModalTitle');
    modalRefs.subtitle = qs('#pointsModalSubtitle');
    modalRefs.chart = qs('#pointsModalChart');
    modalRefs.log = qs('#pointsModalLog');
    modalRefs.form = qs('#pointsAdjustForm');
    modalRefs.amount = qs('#pointsAdjustAmount');
    modalRefs.totalInput = qs('#pointsSetTotal');
    modalRefs.reason = qs('#pointsAdjustReason');
    modalRefs.feedback = qs('#pointsAdjustFeedback');
    modalRefs.resetBtn = qs('#pointsResetBtn');

    modalRefs.wrapper.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', closePointsModal);
    });

    modalRefs.form?.addEventListener('submit', onPointsAdjustSubmit);
    modalRefs.resetBtn?.addEventListener('click', onPointsResetClick);

    modalRefs.wrapper.addEventListener('click', (ev) => {
      if (ev.target === modalRefs.wrapper) closePointsModal();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modalRefs.wrapper.classList.contains('is-open')) {
        closePointsModal();
      }
    });
  }

  // ---------- Charts -------------------------------------------------------

  // Dark-surface categorical steps (validated for colour-blind separation on the panel colour).
  const CHART_COLORS = {
    kept: '#3987e5',
    rooms: '#d95926',
    vault: '#199e70',
    time: '#c98500',
    bonus: '#6e7681'
  };

  let progressChart, scoreChart, challengeChart;

  function drawCharts(rows, ranked) {
    if (typeof window.Chart !== 'function') return;
    const labels = rows.map(r => r.team.toUpperCase());
    const completedData = rows.map(r => r.completed);
    const challengeData = PUZZLES.map(puzzle => rows.reduce((acc, row) => acc + (row.progress?.[puzzle] ? 1 : 0), 0));
    const animate = forceChartAnimation || !chartsAnimated;
    const commonAnimation = animate ? { duration: 650, easing: 'easeOutCubic' } : false;

    // Rooms solved per team (core rooms only)
    const progressCtx = qs('#progressChart')?.getContext('2d');
    if (progressCtx) {
      if (progressChart) progressChart.destroy();
      progressChart = new Chart(progressCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: `Core rooms solved (of ${CORE_ROOMS.length})`,
              data: completedData,
              backgroundColor: CHART_COLORS.kept,
              borderRadius: 4,
              borderWidth: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: commonAnimation,
          scales: { y: { beginAtZero: true, max: CORE_ROOMS.length, ticks: { stepSize: 1 } } },
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: false }
          },
          layout: { padding: 6 }
        }
      });
    }

    // Score breakdown per team, in leaderboard order
    const scoreCtx = qs('#scoreChart')?.getContext('2d');
    if (scoreCtx) {
      if (scoreChart) scoreChart.destroy();
      const parts = [
        { label: 'Points kept', key: 'pot', color: CHART_COLORS.kept },
        { label: 'Room points', key: 'roomPoints', color: CHART_COLORS.rooms },
        { label: 'Vault', key: 'vaultPoints', color: CHART_COLORS.vault },
        { label: 'Time bonus', key: 'timeBonus', color: CHART_COLORS.time }
      ];
      scoreChart = new Chart(scoreCtx, {
        type: 'bar',
        data: {
          labels: ranked.map(e => e.team.toUpperCase()),
          datasets: parts.map(part => ({
            label: part.label,
            data: ranked.map(e => Number(e.result?.[part.key]) || 0),
            backgroundColor: part.color,
            borderColor: '#11161d',
            borderWidth: 1
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: commonAnimation,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: false },
            tooltip: {
              callbacks: {
                footer: (items) => {
                  const entry = ranked[items[0]?.dataIndex];
                  return entry?.result ? `Total: ${entry.result.total}` : '';
                }
              }
            }
          },
          layout: { padding: 6 }
        }
      });
    }

    // Teams per room: the 5 core rooms, then the bonus room (not scored) in grey
    const challengeCtx = qs('#challengeChart')?.getContext('2d');
    if (challengeCtx) {
      if (challengeChart) challengeChart.destroy();
      challengeChart = new Chart(challengeCtx, {
        type: 'bar',
        data: {
          labels: PUZZLES.map(puzzle => (puzzle === BONUS_ROOM ? `${BONUS_LABEL} (not scored)` : (PUZZLE_LABELS[puzzle] || puzzle))),
          datasets: [
            {
              label: 'Teams that solved it',
              data: challengeData,
              backgroundColor: PUZZLES.map(puzzle => (puzzle === BONUS_ROOM ? CHART_COLORS.bonus : CHART_COLORS.kept)),
              borderRadius: 4,
              borderWidth: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: commonAnimation,
          scales: { y: { beginAtZero: true, max: Math.max(1, rows.length), ticks: { stepSize: 1 } } },
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: false }
          },
          layout: { padding: 6 }
        }
      });
    }

    if (animate) chartsAnimated = true;
    forceChartAnimation = false;
  }

  // ---------- Controls -----------------------------------------------------

  function wireChartTabs() {
    const tabs = qsa('.chart-tab');
    const panels = qsa('.chart-panel');
    if (!tabs.length || !panels.length) return;

    const activate = (targetId) => {
      tabs.forEach(tab => {
        const isActive = tab.dataset.target === targetId;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      panels.forEach(panel => {
        const isActive = panel.dataset.panel === targetId;
        panel.classList.toggle('is-active', isActive);
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activate(tab.dataset.target);
      });
    });

    // Initialize state
    activate(tabs.find(tab => tab.classList.contains('is-active'))?.dataset.target || panels[0].dataset.panel);
  }

  function wireControls(refresh) {
    // Reset every team's rooms, code words, vault and points (the game clock is separate)
    qs('#resetAllProgress')?.addEventListener('click', async () => {
      if (!confirm('Reset every team?\n\nThis wipes all rooms, code words, the vault and points for every team. The game clock is not changed.')) return;
      const status = qs('#syncStatus');
      if (status) {
        status.textContent = 'Resetting all teams…';
        status.classList.remove('status-ok', 'status-warn');
      }
      const resetVersion = Date.now();
      TEAMS.forEach(team => {
        setJSON(`${team}_progress`, { ...DEFAULT_PROGRESS });
        setJSON(`${team}_progress_meta`, {});
        setJSON(`${team}_times`, []);
        setJSON(activityKey(team), []);
        logTeamActivity(team, { type: 'session', status: 'reset', detail: 'Progress reset by admin', at: resetVersion });
        writeVault(team, { resetVersion });
        resetTeamScore(team, 'Reset via admin', { resetVault: true });
      });
      ['vault_word_phishing',
       'vault_word_osint',
       'vault_word_incident',
       'vault_word_mfa',
       'vault_word_crypto',
       'vault_word_forensics'
      ].forEach(key => localStorage.removeItem(key));
      try {
        const payload = TEAMS.map(getTeamStateSnapshot);
        const res = await fetch('/.netlify/functions/push', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ teams: payload })
        });
        if (isAuthStatus(res.status)) {
          noteLoginExpired();
          throw loginExpiredError();
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        noteLoginOk();
        if (status) {
          status.textContent = 'All teams reset.';
          status.classList.add('status-ok');
        }
        noteSync('Reset', 'All teams reset and synced.');
      } catch (err) {
        if (status) {
          status.textContent = `Reset sync failed: ${err.message}`;
          status.classList.add('status-warn');
        }
        noteSync('Reset', err.message, 'warn');
      }
      announce('All team progress reset.');
      refresh();
    });

    // Podium overlay: confetti + the top 3, on the admin's screen only (simple class toggles)
    const confettiLayer = qs('#confettiLayer');

    const hidePodium = () => {
      if (!confettiLayer) return;
      confettiLayer.classList.remove('is-active', 'podium-visible');
      confettiLayer.setAttribute('aria-hidden', 'true');
    };

    const showPodium = () => {
      if (!confettiLayer) return;
      refresh(); // fills the podium from the current leaderboard
      confettiLayer.classList.add('is-active', 'podium-visible');
      confettiLayer.setAttribute('aria-hidden', 'false');
    };

    qs('#celebrateClose')?.addEventListener('click', hidePodium);

    qs('#togglePodium')?.addEventListener('click', () => {
      if (!confettiLayer) return;
      const showing = !confettiLayer.classList.contains('podium-visible');
      if (showing) {
        showPodium();
      } else {
        hidePodium();
      }
      announce(showing ? 'Podium shown' : 'Podium hidden');
    });

    // Notes
    const notes = qs('#adminNotes');
    const notesStatus = qs('#notesStatus');
    const saved = localStorage.getItem('admin_notes') || '';
    if (notes) notes.value = saved;

    qs('#saveNotesBtn')?.addEventListener('click', () => {
      if (notes) {
        localStorage.setItem('admin_notes', notes.value);
        if (notesStatus) notesStatus.textContent = 'Notes saved.';
        announce('Notes saved');
      }
    });

    qs('#clearNotesBtn')?.addEventListener('click', () => {
      if (notes) {
        notes.value = '';
        localStorage.removeItem('admin_notes');
        if (notesStatus) notesStatus.textContent = 'Notes cleared.';
        announce('Notes cleared');
      }
    });

    // Logout top link is handled in HTML glue; expose global too
    window.logout = function () {
      if (window.utils?.logout) {
        window.utils.logout('index.html');
      } else {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
      }
    };

    // Refresh now: the same pull the dashboard does every 25 seconds. (Admin edits save
    // themselves, so there is no "push" button: it could undo points a team lost since the last pull.)
    qs('#refreshNowBtn')?.addEventListener('click', async () => {
      const status = qs('#syncStatus');
      try {
        forceChartAnimation = true;
        await syncFromNeon(status);
        refresh();
      } catch (_) {
        refresh();
      }
    });

    qs('#downloadStateBtn')?.addEventListener('click', () => {
      const snapshot = JSON.stringify({ game: gameState.game, teams: teamRows }, null, 2);
      const blob = new Blob([snapshot], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `team-state-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      noteSync('Snapshot', 'Downloaded current team state as JSON.');
    });
  }

  async function syncFromNeon(statusEl) {
    try {
      if (statusEl) {
        statusEl.textContent = 'Refreshing…';
        statusEl.classList.remove('status-ok', 'status-warn');
      }
      const res = await fetch('/.netlify/functions/pull', { method: 'GET', headers: authHeaders(), cache: 'no-store' });
      if (isAuthStatus(res.status)) {
        noteLoginExpired();
        throw loginExpiredError();
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      noteLoginOk();
      const data = await res.json();
      if (!data || !Array.isArray(data.teams)) {
        throw new Error('No teams returned');
      }
      const corrections = [];
      data.teams.forEach(row => {
        if (!row || !row.team) return;
        const team = String(row.team).toLowerCase();
        if (!TEAMS.includes(team)) TEAMS.push(team);
        const issues = [];
        const progress = normalizeProgress(row.progress, issues);
        setJSON(`${team}_progress`, progress);
        const progressMeta = normalizeProgressMeta(row.progressMeta, issues);
        setJSON(`${team}_progress_meta`, progressMeta);
        const times = normalizeTimes(row.times, issues);
        setJSON(`${team}_times`, times);
        const score = normalizeScore(row.score, issues);
        localStorage.setItem(scoreKey(team), String(score));
        const scoreLog = normalizeScoreLog(row.scoreLog, issues, score);
        localStorage.setItem(scoreLogKey(team), JSON.stringify(scoreLog));
        const activity = normalizeActivity(row.activity, issues);
        setJSON(activityKey(team), activity);
        // Keeps the server's solvedAt / openedAt stamps, which the leaderboard scores from.
        writeVault(team, row.vault || {});
        if (issues.length) corrections.push({ team, issues });
      });
      if (statusEl) {
        statusEl.textContent = 'Up to date.';
        statusEl.classList.add('status-ok');
      }
      noteSync('Refresh', `Pulled ${data.teams.length} team states${corrections.length ? `; ${corrections.length} cleaned` : ''}.`);
      return { teams: data.teams, corrections };
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = `Refresh failed: ${e.message}`;
        statusEl.classList.add('status-warn');
      }
      // An expired login is shown in the banner; don't fill the console every 25 seconds.
      if (!e?.loginExpired) console.error('Neon sync failed:', e);
      noteSync('Refresh', e.message, 'warn');
      throw e;
    }
  }

  // ---------- Boot ---------------------------------------------------------

  function refreshAll() {
    // The lists are rebuilt from scratch: keep keyboard focus on a "⚠ n" button.
    const focusedFlag = document.activeElement?.dataset?.flagKey || null;
    const rows = loadTeamData();
    teamRows = rows;
    rankedRows = scoreAndRank(rows);
    renderLeaderboard(rankedRows);
    renderPodium(rankedRows);
    renderTeamCards(rows);
    renderStats(rows);
    drawCharts(rows, rankedRows);
    initActivityFilters();
    renderActivityFeed(rows);
    renderSessionList(rows);
    if (activePointsTeam && modalRefs.wrapper?.classList.contains('is-open')) {
      const row = teamRows.find(r => r.team === activePointsTeam);
      if (row) hydratePointsModal(row);
    }
    if (focusedFlag) {
      const again = qsa('[data-flag-key]').find(btn => btn.dataset.flagKey === focusedFlag);
      if (again) again.focus({ preventScroll: true });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const user = guardAdmin();
    if (!user) return;

    renderWelcome(user);
    renderFormula();
    setupPointsModal();
    initGameControl();
    const firstRefresh = () => { booted = true; refreshAll(); };
    syncFromNeon().then(firstRefresh).catch(firstRefresh);
    wireChartTabs();
    wireControls(refreshAll);
    const throttledRefresh = window.utils?.throttle ? window.utils.throttle(refreshAll, 300) : refreshAll;
    window.addEventListener('storage', throttledRefresh);
    setInterval(() => {
      syncFromNeon().then(() => refreshAll()).catch((err) => noteSync('Auto refresh', err.message, 'warn'));
    }, 25000);
  });

})();
