/* vault.js — code words, the header vault tracker and the room-complete helpers.
   The vault takes one code word from each of the five CORE rooms. Forensics is a bonus room:
   no code word, it unlocks once the vault is open, and completeBonus() records it. */

(function () {
  'use strict';

  // The five core rooms, in display order (header dots, hub vault).
  const PUZZLES = [
    { key: 'phishing', label: 'Phishing', storage: 'vault_word_phishing', href: 'phishing.html' },
    { key: 'osint', label: 'OSINT', storage: 'vault_word_osint', href: 'osint.html' },
    { key: 'incident', label: 'Incident Mgmt', storage: 'vault_word_incident', href: 'incident.html' },
    { key: 'mfa', label: 'MFA / Auth', storage: 'vault_word_mfa', href: 'mfa.html' },
    { key: 'crypto', label: 'Encryption', storage: 'vault_word_crypto', href: 'crypto.html' }
  ];
  const BONUS_ROOMS = { forensics: { label: 'Forensics' } };

  function readWord(item) {
    try {
      const raw = localStorage.getItem(item.storage);
      if (raw && typeof raw === 'string' && raw.trim().length > 0) return raw.trim().toUpperCase();
    } catch (_) {}
    return null;
  }

  function readFlags() {
    return window.utils?.readProgress?.() || {};
  }

  // Code words for the rooms this team has completed. Read-only: a word whose room is
  // not (yet) marked complete is just hidden, never deleted, so a sync hiccup can't
  // destroy a word the team earned. Stray words are cleared on logout / admin reset.
  function readWords() {
    const result = {};
    const progress = readFlags();
    PUZZLES.forEach(item => {
      result[item.key] = progress[item.key] === true ? readWord(item) : null;
    });
    return result;
  }

  let vaultCompleteAnnounced = false;

  function ensureToastStack() {
    let stack = document.getElementById('toastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toastStack';
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'false');
      document.body.appendChild(stack);
    }
    return stack;
  }

  // Toasts sit bottom-right (bottom-centre on phones), clear of the header nav. On a phone
  // only the newest one shows, briefly, so they cover as little of the room as possible.
  function showToast(message) {
    if (!message) return;
    const stack = ensureToastStack();
    let narrow = false;
    try { narrow = window.matchMedia('(max-width: 640px)').matches; } catch (_) {}
    if (narrow) Array.from(stack.children).forEach(old => old.remove());
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 350);
    }, narrow ? 3000 : 4300);
  }

  function announcedKey() {
    const team = String(window.utils?.getUser?.()?.username || 'team').toLowerCase();
    return `${team}_all_words_toast`;
  }

  // Header tracker: a ✓ for every completed room (the same flag the Mission Hub uses),
  // so it ticks the moment a room completes, on any page, in any order.
  function updateUi() {
    const words = readWords();
    const status = document.getElementById('vaultStatus');
    if (!status) return words;

    const list = status.querySelector('.vault-status__digits');
    const countEl = status.querySelector('.vault-status__count');
    const progress = readFlags();

    let found = 0;
    PUZZLES.forEach((item) => {
      const li = list?.querySelector(`[data-vault-key="${item.key}"]`);
      const done = progress[item.key] === true;
      if (li) {
        let btn = li.firstElementChild;
        if (!(btn instanceof HTMLButtonElement)) {
          li.textContent = '';
          btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'vault-dot-btn';
          btn.dataset.puzzle = item.key;
          if (item.href) btn.dataset.href = item.href;
          li.appendChild(btn);
        }
        btn.textContent = done ? '✓' : '•';
        btn.disabled = !item.href;
        const label = done
          ? `${item.label}: solved, code word found`
          : `${item.label}: not solved yet, open the room`;
        btn.setAttribute('aria-label', label);
        li.classList.toggle('is-found', done);
        li.setAttribute('aria-label', label);
      }
      if (done) found++;
    });

    if (countEl) {
      countEl.textContent = `${found}/${PUZZLES.length}`;
    }

    const isComplete = found === PUZZLES.length;
    status.classList.toggle('is-complete', isComplete);
    if (isComplete && !vaultCompleteAnnounced) {
      vaultCompleteAnnounced = true;
      let seen = isVaultOpened();
      try { seen = seen || sessionStorage.getItem(announcedKey()) === '1'; } catch (_) {}
      if (!seen) {
        showToast('All five rooms solved! Type the code words into the vault on the Mission Hub.');
        try { sessionStorage.setItem(announcedKey(), '1'); } catch (_) {}
      }
    } else if (!isComplete) {
      vaultCompleteAnnounced = false;
    }
    return words;
  }

  // Coalesce bursts of change events into one repaint after the current task, so a room
  // that stores its word right after setting its progress still ticks in one go.
  let uiQueued = false;
  function scheduleUi() {
    if (uiQueued) return;
    uiQueued = true;
    setTimeout(() => { uiQueued = false; updateUi(); }, 0);
  }

  function persistWord(item, word) {
    if (!item || typeof word !== 'string' || !word.trim()) return;
    try {
      localStorage.setItem(item.storage, word.trim().toUpperCase());
    } catch (_) {}
  }

  function unlock(key, word, options = {}) {
    const item = PUZZLES.find(entry => entry.key === key);
    if (!item) return;
    if (typeof word === 'string' && word.trim()) {
      persistWord(item, word);
      try {
        window.stateSync?.queueSave?.('vault');
      } catch (_) {}
    }
    const detail = {
      puzzle: key,
      word: String(word).toUpperCase(),
      label: item.label
    };
    document.dispatchEvent(new CustomEvent('vault:word', { detail }));
    updateUi();
    const message = options?.message || `${item.label} code word unlocked.`;
    showToast(message);
  }

  // The one call a room makes when it is solved. Stores the code word, marks the room
  // complete, syncs to the server and ticks the header tracker. The word is stored first
  // so the immediate sync carries both. Safe to call again (e.g. on every page load):
  // once the room is complete it does not touch progress or the activity log again; it
  // only makes sure the word is stored. Returns true only the first time, so rooms can
  // celebrate/scroll once.
  function completeRoom(key, word, options = {}) {
    const item = PUZZLES.find(entry => entry.key === key);
    if (!item || typeof word !== 'string' || !word.trim()) return false;
    const clean = word.trim().toUpperCase();
    const flagged = readFlags()[key] === true;
    const hadWord = readWord(item) === clean;
    if (flagged && hadWord) {
      scheduleUi();
      return false;
    }
    persistWord(item, clean);
    if (!flagged) {
      // Sets the flag, logs "Puzzle completed" once and pushes to the server right away.
      try { window.utils?.setProgressPercent?.(key, 100, { complete: true }); } catch (_) {}
    } else {
      try { window.stateSync?.queueSave?.(`${key}-complete`); } catch (_) {}
    }
    unlock(key, clean, options);
    return true;
  }

  function isRoomComplete(key) {
    const item = PUZZLES.find(entry => entry.key === key);
    if (!item) return false;
    return readFlags()[key] === true && readWord(item) != null;
  }

  function refresh() {
    return updateUi();
  }

  // ---------- Vault opened + bonus room -------------------------------------

  // Opened on this computer, or the team's server copy says so (cracked on another device).
  function isVaultOpened() {
    try {
      if (localStorage.getItem('vault_opened') === '1') return true;
    } catch (_) {}
    try {
      return window.stateSync?.lastRemote?.vault?.opened === true;
    } catch (_) {
      return false;
    }
  }

  function isBonusComplete(key) {
    if (!BONUS_ROOMS[key]) return false;
    return readFlags()[key] === true;
  }

  // The one call the bonus room makes when it is solved: marks it complete, syncs now and
  // shows a toast. Safe to call again; returns true only the first time.
  function completeBonus(key) {
    const room = BONUS_ROOMS[key];
    if (!room) return false;
    if (isBonusComplete(key)) {
      scheduleUi();
      return false;
    }
    // Sets the flag, logs "Puzzle completed" once and pushes to the server right away.
    try { window.utils?.setProgressPercent?.(key, 100, { complete: true }); } catch (_) {}
    scheduleUi();
    showToast('Bonus room complete');
    return true;
  }

  // 'vault:opened' (window): the hub fires it when the team cracks the vault here; we fire it
  // when a sync or another tab shows the vault was opened elsewhere. Once per page.
  let vaultOpenSeen = isVaultOpened();
  window.addEventListener('vault:opened', () => { vaultOpenSeen = true; });
  function checkVaultOpened(source) {
    if (vaultOpenSeen || !isVaultOpened()) return;
    vaultOpenSeen = true;
    try { window.dispatchEvent(new CustomEvent('vault:opened', { detail: { source } })); } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateUi();
    const list = document.querySelector('#vaultStatus .vault-status__digits');
    if (list) {
      list.addEventListener('click', (ev) => {
        const button = ev.target.closest('button[data-href]');
        if (!button) return;
        const href = button.dataset.href;
        if (!href) return;
        if (button.disabled) return;
        window.location.href = href;
      });
    }
  });

  // Keep the tracker right whatever changed progress: this page, a sync pull, another tab,
  // or coming back to the page from the browser's back/forward cache.
  window.addEventListener('progress:change', scheduleUi);
  window.addEventListener('state-sync:applied', (ev) => {
    scheduleUi();
    if (!ev?.detail?.reset) checkVaultOpened('sync');
  });
  window.addEventListener('pageshow', scheduleUi);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleUi();
  });
  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    const progressKey = window.utils?.progressKey?.();
    if (event.key === progressKey || PUZZLES.some(item => item.storage === event.key)) scheduleUi();
    if (event.key === 'vault_opened' && event.newValue === '1') checkVaultOpened('storage');
  });

  window.vault = {
    getWords: readWords,
    getDigits: readWords,
    refresh,
    unlock,
    completeRoom,
    isRoomComplete,
    isVaultOpened,
    completeBonus,
    isBonusComplete,
    PUZZLES
  };
})();
