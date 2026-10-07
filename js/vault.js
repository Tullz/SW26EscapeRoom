(function () {
  'use strict';

  const PUZZLES = [
    { key: 'phishing', label: 'Phishing', storage: 'vault_word_phishing', href: 'phishing.html' },
    { key: 'osint', label: 'OSINT', storage: 'vault_word_osint', href: 'osint.html' },
    { key: 'incident', label: 'Incident Mgmt', storage: 'vault_word_incident', href: 'incident.html' },
    { key: 'mfa', label: 'MFA / Auth', storage: 'vault_word_mfa', href: 'mfa.html' },
    { key: 'supply', label: 'Supply Chain', storage: 'vault_word_supply', href: 'supply-chain.html' },
    { key: 'forensics', label: 'Forensics', storage: 'vault_word_forensics', href: 'forensics.html' }
  ];

  function readWord(item) {
    try {
      const raw = localStorage.getItem(item.storage);
      if (raw && typeof raw === 'string' && raw.trim().length > 0) return raw.trim().toUpperCase();
    } catch (_) {}
    return null;
  }

  function clearWord(item) {
    if (!item) return;
    try { localStorage.removeItem(item.storage); } catch (_) {}
  }

  function readWords() {
    const result = {};
    const progress = window.utils?.readProgress?.() || {};
    PUZZLES.forEach(item => {
      let word = readWord(item);
      if (word && progress[item.key] !== true) {
        clearWord(item);
        word = null;
      }
      result[item.key] = word;
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

  function showToast(message) {
    if (!message) return;
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 350);
    }, 4300);
  }

  function updateUi() {
    const words = readWords();
    const status = document.getElementById('vaultStatus');
    if (!status) return words;

    const list = status.querySelector('.vault-status__digits');
    const countEl = status.querySelector('.vault-status__count');

    let found = 0;
    PUZZLES.forEach((item) => {
      const li = list?.querySelector(`[data-vault-key="${item.key}"]`);
      const word = words[item.key];
      const hasWord = word != null;
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
        btn.textContent = hasWord ? '✓' : '•';
        btn.disabled = !item.href;
        const label = hasWord
          ? `${item.label} — code word secured`
          : `${item.label} — launch puzzle`;
        btn.setAttribute('aria-label', label);
        li.classList.toggle('is-found', hasWord);
        li.setAttribute('aria-label', label);
      }
      if (hasWord) found++;
    });

    if (countEl) {
      countEl.textContent = `${found}/${PUZZLES.length}`;
    }

    const isComplete = found === PUZZLES.length;
    status.classList.toggle('is-complete', isComplete);
    if (isComplete && !vaultCompleteAnnounced) {
      showToast('All code words collected! The vault is ready to crack.');
      vaultCompleteAnnounced = true;
    } else if (!isComplete) {
      vaultCompleteAnnounced = false;
    }
    return words;
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

  function refresh() {
    return updateUi();
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

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    const matches = PUZZLES.some(item => item.storage === event.key);
    if (matches) updateUi();
  });

  window.vault = {
    getWords: readWords,
    getDigits: readWords,
    refresh,
    unlock,
    PUZZLES
  };
})();
