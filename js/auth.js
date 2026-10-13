/* auth.js — Cyber Escape Rooms login
   - Logs in only through the Netlify Function (Neon-backed users table); no offline accounts
   - Saves { username (lower-case), role, token } in localStorage as "user"
     (token = signed sign-in token for every account; utils.authHeaders() sends it to every
     protected Netlify Function)
   - Redirects admin -> admin.html, teams -> game.html
   - Shows "Your sign-in has expired" above the form after index.html?expired=1
   - Global logout()
*/

(function () {
  'use strict';

  // ---------- Config -------------------------------------------------------

  // Netlify Function endpoint (same origin, CSP-friendly)
  const LOGIN_ENDPOINT = '/.netlify/functions/login';
  const LOGIN_TIMEOUT_MS = 10000;

  const MSG_UNREACHABLE = "Can't reach the game server. Check your connection or ask a facilitator.";
  const MSG_WRONG = "That username or password isn't right. Check them and try again, or ask a facilitator.";
  const MSG_MISSING = 'Please enter your username and password.';
  const MSG_EXPIRED = 'Your sign-in has expired. Please log in again.';

  // ---------- DOM helpers --------------------------------------------------

  const $ = (sel, root = document) => root.querySelector(sel);

  function setError(msg) {
    const el = $('#errorMsg');
    if (el) { el.textContent = msg || ''; }
    if (window.a11y && msg) window.a11y.announce(msg);
  }

  function setLoading(isLoading) {
    const btn = $('#loginForm button[type="submit"]');
    if (!btn) return;
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? 'Logging in…' : 'Login';
  }

  function redirectForRole(role) {
    if (role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'game.html';
    }
  }

  // ---------- Storage ------------------------------------------------------

  // Usernames are stored lower-case so every `${username}_...` key matches the server's team key.
  function saveUser(user) {
    const saved = { username: String(user.username).toLowerCase(), role: user.role };
    if (user.token) saved.token = user.token;
    localStorage.setItem('user', JSON.stringify(saved));
    return saved;
  }

  function readUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }

  // ---------- Server login (Neon via Netlify Function) ---------------------

  // Returns { ok: true, user: { username, role, token? } } or { ok: false, error }.
  async function serverLogin(username, password) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LOGIN_TIMEOUT_MS);
    try {
      const res = await fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: ctrl.signal
      });
      if (res.status === 401) return { ok: false, error: MSG_WRONG };
      if (res.status === 400) return { ok: false, error: MSG_MISSING };
      // Anything else that isn't a success (function missing, database down, proxy error)
      // looks the same to a player: the game server can't log them in right now.
      if (!res.ok) return { ok: false, error: MSG_UNREACHABLE };
      const data = await res.json().catch(() => null);
      // Expected shape: { ok: true, user: { username, role }, token }
      if (data && data.ok && data.user && data.user.username && data.user.role) {
        return { ok: true, user: { username: data.user.username, role: data.user.role, token: data.token || data.user.token || null } };
      }
      return { ok: false, error: MSG_UNREACHABLE };
    } catch (_) {
      // Network error, offline, or timed out.
      return { ok: false, error: MSG_UNREACHABLE };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- Public logout (used by headers) ------------------------------

  window.logout = function logout() {
    if (window.utils?.logout) {
      window.utils.logout('index.html');
    } else {
      localStorage.removeItem('user');
      window.location.href = 'index.html';
    }
  };

  const ROOM_KEYS = ['phishing', 'osint', 'incident', 'mfa', 'crypto', 'forensics'];
  const DEFAULT_PROGRESS = Object.fromEntries(ROOM_KEYS.map(k => [k, false]));

  async function bootstrapTeamState(username) {
    const team = String(username || '').toLowerCase();
    if (!team) return;
    try {
      const url = new URL('/.netlify/functions/team-state', window.location.origin);
      url.searchParams.set('team', team);
      const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store', headers: window.utils?.authHeaders?.() || {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const state = payload?.state;
      if (!state) return;
      const progressKey = `${team}_progress`;
      const metaKey = `${team}_progress_meta`;
      const timesKey = `${team}_times`;
      const scoreKey = `${team}_score`;
      const scoreLogKey = `${team}_score_log`;
      const activityKey = `${team}_activity`;
      localStorage.setItem(progressKey, JSON.stringify({ ...DEFAULT_PROGRESS, ...(state.progress || {}) }));
      localStorage.setItem(metaKey, JSON.stringify(state.progressMeta || {}));
      localStorage.setItem(timesKey, JSON.stringify(state.times || []));
      if (Number.isFinite(state.score)) {
        localStorage.setItem(scoreKey, String(Math.max(0, Math.round(state.score))));
      }
      localStorage.setItem(scoreLogKey, JSON.stringify(state.scoreLog || []));
      localStorage.setItem(activityKey, JSON.stringify(state.activity || []));
      // Code words and "vault opened" live under shared keys: start from this team's copy only,
      // never from whatever another team left on this computer.
      ROOM_KEYS.forEach(k => localStorage.removeItem(`vault_word_${k}`));
      localStorage.removeItem('vault_opened');
      if (state.vault) {
        ROOM_KEYS.forEach(k => {
          if (state.vault[k]) localStorage.setItem(`vault_word_${k}`, String(state.vault[k]));
        });
        if (state.vault.opened) localStorage.setItem('vault_opened', '1');
        if (state.vault.entries && typeof state.vault.entries === 'object') {
          localStorage.setItem(`${team}_vault_entries`, JSON.stringify(state.vault.entries));
        }
        localStorage.setItem(`${team}_vault`, JSON.stringify(state.vault));
      }
      // The reset epoch always comes from the server copy (none -> none).
      if (state.vault?.resetVersion) localStorage.setItem(`${team}_reset_version`, String(state.vault.resetVersion));
      else localStorage.removeItem(`${team}_reset_version`);
    } catch (err) {
      console.warn('Unable to hydrate team state', err);
    }
  }

  // ---------- Sign-in expired ---------------------------------------------

  // index.html?expired=1 (or a team page that just found the sign-in refused): one line above
  // the form, so the player knows why they are here.
  function showExpired() {
    let flagged = false;
    try { flagged = sessionStorage.getItem('signin_expired') === '1'; } catch (_) {}
    if (!flagged && window.utils?.getQueryParam?.('expired') !== '1') return;
    try { sessionStorage.removeItem('signin_expired'); } catch (_) {}
    const form = $('#loginForm');
    if (!form || $('#expiredMsg')) return;
    const note = document.createElement('p');
    note.id = 'expiredMsg';
    note.className = 'status-warn mt-2';
    note.setAttribute('role', 'status');
    note.textContent = MSG_EXPIRED;
    form.parentNode.insertBefore(note, form);
    // On a phone the form is below the fold: bring it (and the reason) into view.
    try { note.scrollIntoView({ block: 'center' }); } catch (_) {}
    if (window.a11y) window.a11y.announce(MSG_EXPIRED);
  }

  // ---------- Page bootstrap ----------------------------------------------

  document.addEventListener('DOMContentLoaded', () => {
    let user = readUser();

    // A team signed in before sign-in tokens existed: forget it and ask for a new login here,
    // instead of bouncing to the hub (which would only send the player straight back).
    if ($('form#loginForm') && user && user.role === 'team' && !user.token) {
      window.utils?.clearSessionKeys?.();
      try { sessionStorage.setItem('signin_expired', '1'); } catch (_) {}
      user = null;
    }

    // If we land on the login page while already logged in, bounce to destination.
    // (Keeps deep links tidy; still allows manual logout from header.)
    if (document.body && $('form#loginForm')) {
      if (user && user.role) {
        redirectForRole(user.role);
        return;
      }
    }

    const form = $('#loginForm');
    if (!form) return; // not on index.html
    showExpired();

    const usernameEl = $('#username');
    const passwordEl = $('#password');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const username = (usernameEl.value || '').trim();
      const password = passwordEl.value || '';

      if (!username || !password) {
        setLoading(false);
        return setError(MSG_MISSING);
      }

      const result = await serverLogin(username, password);
      if (!result.ok) {
        setLoading(false);
        return setError(result.error);
      }

      const user = saveUser(result.user);
      $('#expiredMsg')?.remove();
      if (user.role === 'team') {
        await bootstrapTeamState(user.username);
        try {
          window.utils?.pushActivity({ type: 'session', status: 'login', detail: 'Signed in' });
          window.stateSync?.saveNow?.('login');
        } catch (_) {
          /* ignore */
        }
      }
      setLoading(false);
      if (window.a11y) window.a11y.announce('Login successful');
      return redirectForRole(user.role);
    });

    // Clear button feedback
    $('#clearBtn')?.addEventListener('click', () => {
      setError('');
      if (usernameEl) usernameEl.focus();
    });
  });
})();
