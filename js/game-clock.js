/* game-clock.js — the shared game clock (free roam or a timed competition)

   - Polls /.netlify/functions/game on load, every 15 s (5 s while waiting for the start),
     and when the tab becomes visible. Keeps an offset to the server clock, so the countdown
     is the same on every device whatever its own clock says.
   - window.gameClock: get(), now(), remainingMs(), refresh(), onChange(fn).
   - Events on window: 'game:change' (detail = game) on every mode/status/clock change and
     after the first server answer; 'game:tick' (detail = { remainingMs }) every second
     while the clock runs.
   - A small clock pill next to the header vault tracker (#vaultStatus), unless the page
     opts out with <body data-no-clock-pill>.
   - The five core room pages are locked behind a full-page overlay while the game is
     waiting to start or time is up; it goes away by itself when play is allowed.
     (Forensics is a bonus room and is never locked here.) */

(function () {
  'use strict';

  const ENDPOINT = '/.netlify/functions/game';
  const POLL_MS = 15000;
  const POLL_WAITING_MS = 5000;
  const FETCH_TIMEOUT_MS = 8000;
  const MINUTE = 60000;
  const WARN_MS = 10 * MINUTE;
  const DANGER_MS = 2 * MINUTE;
  // Last answer for this tab, so moving between pages doesn't flash an unlocked room.
  const CACHE_KEY = 'game_clock';
  const CACHE_MAX_AGE_MS = 5 * MINUTE;
  const CORE_PAGES = ['phishing.html', 'osint.html', 'incident.html', 'mfa.html', 'crypto.html'];
  const PAGE = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const LOCKS_PAGE = CORE_PAGES.includes(PAGE);

  let game = null;        // last game object (status kept current with the server clock)
  let offset = 0;         // server time minus this device's time, in ms
  let signature = '';
  let answered = false;   // has the server answered on this page yet?
  let inflight = null;
  let pollTimer = null;
  let tickTimer = null;
  const listeners = new Set();

  const ms = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

  function now() {
    return Date.now() + offset;
  }

  // Server shape -> clean game object; status follows the (server-corrected) clock.
  function normalize(raw) {
    const g = raw && typeof raw === 'object' ? raw : {};
    const mode = g.mode === 'competition' ? 'competition' : 'free';
    const durationMin = Number(g.durationMin) > 0 ? Number(g.durationMin) : 45;
    const startedAt = mode === 'competition' ? ms(g.startedAt) : null;
    const endedAt = startedAt ? ms(g.endedAt) : null;
    const endsAt = startedAt ? (ms(g.endsAt) || endedAt || startedAt + durationMin * MINUTE) : null;
    return { mode, status: statusOf(mode, startedAt, endsAt), startedAt, endedAt, endsAt, durationMin };
  }

  function statusOf(mode, startedAt, endsAt) {
    if (mode !== 'competition') return 'free';
    if (!startedAt) return 'waiting';
    return now() < endsAt ? 'running' : 'over';
  }

  function get() {
    return game ? { ...game } : null;
  }

  function remainingMs() {
    if (!game) return null;
    if (game.status === 'running') return Math.max(0, game.endsAt - now());
    if (game.status === 'over') return 0;
    return null;
  }

  // ---------- Cache (sessionStorage, this tab only) -------------------------

  function readCache() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (!raw || !raw.game || !(Date.now() - Number(raw.at) < CACHE_MAX_AGE_MS)) return;
      offset = Number.isFinite(Number(raw.offset)) ? Number(raw.offset) : 0;
      game = normalize(raw.game);
    } catch (_) { /* ignore */ }
  }

  function writeCache() {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ game, offset, at: Date.now() }));
    } catch (_) { /* ignore */ }
  }

  // ---------- Change detection ----------------------------------------------

  function sig(g) {
    return g ? [g.mode, g.status, g.startedAt, g.endedAt, g.endsAt, g.durationMin].join('|') : '';
  }

  function notify() {
    const snapshot = get();
    listeners.forEach((fn) => {
      try { fn(snapshot); } catch (err) { console.warn('[game-clock] listener failed', err); }
    });
    try { window.dispatchEvent(new CustomEvent('game:change', { detail: snapshot })); } catch (_) {}
  }

  // Re-derive the status from the clock; tell everyone if anything changed (or if this is
  // the server's first answer on this page, so listeners added after a cached start hear it).
  function evaluate(force) {
    if (!game) return;
    game = { ...game, status: statusOf(game.mode, game.startedAt, game.endsAt) };
    const next = sig(game);
    const changed = next !== signature;
    const before = signature ? signature.split('|')[1] : null;
    signature = next;
    render();
    scheduleTick();
    if (changed || force) {
      announceChange(before, game.status);
      notify();
    }
  }

  // ---------- Server --------------------------------------------------------

  function refresh() {
    if (inflight) return inflight;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
    const sentAt = Date.now();
    inflight = fetch(ENDPOINT, { method: 'GET', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (!data || !data.ok || !data.game) throw new Error('Unexpected game response');
        const receivedAt = Date.now();
        const serverNow = Number(data.serverNow);
        if (Number.isFinite(serverNow)) offset = serverNow - (sentAt + receivedAt) / 2;
        game = normalize(data.game);
        writeCache();
        const first = !answered;
        answered = true;
        evaluate(first);
        return get();
      })
      .catch((err) => {
        // Keep the last known state: a network blip must not lock or unlock anyone.
        console.warn('[game-clock] could not reach the game clock', err && err.message ? err.message : err);
        return get();
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        inflight = null;
        schedulePoll();
      });
    return inflight;
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    const wait = game && game.status === 'waiting' ? POLL_WAITING_MS : POLL_MS;
    pollTimer = setTimeout(() => {
      if (document.visibilityState === 'hidden') { schedulePoll(); return; }
      refresh();
    }, wait);
  }

  // One tick just after each whole second while the clock runs.
  function scheduleTick() {
    clearTimeout(tickTimer);
    if (!game || game.status !== 'running') return;
    const left = remainingMs();
    tickTimer = setTimeout(tick, (left % 1000) + 20);
  }

  function tick() {
    if (!game) return;
    const left = remainingMs();
    try { window.dispatchEvent(new CustomEvent('game:tick', { detail: { remainingMs: left } })); } catch (_) {}
    announceThresholds(left);
    evaluate(false); // flips running -> over at zero, re-renders and schedules the next tick
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ---------- Announcements -------------------------------------------------

  function say(msg) {
    try { window.a11y?.announce?.(msg); } catch (_) {}
  }

  function announceChange(before, after) {
    if (!before || before === after) return; // only real changes, not the first paint
    // A locked room page announces its own lock message instead.
    if (LOCKS_PAGE && (after === 'waiting' || after === 'over')) return;
    if (after === 'running') say('The game clock has started. Good luck!');
    else if (after === 'over') say("Time's up! The rooms are now closed.");
    else if (after === 'waiting') {
      say(before === 'free'
        ? 'Competition mode is on. Waiting for the facilitator to start the clock.'
        : 'The game clock was reset. Waiting for the facilitator to start.');
    } else if (after === 'free') say('Free roam: no clock is running.');
  }

  let lastThreshold = null;
  function announceThresholds(left) {
    if (left == null) return;
    const band = left <= DANGER_MS ? 'danger' : left <= WARN_MS ? 'warn' : 'ok';
    if (lastThreshold && band !== lastThreshold && band !== 'ok') {
      say(band === 'danger' ? 'Two minutes left on the game clock.' : 'Ten minutes left on the game clock.');
    }
    lastThreshold = band;
  }

  // ---------- Header pill ---------------------------------------------------

  let pill = null;

  function ensurePill() {
    if (pill && pill.isConnected) return pill;
    if (!document.body || document.body.hasAttribute('data-no-clock-pill')) return null;
    const anchor = document.getElementById('vaultStatus');
    if (!anchor || !anchor.parentNode) return null;
    pill = document.createElement('span');
    pill.className = 'gc-pill';
    pill.id = 'gameClockPill';
    pill.setAttribute('role', 'timer');
    pill.innerHTML = '<span class="gc-pill__dot" aria-hidden="true"></span><span class="gc-pill__text"></span>';
    anchor.parentNode.insertBefore(pill, anchor.nextSibling);
    return pill;
  }

  function clockText(left) {
    const total = Math.max(0, Math.ceil(left / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function renderPill() {
    const el = ensurePill();
    if (!el) return;
    if (!game) { el.hidden = true; return; }
    el.hidden = false;
    const left = remainingMs();
    let text = 'Free roam';
    let state = 'free';
    let label = 'Free roam: no game clock is running';
    if (game.status === 'waiting') {
      text = 'Waiting to start'; state = 'waiting'; label = 'Game clock: waiting for the facilitator to start';
    } else if (game.status === 'over') {
      text = "Time's up"; state = 'over'; label = "Game clock: time's up";
    } else if (game.status === 'running') {
      text = `${clockText(left)} left`;
      state = left <= DANGER_MS ? 'danger' : left <= WARN_MS ? 'warn' : 'running';
      label = `Game clock: ${Math.ceil(left / MINUTE)} minute${Math.ceil(left / MINUTE) === 1 ? '' : 's'} left`;
    }
    const textEl = el.querySelector('.gc-pill__text');
    if (textEl && textEl.textContent !== text) textEl.textContent = text;
    if (el.dataset.state !== state) el.dataset.state = state;
    if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
    el.title = label;
  }

  // ---------- Lock overlay (core rooms only) --------------------------------

  // Line icons (SVG, so they look the same on every computer; emoji fonts vary).
  const ICONS = {
    hourglass: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 3h12M6 21h12"/><path d="M7 3c0 4.5 5 6 5 9s-5 4.5-5 9"/><path d="M17 3c0 4.5-5 6-5 9s5 4.5 5 9"/><path d="M9.5 19h5" stroke-width="2.6"/></svg>',
    alarm: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.6 1.6"/><path d="M4.5 4.5 2.5 6.5M19.5 4.5l2 2"/><path d="M7 19.5 5.5 21M17 19.5l1.5 1.5"/></svg>'
  };

  const LOCK_COPY = {
    waiting: {
      icon: 'hourglass',
      title: "The game hasn't started yet",
      text: 'Hang tight: your facilitator will start the clock soon, and this room opens by itself the moment they do.'
    },
    over: {
      icon: 'alarm',
      title: "Time's up!",
      text: 'The clock has run out, so the rooms are now closed. Head back to the Mission Hub to see how your team did.'
    }
  };

  let overlay = null;
  let lockedAs = null;
  let observer = null;
  const inerted = new Map(); // element -> its own aria-hidden value before the lock

  // Everything on the page except the overlay and the screen-reader / toast regions.
  function shouldInert(el) {
    return el instanceof HTMLElement && el !== overlay && el.id !== 'a11y-live' && el.id !== 'toastStack'
      && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE';
  }

  function inertEl(el) {
    if (!shouldInert(el) || el.inert || inerted.has(el)) return;
    inerted.set(el, el.getAttribute('aria-hidden'));
    el.inert = true;
    el.setAttribute('aria-hidden', 'true');
  }

  function buildOverlay() {
    const el = document.createElement('div');
    el.className = 'gc-lock';
    el.id = 'gameClockLock';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'gameClockLockTitle');
    el.setAttribute('aria-describedby', 'gameClockLockText');
    el.innerHTML = `
      <div class="gc-lock__card">
        <div class="gc-lock__icon" aria-hidden="true"></div>
        <h2 class="gc-lock__title" id="gameClockLockTitle"></h2>
        <p class="gc-lock__text" id="gameClockLockText"></p>
        <a class="btn primary gc-lock__btn" href="game.html">Back to the Mission Hub</a>
      </div>`;
    // Keep keyboard focus on the one button while the room is locked.
    el.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Tab') return;
      ev.preventDefault();
      el.querySelector('.gc-lock__btn')?.focus();
    });
    return el;
  }

  function lock(status) {
    const copy = LOCK_COPY[status];
    if (!copy || !document.body) return;
    const fresh = !overlay;
    if (fresh) overlay = buildOverlay();
    if (lockedAs !== status) {
      overlay.dataset.state = status;
      overlay.querySelector('.gc-lock__icon').innerHTML = ICONS[copy.icon];
      overlay.querySelector('.gc-lock__title').textContent = copy.title;
      overlay.querySelector('.gc-lock__text').textContent = copy.text;
    }
    if (!overlay.isConnected) document.body.appendChild(overlay);
    Array.from(document.body.children).forEach(inertEl);
    if (!observer && typeof MutationObserver === 'function') {
      // Anything a room adds later (pop-ups, toasts, onboarding) stays behind the lock too.
      observer = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(inertEl)));
      observer.observe(document.body, { childList: true });
    }
    document.documentElement.classList.add('gc-locked');
    if (lockedAs !== status) {
      lockedAs = status;
      say(`${copy.title} ${copy.text}`);
      const focusTarget = overlay.querySelector('.gc-lock__btn');
      setTimeout(() => { try { focusTarget.focus({ preventScroll: true }); } catch (_) {} }, 0);
    }
  }

  function unlock() {
    if (!overlay) return;
    if (observer) { observer.disconnect(); observer = null; }
    inerted.forEach((ariaHidden, el) => {
      el.inert = false;
      if (ariaHidden == null) el.removeAttribute('aria-hidden');
      else el.setAttribute('aria-hidden', ariaHidden);
    });
    inerted.clear();
    overlay.remove();
    overlay = null;
    document.documentElement.classList.remove('gc-locked');
    lockedAs = null;
    // Focus was on the lock's button: hand it to a room pop-up that is open (e.g. "How to
    // play"), otherwise to the main content.
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]:not([hidden])');
    const target = dialog || document.getElementById('main');
    if (target) { try { target.focus({ preventScroll: true }); } catch (_) {} }
  }

  function renderLock() {
    if (!LOCKS_PAGE) return;
    if (game && (game.status === 'waiting' || game.status === 'over')) lock(game.status);
    else unlock();
  }

  function render() {
    if (document.readyState === 'loading') return; // DOMContentLoaded renders
    renderPill();
    renderLock();
  }

  // ---------- Start ---------------------------------------------------------

  readCache();
  if (game) signature = sig(game);

  document.addEventListener('DOMContentLoaded', () => {
    render();
    scheduleTick();
  });
  if (document.readyState !== 'loading') { render(); scheduleTick(); }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  // Back/forward cache restores a frozen page: check the clock again straight away.
  window.addEventListener('pageshow', (ev) => { if (ev.persisted) refresh(); });

  refresh();

  window.gameClock = { get, now, remainingMs, refresh, onChange };
})();
