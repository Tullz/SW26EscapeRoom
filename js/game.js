/* game.js — Cyber Escape Rooms (Mission Hub + Vault Lock)
   - Renders the room list and the next-step call to action from ROOMS
   - Rooms can be played in any order, on any of the team's devices
   - The vault opens if and only if every slot holds that room's code word
     (checked per slot against a salted SHA-256; finished rooms are NOT required,
     so a team that split up can type in words found on other devices)
*/

(function () {
  'use strict';

  // -------------------- Config --------------------------------------------

  // One salted SHA-256 per vault slot: sha256(`${VAULT_SALT}|${room key}|${WORD}`), WORD in
  // capitals. The words themselves never appear in this file. To change a word, recompute:
  //   node -e 'console.log(require("crypto").createHash("sha256").update("cer-vault-2026|osint|NEWWORD").digest("hex"))'
  const VAULT_SALT = 'cer-vault-2026';
  const SLOT_HASHES = {
    phishing:  '10b2f8bd4bf60485170cd8cec72a37d30081361c2fef4846d40ce1da9a282a20',
    osint:     'fdb8926d5972a73a5528140090665e3563017c80bb42d30a302ae74522ff8f2d',
    incident:  'a54cb56e99787a0adfde640f678b28844cd9be15b3c972d7ef7866187ea4e900',
    mfa:       'ce6e3eb959ebcbc99edc9ec55b01d510298b306eddc98c601e2d6c5e3dbf836b',
    crypto:    '4a48c4b8f0bec07419e1a50a82f4ea1e5c060931d126cf68dd8559b1c44995b9',
    forensics: 'a572bcb2beaef6d56e68c29f63f593da06431b576c856bed23d3ddf36855ce69'
  };

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
  // Display order of the room list AND of the vault slots (rooms can be played in any order).
  // To rename/replace a room, change it here (and its slot hash above).
  const ROOMS = [
    { key: 'phishing',  label: 'Phishing Spotter',     vaultLabel: 'Phishing',     path: 'phishing.html',
      blurb: 'Inspect suspicious emails and spot the tell-tale signs of phishing.' },
    { key: 'osint',     label: 'OSINT Investigation',  vaultLabel: 'OSINT',        path: 'osint.html',
      blurb: 'Dig through a public social profile to recover a locked account.' },
    { key: 'incident',  label: 'Incident Management',  vaultLabel: 'Incident',     path: 'incident.html',
      blurb: 'An alarm at 2 AM: customer records are leaking. Find the intruder and lead the response.' },
    { key: 'mfa',       label: 'MFA / Authentication', vaultLabel: 'MFA',          path: 'mfa.html',
      blurb: 'Help a colleague take back her phished account and fend off the attacker.' },
    { key: 'crypto',    label: 'Encryption',           vaultLabel: 'Encryption',   path: 'crypto.html',
      blurb: 'Search a captured courier\'s briefcase, find the hidden keys and crack the crew\'s codes.' },
    { key: 'forensics', label: 'Network Forensics',    vaultLabel: 'Forensics',    path: 'forensics.html',
      blurb: 'Piece together the attack timeline from the evidence left behind.' }
  ];
  const PUZZLES = ROOMS.map(r => r.key);
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

  function isVaultOpened(){
    let local = false;
    try { local = localStorage.getItem('vault_opened') === '1'; } catch (_) {}
    return local || window.stateSync?.lastRemote?.vault?.opened === true;
  }

  function readMeta(){
    return typeof window.utils?.readProgressMeta === 'function' ? window.utils.readProgressMeta() : {};
  }

  // The newer of two progress-meta entries ({ percent, updatedAt }).
  function newerEntry(a, b){
    const ok = (e) => e && typeof e.percent === 'number';
    if (!ok(a)) return ok(b) ? b : null;
    if (!ok(b)) return a;
    return Number(b.updatedAt || 0) > Number(a.updatedAt || 0) ? b : a;
  }

  // Complete always wins over any percent; otherwise the newest percent we know of.
  function roomStatus(key, p, meta, remote){
    const entry = newerEntry(meta?.[key], remote?.progressMeta?.[key]);
    const complete = p?.[key] === true || remote?.progress?.[key] === true;
    let percent = entry ? Math.max(0, Math.min(100, Math.round(entry.percent))) : 0;
    if (complete) percent = 100;
    else if (percent >= 100) percent = 99;
    return { complete, percent, updatedAt: Number(entry?.updatedAt || 0) };
  }

  // Suggest carrying on with the room touched most recently, else the first one not started.
  function suggestRoom(statuses){
    const open = ROOMS.filter(r => !statuses[r.key].complete);
    if (!open.length) return null;
    const started = open
      .filter(r => statuses[r.key].percent > 0)
      .sort((a, b) => statuses[b.key].updatedAt - statuses[a.key].updatedAt);
    return (started[0] || open[0]).key;
  }

  function allSlotsFilled(){
    return wordInputs.length > 0 && wordInputs.every(i => (i.value || '').trim());
  }

  function renderProgress(){
    const p = readProgress();
    const meta = readMeta();
    const remote = window.stateSync?.lastRemote || null;
    const vaultOpened = isVaultOpened();
    const statuses = Object.fromEntries(PUZZLES.map(k => [k, roomStatus(k, p, meta, remote)]));
    const done = PUZZLES.filter(k => statuses[k].complete).length;

    const status = $('#progressStatus');
    if (status) status.textContent = `${done} of ${PUZZLES.length} rooms complete`;

    const overallPercent = Math.round((done / PUZZLES.length) * 100);
    const globalFill = $('#missionProgressFill');
    if (globalFill) globalFill.style.width = `${overallPercent}%`;

    const missionMetaEntry = meta?.mission;
    const currentMissionPercent = missionMetaEntry && typeof missionMetaEntry.percent === 'number'
      ? Math.round(missionMetaEntry.percent)
      : null;
    if (currentMissionPercent == null || currentMissionPercent !== overallPercent) {
      try {
        window.utils?.setProgressPercent?.('mission', overallPercent);
      } catch (_) {
        /* ignore meta sync errors */
      }
    }

    const nextPuzzle = suggestRoom(statuses);

    PUZZLES.forEach((k, i) => {
      // Scope to the room list: vault.js also puts data-puzzle on header buttons.
      const btn = document.querySelector(`#missionTrackerList .mission-tracker__item[data-puzzle="${k}"]`);
      const { complete, percent } = statuses[k];
      const isNext = !complete && !vaultOpened && k === nextPuzzle;
      const started = !complete && percent > 0;

      if (btn) {
        const fillEl = btn.querySelector('.mission-tracker__fill');
        const progressLabel = btn.querySelector('.mission-tracker__progress');
        const stepEl = btn.querySelector('.hub-step');
        if (fillEl) {
          fillEl.style.width = `${percent}%`;
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

    renderNextStep({ done, nextPuzzle, statuses, vaultOpened });
    renderSlots(p, remote?.progress);
    renderVaultOpen(vaultOpened);

    const bonusEl = $('#bonusCallout');
    if (bonusEl) {
      const showBonus = vaultOpened;
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

  // One obvious next action. Rooms can be done in any order, and the vault can be opened
  // as soon as all six words are known (even if some rooms were solved on another device).
  function renderNextStep({ done, nextPuzzle, statuses, vaultOpened }){
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
    const total = PUZZLES.length;
    if (vaultOpened) {
      if (nextTag) nextTag.textContent = 'Mission complete';
      setBtn('Vault cracked! See your results', 'celebration.html');
      if (nextHint) {
        nextHint.textContent = done === total
          ? 'All six rooms solved and the vault is open. Bonus missions are below.'
          : 'The vault is open! Bonus missions are below, and you can still play any room you skipped.';
      }
    } else if (done === total) {
      if (nextTag) nextTag.textContent = 'Final step';
      setBtn('Open the vault', '#vaultHeading');
      if (nextHint) nextHint.textContent = 'All six rooms solved! Type all six code words into the vault and crack it.';
    } else if (allSlotsFilled()) {
      if (nextTag) nextTag.textContent = 'Ready to try?';
      setBtn('Try the vault', '#vaultHeading');
      if (nextHint) nextHint.textContent = 'All six slots are filled. Try the vault, or keep solving rooms.';
    } else if (nextPuzzle) {
      const room = ROOM_BY_KEY[nextPuzzle];
      const { percent } = statuses[nextPuzzle];
      const anyStarted = PUZZLES.some(k => statuses[k].complete || statuses[k].percent > 0);
      if (nextTag) nextTag.textContent = anyStarted ? 'Your next step' : 'Start here';
      setBtn(`${percent > 0 ? 'Continue' : 'Start'} Room ${room.index + 1}: ${room.label}`, room.path);
      if (nextHint) {
        nextHint.textContent = done === 0
          ? `${room.blurb} Or pick any room below: they can be done in any order.`
          : `Nice work: ${done} down, ${total - done} to go. Got a code word? Type it into its vault slot.`;
      }
    }
  }

  // Vault slots. "Solved" only says the team has finished that room; nothing here
  // says whether a typed word is right (the vault only answers when you try it).
  function renderSlots(p, remoteProgress){
    const progress = p || readProgress();
    const remote = remoteProgress || window.stateSync?.lastRemote?.progress || {};
    unlockBtn?.classList.toggle('is-ready', allSlotsFilled() && !isVaultOpened());
    $$('#vaultSlots .vault-slot').forEach(slot => {
      const key = slot.dataset.slot;
      const solved = progress[key] === true || remote[key] === true;
      const input = slot.querySelector('.lock-word');
      const filled = Boolean((input?.value || '').trim());
      slot.classList.toggle('is-earned', solved);
      slot.classList.toggle('is-filled', filled);
      const tag = slot.querySelector('.vault-slot__tag');
      if (tag) {
        tag.hidden = !solved;
        tag.textContent = solved ? 'Solved' : '';
      }
      if (input) input.placeholder = solved && !filled ? 'Type it here' : 'Code word';
    });
  }

  function renderVaultOpen(opened){
    if (!opened) return;
    chest?.classList.add('open');
    openBtn?.setAttribute('aria-label', 'Vault open');
    unlockBtn?.setAttribute('disabled', 'true');
    if (feedback && !feedback.textContent) {
      feedback.textContent = 'The vault is open. Well done!';
      feedback.classList.add('ok');
    }
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

  function normalizeWord(value){
    return String(value || '').trim().toUpperCase();
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

  function slotKey(input){
    return input.closest('.vault-slot')?.dataset.slot || '';
  }

  function saveEntries(){
    const entries = {};
    wordInputs.forEach((input) => {
      const word = normalizeWord(input.value);
      if (word) entries[slotKey(input)] = word;
    });
    try { localStorage.setItem(entriesKey(), JSON.stringify(entries)); } catch (_) {}
    window.stateSync?.queueSave?.('vault-entry');
  }

  function restoreEntries(){
    const entries = readEntries();
    wordInputs.forEach((input) => {
      const saved = entries[slotKey(input)];
      if (saved && !input.value && document.activeElement !== input) input.value = saved;
    });
    renderProgress();
  }

  function initVaultInputs(){
    restoreEntries();
    wordInputs.forEach(input => {
      input.addEventListener('input', () => {
        input.value = input.value.toUpperCase();
        saveEntries();
        renderProgress();
        if (feedback?.classList.contains('warn')) setFeedback('');
      });
    });
    clearBtn?.addEventListener('click', () => {
      clearCode();
      saveEntries();
      renderProgress();
    });
  }

  // SHA-256 hex
  async function sha256Hex(s){
    const enc = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // How many slots hold exactly the right word for THAT slot (a right word in the wrong
  // slot does not count).
  async function countCorrectSlots(){
    const checks = await Promise.all(wordInputs.map(async (input) => {
      const key = slotKey(input);
      const expected = SLOT_HASHES[key];
      const word = normalizeWord(input.value);
      if (!expected || !word) return null;
      return (await sha256Hex(`${VAULT_SALT}|${key}|${word}`)) === expected ? key : null;
    }));
    return new Set(checks.filter(Boolean)).size;
  }

  function logVault(status, detail){
    try { window.utils?.pushActivity?.({ type: 'vault', status, detail }); } catch (_) {}
  }

  let checkingVault = false;

  // Opens if and only if all six slots hold their room's code word. Whether the rooms are
  // finished on this device does not matter: a team may have split up across devices.
  async function tryUnlock(){
    if (checkingVault || isVaultOpened()) return;
    const total = ROOMS.length;
    const filledCount = wordInputs.filter(i => normalizeWord(i.value)).length;
    if (wordInputs.length !== total || filledCount < total) {
      setFeedback(`The vault needs all ${total} code words. You have ${filledCount} of ${total} so far.`);
      return;
    }

    checkingVault = true;
    let correct = 0;
    try {
      correct = await countCorrectSlots();
    } catch (err) {
      console.warn('[vault] could not check words', err);
      setFeedback('The vault could not check your words in this browser. Please ask a facilitator.');
      return;
    } finally {
      checkingVault = false;
    }

    if (correct === total) {
      setFeedback('Vault cracked! Operation complete.', true);
      chest?.classList.add('open');
      openBtn?.setAttribute('aria-label', 'Vault open');
      announce('Vault cracked');
      unlockBtn?.setAttribute('disabled', 'true');
      try {
        localStorage.setItem('vault_opened', '1');
      } catch (_) {}
      logVault('opened', 'Vault cracked');
      window.stateSync?.saveNow?.('vault-opened');
      renderProgress();
      setTimeout(() => {
        window.location.href = 'celebration.html';
      }, 1200);
    } else {
      const noun = correct === 1 ? 'code word is' : 'code words are';
      setFeedback(`The vault stays locked: ${correct} of ${total} ${noun} correct. Check the spelling, and that each word is in the slot for the room it came from.`);
      logVault('attempt', `Vault attempt: ${correct} of ${total} words correct`);
      chest?.classList.remove('is-shaking');
      void chest?.offsetWidth;
      chest?.classList.add('is-shaking');
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
