/* game.js — Cyber Escape Rooms (Mission Hub + Vault Lock)
   - Renders the 5 core rooms, the bonus room and the next-step call to action
   - Rooms can be played in any order, on any of the team's devices
   - The vault opens if and only if every slot holds that room's code word. The SERVER checks
     the words (POST /.netlify/functions/vault); nothing in this file can tell a right word
     from a wrong one. Finished rooms are NOT required, so a team that split up can type in
     words found on other devices.
   - Game clock (window.gameClock, js/game-clock.js): free roam = no clock; waiting / over =
     rooms and vault locked; running = big countdown. Reacts live to game:change / game:tick.
   - Score panel: the total from window.scoring.compute (js/scoring.js) with a plain breakdown
   - Bonus room (Network Forensics): unlocks once the vault is open; never changes the score
*/

(function () {
  'use strict';

  // -------------------- Config --------------------------------------------

  // The vault is checked by the server (the code words live in
  // netlify/functions/_shared/answers.js). It also logs every attempt to the team's activity.
  const VAULT_ENDPOINT = '/.netlify/functions/vault';
  const VAULT_TIMEOUT_MS = 15000;
  const MSG_VAULT_OFFLINE = 'The vault couldn\'t reach the server. Check your connection and try again.';
  const MSG_VAULT_ERROR = 'The vault couldn\'t check your words just now. Try again in a moment.';
  const MSG_VAULT_SLOW = 'Too many tries. Wait a moment and try again.';
  const MSG_SIGNED_OUT = 'Your sign-in has expired. Please log in again.';

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

  function renderTeamName(){
    const el = $('#teamName');
    if (!el) return;
    const username = readUser()?.username || 'team';
    el.textContent = window.utils?.teamLabel ? window.utils.teamLabel(username) : username.toUpperCase();
  }

  // -------------------- Rooms (single source of truth) --------------------
  // Display order of the room list AND of the vault slots (rooms can be played in any order).
  // To rename/replace a room, change it here (and its code word in _shared/answers.js).
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
      blurb: 'Search a captured courier\'s briefcase, find the hidden keys and crack the crew\'s codes.' }
  ];
  // Not in the vault, no code word, no effect on the score. Unlocks once the vault is open.
  const BONUS_ROOM = { key: 'forensics', label: 'Network Forensics', path: 'forensics.html' };
  const PUZZLES = ROOMS.map(r => r.key);
  const ROOM_BY_KEY = Object.fromEntries(ROOMS.map((r, i) => [r.key, { ...r, index: i }]));

  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const countWord = (n) => NUMBER_WORDS[n] || String(n);

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

  // -------------------- Game clock (js/game-clock.js) ---------------------
  // Every call is defensive: the hub must work (as free roam) if the clock is missing or
  // has not answered yet.

  const STATUSES = ['free', 'waiting', 'running', 'over'];
  const MINUTE = 60000;

  function currentGame(){
    try { return window.gameClock?.get?.() || null; } catch (_) { return null; }
  }

  function serverNow(){
    try {
      const t = Number(window.gameClock?.now?.());
      if (Number.isFinite(t) && t > 0) return t;
    } catch (_) {}
    return Date.now();
  }

  function remainingMs(game = currentGame()){
    try {
      const v = window.gameClock?.remainingMs?.();
      if (v != null && Number.isFinite(Number(v))) return Math.max(0, Number(v));
    } catch (_) {}
    const endsAt = Number(game?.endsAt);
    return game?.status === 'running' && endsAt > 0 ? Math.max(0, endsAt - serverNow()) : null;
  }

  // 'free' | 'waiting' | 'running' | 'over', or null before the first answer (acts like free roam).
  function gameStatus(game = currentGame()){
    if (!game || !STATUSES.includes(game.status)) return null;
    if (game.status === 'running' && remainingMs(game) === 0) return 'over';
    return game.status;
  }

  const isPlayLocked = (status) => status === 'waiting' || status === 'over';

  function cfg(){
    return window.scoring?.CONFIG || {
      roomPoints: 20, vaultPoints: 50, timeBonusPerMinute: 2, durationMin: 45,
      coreRooms: PUZZLES, bonusRoom: BONUS_ROOM.key
    };
  }

  function durationMin(game = currentGame()){
    const d = Number(game?.durationMin);
    return d > 0 ? d : cfg().durationMin;
  }

  // Countdown text: rounds up, so it reads 60:00 at the start and 00:00 only when time is up.
  function fmtClock(ms){
    const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  function fmtDuration(ms){
    return typeof window.scoring?.fmtDuration === 'function' ? window.scoring.fmtDuration(ms) : fmtClock(ms);
  }

  // -------------------- Score (js/scoring.js) -----------------------------

  // The moment this browser cracked the vault, used until the server's openedAt stamp arrives.
  function provisionalKey(){ return `${readUser()?.username || 'team'}_vault_cracked_at`; }
  function readProvisional(){
    try {
      const v = Number(sessionStorage.getItem(provisionalKey()));
      return v > 0 ? v : null;
    } catch (_) { return null; }
  }
  function saveProvisional(at){
    try { sessionStorage.setItem(provisionalKey(), String(at)); } catch (_) {}
  }

  function readPoints(){
    try {
      const v = Number(window.utils?.points?.get?.());
      return Number.isFinite(v) ? v : null;
    } catch (_) { return null; }
  }

  // The team in the server-row shape scoring.compute expects: this browser's progress OR the
  // team's synced progress, the running score, and the server-stamped vault times.
  function teamSnapshot(){
    const local = readProgress();
    const remote = window.stateSync?.lastRemote || null;
    const progress = {};
    [...PUZZLES, BONUS_ROOM.key].forEach(k => {
      progress[k] = local?.[k] === true || remote?.progress?.[k] === true;
    });
    const rv = remote?.vault || {};
    return {
      progress,
      score: readPoints(),
      vault: { opened: isVaultOpened(), openedAt: rv.openedAt ?? null, solvedAt: rv.solvedAt || {} }
    };
  }

  function computeScore(game = currentGame()){
    if (typeof window.scoring?.compute !== 'function') return null;
    try {
      return window.scoring.compute(teamSnapshot(), game, { provisionalOpenedAt: readProvisional() });
    } catch (err) {
      console.warn('[hub] could not compute the score', err);
      return null;
    }
  }

  // -------------------- Progress rendering --------------------------------

  function isVaultOpened(){
    let viaVault = false;
    try { viaVault = window.vault?.isVaultOpened?.() === true; } catch (_) {}
    let local = false;
    try { local = localStorage.getItem('vault_opened') === '1'; } catch (_) {}
    return viaVault || local || window.stateSync?.lastRemote?.vault?.opened === true;
  }

  function isBonusComplete(){
    try {
      if (window.vault?.isBonusComplete?.(BONUS_ROOM.key) === true) return true;
    } catch (_) {}
    return readProgress()?.[BONUS_ROOM.key] === true
      || window.stateSync?.lastRemote?.progress?.[BONUS_ROOM.key] === true;
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

  // Why the rooms / vault are locked, in plain words (null when they are not).
  function lockReason(status){
    if (status === 'waiting') return 'Locked until the facilitator starts the game.';
    if (status === 'over') return 'Time\'s up: the rooms are closed.';
    return null;
  }

  let booted = false;

  function renderProgress(){
    if (!booted) return;
    const game = currentGame();
    const status = gameStatus(game);
    const locked = isPlayLocked(status);
    const p = readProgress();
    const meta = readMeta();
    const remote = window.stateSync?.lastRemote || null;
    const vaultOpened = isVaultOpened();
    const statuses = Object.fromEntries(PUZZLES.map(k => [k, roomStatus(k, p, meta, remote)]));
    const done = PUZZLES.filter(k => statuses[k].complete).length;

    $('#main')?.setAttribute('data-game-status', status || 'free');

    const statusEl = $('#progressStatus');
    if (statusEl) statusEl.textContent = `${done} of ${PUZZLES.length} rooms complete`;

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

    // Rooms are locked (not links) while the game is waiting to start or after time's up.
    const roomsCard = $('#roomsCard');
    roomsCard?.classList.toggle('is-locked', locked);
    const roomsNote = $('#roomsLockNote');
    if (roomsNote) {
      roomsNote.hidden = !locked;
      const t = $('#roomsLockText');
      if (t) t.textContent = lockReason(status) || '';
    }

    PUZZLES.forEach((k, i) => {
      // Scope to the room list: vault.js also puts data-puzzle on header buttons.
      const btn = document.querySelector(`#missionTrackerList .mission-tracker__item[data-puzzle="${k}"]`);
      const { complete, percent } = statuses[k];
      const isNext = !complete && !vaultOpened && !locked && k === nextPuzzle;
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
        else if (locked) label = 'Locked';
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
        if (locked) {
          // No href = not clickable or focusable; role + aria-disabled keep it announced.
          btn.removeAttribute('href');
          btn.setAttribute('role', 'link');
          btn.setAttribute('aria-disabled', 'true');
          btn.setAttribute('aria-label', `Room ${i + 1}: ${ROOMS[i].label} — ${complete ? 'complete. ' : ''}${lockReason(status)}`);
        } else {
          btn.setAttribute('href', ROOMS[i].path);
          btn.removeAttribute('role');
          btn.removeAttribute('aria-disabled');
          btn.setAttribute('aria-label', `Room ${i + 1}: ${ROOMS[i].label} — ${label}`);
        }
      }
    });

    renderNextStep({ done, nextPuzzle, statuses, vaultOpened, status, game });
    renderSlots(p, remote?.progress);
    renderVaultOpen(vaultOpened);
    renderVaultLock(status, vaultOpened);
    renderBonus(vaultOpened);

    const result = computeScore(game);
    renderClock({ status, game, result, vaultOpened });
    renderScore({ result, status, game, vaultOpened });
    renderScoringRules(game);
    noteStatusChange(status);
  }

  // One obvious next action. Rooms can be done in any order, and the vault can be opened
  // as soon as all five words are known (even if some rooms were solved on another device).
  function renderNextStep({ done, nextPuzzle, statuses, vaultOpened, status, game }){
    const nextTag = $('#nextPuzzleTag');
    const nextHint = $('#nextPuzzleHint');
    const startBtn = $('#startChallengesBtn');
    // href null = a disabled button (not a link, greyed, announced as unavailable).
    const setBtn = (text, href) => {
      if (!startBtn) return;
      if (href) {
        startBtn.setAttribute('href', href);
        startBtn.removeAttribute('role');
        startBtn.removeAttribute('aria-disabled');
      } else {
        startBtn.removeAttribute('href');
        startBtn.setAttribute('role', 'link');
        startBtn.setAttribute('aria-disabled', 'true');
      }
      startBtn.classList.toggle('is-disabled', !href);
      startBtn.textContent = '';
      startBtn.append(document.createTextNode(text + ' '));
      if (href) {
        const arrow = el('span', null, '→');
        arrow.setAttribute('aria-hidden', 'true');
        startBtn.appendChild(arrow);
      }
    };
    const total = PUZZLES.length;
    const all = countWord(total);
    if (vaultOpened) {
      if (nextTag) nextTag.textContent = 'Mission complete';
      setBtn('Vault cracked! See your results', 'celebration.html');
      if (nextHint) {
        if (done === total) {
          nextHint.textContent = `All ${all} rooms solved and the vault is open. The bonus room is unlocked: just for fun, if you have time.`;
        } else if (status === 'over') {
          nextHint.textContent = 'The vault is open! The bonus room is unlocked: just for fun, if you have time.';
        } else {
          nextHint.textContent = status === 'running'
            ? 'The vault is open! Until time\'s up, any room you skipped still earns points. Or try the bonus room, just for fun.'
            : 'The vault is open! The bonus room is unlocked, and you can still play any room you skipped.';
        }
      }
    } else if (status === 'waiting') {
      if (nextTag) nextTag.textContent = 'Get ready';
      setBtn('Waiting for the facilitator to start', null);
      if (nextHint) nextHint.textContent = `The rooms unlock as soon as the facilitator starts the ${durationMin(game)}-minute clock. This page updates by itself.`;
    } else if (status === 'over') {
      if (nextTag) nextTag.textContent = 'Time\'s up';
      setBtn('See your final score', '#hubScore');
      if (nextHint) nextHint.textContent = 'The clock ran out before the vault opened. Well played anyway: your final score is below.';
    } else if (done === total) {
      if (nextTag) nextTag.textContent = 'Final step';
      setBtn('Open the vault', '#vaultHeading');
      if (nextHint) nextHint.textContent = `All ${all} rooms solved! Type all ${all} code words into the vault and crack it.`;
    } else if (allSlotsFilled()) {
      if (nextTag) nextTag.textContent = 'Ready to try?';
      setBtn('Try the vault', '#vaultHeading');
      if (nextHint) nextHint.textContent = `All ${all} slots are filled. Try the vault, or keep solving rooms.`;
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
    if (feedback && !feedback.textContent) {
      feedback.textContent = 'The vault is open. Well done!';
      feedback.classList.add('ok');
    }
  }

  // While the game is waiting / over the vault can't be tried (unless it is already open).
  function renderVaultLock(status, opened){
    const locked = !opened && isPlayLocked(status);
    chest?.classList.toggle('is-locked', locked);
    wordInputs.forEach(input => { input.disabled = locked; });
    if (unlockBtn) unlockBtn.disabled = opened || locked || checkingVault;
    if (clearBtn) clearBtn.disabled = locked;
    const note = $('#vaultLockNote');
    if (note) {
      note.hidden = !locked;
      const t = $('#vaultLockText');
      if (t) {
        t.textContent = status === 'over'
          ? 'Time\'s up: the vault can\'t be opened any more.'
          : 'Locked until the facilitator starts the game. Your saved words stay put.';
      }
    }
  }

  // Bonus room card: a padlocked, non-clickable card until the vault is open; then a link.
  function renderBonus(vaultOpened){
    const card = $('#bonusRoom');
    const link = $('#bonusRoomLink');
    const statusEl = $('#bonusStatus');
    if (!card || !link) return;
    const complete = vaultOpened && isBonusComplete();
    const state = !vaultOpened ? 'locked' : (complete ? 'complete' : 'open');
    card.dataset.state = state;
    let phrase;
    if (state === 'locked') {
      link.removeAttribute('href');
      link.setAttribute('role', 'link');
      link.setAttribute('aria-disabled', 'true');
      phrase = 'Crack the vault to unlock';
    } else {
      link.setAttribute('href', BONUS_ROOM.path);
      link.removeAttribute('role');
      link.removeAttribute('aria-disabled');
      phrase = complete ? 'Complete' : 'Play now';
    }
    if (statusEl) {
      statusEl.textContent = state === 'complete' ? '✓ Complete' : (state === 'open' ? 'Play now →' : phrase);
    }
    link.setAttribute('aria-label', `Bonus room: ${BONUS_ROOM.label} — ${phrase}`);
  }

  // -------------------- Clock rendering -----------------------------------

  function clockBand(ms){
    if (ms == null) return null;
    if (ms < 2 * MINUTE) return 'red';
    if (ms < 10 * MINUTE) return 'amber';
    return 'normal';
  }

  // The parts of the clock bar that change every second while running.
  function renderRunningClock(ms, { cracked = false, game = currentGame() } = {}){
    const bar = $('#hubClock');
    if (!bar || ms == null) return;
    const dur = durationMin(game) * MINUTE;
    const fill = $('#hubClockFill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (ms / dur) * 100))}%`;
    const meta = $('#hubClockMeta');
    if (cracked) {
      bar.classList.remove('is-amber', 'is-red');
      if (meta) {
        meta.textContent = '';
        meta.append(document.createTextNode('Clock: '), el('strong', null, fmtClock(ms)), document.createTextNode(' left for everyone else'));
      }
      return;
    }
    const big = $('#hubClockBig');
    if (big) big.textContent = fmtClock(ms);
    // (js/game-clock.js announces the 10- and 2-minute marks to screen readers.)
    const band = clockBand(ms);
    bar.classList.toggle('is-amber', band === 'amber');
    bar.classList.toggle('is-red', band === 'red');
    if (meta) {
      const bonus = Math.floor(ms / MINUTE) * cfg().timeBonusPerMinute;
      meta.textContent = '';
      meta.append(document.createTextNode('Crack the vault now: '), el('strong', null, `+${bonus}`), document.createTextNode(' time bonus'));
    }
    const timeNote = $('#tallyTimeNote');
    if (timeNote && bar.dataset.state === 'running') {
      timeNote.textContent = `Crack it now: +${Math.floor(ms / MINUTE) * cfg().timeBonusPerMinute}`;
    }
  }

  function renderClock({ status, game, result, vaultOpened }){
    const chip = $('#hubFreeChip');
    if (chip) chip.hidden = status !== 'free';
    const bar = $('#hubClock');
    if (!bar) return;
    const show = status === 'waiting' || status === 'running' || status === 'over';
    bar.hidden = !show;
    if (!show) {
      bar.dataset.state = '';
      return;
    }
    const label = $('#hubClockLabel');
    const big = $('#hubClockBig');
    const text = $('#hubClockText');
    const meter = $('#hubClockMeter');
    const final = $('#hubClockFinal');
    const c = cfg();
    const state = status === 'running' && vaultOpened ? 'cracked' : status;
    bar.dataset.state = state;
    big?.classList.toggle('is-text', state === 'waiting' || state === 'over');
    if (meter) meter.hidden = !(state === 'running' || state === 'cracked');
    if (final) final.hidden = state !== 'over';
    if (state !== 'running') bar.classList.remove('is-amber', 'is-red');
    const set = (node, value) => { if (node) node.textContent = value; };

    if (state === 'waiting') {
      set(label, 'Get ready');
      set(big, 'Waiting for the facilitator to start the game');
      set(text, `The rooms and the vault unlock when the ${durationMin(game)}-minute clock starts. This page updates by itself: no need to reload.`);
    } else if (state === 'running') {
      set(label, 'Time left');
      set(text, `Crack the vault before the clock runs out. Every whole minute still left when you crack it is worth +${c.timeBonusPerMinute} points.`);
      renderRunningClock(remainingMs(game), { game });
    } else if (state === 'cracked') {
      const finished = result?.finishMs != null;
      set(label, finished ? 'Vault cracked in' : 'Vault open');
      set(big, finished ? fmtDuration(result.finishMs) : 'Done!');
      const skipped = result && result.roomsSolved < PUZZLES.length;
      const next = skipped
        ? 'Until time\'s up, rooms you skipped still earn points, or try the bonus room for fun.'
        : 'Fancy more? Try the bonus room for fun while the clock runs down.';
      set(text, result?.timeBonus > 0 ? `Your time bonus is locked in: +${result.timeBonus} points. ${next}` : next);
      renderRunningClock(remainingMs(game), { cracked: true, game });
    } else if (state === 'over') {
      set(label, 'The clock has stopped');
      set(big, 'Time\'s up!');
      if (vaultOpened && result?.finishMs != null) {
        set(text, `You cracked the vault in ${fmtDuration(result.finishMs)}. The bonus room is still open, just for fun.`);
      } else if (vaultOpened) {
        set(text, 'Your vault is open. The bonus room is still open, just for fun.');
      } else {
        set(text, 'The rooms and the vault are closed now. Thanks for playing!');
      }
      set($('#hubClockFinalScore'), String(result ? result.total : (readPoints() ?? 0)));
    }
  }

  // -------------------- Score rendering -----------------------------------

  function setPart(part, value, note, zero){
    const li = $(`#scoreBreakdown [data-part="${part}"]`);
    if (!li) return;
    const v = li.querySelector('.hub-tally__value');
    const n = li.querySelector('.hub-tally__note');
    if (v) v.textContent = value;
    if (n && note != null) n.textContent = note;
    li.classList.toggle('is-zero', Boolean(zero));
  }

  function renderScore({ result, status, game, vaultOpened }){
    const c = cfg();
    const heroTotal = $('#scoreTotal');
    const heroLabel = $('#scoreTotalLabel');
    if (heroLabel) heroLabel.textContent = status === 'over' ? 'Final score' : 'Score';
    const sub = $('#scoreSub');
    if (sub) {
      sub.textContent = ({
        free: 'Practice game: no clock, so no time bonus',
        waiting: 'The clock hasn\'t started yet',
        running: 'Updates as you play',
        over: 'Time\'s up: this is your final score'
      })[status] || 'Updates as you play';
    }

    if (!result) {
      // scoring.js missing: show what we know (the running score) and nothing invented.
      const pts = readPoints() ?? 100;
      if (heroTotal) heroTotal.textContent = String(pts);
      setPart('pot', String(pts));
      setPart('total', String(pts));
      return;
    }

    if (heroTotal) heroTotal.textContent = String(result.total);
    const coreCount = (c.coreRooms || PUZZLES).length;
    setPart('pot', String(result.pot), 'Starts at 100. Hints and mistakes cost a few.', result.pot === 0);
    setPart('rooms', `+${result.roomPoints}`, `${result.roomsSolved} of ${coreCount} · +${c.roomPoints} each`, !result.roomPoints);
    setPart('vault', `+${result.vaultPoints}`,
      result.vaultCracked ? 'Cracked!' : `+${c.vaultPoints} when you crack it`, !result.vaultPoints);

    const openedBeforeStart = result.notes.includes('Vault opened before the clock started');
    let timeNote;
    if (result.vaultCracked && result.minutesLeft != null) {
      timeNote = `${result.minutesLeft} min left × ${c.timeBonusPerMinute}`;
    } else if (openedBeforeStart) {
      timeNote = 'None: opened before the clock started';
    } else if (status === 'running' && !vaultOpened) {
      timeNote = `Crack it now: +${Math.floor((remainingMs(game) || 0) / MINUTE) * c.timeBonusPerMinute}`;
    } else if (status === 'waiting') {
      timeNote = 'Counts once the clock starts';
    } else if (status === 'over') {
      timeNote = 'The vault wasn\'t cracked in time';
    } else {
      timeNote = 'Only in a timed game';
    }
    setPart('time', `+${result.timeBonus}`, timeNote, !result.timeBonus);
    setPart('total', String(result.total), status === 'over' ? 'Final score' : 'Highest total wins');

    const notes = $('#tallyNotes');
    if (notes) {
      notes.hidden = !result.notes.length;
      notes.textContent = result.notes.length ? `Note: ${result.notes.join('. ')}.` : '';
    }
  }

  // "How scoring works": the numbers come from scoring.CONFIG (the HTML holds fallbacks).
  function renderScoringRules(game){
    const c = cfg();
    $$('[data-cfg]').forEach(node => {
      const key = node.dataset.cfg;
      const value = key === 'durationMin' ? durationMin(game) : c[key];
      if (value != null) node.textContent = String(value);
    });
    $$('[data-cfg-example]').forEach(node => { node.textContent = String(20 * c.timeBonusPerMinute); });
  }

  // The status the page was last drawn for (game:tick re-renders when it changes, e.g. at 00:00).
  // Screen-reader news about the clock itself comes from js/game-clock.js.
  let lastStatus;
  function noteStatusChange(status){
    lastStatus = status;
  }

  // -------------------- Lock helpers --------------------------------------

  const wordInputs = $$('.lock-word');
  const unlockBtn = $('#unlockBtn');
  const clearBtn  = $('#clearCodeBtn');
  const chest     = $('#vaultChest');
  const feedback  = $('#lockFeedback');
  const openBtn   = $('#lockOpenBtn');

  function setFeedback(msg, good=false, quiet=false){
    if (!feedback) return;
    feedback.textContent = msg || '';
    feedback.classList.toggle('ok', !!good);
    feedback.classList.toggle('warn', !good && !!msg);
    if (msg && !quiet) announce(msg);
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

  // A friendly "not now" while the game is waiting to start or after time's up (else null).
  function vaultClosedMessage(status){
    if (status === 'waiting') return 'Not yet! The vault opens for business when the facilitator starts the game.';
    if (status === 'over') return 'Time\'s up: the vault can\'t be opened any more.';
    return null;
  }

  let checkingVault = false;
  let signingOut = false;

  // The team's sign-in token (js/utils.js); before utils.authHeaders exists, the saved token.
  function authHeaders(){
    try {
      const h = window.utils?.authHeaders?.();
      if (h && typeof h === 'object') return h;
    } catch (_) {}
    const token = readUser()?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // Ask the server whether the words open the vault. Never throws. Resolves to
  // { kind, data }, kind = 'opened' | 'wrong' | 'waiting' | 'over' | 'slow' | 'expired' |
  // 'offline' | 'error'. The server logs the attempt in the team's activity itself.
  async function askVault(words){
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), VAULT_TIMEOUT_MS) : null;
    try {
      let res;
      try {
        res = await fetch(VAULT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ team: String(readUser()?.username || '').toLowerCase(), words }),
          cache: 'no-store',
          signal: ctrl?.signal
        });
      } catch (_) {
        return { kind: 'offline', data: null }; // no connection, or no answer in time
      }
      const data = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) return { kind: 'expired', data };
      if (res.status === 429) return { kind: 'slow', data };
      if (res.status === 409 && (data?.reason === 'waiting' || data?.reason === 'over')) return { kind: data.reason, data };
      if (!res.ok || !data || data.ok !== true) return { kind: 'error', data };
      return { kind: data.opened === true ? 'opened' : 'wrong', data };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // The button stays disabled (and says so) while the server is checking.
  function setChecking(on){
    checkingVault = on;
    chest?.setAttribute('aria-busy', on ? 'true' : 'false');
    if (unlockBtn) {
      if (on) {
        unlockBtn.dataset.label = unlockBtn.textContent;
        unlockBtn.textContent = 'Checking…';
      } else if (unlockBtn.dataset.label) {
        unlockBtn.textContent = unlockBtn.dataset.label;
        delete unlockBtn.dataset.label;
      }
    }
    renderVaultLock(gameStatus(), isVaultOpened());
  }

  // The team's sign-in is no longer valid (401): say so once, then back to the login page
  // (utils.sessionExpired: the shared notice + index.html?expired=1, which also announces it).
  function signInExpired(){
    if (signingOut) return;
    signingOut = true;
    const shared = typeof window.utils?.sessionExpired === 'function';
    setFeedback(MSG_SIGNED_OUT, false, shared);
    if (shared) {
      try { window.utils.sessionExpired(); return; } catch (_) { /* fall back below */ }
    }
    setTimeout(() => {
      try { localStorage.removeItem('user'); } catch (_) {}
      window.location.href = 'index.html?expired=1';
    }, 1500);
  }

  // The server opened the vault (or it already was): adopt its copy, then celebrate.
  function vaultOpened(data){
    const state = data?.state && typeof data.state === 'object' ? data.state : null;
    let applied = false;
    if (state && typeof window.stateSync?.applyServerState === 'function') {
      try {
        applied = window.stateSync.applyServerState(state) !== false;
      } catch (err) {
        console.warn('[vault] could not apply the server state', err);
      }
    }
    // The server has the vault open, so this flag is true; the next pull fills in the rest.
    if (!applied || !isVaultOpened()) {
      try { localStorage.setItem('vault_opened', '1'); } catch (_) {}
      if (!applied) window.stateSync?.refresh?.();
    }
    // The server's openedAt stamp when it came back; otherwise this moment, until it arrives.
    const stamped = Number(state?.vault?.openedAt);
    const crackedAt = stamped > 0 ? stamped : serverNow();
    saveProvisional(crackedAt);
    setFeedback('Vault cracked! Operation complete.', true);
    chest?.classList.add('open');
    openBtn?.setAttribute('aria-label', 'Vault open');
    announce('Vault cracked');
    unlockBtn?.setAttribute('disabled', 'true');
    try {
      window.dispatchEvent(new CustomEvent('vault:opened', {
        detail: { team: readUser()?.username || null, openedAt: crackedAt, provisional: !(stamped > 0) }
      }));
    } catch (_) {}
    renderProgress();
    setTimeout(() => {
      window.location.href = 'celebration.html';
    }, 1200);
  }

  // Opens if and only if all five slots hold their room's code word (the server decides).
  // Whether the rooms are finished on this device does not matter: a team may have split up
  // across devices.
  async function tryUnlock(){
    if (checkingVault || signingOut || isVaultOpened()) return;
    const closed = vaultClosedMessage(gameStatus());
    if (closed) {
      setFeedback(closed);
      return;
    }
    const total = ROOMS.length;
    const filledCount = wordInputs.filter(i => normalizeWord(i.value)).length;
    if (wordInputs.length !== total || filledCount < total) {
      setFeedback(`The vault needs all ${total} code words. You have ${filledCount} of ${total} so far.`);
      return;
    }

    const words = {};
    wordInputs.forEach((input) => { words[slotKey(input)] = normalizeWord(input.value); });
    setChecking(true);
    let outcome;
    try {
      outcome = await askVault(words);
    } finally {
      setChecking(false);
    }
    const { kind, data } = outcome;

    if (kind === 'opened') {
      vaultOpened(data);
    } else if (kind === 'wrong') {
      const correct = Math.max(0, Math.min(total, Math.round(Number(data?.correct)) || 0));
      const noun = correct === 1 ? 'code word is' : 'code words are';
      setFeedback(`The vault stays locked: ${correct} of ${total} ${noun} correct. Check the spelling, and that each word is in the slot for the room it came from.`);
      chest?.classList.remove('is-shaking');
      void chest?.offsetWidth;
      chest?.classList.add('is-shaking');
    } else if (kind === 'waiting' || kind === 'over') {
      // The server's clock says no: show the usual message and let the page catch up.
      setFeedback(vaultClosedMessage(kind));
      try { window.gameClock?.refresh?.(); } catch (_) {}
    } else if (kind === 'slow') {
      setFeedback(MSG_VAULT_SLOW);
    } else if (kind === 'expired') {
      signInExpired();
    } else if (kind === 'offline') {
      setFeedback(MSG_VAULT_OFFLINE);
    } else {
      setFeedback(MSG_VAULT_ERROR);
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

  // ---------- Score log ----------------------------------------------------

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
    const log = (window.utils?.points?.log?.() || []).slice().reverse();
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

  function initScoreboard() {
    window.utils?.points?.ensure?.();
    if (scoreLogBtn && scoreLogPanel) {
      scoreLogBtn.addEventListener('click', () => {
        const hidden = scoreLogPanel.hasAttribute('hidden');
        if (hidden) {
          renderScoreLog();
          scoreLogPanel.removeAttribute('hidden');
        } else {
          scoreLogPanel.setAttribute('hidden', 'hidden');
        }
        scoreLogBtn.textContent = hidden ? 'Hide score log' : 'View score log';
        scoreLogBtn.setAttribute('aria-expanded', hidden ? 'true' : 'false');
      });
    }
  }

  // -------------------- Live updates ---------------------------------------

  window.addEventListener('score:change', () => {
    if (!booted) return;
    renderProgress();
    if (scoreLogPanel && !scoreLogPanel.hasAttribute('hidden')) {
      renderScoreLog();
    }
  });

  // The facilitator started / ended the game, or switched mode: no reload needed.
  window.addEventListener('game:change', () => renderProgress());
  window.addEventListener('vault:opened', () => renderProgress());

  window.addEventListener('game:tick', (ev) => {
    if (!booted) return;
    const status = gameStatus();
    if (status !== lastStatus) { renderProgress(); return; } // e.g. the clock just ran out
    if (status !== 'running') return;
    const fromTick = Number(ev?.detail?.remainingMs);
    const ms = Number.isFinite(fromTick) ? Math.max(0, fromTick) : remainingMs();
    renderRunningClock(ms, { cracked: isVaultOpened() });
  });

  // -------------------- Boot ----------------------------------------------

  document.addEventListener('DOMContentLoaded', () => {
    // Session guard (teams only)
    const user = readUser();
    if (!user || user.role !== 'team') {
      window.location.href = 'index.html';
      return;
    }

    booted = true;
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
    // The total is ours (scoring.js); the shared HUD only flashes the latest +/- change.
    window.utils?.initStatusHud('mission', {
      delta: '#missionPointsDelta',
      progressFill: '#missionProgressFill'
    });
    const metaKey = `${user.username || 'team'}_progress_meta`;
    const pKey = progressKey(user);
    window.addEventListener('storage', (ev) => {
      if (!ev.key) return;
      if (ev.key === pKey || ev.key === metaKey || ev.key === 'vault_opened') {
        renderProgress();
      }
    });
    initVaultInputs();
    window.addEventListener('state-sync:applied', restoreEntries);
    initScoreboard();

    unlockBtn?.addEventListener('click', tryUnlock);

    // In-page call-to-action ("Open the vault", "See your final score"): scroll there; for the
    // vault, focus the first empty slot.
    $('#startChallengesBtn')?.addEventListener('click', (e) => {
      const href = e.currentTarget.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      e.preventDefault();
      if (href === '#vaultHeading') {
        $('#vaultChest')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const target = wordInputs.find(i => !(i.value || '').trim()) || unlockBtn;
        setTimeout(() => target?.focus({ preventScroll: true }), 350);
      } else {
        const target = $(href);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => target?.focus?.({ preventScroll: true }), 350);
      }
    });
    $('#hubClockFinal a')?.addEventListener('click', (e) => {
      e.preventDefault();
      const target = $('#hubScore');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => target?.focus?.({ preventScroll: true }), 350);
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
