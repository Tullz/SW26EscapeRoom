/* game.js — Cyber Escape Rooms (Mission Hub + Vault Lock)
   - Renders the room route and the next-step call to action from ROOMS
   - Handles the 6-word vault lock with SHA-256 hash compare
   - Requires all puzzles complete before unlocking
*/

(function () {
  'use strict';

  // -------------------- Config --------------------------------------------

  // Option A: set a cleartext code (for local testing only). If present, we'll hash it at runtime.
  // window.VAULT_CODE = "1234";

  // SHA-256 hash of the 6-word vault passphrase (concatenated, uppercase)
  // echo -n MERCURYSHADOWBREACHKEYSTONEVIPERCIPHER | shasum -a 256
  const DEFAULT_VAULT_HASH = '8c46d80748b5ec2fffa3c5b9b8e0053da7963c4af11260c63a4d5c2ad299d312';
  const CORRECT_CODE_HASH = window.VAULT_CODE_HASH || DEFAULT_VAULT_HASH;
  if (!window.VAULT_CODE_HASH) {
    window.VAULT_CODE_HASH = DEFAULT_VAULT_HASH;
  }

  // -------------------- DOM helpers ---------------------------------------

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));


  function announce(msg){ try{ window.a11y?.announce?.(msg); }catch(_){} }

  // -------------------- Storage / user ------------------------------------

  function readUser(){
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }

  function progressKey(user){ return `${user?.username || 'team'}_progress`; }

  function readProgress(){
    const u = readUser();
    try {
      return JSON.parse(localStorage.getItem(progressKey(u)) || '{}');
    } catch {
      return {};
    }
  }
  

  // -------------------- Team display --------------------------------------

  let aliasInput = null;
  let aliasDisplay = null;

  function updateAliasUI(alias) {
    if (aliasInput && aliasInput.value !== alias) {
      aliasInput.value = alias;
    }
    if (aliasDisplay) {
      aliasDisplay.textContent = alias || '—';
    }
  }

  function renderTeamName(){
    const user = readUser();
    const alias = window.utils?.getPlayerAlias?.() || '';
    const el = $('#teamName');
    if (!el) return;
    const baseName = user?.username || 'TEAM';
    const name = alias || baseName;
    el.textContent = name.toUpperCase();
  }

  // -------------------- Rooms (single source of truth) --------------------
  // Order matters: it is the route order on the hub AND the vault word order.
  // To rename/replace a room, change it here only.
  const ROOMS = [
    { key: 'phishing',  label: 'Phishing Spotter',     vaultLabel: 'Phishing',     path: 'phishing.html',
      blurb: 'Inspect suspicious emails and spot the tell-tale signs of phishing.' },
    { key: 'osint',     label: 'OSINT Investigation',  vaultLabel: 'OSINT',        path: 'osint.html',
      blurb: 'Dig through a public social profile to recover a locked account.' },
    { key: 'incident',  label: 'Incident Management',  vaultLabel: 'Incident',     path: 'incident.html',
      blurb: 'A breach is underway. Examine the evidence and lead the response.' },
    { key: 'mfa',       label: 'MFA / Authentication', vaultLabel: 'MFA',          path: 'mfa.html',
      blurb: 'Help a colleague take back her phished account and fend off the attacker.' },
    { key: 'supply',    label: 'Supply Chain Attack',  vaultLabel: 'Supply Chain', path: 'supply-chain.html',
      blurb: 'Trace how a trusted supplier became the way in.' },
    { key: 'forensics', label: 'Network Forensics',    vaultLabel: 'Forensics',    path: 'forensics.html',
      blurb: 'Piece together the attack timeline from the evidence left behind.' }
  ];
  const PUZZLES = ROOMS.map(r => r.key);
  const VAULT_WORDS = PUZZLES;
  const ROOM_BY_KEY = Object.fromEntries(ROOMS.map((r, i) => [r.key, { ...r, index: i }]));

  function el(tag, cls, text){
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // Build the route list and the vault slots from ROOMS (runs before inputs are queried).
  function renderShell(){
    const list = $('#missionTrackerList');
    if (list && !list.children.length) {
      ROOMS.forEach((room, i) => {
        const li = el('li');
        const a = el('a', 'mission-tracker__item is-later');
        a.href = room.path;
        a.dataset.puzzle = room.key;
        const step = el('span', 'hub-step', String(i + 1));
        step.setAttribute('aria-hidden', 'true');
        const text = el('span', 'hub-room');
        text.append(el('span', 'hub-room__name', `Room ${i + 1}: ${room.label}`), el('span', 'hub-room__blurb', room.blurb));
        const status = el('span', 'mission-tracker__progress', 'Not started');
        const bar = el('span', 'mission-tracker__bar');
        bar.setAttribute('aria-hidden', 'true');
        bar.appendChild(el('span', 'mission-tracker__fill'));
        a.append(step, text, status, bar);
        li.appendChild(a);
        list.appendChild(li);
      });
    }
    const slots = $('#vaultSlots');
    if (slots && !slots.children.length) {
      ROOMS.forEach((room, i) => {
        const wrap = el('div', 'vault-slot lock-word-group');
        wrap.dataset.slot = room.key;
        const id = `vaultWord-${room.key}`;
        const label = el('label', 'vault-slot__label lock-word-label');
        label.htmlFor = id;
        label.append(el('span', 'vault-slot__num', String(i + 1)), document.createTextNode(room.vaultLabel));
        const tag = el('span', 'vault-slot__tag', '');
        tag.hidden = true;
        label.appendChild(tag);
        const input = el('input', 'lock-word');
        input.id = id;
        input.type = 'text';
        input.maxLength = 12;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'characters');
        input.placeholder = 'Code word';
        input.setAttribute('aria-label', `Code word ${i + 1} (${room.vaultLabel})`);
        wrap.append(label, input);
        slots.appendChild(wrap);
      });
    }
  }
  renderShell();

  // -------------------- Progress rendering --------------------------------

  function computeCompleted(p){
    return PUZZLES.reduce((n, key) => n + (p[key] ? 1 : 0), 0);
  }

  function isVaultOpened(){
    let local = false;
    try { local = localStorage.getItem('vault_opened') === '1'; } catch (_) {}
    return local || window.stateSync?.lastRemote?.vault?.opened === true;
  }

  function renderProgress(){
    const p = readProgress();
    const meta = typeof window.utils?.readProgressMeta === 'function'
      ? window.utils.readProgressMeta()
      : {};
    const remoteState = window.stateSync?.lastRemote;
    const remoteMeta = remoteState?.progressMeta || {};
    const remoteProgress = remoteState?.progress || {};
    const vaultOpened = isVaultOpened();
    const done = computeCompleted(p);

    const status = $('#progressStatus');
    if (status) status.textContent = `${done} of ${PUZZLES.length} rooms complete`;

    const overallPercent = Math.round((done / PUZZLES.length) * 100);
    const globalFill = $('#missionProgressFill');
    if (globalFill) globalFill.style.width = `${overallPercent}%`;

    const missionMetaEntry = meta?.mission;
    const currentMissionPercent = missionMetaEntry && typeof missionMetaEntry.percent === 'number'
      ? Math.round(missionMetaEntry.percent)
      : null;
    const needsMissionUpdate = currentMissionPercent == null || currentMissionPercent !== overallPercent;
    if (needsMissionUpdate || (done === PUZZLES.length && currentMissionPercent !== 100)) {
      try {
        window.utils?.setProgressPercent?.('mission', overallPercent, { complete: done === PUZZLES.length });
      } catch (_) {
        /* ignore meta sync errors */
      }
    }

    const nextPuzzle = PUZZLES.find(k => !p[k]);

    PUZZLES.forEach((k, i) => {
      // Scope to the route list: vault.js also puts data-puzzle on header buttons.
      const btn = document.querySelector(`#missionTrackerList .mission-tracker__item[data-puzzle="${k}"]`);
      const entry = meta?.[k];
      const remoteEntry = remoteMeta?.[k];

      const readPercent = (source) => {
        if (!source || typeof source.percent !== 'number') return null;
        return Math.max(0, Math.min(100, Math.round(source.percent)));
      };

      let percent = readPercent(remoteEntry);
      if (percent == null) percent = readPercent(entry);

      const isComplete = Boolean(p?.[k]) || Boolean(remoteProgress?.[k]);
      if (isComplete && (percent == null || percent < 100)) {
        percent = 100;
      }
      if (percent == null) percent = 0;

      const complete = percent >= 100 && isComplete;
      const isNext = !complete && k === nextPuzzle;
      const started = !complete && percent > 0;

      if (btn) {
        const fillEl = btn.querySelector('.mission-tracker__fill');
        const progressLabel = btn.querySelector('.mission-tracker__progress');
        const stepEl = btn.querySelector('.hub-step');
        if (fillEl) {
          fillEl.style.width = `${complete ? 100 : percent}%`;
          fillEl.dataset.percent = String(percent);
        }
        let label;
        if (complete) label = 'Complete';
        else if (started) label = `In progress · ${percent}%`;
        else if (isNext) label = 'Up next';
        else label = 'Not started';
        if (progressLabel) progressLabel.textContent = label;
        if (stepEl) stepEl.textContent = complete ? '✓' : String(i + 1);
        btn.classList.toggle('is-complete', complete);
        btn.classList.toggle('is-next', isNext);
        btn.classList.toggle('is-started', started && !isNext);
        btn.classList.toggle('is-later', !complete && !isNext && !started);
        btn.parentElement?.classList.toggle('is-done', complete);
        btn.dataset.progressPercent = String(percent);
        btn.dataset.progressComplete = complete ? 'true' : 'false';
        if (isNext) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
        btn.setAttribute('aria-label', `Room ${i + 1}: ${ROOMS[i].label} — ${label}`);
      }
    });

    // One obvious next action.
    const nextTag = $('#nextPuzzleTag');
    const nextHint = $('#nextPuzzleHint');
    const startBtn = $('#startChallengesBtn');
    const setBtn = (text, href) => {
      if (!startBtn) return;
      startBtn.href = href;
      startBtn.textContent = '';
      startBtn.append(document.createTextNode(text + ' '));
      const arrow = el('span', null, '→');
      arrow.setAttribute('aria-hidden', 'true');
      startBtn.appendChild(arrow);
    };
    if (nextPuzzle) {
      const room = ROOM_BY_KEY[nextPuzzle];
      const n = room.index + 1;
      const pct = Number(document.querySelector(`#missionTrackerList [data-puzzle="${nextPuzzle}"]`)?.dataset.progressPercent || 0);
      const verb = pct > 0 ? 'Continue' : 'Start';
      if (nextTag) nextTag.textContent = done === 0 ? 'Start here' : 'Your next step';
      setBtn(`${verb} Room ${n}: ${room.label}`, room.path);
      if (nextHint) {
        nextHint.textContent = done === 0
          ? room.blurb
          : `Nice work — ${done} down, ${PUZZLES.length - done} to go. Got a code word? Type it into the vault first.`;
      }
    } else if (vaultOpened) {
      if (nextTag) nextTag.textContent = 'Mission complete';
      setBtn('Vault cracked! See your results', 'celebration.html');
      if (nextHint) nextHint.textContent = 'All six rooms solved and the vault is open. Bonus missions are below.';
    } else {
      if (nextTag) nextTag.textContent = 'Final step';
      setBtn('Open the vault', '#vaultHeading');
      if (nextHint) nextHint.textContent = 'All six rooms solved! Type all six code words into the vault and crack it.';
    }

    renderSlots(p, remoteProgress);

    const bonusEl = $('#bonusCallout');
    if (bonusEl) {
      const showBonus = !nextPuzzle && vaultOpened;
      bonusEl.hidden = !showBonus;
      bonusEl.setAttribute('aria-hidden', showBonus ? 'false' : 'true');
      bonusEl.dataset.active = showBonus ? 'true' : 'false';
      const aliasCard = $('#playerAliasCard');
      if (aliasCard) {
        aliasCard.hidden = !showBonus;
        aliasCard.setAttribute('aria-hidden', showBonus ? 'false' : 'true');
        aliasCard.dataset.active = showBonus ? 'true' : 'false';
      }
    }
  }

  // Visual state of each vault slot: earned (room solved) / filled (word typed).
  function renderSlots(p, remoteProgress){
    const progress = p || readProgress();
    const remote = remoteProgress || window.stateSync?.lastRemote?.progress || {};
    const allFilled = wordInputs.length > 0 && wordInputs.every(i => (i.value || '').trim());
    unlockBtn?.classList.toggle('is-ready', allFilled);
    $$('#vaultSlots .vault-slot').forEach(slot => {
      const key = slot.dataset.slot;
      const earned = Boolean(progress[key]) || Boolean(remote[key]);
      const input = slot.querySelector('.lock-word');
      const filled = Boolean((input?.value || '').trim());
      slot.classList.toggle('is-earned', earned);
      slot.classList.toggle('is-filled', filled);
      const tag = slot.querySelector('.vault-slot__tag');
      if (tag) {
        tag.hidden = !earned;
        tag.textContent = earned ? (filled ? '✓' : 'Earned') : '';
      }
      if (input) input.placeholder = earned && !filled ? 'Type it here' : 'Code word';
    });
  }

  // -------------------- Lock helpers --------------------------------------

  const wordInputs = $$('.lock-word');
  const unlockBtn = $('#unlockBtn');
  const clearBtn  = $('#clearCodeBtn');
  const chest     = $('#vaultChest');
  const feedback  = $('#lockFeedback');
  const openBtn   = $('#lockOpenBtn');

  function setFeedback(msg, good=false){
    if (!feedback) return;
    feedback.textContent = msg || '';
    feedback.classList.toggle('ok', !!good);
    feedback.classList.toggle('warn', !good && !!msg);
    if (msg) announce(msg);
  }

  function getPassphrase(){
    return wordInputs.map(i => (i.value || '').trim().toUpperCase()).join('');
  }

  function clearCode(){
    wordInputs.forEach(d => d.value = '');
    wordInputs[0]?.focus();
    setFeedback('');
  }

  // Words the team has typed into the vault, saved per team and synced via state-sync.
  function entriesKey(){ return `${readUser()?.username || 'team'}_vault_entries`; }

  function readEntries(){
    try { return JSON.parse(localStorage.getItem(entriesKey()) || '{}') || {}; } catch { return {}; }
  }

  function saveEntries(){
    const entries = {};
    wordInputs.forEach((input, idx) => {
      const word = (input.value || '').trim().toUpperCase();
      if (word) entries[VAULT_WORDS[idx]] = word;
    });
    try { localStorage.setItem(entriesKey(), JSON.stringify(entries)); } catch (_) {}
    window.stateSync?.queueSave?.('vault-entry');
  }

  function restoreEntries(){
    const entries = readEntries();
    wordInputs.forEach((input, idx) => {
      const saved = entries[VAULT_WORDS[idx]];
      if (saved && !input.value && document.activeElement !== input) input.value = saved;
    });
    renderSlots();
  }

  function initVaultInputs(){
    restoreEntries();
    wordInputs.forEach(input => {
      input.addEventListener('input', () => {
        input.value = input.value.toUpperCase();
        saveEntries();
        renderSlots();
        if (feedback?.classList.contains('warn')) setFeedback('');
      });
    });
    clearBtn?.addEventListener('click', () => {
      clearCode();
      saveEntries();
      renderSlots();
    });
  }

  // SHA-256 hex
  async function sha256Hex(s){
    const enc = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function allPuzzlesComplete(){
    const p = readProgress();
    return PUZZLES.every(k => !!p[k]);
  }

  async function tryUnlock(){
    const passphrase = getPassphrase();
    const filledCount = wordInputs.filter(i => (i.value || '').trim().length > 0).length;
    if (filledCount < wordInputs.length) {
      setFeedback(`The vault needs all ${wordInputs.length} code words. You have ${filledCount} of ${wordInputs.length} so far.`);
      return;
    }

    if (!allPuzzlesComplete()) {
      setFeedback(`Solve all ${PUZZLES.length} rooms before cracking the vault.`);
      return;
    }

    const h = await sha256Hex(passphrase);
    if (h === CORRECT_CODE_HASH) {
      setFeedback('Vault cracked! Operation complete.', true);
      chest?.classList.add('open');
      openBtn?.setAttribute('aria-label', 'Vault open');
      announce('Vault cracked');
      unlockBtn?.setAttribute('disabled', 'true');
      try {
        localStorage.setItem('vault_opened', '1');
      } catch (_) {}
      window.stateSync?.queueSave?.('vault-opened');
      renderProgress();
      setTimeout(() => {
        window.location.href = 'celebration.html';
      }, 1200);
    } else {
      setFeedback('The vault stays locked. Check that each word is in the right slot and spelled exactly as the room showed it.');
    }
  }

  // -------------------- Logout glue (fallback) -----------------------------

  function ensureLogout(){
    if (typeof window.logout === 'function') return;
    window.logout = function () {
      if (window.utils?.logout) {
        window.utils.logout('index.html');
      } else {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
      }
    };
  }

  // -------------------- Boot ----------------------------------------------

  // ---------- Scoreboard ---------------------------------------------------

  const scoreEl = $('#scoreTotal');
  const scoreLogBtn = $('#scoreLogBtn');
  const scoreLogPanel = $('#scoreLog');

  function fmtScoreLogEntry(entry) {
    const time = new Date(entry.at || Date.now());
    const delta = entry.delta || 0;
    const sign = delta >= 0 ? '+' : '−';
    const amount = Math.abs(delta);
    const date = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${date} ${sign}${amount}: ${entry.reason || 'update'} → ${entry.total}`;
  }

  function renderScoreLog() {
    if (!scoreLogPanel) return;
    const log = window.utils.points.log().slice().reverse();
    if (!log.length) {
      scoreLogPanel.textContent = 'No adjustments yet.';
      return;
    }
    scoreLogPanel.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'score-log__list';
    log.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = fmtScoreLogEntry(entry);
      ul.appendChild(li);
    });
    scoreLogPanel.appendChild(ul);
  }

  function updateScore(total) {
    if (!scoreEl) return;
    const t = total ?? window.utils.points.get();
    scoreEl.textContent = String(t).padStart(3, '0');
  }

  window.addEventListener('score:change', (ev) => {
    updateScore(ev?.detail?.total);
    if (scoreLogPanel && !scoreLogPanel.hasAttribute('hidden')) {
      renderScoreLog();
    }
  });

  function initScoreboard() {
    window.utils.points.ensure();
    updateScore();
    if (scoreLogBtn && scoreLogPanel) {
      scoreLogBtn.addEventListener('click', () => {
        const hidden = scoreLogPanel.hasAttribute('hidden');
        if (hidden) {
          renderScoreLog();
          scoreLogPanel.removeAttribute('hidden');
          scoreLogBtn.textContent = 'Hide log';
        } else {
          scoreLogPanel.setAttribute('hidden', 'hidden');
          scoreLogBtn.textContent = 'View log';
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Session guard (teams only)
    const user = readUser();
    if (!user || user.role !== 'team') {
      window.location.href = 'index.html';
      return;
    }

    aliasInput = $('#playerAliasInput');
    aliasDisplay = $('#playerAliasDisplay');
    const storedAlias = window.utils?.getPlayerAlias?.() || '';
    window.utils?.setPlayerAlias?.(storedAlias);
    updateAliasUI(storedAlias);

    ensureLogout();
    window.vault?.refresh();
    renderTeamName();
    renderProgress();
    const refreshFromSync = () => {
      renderProgress();
      window.vault?.refresh();
    };
    window.addEventListener('progress:change', refreshFromSync);
    window.addEventListener('state-sync:ready', refreshFromSync);
    window.addEventListener('state-sync:applied', refreshFromSync);
    window.addEventListener('pageshow', refreshFromSync);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshFromSync();
      }
    });
    window.utils?.initStatusHud('mission', {
      score: '#scoreTotal',
      delta: '#missionPointsDelta',
      progressFill: '#missionProgressFill'
    });
    const metaKey = `${user.username || 'team'}_progress_meta`;
    const pKey = progressKey(user);
    window.addEventListener('storage', (ev) => {
      if (!ev.key) return;
      if (ev.key === pKey || ev.key === metaKey) {
        renderProgress();
      }
      if (ev.key === 'player_alias') {
        const refreshedAlias = window.utils?.getPlayerAlias?.() || '';
        updateAliasUI(refreshedAlias);
        renderTeamName();
      }
    });
    initVaultInputs();
    window.addEventListener('state-sync:applied', restoreEntries);
    initScoreboard();

    if (aliasInput) {
      const syncAlias = (value) => {
        const sanitized = window.utils?.setPlayerAlias?.(value) ?? '';
        updateAliasUI(sanitized);
        renderTeamName();
      };
      aliasInput.addEventListener('input', (ev) => {
        syncAlias(ev.target.value);
      });
      aliasInput.addEventListener('blur', (ev) => {
        syncAlias(ev.target.value);
      });
    }

    unlockBtn?.addEventListener('click', tryUnlock);

    // "Open the vault" call-to-action: jump to the first empty slot.
    $('#startChallengesBtn')?.addEventListener('click', (e) => {
      const href = e.currentTarget.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      e.preventDefault();
      $('#vaultChest')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const target = wordInputs.find(i => !(i.value || '').trim()) || unlockBtn;
      setTimeout(() => target?.focus({ preventScroll: true }), 350);
    });

    // Enter in any slot moves to the next one; Enter in the last slot tries the vault.
    wordInputs.forEach((input, idx) => {
      if (idx === wordInputs.length - 1) return;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); wordInputs[idx + 1]?.focus(); }
      });
    });

    const lastWord = wordInputs[wordInputs.length - 1];
    lastWord?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
  });

})();
