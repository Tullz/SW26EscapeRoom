/* mfa.js — MFA / Authentication room: "Priya's Account" (Cyber Escape Rooms)

   Story: Priya Shah (Finance) was phished and her work password leaked.
   The team are Northwind's IT security helpers. With Priya's permission (she
   is on a call guiding them) they sign in at her desk so Sam from IT can
   secure the account, then guard her phone while the attacker tries to trick
   whoever is holding it.

   Stage 1 — Priya's desk (find + combine clues)
     - password = favourite flower (plant label) + desk number (ID badge)  -> Something you KNOW
     - drawer   = day + month she started (printed induction email), 4-dial lock
     - phone    = fingerprint does not recognise the team                 -> Something you ARE
                  the team asks IT for a remote unlock, Priya approves it, IT unlocks the phone
     - sign-in  = live 6-digit Authenticator code from the phone          -> Something you HAVE
   Stage 2 — Guard the phone (3 events, recognise and refuse)
     1. flood of sign-in requests nobody started (MFA fatigue) -> deny + report
     2. text asking for the code                               -> report as scam
     3. Priya's genuine sign-in                                -> approve by number matching

   All localStorage keys start with "mfa_" (admin reset clears mfa_*).
   Vault key: mfa
*/

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function announce(msg) { try { window.a11y?.announce?.(msg); } catch (_) {} }

  if (!$('#mfaRoom') || !$('#deskScene')) return;

  // ---------- Constants ----------
  const STATE_KEY = 'mfa_puzzle_state';
  const STATE_VERSION = 5;
  const ROOM = 'mfa';
  // Kept out of plain sight in the page; only ever shown after completion.
  const CODE_WORD = (function () { try { return atob('S0VZU1RPTkU='); } catch (_) { return ''; } })();
  const COST = { wrong: 2, breach: 3, hint: 5 };
  const DRAWER_CODE = '0311';
  const EMAIL_SENT_CODE = '2010'; // the induction email's "Sent" date, a tempting wrong answer
  const VALID_PASSWORDS = ['sunflower27', 'sunflowers27'];

  const points = window.utils?.points;
  // Room state lives in one localStorage key shared by every team on this browser.
  const TEAM_ID = String(window.utils?.getUser?.()?.username || '').toLowerCase();

  // ---------- State ----------
  function freshState() {
    return {
      version: STATE_VERSION,
      seen: {},              // itemId -> true (inspected)
      clues: [],             // clue ids, in the order found
      keyboardLifted: false,
      pwOk: false,
      dial: [0, 0, 0, 0],
      drawerOpen: false,
      phoneTaken: false,
      fingerTried: false,    // touched the sensor: fingerprint not recognised
      remoteAsked: false,    // asked IT for a remote unlock
      priyaApproved: false,  // Priya confirmed the remote unlock on the call
      phoneUnlocked: false,
      loggedIn: false,
      factors: { know: false, have: false, are: false },
      stage: 'desk',         // desk | attack | done
      event: 0,              // index into EVENTS while stage === 'attack'
      resolved: false,       // current event handled, lesson showing
      nudge: null,           // current event: safe-but-not-best choice made
      breach: null,          // event id currently showing "attacker got in"
      matchNumber: 0,        // number shown on Priya's laptop in event 3
      hints: {},             // step -> number of hints revealed
      msgs: [],              // feed message ids shown
      focus: null,           // current close-up item
      completed: false,
      team: TEAM_ID          // whose progress this is (shared browsers)
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      const s = raw ? JSON.parse(raw) : null;
      // Another team's leftover progress on a shared browser does not carry over.
      if (s && s.version === STATE_VERSION && (!s.team || s.team === TEAM_ID)) return Object.assign(freshState(), s, { team: TEAM_ID });
    } catch (_) {}
    return freshState();
  }
  function save() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  let state = loadState();

  // Solved according to the shared vault (progress flag + stored word), or marked
  // complete by the facilitator / another device (flag only; the word gets stored on boot).
  function roomMarkedComplete() {
    try { if (window.vault?.isRoomComplete?.(ROOM)) return true; } catch (_) {}
    try { return (window.utils?.readProgress?.() || {})[ROOM] === true; } catch (_) { return false; }
  }
  function markDone() {
    state.completed = true;
    state.stage = 'done';
    state.factors = { know: true, have: true, are: true };
    state.breach = null;
    state.nudge = null;
    if (!state.msgs.includes('genuine_done')) state.msgs.push('genuine_done'); // the call isn't left empty
    save();
  }
  // Progress says "not done" (e.g. after an admin reset): start over.
  if (state.completed && !roomMarkedComplete()) {
    state = freshState();
    save();
  }
  // Completed on another device / state lost: show the finished room.
  if (!state.completed && roomMarkedComplete()) {
    state = freshState();
    markDone();
  }

  // ---------- Content: the live call ----------
  const MSGS = {
    intro_sam: { who: 'sam', text: 'Thanks for jumping on this. Priya typed her password into a fake login page this morning, so an attacker has it. I need someone at her desk to sign in to her account, <strong>with her permission</strong>, so I can lock it down before they get in.' },
    intro_priya: { who: 'priya', text: 'Hi team, thank you! I\'m on the train with awful signal. I can\'t read my password out loud here (and you should never tell anyone your password anyway!). But&hellip; confession: I left myself a reminder at my desk. Have a look around.' },
    sticky: { who: 'priya', text: 'Ah, you found my reminder. Yes, I know, a sticky note is a bad idea: anyone walking past could do the same! It doesn\'t spell the password out, but everything you need is on my desk.' },
    pwOk: { who: 'sam', text: 'Password accepted&hellip; and now it wants a <strong>6-digit code from her Authenticator app</strong>. That\'s multi-factor authentication (MFA): a second key on top of the password. It\'s exactly why the attacker is stuck: they have her password, but not her phone.' },
    pwOk2: { who: 'priya', text: 'My work phone is locked in my desk drawer. I can never remember the drawer code, so I made it a date I\'ll never forget.' },
    drawerOpen: { who: 'priya', text: 'That\'s my work phone in there. Go ahead and pick it up.' },
    finger: { who: 'sam', text: 'Of course it won\'t take <em>your</em> fingerprint: you\'re not Priya! A fingerprint or face scan is something you <strong>ARE</strong>. It can\'t be written on a sticky note or lent to someone else. Don\'t try to get round it: press <strong>"Ask IT to unlock it remotely"</strong> on the phone.' },
    remote: { who: 'sam', text: 'Got your request. It\'s a managed Northwind work phone, so IT can unlock it remotely, but <strong>only once the owner confirms</strong>. Priya, are you happy for me to unlock it?' },
    remote2: { who: 'priya', text: 'Yes, I confirm. Please unlock it for the team, Sam. Thanks for checking with me first!' },
    unlocked: { who: 'sam', text: 'Done: I\'ve unlocked it remotely with Priya\'s OK, and it\'s logged on our side. Her Authenticator app is showing a 6-digit code. Type it into her computer before it changes: a new code appears every 30 seconds.' },
    loggedIn: { who: 'sam', tone: 'good', text: 'We\'re in! Look at what it took: her password (something she <strong>knows</strong>) <em>and</em> her phone (something she <strong>has</strong>). The attacker only has one of the two, so they\'re stuck outside. I\'m resetting her password now, which takes a few minutes.' },
    attack: { who: 'sam', tone: 'warn', text: 'Heads up, Priya\'s phone is buzzing! The attacker can\'t get past MFA, so now they\'ll try to <strong>trick whoever is holding her phone</strong>. Keep hold of it and deal with each alert carefully.' },
    flood_done: { who: 'sam', tone: 'good', text: 'Reported. I\'ve blocked those sign-in attempts.' },
    sms_done: { who: 'sam', tone: 'good', text: 'Reported. I\'ve warned the rest of the company about that text.' },
    genuine: { who: 'priya', text: 'I\'m off the train! I\'m signing in on my laptop with the new password Sam sent me. I\'ve shared my screen with you: please approve it on my phone.' },
    genuine_done: { who: 'priya', tone: 'good', text: 'I\'m in, and the attacker is locked out. Thank you all so much!' },
    breach_reset: { who: 'sam', tone: 'warn', text: 'I\'ve kicked them out and blocked that session. They\'ll try again, so take another look!' }
  };
  const REPEATABLE = { breach_reset: true };

  const CLUES = {
    sticky: '<b>Sticky note (under keyboard):</b> "NEW PASSWORD &mdash; my favourite flower + my desk number. No spaces!"',
    flower: '<b>Label on the plant pot:</b> "My favourite flower! &mdash; P." (it\'s a sunflower)',
    desk: '<b>ID badge:</b> Priya Shah, Finance Manager, Level 3, <b>Desk 27</b>',
    email: '<b>Printed welcome email:</b> "Welcome to Northwind: your induction". Start date: <b>Monday 3 November 2025</b>.',
    drawer: '<b>Note on the drawer:</b> "Work phone in here. Code = the day and month I started at Northwind (DD MM)."',
    bin: '<b>Scrap in the bin:</b> "old password: <s>daisy12</s> &mdash; had to change it!!"'
  };

  const FACTORS = {
    know: { name: 'Something you KNOW', text: 'A password or PIN. Easy to steal, guess, reuse or leave on a sticky note.', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>' },
    have: { name: 'Something you HAVE', text: 'Your phone with an authenticator app, or a security key. Someone would need it in their hands.', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>' },
    are: { name: 'Something you ARE', text: 'A fingerprint or face scan. It can\'t be written down or lent to anyone.', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 11v4M8 12a4 4 0 0 1 8 0v2a8 8 0 0 1-1 4M6 16a10 10 0 0 0 1-4 5 5 0 0 1 1-3M18 16c.5-1 .8-2.4.9-4M9 20c1-1.5 2-3.5 2-6"/></svg>' }
  };

  const EVENTS = [
    {
      id: 'flood',
      label: 'A flood of sign-in requests',
      done: 'Denied and reported: MFA fatigue.',
      lessonTitle: 'That trick is called "MFA fatigue"',
      lesson: 'The attacker sends request after request, hoping someone taps Approve just to make them stop. If you get sign-in requests you didn\'t start, never approve them: deny and report, because it means someone has your password.'
    },
    {
      id: 'sms',
      label: 'A text asking for the code',
      done: 'Reported: never share a sign-in code.',
      lessonTitle: 'Never share your code',
      lesson: 'The code on your phone is a key to your account. Real IT staff will never ask you for it by text, email or phone call, so anyone who asks is trying to get in. Don\'t reply: report it.'
    },
    {
      id: 'genuine',
      label: 'Priya\'s own sign-in',
      done: 'Approved: she started it and the numbers matched.',
      lessonTitle: 'That one was real',
      lesson: 'Only approve a sign-in you (or the person you\'re helping) started right now. Number matching makes this easy: the attacker can\'t see your screen, so they can\'t give you the right number.'
    }
  ];

  const BREACH = {
    flood: 'You approved a sign-in nobody here started. It was the attacker, using Priya\'s stolen password, and one tap let them straight in.',
    sms: 'You sent the code to the attacker. They typed it in within seconds and got in. Whoever has the code has the key.'
  };

  // Progressive hints: each click reveals the next, more detailed one.
  const HINTS = {
    pwFind: [
      'Priya said she left a reminder at her desk. Where would you hide a note you need every time you type?',
      'Take a close look at the keyboard. Something might be stuck underneath it.',
      'Click the Keyboard on the desk, then press "Lift the keyboard" to find her password reminder.'
    ],
    pwCombine: [
      'The sticky note says: favourite flower + desk number. Both answers are somewhere on her desk.',
      'Read the label on the potted flower, and look at the ID badge hanging on the hook by her desk for her desk number.',
      'Her favourite flower is a sunflower and she sits at desk 27. Type sunflower27 into the computer.'
    ],
    drawer: [
      'The note on the drawer says the code is the day and month Priya started at Northwind. Is there anything on her desk about her first day?',
      'The printed welcome email on the desk gives her start date: 3 November 2025. Write it as day then month, two digits each.',
      'Set the drawer dials to 0 3 1 1, then press "Try to open".'
    ],
    phone: [
      'Priya\'s work phone is in the open drawer. Pick it up and try to unlock it.',
      'Click the Drawer, press "Take the phone", then touch the fingerprint sensor on the phone.'
    ],
    remote: [
      'Only Priya\'s fingerprint can unlock her phone, so yours won\'t work. Don\'t try to get round it: read the phone screen for the approved way in.',
      'Press "Ask IT to unlock it remotely" on the phone. Sam from IT unlocks it once Priya confirms it\'s OK.'
    ],
    code: [
      'The computer wants a code from the Authenticator app. The app is on Priya\'s phone, which is now in your hands.',
      'Read the 6-digit number on the phone and type it into the computer (click Computer on the desk). If the timer is nearly out, wait for the next code.'
    ],
    flood: [
      'Is anyone on your team trying to sign in to Priya\'s account right now? If not, who is?',
      'Never tap Approve on a request you didn\'t start. Look for the option that tells IT something is wrong.',
      'Tap "Report: I didn\'t try to sign in".'
    ],
    sms: [
      'Would a real IT team ever need the code from Priya\'s phone?',
      'Whoever has the code can use it to get in. Don\'t reply: let IT know about the message instead.',
      'Tap "Report as scam".'
    ],
    genuine: [
      'This request really is from Priya: she told you she\'s signing in. The phone is asking for a number.',
      'Look at Priya\'s laptop screen (the panel next to the phone) and tap the matching number on the phone.'
    ]
  };

  const PROGRESS = { pwOk: 20, drawerOpen: 30, phoneUnlocked: 40, loggedIn: 50, perEvent: 15 };

  // ---------- DOM refs ----------
  const els = {
    feed: $('#mfaFeed'),
    closeup: $('#closeup'),
    handsWrap: $('#handsWrap'),
    handPhone: $('#handPhone'),
    sticky: $('#sceneSticky'),
    stageDesk: $('#stageDesk'),
    stageAttack: $('#stageAttack'),
    attackPhone: $('#attackPhone'),
    monitor: $('#attackMonitor'),
    attackLog: $('#attackLog'),
    pill: $('#mfaStagePill'),
    pillTitle: $('#mfaStageTitle'),
    hintBtn: $('#mfaHintBtn'),
    hintText: $('#mfaHintText'),
    clueList: $('#clueList'),
    factorCount: $('#factorCount'),
    kit: $('#mfaKit'),
    room: $('#mfaRoom'),
    finalBanner: $('#mfaFinalBanner'),
    completion: $('#completionContent'),
    vaultValue: $('#mfaVaultValue')
  };

  // ---------- Helpers ----------
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(function () { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  function clearTimers() { timers.forEach(clearTimeout); timers.clear(); }

  function h(tag, attrs, html) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    if (html != null) el.innerHTML = html;
    return el;
  }
  function button(cls, label, onClick) {
    const b = h('button', { class: cls, type: 'button' }, label);
    b.addEventListener('click', onClick);
    return b;
  }
  function spend(amount, reason) { try { points?.spend?.(amount, reason); } catch (_) {} }

  function setProgress() {
    if (state.completed) return;
    let pct = 0;
    if (state.pwOk) pct += 20;
    if (state.drawerOpen) pct += 10;
    if (state.phoneUnlocked) pct += 10;
    if (state.loggedIn) pct = PROGRESS.loggedIn;
    if (state.stage === 'attack') pct = PROGRESS.loggedIn + (state.event + (state.resolved ? 1 : 0)) * PROGRESS.perEvent;
    pct = Math.min(pct, 95);
    try { window.utils?.setProgressPercent?.(ROOM, pct); } catch (_) {}
  }

  // Time-based "authenticator" code: changes every 30 seconds.
  function codeFor(windowIdx) {
    let x = 2166136261 >>> 0;
    const s = 'NW-PRIYA-' + windowIdx;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    return String(x % 1000000).padStart(6, '0');
  }
  function nowWindow() { return Math.floor(Date.now() / 30000); }
  function secsLeft() { return 30 - Math.floor((Date.now() / 1000) % 30); }
  function clockText() {
    const d = new Date();
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  }
  // Wide screens show the whole room as one dashboard (keep in step with the CSS in mfa.html).
  function dashboardLayout() {
    try { return window.matchMedia('(min-width: 1180px) and (min-height: 520px)').matches; } catch (_) { return false; }
  }

  // ---------- The live call feed ----------
  const WHO = { priya: 'Priya', sam: 'Sam (IT)' };
  function feedMsg(id, isNew) {
    const m = MSGS[id];
    const el = h('div', { class: 'comms__msg' + (m.tone ? ' is-' + m.tone : '') + (isNew ? ' is-new' : '') });
    el.appendChild(h('span', { class: 'comms__who comms__who--' + m.who, text: WHO[m.who] }));
    el.appendChild(h('span', null, m.text));
    return el;
  }
  // Scroll the feed (never the page) so the newest message shows from its first line.
  function newestTop() {
    const f = els.feed;
    const last = f.lastElementChild;
    return last ? Math.max(0, Math.min(f.scrollHeight - f.clientHeight, last.offsetTop - 8)) : 0;
  }
  function showNewest(smooth) {
    const f = els.feed;
    if (!smooth || reducedMotion()) { f.scrollTop = newestTop(); return; }
    try { f.scrollTo({ top: newestTop(), behavior: 'smooth' }); } catch (_) { f.scrollTop = newestTop(); }
    // A page scroll running at the same time can cancel a smooth scroll: make sure it lands.
    setTimeout(function () { if (Math.abs(f.scrollTop - newestTop()) > 2) f.scrollTop = newestTop(); }, 800);
  }
  function renderFeed() {
    els.feed.innerHTML = '';
    state.msgs.forEach(function (id) { if (MSGS[id]) els.feed.appendChild(feedMsg(id, false)); });
    showNewest(false);
  }
  function say(id) {
    if (!MSGS[id]) return;
    if (!REPEATABLE[id] && state.msgs.includes(id)) return;
    state.msgs.push(id);
    const trimmed = state.msgs.length > 40;
    if (trimmed) state.msgs = state.msgs.slice(-40);
    save();
    if (trimmed) renderFeed();
    else {
      $$('.comms__msg.is-new', els.feed).forEach(function (el) { el.classList.remove('is-new'); });
      els.feed.appendChild(feedMsg(id, true));
      showNewest(true);
    }
    announce(WHO[MSGS[id].who] + ' says: ' + h('div', null, MSGS[id].text).textContent);
  }

  // ---------- Notebook + factors ----------
  function addClue(id) {
    if (state.clues.includes(id)) return;
    state.clues.push(id);
    save();
    renderClues(id);
  }
  function renderClues(newId) {
    els.clueList.innerHTML = '';
    if (!state.clues.length) {
      els.clueList.appendChild(h('li', { class: 'clues__empty', style: 'background:none;border:0;padding:0' }, 'Nothing yet. Inspect things on the desk: anything useful gets written down here.'));
      return;
    }
    state.clues.forEach(function (id) {
      if (CLUES[id]) els.clueList.appendChild(h('li', id === newId ? { class: 'is-new' } : null, CLUES[id]));
    });
    // On the dashboard the notebook scrolls inside its own panel: keep the newest clue in view.
    const panel = els.clueList.closest('.kit__panel');
    if (newId && panel && panel.scrollHeight > panel.clientHeight) {
      try { panel.scrollTo({ top: panel.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (_) { panel.scrollTop = panel.scrollHeight; }
    }
  }
  function findFactor(key) {
    if (state.factors[key]) return;
    state.factors[key] = true;
    save();
    renderFactors();
    announce('New key type discovered: ' + FACTORS[key].name);
  }
  function renderFactors() {
    let n = 0;
    $$('.factor', els.kit).forEach(function (slot) {
      const key = slot.dataset.factor;
      const f = FACTORS[key];
      const found = !!state.factors[key];
      if (found) n++;
      slot.classList.toggle('is-found', found);
      slot.innerHTML = '';
      slot.appendChild(h('div', { class: 'factor__icon', 'aria-hidden': 'true' }, found ? f.icon : '?'));
      const txt = h('div');
      txt.appendChild(h('div', { class: 'factor__name' }, found ? f.name : '???'));
      txt.appendChild(h('div', { class: 'factor__text' }, found ? f.text : 'Not discovered yet.'));
      slot.appendChild(txt);
    });
    els.factorCount.textContent = n + ' / 3 discovered';
  }

  // ---------- Hints + stage chrome ----------
  function currentStep() {
    if (state.stage === 'desk') {
      if (!state.pwOk) return state.clues.includes('sticky') ? 'pwCombine' : 'pwFind';
      if (!state.drawerOpen) return 'drawer';
      if (!state.fingerTried) return 'phone';
      if (!state.remoteAsked) return 'remote';
      if (!state.loggedIn) return 'code'; // IT is unlocking the phone, then the code goes in
      return null;
    }
    if (state.stage === 'attack' && !state.resolved && !state.breach) return EVENTS[state.event]?.id || null;
    return null;
  }
  function renderHint() {
    const step = currentStep();
    if (!step) {
      els.hintBtn.hidden = true;
      els.hintText.hidden = true;
      return;
    }
    const list = HINTS[step];
    const shown = Math.min(state.hints[step] || 0, list.length);
    els.hintBtn.hidden = false;
    if (shown) {
      els.hintText.innerHTML = '';
      list.slice(0, shown).forEach(function (t, i) {
        els.hintText.appendChild(h('div', { text: 'Hint ' + (i + 1) + ': ' + t }));
      });
      els.hintText.hidden = false;
      els.hintText.scrollTop = els.hintText.scrollHeight; // newest hint in view when the box scrolls
    } else {
      els.hintText.hidden = true;
    }
    if (shown >= list.length) {
      els.hintBtn.disabled = true;
      els.hintBtn.textContent = 'No more hints';
    } else {
      els.hintBtn.disabled = false;
      els.hintBtn.textContent = 'Hint ' + (shown + 1) + ' of ' + list.length + ' (-' + COST.hint + ' pts)';
    }
  }
  els.hintBtn.addEventListener('click', function () {
    const step = currentStep();
    if (!step) return;
    const shown = state.hints[step] || 0;
    if (shown >= HINTS[step].length) return;
    state.hints[step] = shown + 1;
    spend(COST.hint, 'MFA room hint');
    save();
    renderHint();
    announce('Hint: ' + HINTS[step][shown]);
  });

  function renderStageChrome() {
    els.pill.classList.remove('is-alert', 'is-done');
    if (state.stage === 'desk') {
      els.pillTitle.textContent = 'Stage 1 of 2: Priya\'s desk';
    } else if (state.stage === 'attack') {
      els.pill.classList.add('is-alert');
      els.pillTitle.textContent = 'Stage 2 of 2: Guard Priya\'s phone';
    } else {
      els.pill.classList.add('is-done');
      els.pillTitle.textContent = 'Account secured';
    }
    els.room.dataset.stage = state.stage; // picks the dashboard layout for this stage
    els.stageDesk.hidden = state.stage !== 'desk';
    els.stageAttack.hidden = state.stage !== 'attack';
    renderHint();
  }

  // =====================================================================
  //  STAGE 1 — THE DESK
  // =====================================================================
  function renderHotspots() {
    $$('.hotspot').forEach(function (b) {
      b.classList.toggle('is-seen', !!state.seen[b.dataset.item]);
      b.classList.toggle('is-active', state.focus === b.dataset.item);
    });
    els.sticky.hidden = !state.keyboardLifted;
    const drawer = $('.hotspot[data-item="drawer"]');
    if (drawer) {
      drawer.classList.toggle('is-open', !!state.drawerOpen);
      drawer.setAttribute('aria-label', state.drawerOpen ? 'Open desk drawer' : 'Locked desk drawer');
    }
  }

  $$('.hotspot').forEach(function (btn) {
    btn.addEventListener('click', function () { inspect(btn.dataset.item, true); });
  });

  function inspect(item, userAction) {
    state.focus = item;
    state.seen[item] = true;
    save();
    renderHotspots();
    renderCloseup();
    if (userAction) {
      try { els.closeup.focus({ preventScroll: true }); } catch (_) {}
      if (window.matchMedia && window.matchMedia('(max-width: 960px)').matches) {
        els.closeup.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function closeupShell(eyebrow, title) {
    els.closeup.innerHTML = '';
    els.closeup.scrollTop = 0; // a long close-up scrolls inside its panel: start each one at the top
    els.closeup.appendChild(h('p', { class: 'closeup__eyebrow' }, eyebrow));
    els.closeup.appendChild(h('h3', null, title));
    return els.closeup;
  }

  function renderCloseup() {
    const item = state.focus;
    const renderers = {
      badge: function () {
        const c = closeupShell('Hanging on a hook', 'Priya\'s staff ID badge');
        c.appendChild(h('div', { class: 'prop-badge' },
          '<div class="prop-badge__photo">PS</div><div><div class="prop-badge__name">PRIYA SHAH</div>' +
          '<div class="prop-badge__row">Finance Manager &middot; Northwind</div><div class="prop-badge__row">Level 3</div>' +
          '<span class="prop-badge__desk">DESK 27</span></div>'));
        c.appendChild(h('p', null, 'She left her spare badge on the hook by her desk.'));
        addClue('desk');
      },
      photo: function () {
        const c = closeupShell('On the desk', 'A framed photo');
        c.appendChild(h('p', null, 'Priya and a friend on a beach holiday, squinting into the sun. Lovely, but there\'s nothing written on it, front or back.'));
      },
      email: function () {
        const c = closeupShell('On the desk', 'A printed email');
        c.appendChild(h('p', null, 'An email Priya printed out before her first day. She has highlighted one line.'));
        c.appendChild(h('div', { class: 'prop-email' },
          '<div class="prop-email__top"><b>Priya Shah</b><span>Northwind Mail</span></div>' +
          '<dl class="prop-email__head">' +
            '<dt>From:</dt><dd>Northwind People &amp; Culture &lt;onboarding@northwind.com&gt;</dd>' +
            '<dt>Sent:</dt><dd>Monday 20 October 2025, 9:12 am</dd>' +
            '<dt>To:</dt><dd>Priya Shah &lt;priya.shah@northwind.com&gt;</dd>' +
            '<dt>Subject:</dt><dd>Welcome to Northwind: your induction</dd>' +
          '</dl>' +
          '<div class="prop-email__body">' +
            '<p>Hi Priya,</p>' +
            '<p>Welcome to Northwind! We\'re delighted you\'re joining the Finance team. Here\'s everything you need for your first day.</p>' +
            '<div class="prop-email__start"><span>Your start date</span><strong><mark>Monday 3 November 2025</mark></strong>Please arrive at Level 1 reception at 8:45 am.</div>' +
            '<p><b>Your induction day</b></p>' +
            '<ul><li>9:00 am: welcome and building tour</li><li>10:30 am: collect your laptop, work phone and ID badge</li>' +
            '<li>11:30 am: set up your password and Authenticator app with IT</li><li>12:30 pm: lunch with the Finance team</li></ul>' +
            '<p>See you soon!<br>The People &amp; Culture team</p>' +
          '</div>' +
          '<div class="prop-email__foot">Page 1 of 1</div>'));
        addClue('email');
      },
      mug: function () {
        const c = closeupShell('On the desk', 'A coffee mug');
        c.appendChild(h('p', null, 'It says <strong>WORLD\'S OKAYEST ACCOUNTANT</strong>. It\'s full of pens and a cold teabag. Nothing useful here.'));
      },
      plant: function () {
        const c = closeupShell('On the desk', 'A potted flower');
        c.appendChild(h('p', null, 'A big, cheerful sunflower. There\'s a handwritten label stuck to the pot:'));
        c.appendChild(h('div', { class: 'prop-label' }, 'My favourite flower! &mdash; P.'));
        addClue('flower');
      },
      bin: function () {
        const c = closeupShell('Under the desk', 'The rubbish bin');
        c.appendChild(h('p', null, 'Among the tissues and a banana peel there\'s a crumpled scrap of paper:'));
        c.appendChild(h('div', { class: 'prop-paper' }, 'old password: <s>daisy12</s><br>had to change it!!'));
        c.appendChild(h('p', null, 'An old, crossed-out password. It won\'t work any more, but it shows how Priya likes to make up her passwords&hellip;'));
        addClue('bin');
      },
      keyboard: renderKeyboard,
      drawer: renderDrawer,
      computer: renderComputer
    };
    if (!item || !renderers[item]) {
      els.closeup.innerHTML = '<p class="closeup-empty">Nothing picked up yet. Click something on the desk to look at it up close.</p>';
      return;
    }
    renderers[item]();
    if (state.loggedIn && state.stage === 'desk' && item !== 'computer') {
      els.closeup.appendChild(button('btn primary', 'Next: guard Priya\'s phone &rarr;', startAttack));
    }
  }

  function renderKeyboard() {
    const c = closeupShell('On the desk', 'Priya\'s keyboard');
    if (!state.keyboardLifted) {
      c.appendChild(h('p', null, 'A well-used keyboard with a few crumbs. One corner doesn\'t quite sit flat on the desk&hellip;'));
      c.appendChild(button('btn primary', 'Lift the keyboard', function () {
        state.keyboardLifted = true;
        save();
        renderHotspots();
        renderKeyboard();
        say('sticky');
        renderHint();
      }));
      return;
    }
    c.appendChild(h('p', null, 'Stuck to the underside of the keyboard:'));
    c.appendChild(h('div', { class: 'prop-sticky' }, 'NEW PASSWORD &mdash; don\'t forget!!<br><strong>my favourite flower + my desk number</strong><br>(no spaces)'));
    addClue('sticky');
  }

  // ---------- Drawer + 4-dial lock ----------
  function renderDrawer() {
    const c = closeupShell('Under the desk', state.drawerOpen ? 'The open drawer' : 'A locked desk drawer');
    if (state.drawerOpen) {
      if (!state.phoneTaken) {
        c.appendChild(h('p', null, 'Inside, next to a phone charger and some mints: <strong>Priya\'s work phone</strong>.'));
        c.appendChild(button('btn primary', 'Take the phone', function () {
          state.phoneTaken = true;
          save();
          renderHands();
          renderDrawer();
          renderHint();
          announce('You picked up Priya\'s work phone. It is shown in your hands, next to the close-up.');
          if (window.matchMedia && window.matchMedia('(max-width: 960px)').matches) {
            els.handsWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }));
      } else {
        c.appendChild(h('p', null, 'Just a phone charger and some mints left. The phone is in your hands.'));
      }
      return;
    }
    c.appendChild(h('p', null, 'A 4-dial combination lock keeps it shut. A note is stuck to the front:'));
    c.appendChild(h('div', { class: 'prop-sticky' }, 'Work phone in here.<br><strong>Code = the day and month I started at Northwind</strong> (DD MM)'));
    addClue('drawer');

    const combo = h('div', { class: 'combo', role: 'group', 'aria-label': 'Drawer combination lock' });
    state.dial.forEach(function (d, i) {
      const dial = h('div', { class: 'combo__dial' });
      const digit = h('div', { class: 'combo__digit', 'aria-live': 'polite', text: String(d) });
      function turn(delta) {
        state.dial[i] = (state.dial[i] + delta + 10) % 10;
        digit.textContent = String(state.dial[i]);
        save();
      }
      dial.appendChild(button('combo__btn', '&#9650;', function () { turn(1); }));
      dial.lastChild.setAttribute('aria-label', 'Dial ' + (i + 1) + ' up');
      dial.appendChild(digit);
      dial.appendChild(button('combo__btn', '&#9660;', function () { turn(-1); }));
      dial.lastChild.setAttribute('aria-label', 'Dial ' + (i + 1) + ' down');
      combo.appendChild(dial);
    });
    c.appendChild(combo);
    const fb = h('p', { class: 'mfa-feedback', role: 'status' });
    c.appendChild(button('btn primary', 'Try to open', function () {
      const code = state.dial.join('');
      if (code === DRAWER_CODE) {
        state.drawerOpen = true;
        save();
        setProgress();
        say('drawerOpen');
        renderDrawer();
        renderHint();
        return;
      }
      spend(COST.wrong, 'MFA room: wrong drawer code');
      combo.classList.remove('combo--shake');
      void combo.offsetWidth;
      combo.classList.add('combo--shake');
      fb.className = 'mfa-feedback is-bad';
      if (code === '1103') fb.textContent = 'Click. Still locked (-2 pts). The note says DD MM: the day comes first, then the month.';
      else if (code === EMAIL_SENT_CODE) fb.textContent = 'Click. Still locked (-2 pts). 20 October is when the email was sent. The note wants the day she started.';
      else fb.textContent = 'Click. Still locked (-2 pts). Check the note on the drawer again.';
    }));
    c.appendChild(fb);
  }

  // ---------- The phone in your hands ----------
  let handTick = null;
  function stopHandTick() { if (handTick) { clearInterval(handTick); handTick = null; } }

  function phoneShell(target) {
    target.innerHTML = '';
    const screen = h('div', { class: 'phone__screen' });
    screen.appendChild(h('div', { class: 'phone__notch', 'aria-hidden': 'true' }));
    screen.appendChild(h('div', { class: 'phone__status', 'aria-hidden': 'true' }, '<span>' + clockText() + '</span><span>5G &#9646;&#9646;&#9646;</span>'));
    const body = h('div', { class: 'phone__body' });
    screen.appendChild(body);
    target.appendChild(screen);
    return body;
  }

  const UNLOCKED_TEXT = 'Unlocked remotely by Northwind IT (approved by Priya)';

  // The phone's lock screen walks through: touch the sensor -> not recognised (only Priya's
  // fingerprint works) -> ask IT -> remote unlock in progress -> unlocked -> Authenticator.
  function renderHands(justUnlocked) {
    stopHandTick();
    const show = state.stage === 'desk' && state.phoneTaken;
    els.handsWrap.hidden = !show;
    els.room.classList.toggle('is-holding', show);
    if (!show) return;
    const body = phoneShell(els.handPhone);
    if (!state.phoneUnlocked || justUnlocked) {
      body.appendChild(h('div', { class: 'phone__clock', text: clockText() }));
      body.appendChild(h('div', { class: 'phone__date', text: 'Northwind work phone' }));
      const center = h('div', { class: 'phone__center' });
      if (state.phoneUnlocked) {
        center.appendChild(h('div', { class: 'phone__badge phone__badge--ok', 'aria-hidden': 'true' }, '&#10003;'));
        center.appendChild(h('div', { class: 'phone__msg' }, '<strong>Unlocked remotely by Northwind IT</strong>(approved by Priya)'));
        center.appendChild(h('div', { class: 'phone__muted' }, 'Opening Authenticator&hellip;'));
      } else if (!state.fingerTried) {
        center.appendChild(h('div', { class: 'phone__muted' }, 'Touch the sensor to unlock'));
        const fp = button('fp-btn', FACTORS.are.icon, tryFinger);
        fp.setAttribute('aria-label', 'Fingerprint sensor: touch to unlock');
        center.appendChild(fp);
      } else if (!state.remoteAsked) {
        center.appendChild(h('div', { class: 'fp-btn is-fail', 'aria-hidden': 'true' }, FACTORS.are.icon));
        center.appendChild(h('div', { class: 'phone__msg phone__msg--bad' }, '<strong>Fingerprint not recognised</strong>Only Priya\'s fingerprint can unlock this phone.'));
        const box = h('div', { class: 'remote-box' });
        box.appendChild(h('div', { class: 'remote-box__title', text: 'Managed by Northwind IT' }));
        box.appendChild(h('div', { class: 'remote-box__text', text: 'IT can unlock this work phone remotely, once Priya says it\'s OK.' }));
        box.appendChild(button('pbtn pbtn--it', 'Ask IT to unlock it remotely', askRemoteUnlock));
        center.appendChild(box);
      } else {
        center.appendChild(h('div', { class: 'phone__badge phone__badge--wait', 'aria-hidden': 'true' }, '<span class="remote-spin"></span>'));
        center.appendChild(h('div', { class: 'phone__msg' }, '<strong>Remote unlock by Northwind IT&hellip;</strong>'));
        const steps = h('ul', { class: 'remote-steps' });
        steps.appendChild(h('li', { class: 'is-ok' }, 'Request sent to Northwind IT'));
        steps.appendChild(h('li', { class: state.priyaApproved ? 'is-ok' : 'is-wait' }, state.priyaApproved ? 'Approved by Priya' : 'Waiting for Priya to approve&hellip;'));
        if (state.priyaApproved) steps.appendChild(h('li', { class: 'is-wait' }, 'Unlocking&hellip;'));
        center.appendChild(steps);
      }
      body.appendChild(center);
      return;
    }
    // Unlocked: Authenticator app with a live code.
    body.appendChild(h('div', { class: 'phone-banner' }, '<span aria-hidden="true">&#10003;</span> ' + UNLOCKED_TEXT));
    body.appendChild(h('div', { class: 'phone__date', text: 'Authenticator' }));
    const app = h('div', { class: 'auth-app' });
    app.appendChild(h('div', { class: 'auth-app__title', text: 'Northwind' }));
    app.appendChild(h('div', { class: 'auth-app__acct', text: 'priya.shah@northwind.com' }));
    const code = h('div', { class: 'auth-app__code', 'aria-live': 'polite' });
    const bar = h('div', { class: 'auth-app__bar', 'aria-hidden': 'true' }, '<span></span>');
    const secs = h('div', { class: 'auth-app__secs' });
    app.appendChild(code);
    app.appendChild(bar);
    app.appendChild(secs);
    body.appendChild(app);
    body.appendChild(h('div', { class: 'phone__muted', style: 'text-align:center' }, 'A new code appears every 30 seconds.'));
    function tick() {
      const c = codeFor(nowWindow());
      const txt = c.slice(0, 3) + ' ' + c.slice(3);
      if (code.textContent !== txt) code.textContent = txt;
      const left = secsLeft();
      bar.firstChild.style.width = Math.round((left / 30) * 100) + '%';
      bar.classList.toggle('is-low', left <= 7);
      secs.textContent = 'Changes in ' + left + 's';
    }
    tick();
    handTick = setInterval(tick, 1000);
  }

  function focusPhone(sel) {
    const el = sel ? $(sel, els.handPhone) : els.handPhone;
    try { el?.focus({ preventScroll: true }); } catch (_) {}
  }

  function tryFinger() {
    if (state.fingerTried) return;
    state.fingerTried = true;
    save();
    renderHands();
    findFactor('are');
    say('finger');
    renderHint();
    focusPhone('.pbtn--it');
    announce('Fingerprint not recognised. Only Priya\'s fingerprint can unlock this phone. The phone offers a button: Ask IT to unlock it remotely.');
  }
  // The approved route in: IT unlocks the managed phone remotely once Priya confirms.
  function askRemoteUnlock() {
    if (!state.fingerTried || state.remoteAsked || state.phoneUnlocked) return;
    state.remoteAsked = true;
    save();
    renderHands();
    focusPhone();
    say('remote');
    renderHint();
    later(approveRemote, 1800);
  }
  function approveRemote() {
    if (state.stage !== 'desk' || !state.remoteAsked || state.priyaApproved) return;
    state.priyaApproved = true;
    save();
    say('remote2');
    renderHands();
    later(unlockPhone, 1600);
  }
  function unlockPhone() {
    if (state.stage !== 'desk' || state.phoneUnlocked) return;
    state.phoneUnlocked = true;
    save();
    setProgress();
    renderHands(true);
    say('unlocked');
    renderHint();
    if (state.focus === 'computer') renderCloseup();
    announce(UNLOCKED_TEXT + '. The Authenticator app is opening.');
    // Show "unlocked" for a moment, then open the Authenticator app.
    later(function () { if (state.stage === 'desk' && state.phoneUnlocked) renderHands(); }, 2000);
  }
  // A step that was mid-way when the page was left (reload, back/forward): carry on from it.
  function resumePending() {
    if (state.stage !== 'desk') return;
    if (state.msgs.includes('intro_sam') && !state.msgs.includes('intro_priya')) later(function () { say('intro_priya'); }, 900);
    if (state.pwOk && !state.msgs.includes('pwOk2')) later(function () { say('pwOk2'); }, 900);
    if (state.remoteAsked && !state.priyaApproved) later(approveRemote, 1200);
    else if (state.priyaApproved && !state.phoneUnlocked) later(unlockPhone, 1200);
  }

  // ---------- Priya's computer (sign-in screen) ----------
  function loginSteps() {
    const steps = h('div', { class: 'login__steps', 'aria-hidden': 'true' });
    const defs = [['Password', state.pwOk], ['Code from phone', state.loggedIn], ['Signed in', state.loggedIn]];
    let nowSet = false;
    defs.forEach(function (d) {
      let cls = 'login__step';
      if (d[1]) cls += ' is-ok';
      else if (!nowSet) { cls += ' is-now'; nowSet = true; }
      steps.appendChild(h('span', { class: cls, text: d[0] }));
    });
    return steps;
  }

  function renderComputer() {
    const c = closeupShell('On the desk', 'Priya\'s computer');
    const box = h('div', { class: 'login' });
    box.appendChild(h('div', { class: 'login__brand' }, '<span class="login__logo" aria-hidden="true"></span>Northwind sign-in'));
    box.appendChild(h('div', { class: 'login__user', text: 'priya.shah@northwind.com' }));
    box.appendChild(loginSteps());
    const fb = h('p', { class: 'mfa-feedback', role: 'status' });

    if (state.loggedIn) {
      box.appendChild(h('div', { class: 'login__ok' }, '<strong>Signed in as Priya Shah</strong>Sam is resetting her password from the IT console.'));
      c.appendChild(box);
      if (state.stage === 'desk') {
        c.appendChild(button('btn primary', 'Next: guard Priya\'s phone &rarr;', startAttack));
      }
      return;
    }

    const form = h('form', { novalidate: 'novalidate' });
    const row = h('div', { class: 'login__row' });
    const input = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });

    if (!state.pwOk) {
      input.id = 'mfaPwInput';
      form.appendChild(h('label', { for: 'mfaPwInput', text: 'Password' }));
      input.setAttribute('placeholder', 'Type the password');
      row.appendChild(input);
      row.appendChild(h('button', { class: 'btn primary', type: 'submit', text: 'Sign in' }));
      form.appendChild(row);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const raw = input.value.trim();
        if (!raw) { fb.className = 'mfa-feedback is-info'; fb.textContent = 'Type a password first.'; return; }
        const guess = raw.toLowerCase().replace(/\s+/g, '');
        if (VALID_PASSWORDS.includes(guess)) {
          state.pwOk = true;
          save();
          findFactor('know');
          setProgress();
          say('pwOk');
          later(function () { say('pwOk2'); }, 1500);
          renderComputer();
          renderHint();
          return;
        }
        spend(COST.wrong, 'MFA room: wrong password');
        fb.className = 'mfa-feedback is-bad';
        if (guess === 'daisy12') fb.textContent = 'Incorrect password (-2 pts). That\'s her OLD password: she had to change it.';
        else if (!state.clues.includes('sticky')) fb.textContent = 'Incorrect password (-2 pts). Priya said she left a reminder somewhere on her desk.';
        else fb.textContent = 'Incorrect password (-2 pts). Check the sticky note: favourite flower + desk number, no spaces.';
        input.select();
      });
    } else {
      input.id = 'mfaCodeInput';
      input.className = 'login__code';
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('maxlength', '7');
      input.setAttribute('placeholder', '000000');
      form.appendChild(h('label', { for: 'mfaCodeInput', text: 'Enter the 6-digit code from the Authenticator app' }));
      row.appendChild(input);
      row.appendChild(h('button', { class: 'btn primary', type: 'submit', text: 'Verify' }));
      form.appendChild(row);
      if (!state.phoneUnlocked) {
        box.appendChild(h('p', { class: 'phone__muted', style: 'margin:.2rem 0 .6rem;color:#9fb8d6' }, 'The Authenticator app is on Priya\'s work phone.'));
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const guess = input.value.replace(/\D/g, '');
        if (guess.length !== 6) { fb.className = 'mfa-feedback is-info'; fb.textContent = 'The code is 6 digits long.'; return; }
        const w = nowWindow();
        if (state.phoneUnlocked && (guess === codeFor(w) || guess === codeFor(w - 1))) {
          state.loggedIn = true;
          save();
          findFactor('have');
          setProgress();
          say('loggedIn');
          renderComputer();
          renderHint();
          return;
        }
        spend(COST.wrong, 'MFA room: wrong login code');
        fb.className = 'mfa-feedback is-bad';
        fb.textContent = state.phoneUnlocked
          ? 'That code didn\'t work (-2 pts). Codes only last 30 seconds: copy the one showing on the phone right now.'
          : 'That code didn\'t work (-2 pts). You\'ll need the code from Priya\'s phone.';
        input.select();
      });
    }
    box.appendChild(form);
    box.appendChild(fb);
    c.appendChild(box);
  }

  // =====================================================================
  //  STAGE 2 — GUARD PRIYA'S PHONE
  // =====================================================================
  let attackTick = null;
  function stopAttackTick() { if (attackTick) { clearInterval(attackTick); attackTick = null; } }
  const lessonEl = h('div', { id: 'mfaLesson', 'aria-live': 'polite' });
  const attackSide = $('.attack-side');
  if (attackSide) attackSide.insertBefore(lessonEl, attackSide.firstChild);

  function startAttack() {
    if (state.stage !== 'desk' || !state.loggedIn) return;
    state.stage = 'attack';
    state.event = 0;
    state.resolved = false;
    state.nudge = null;
    state.breach = null;
    if (!state.matchNumber) state.matchNumber = 20 + Math.floor(Math.random() * 70);
    save();
    renderHands();
    renderStageChrome();
    setProgress();
    say('attack');
    renderAttack();
    try { els.room.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
  }

  function renderAttack() {
    stopAttackTick();
    if (state.stage !== 'attack') return;
    renderLog();
    renderMonitor();
    renderAttackPhone();
    renderLesson();
    renderHint();
  }

  function renderLog() {
    els.attackLog.innerHTML = '';
    EVENTS.forEach(function (ev, i) {
      let cls = '';
      let sub = 'Waiting&hellip;';
      if (i < state.event || (i === state.event && state.resolved)) { cls = 'is-done'; sub = ev.done; }
      else if (i === state.event) { cls = 'is-now'; sub = 'Happening now'; }
      const li = h('li', { class: cls });
      li.appendChild(h('span', { class: 'n', text: cls === 'is-done' ? '✓' : String(i + 1) }));
      li.appendChild(h('span', null, '<b>' + (i <= state.event ? ev.label : 'Alert ' + (i + 1)) + '</b>' + sub));
      els.attackLog.appendChild(li);
    });
  }

  function renderMonitor() {
    const ev = EVENTS[state.event];
    const m = els.monitor;
    m.innerHTML = '';
    if (ev.id === 'genuine') {
      m.appendChild(h('div', { class: 'monitor__bar' }, '<i></i><i></i><i></i>Priya\'s laptop &middot; shared on the call'));
      m.appendChild(h('p', { style: 'margin:0;text-align:center;color:#cfe0f5' }, 'Northwind sign-in: check your phone and tap this number to sign in'));
      m.appendChild(h('div', { class: 'monitor__big', text: String(state.matchNumber) }));
      return;
    }
    m.appendChild(h('div', { class: 'monitor__bar' }, '<i></i><i></i><i></i>Sam\'s IT console'));
    if (state.breach) {
      m.appendChild(h('p', { style: 'margin:0;color:var(--danger);font-weight:700' }, 'ALERT: someone just signed in to Priya\'s account from an unknown device.'));
    } else {
      m.appendChild(h('p', { style: 'margin:0 0 .4rem;color:#cfe0f5' }, 'Resetting Priya\'s password&hellip; almost done.'));
      m.appendChild(h('p', { style: 'margin:0;color:var(--warn)' }, ev.id === 'flood'
        ? 'Sign-in attempts with her old password: Rotterdam, Netherlands (unknown device).'
        : 'New tactic: the attacker has stopped sending sign-in requests.'));
    }
  }

  function notifHead(icon, app) {
    return h('div', { class: 'notif__app' }, '<span class="notif__icon' + (icon === 'sms' ? ' notif__icon--sms' : '') + '">' + (icon === 'sms' ? '&#9993;' : 'N') + '</span>' + app + '<span style="margin-left:auto;font-weight:600">now</span>');
  }
  function signinRows(where, device) {
    return h('div', { class: 'notif__rows' },
      '<span><b>Account:</b> priya.shah@northwind.com</span><span><b>Location:</b> ' + where + '</span><span><b>Device:</b> ' + device + '</span>');
  }

  function renderAttackPhone() {
    const ev = EVENTS[state.event];
    const body = phoneShell(els.attackPhone);
    body.appendChild(h('div', { class: 'phone__clock', style: 'font-size:2em', text: clockText() }));

    if (state.breach) {
      const b = h('div', { class: 'breach', role: 'alert' });
      b.appendChild(h('div', { class: 'breach__title', text: 'THE ATTACKER GOT IN' }));
      b.appendChild(h('p', null, BREACH[state.breach]));
      b.appendChild(h('p', null, '-' + COST.breach + ' points.'));
      b.appendChild(button('pbtn pbtn--dark', 'Sam, kick them out!', function () {
        state.breach = null;
        save();
        say('breach_reset');
        renderAttack();
      }));
      body.appendChild(b);
      return;
    }

    if (state.resolved) {
      const toast = { flood: 'Reported to IT. Sign-in requests blocked.', sms: 'Reported as a scam. Message removed.', genuine: 'Approved. Priya is signed in.' }[ev.id];
      body.appendChild(h('div', { class: 'phone-toast', text: toast }));
      return;
    }

    if (ev.id === 'flood') renderFlood(body);
    else if (ev.id === 'sms') renderSms(body);
    else renderGenuine(body);
  }

  function renderFlood(body) {
    const n = h('div', { class: 'notif' });
    n.appendChild(notifHead('app', 'Northwind Sign-in'));
    const title = h('div', { class: 'notif__title' }, 'Are you trying to sign in? ');
    let count = 4;
    const badge = h('span', { class: 'notif__count', text: '+' + count + ' more' });
    title.appendChild(badge);
    n.appendChild(title);
    n.appendChild(signinRows('Rotterdam, Netherlands', 'Unknown Windows PC'));
    const acts = h('div', { class: 'phone-actions' });
    acts.appendChild(button('pbtn pbtn--deny', 'Deny', function () {
      state.nudge = 'flood';
      save();
      count += 3;
      badge.textContent = '+' + count + ' more';
      renderLesson();
      focusLesson();
    }));
    acts.appendChild(button('pbtn pbtn--approve', 'Approve', function () { breach('flood'); }));
    n.appendChild(acts);
    const stack = h('div', { class: 'phone-actions phone-actions--stack' });
    stack.appendChild(button('pbtn pbtn--ghost', 'Report: I didn\'t try to sign in', function () { resolve('flood'); }));
    n.appendChild(stack);
    body.appendChild(n);
    // More requests keep arriving while the team decides.
    attackTick = setInterval(function () {
      if (count >= 30) return;
      count += 1;
      badge.textContent = '+' + count + ' more';
    }, 2000);
  }

  function renderSms(body) {
    const t = h('div', { class: 'sms-thread' });
    t.appendChild(h('div', { class: 'sms-from' }, '<b>Northwind IT</b>Text message &middot; 0491 570 156'));
    t.appendChild(h('div', { class: 'sms-bubble' }, 'Northwind IT: We have detected unusual sign-ins on your account. To stop your account being locked, reply with the 6-digit code from your Authenticator app within 10 minutes.'));
    body.appendChild(t);
    const acts = h('div', { class: 'phone-actions phone-actions--stack' });
    acts.appendChild(button('pbtn', 'Reply with the code', function () { breach('sms'); }));
    acts.appendChild(button('pbtn pbtn--dark', 'Delete the message', function () {
      state.nudge = 'sms';
      save();
      renderLesson();
      focusLesson();
    }));
    acts.appendChild(button('pbtn pbtn--dark', 'Report as scam', function () { resolve('sms'); }));
    body.appendChild(acts);
  }

  function matchOptions() {
    const a = state.matchNumber;
    const opts = [a, ((a + 37) % 70) + 20, ((a + 18) % 70) + 20];
    if (opts[1] === a) opts[1] = a + 1;
    if (opts[2] === a || opts[2] === opts[1]) opts[2] = a + 2;
    const rot = a % 3;
    return opts.slice(rot).concat(opts.slice(0, rot));
  }

  function renderGenuine(body) {
    const n = h('div', { class: 'notif' });
    n.appendChild(notifHead('app', 'Northwind Sign-in'));
    n.appendChild(h('div', { class: 'notif__title', text: 'Are you trying to sign in?' }));
    n.appendChild(signinRows('Near the Northwind office', 'Priya\'s work laptop'));
    n.appendChild(h('div', { class: 'notif__text', style: 'margin-top:.4em' }, 'Tap the number shown on your screen:'));
    const nums = h('div', { class: 'num-row' });
    matchOptions().forEach(function (num) {
      const b = button('pbtn pbtn--num', String(num), function () {
        if (num === state.matchNumber) { resolve('genuine'); return; }
        spend(COST.wrong, 'MFA room: wrong number match');
        state.nudge = 'genuine_wrong';
        save();
        renderLesson();
        focusLesson();
      });
      b.setAttribute('aria-label', 'Number ' + num);
      nums.appendChild(b);
    });
    n.appendChild(nums);
    const stack = h('div', { class: 'phone-actions phone-actions--stack' });
    stack.appendChild(button('pbtn pbtn--ghost', 'No, it\'s not me', function () {
      state.nudge = 'genuine_deny';
      save();
      renderLesson();
      focusLesson();
    }));
    n.appendChild(stack);
    body.appendChild(n);
  }

  const NUDGES = {
    flood: ['Good: you didn\'t approve it.', 'But more requests keep arriving. Denying them one at a time won\'t stop the attacker, and someone might tap Approve by mistake. Is there a way to warn IT?'],
    sms: ['Safe, but not the best move.', 'Deleting it keeps Priya safe, but IT still doesn\'t know this scam is going around, and other staff may get the same text. Is there something better to do?'],
    genuine_wrong: ['That number doesn\'t match (-2 pts).', 'Look at the number on Priya\'s shared laptop screen and tap the same one on her phone.'],
    genuine_deny: ['Careful: this one really is Priya.', 'She just told you she\'s signing in, and it\'s coming from her own laptop. Check the number on her shared screen.']
  };

  function renderLesson() {
    lessonEl.innerHTML = '';
    if (state.stage !== 'attack' || state.breach) return;
    const ev = EVENTS[state.event];
    if (state.resolved) {
      const box = h('div', { class: 'lesson', tabindex: '-1' });
      box.appendChild(h('p', { class: 'lesson__title', text: ev.lessonTitle }));
      box.appendChild(h('p', null, ev.lesson));
      const last = state.event >= EVENTS.length - 1;
      box.appendChild(button('btn primary', last ? 'Finish: account secured &rarr;' : 'Next alert &rarr;', nextEvent));
      lessonEl.appendChild(box);
      return;
    }
    if (state.nudge && NUDGES[state.nudge]) {
      const box = h('div', { class: 'lesson lesson--warn', tabindex: '-1' });
      box.appendChild(h('p', { class: 'lesson__title', text: NUDGES[state.nudge][0] }));
      box.appendChild(h('p', { style: 'margin:0' }, NUDGES[state.nudge][1]));
      lessonEl.appendChild(box);
    }
  }
  function focusLesson() {
    const box = lessonEl.firstChild;
    if (!box) return;
    try { box.focus({ preventScroll: true }); } catch (_) {}
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
    announce(box.textContent);
  }

  function breach(id) {
    spend(COST.breach, 'MFA room: fell for an attacker trick');
    state.breach = id;
    state.nudge = null;
    save();
    renderAttack();
    announce('The attacker got in. ' + BREACH[id]);
  }
  function resolve(id) {
    if (state.resolved) return;
    state.resolved = true;
    state.nudge = null;
    save();
    setProgress();
    say(id + '_done');
    renderAttack();
    focusLesson();
  }
  function nextEvent() {
    if (!state.resolved) return;
    if (state.event >= EVENTS.length - 1) { complete(); return; }
    state.event += 1;
    state.resolved = false;
    state.nudge = null;
    save();
    if (EVENTS[state.event].id === 'genuine') say('genuine');
    renderAttack();
    // The dashboard already shows the phone, the laptop and the call together: just line the room up.
    const target = dashboardLayout() ? els.room : els.attackPhone;
    try { target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: dashboardLayout() ? 'start' : 'center' }); } catch (_) {}
  }

  // =====================================================================
  //  COMPLETION
  // =====================================================================
  // Shared completion contract: sets the progress flag, stores the code word, syncs to the
  // server and ticks the header tracker. Safe to repeat (returns false after the first time).
  function secureCodeWord() {
    try { return !!window.vault?.completeRoom?.(ROOM, CODE_WORD, { message: 'Code word ' + CODE_WORD + ' secured.' }); } catch (_) { return false; }
  }

  function complete() {
    stopAttackTick();
    const first = !state.completed;
    if (first) {
      state.completed = true;
      state.stage = 'done';
      save();
      say('genuine_done');
    }
    secureCodeWord();
    renderAll();
    if (!first) return;
    announce('Room complete. Code word ' + CODE_WORD + '. Enter it in the vault on the Mission Hub.');
    // The finish button has gone: move focus and the view to the code word at the top.
    try { els.completion.focus({ preventScroll: true }); } catch (_) {}
    try { els.finalBanner.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
  }

  // "Code word" callout in the briefing near the top of the page.
  const LOCKED_CALLOUT = els.vaultValue ? els.vaultValue.innerHTML : '';
  function renderVaultCallout() {
    if (!els.vaultValue) return;
    if (state.stage !== 'done') {
      if (els.vaultValue.innerHTML !== LOCKED_CALLOUT) els.vaultValue.innerHTML = LOCKED_CALLOUT;
      return;
    }
    els.vaultValue.textContent = '';
    els.vaultValue.appendChild(document.createTextNode('Code word: '));
    els.vaultValue.appendChild(h('strong', { text: CODE_WORD }));
    els.vaultValue.appendChild(document.createTextNode(' — enter it in the vault on the Mission Hub.'));
  }

  function renderDone() {
    const word = CODE_WORD;
    els.finalBanner.hidden = false;
    const c = els.completion;
    c.innerHTML = '';
    c.appendChild(h('h2', { text: 'Priya\'s account is secure' }));
    c.appendChild(h('p', null, 'Password reset, attacker locked out, and every trick spotted. Great work, team.'));
    c.appendChild(h('div', { class: 'mfa-complete__word', text: word }));
    c.appendChild(h('p', { class: 'mfa-complete__cta', text: 'Code word: ' + word + ' — enter it in the vault on the Mission Hub' }));
    c.appendChild(h('a', { class: 'btn primary', href: 'game.html', text: 'Go to the Mission Hub' }));
    const deb = h('div', { class: 'debrief' });
    deb.appendChild(h('div', { class: 'debrief__card' },
      '<h3>The three kinds of key</h3><ul><li><strong>Know:</strong> a password or PIN</li><li><strong>Have:</strong> your phone or a security key</li><li><strong>Are:</strong> your fingerprint or face</li><li>MFA means using two or more of them, so a stolen password alone isn\'t enough.</li></ul>'));
    deb.appendChild(h('div', { class: 'debrief__card' },
      '<h3>Tricks to watch for</h3><ul><li>Sign-in requests you didn\'t start: <strong>deny and report</strong>.</li><li>Anyone asking for your code: <strong>never share it</strong>, report it.</li><li>Real sign-in? Check it\'s you and <strong>match the number</strong>.</li></ul>'));
    deb.appendChild(h('div', { class: 'debrief__card' },
      '<h3>Keep your password safe</h3><ul><li>Don\'t reuse it on other sites.</li><li>Don\'t write it on a sticky note.</li><li>Typed it into a suspicious page? Tell IT straight away, like Priya did.</li></ul>'));
    c.appendChild(deb);
  }

  // =====================================================================
  //  BOOT
  // =====================================================================
  function renderAll() {
    renderFeed();
    renderClues();
    renderFactors();
    renderHotspots();
    renderStageChrome();
    if (state.stage === 'desk') renderCloseup();
    renderHands(); // hides the phone outside Stage 1
    if (state.stage === 'attack') renderAttack();
    if (state.stage === 'done') {
      stopAttackTick();
      renderDone();
    } else {
      els.finalBanner.hidden = true;
      els.completion.innerHTML = '';
    }
    renderVaultCallout();
  }

  function startIntro() {
    if (!state.msgs.length && state.stage === 'desk') {
      state.msgs = ['intro_sam'];
      save();
      later(function () { say('intro_priya'); }, 1400);
    }
  }

  // ---------- Team sync ----------
  // state-sync merges the team's server state in every few seconds. A completion is only
  // ever taken away by an admin reset (the page reloads) or an admin "reopen" of this room.
  const bootResetVersion = (function () { try { return localStorage.getItem(TEAM_ID + '_reset_version'); } catch (_) { return null; } })();
  window.addEventListener('state-sync:applied', function (ev) {
    const synced = ev?.detail?.state || {};
    const syncedReset = synced.vault?.resetVersion;
    if (ev?.detail?.reset || (syncedReset && String(syncedReset) !== String(bootResetVersion))) return; // page reloads
    const done = synced.progress?.[ROOM] === true;

    if (done && !state.completed) {
      // Solved on another device, or marked complete by the facilitator.
      clearTimers();
      stopAttackTick();
      markDone();
      secureCodeWord();
      renderAll();
      return;
    }
    if (!done && state.completed) {
      // The facilitator reopened the room: start again.
      clearTimers();
      state = freshState();
      save();
      startIntro();
      renderAll();
      try { window.vault?.refresh?.(); } catch (_) {} // header tracker drops this room's tick
    }
  });

  function boot() {
    try { points?.ensure?.(); } catch (_) {}
    try {
      window.utils?.initStatusHud?.(ROOM, {
        score: '#mfaPointsTotal',
        delta: '#mfaPointsDelta',
        progressFill: '#mfaProgressFill',
        progressLabel: '#mfaProgressText'
      });
    } catch (_) {}

    syncHeaderSpace();
    window.addEventListener('resize', syncHeaderSpace);
    // The game clock pill can make the header wrap after boot, without a window resize.
    try { const bar = $('.site-header--bar'); if (bar && window.ResizeObserver) new ResizeObserver(syncHeaderSpace).observe(bar); } catch (_) {}
    // Timed messages or a remote unlock that were pending when the page was left.
    resumePending();
    startIntro();

    renderAll();
    if (state.stage === 'desk') setProgress();
    // Already solved (here or elsewhere): make sure the word is stored and the header ticked.
    if (state.completed && !window.vault?.isRoomComplete?.(ROOM)) secureCodeWord();
  }

  // The dashboard layout sizes the room to the space under the sticky site header.
  function syncHeaderSpace() {
    const bar = $('.site-header--bar');
    let px = 0;
    try { if (bar && getComputedStyle(bar).position === 'sticky') px = Math.round(bar.getBoundingClientRect().height); } catch (_) {}
    els.room.style.setProperty('--mfa-head', px + 'px');
  }

  window.addEventListener('pagehide', function () { clearTimers(); stopHandTick(); stopAttackTick(); });
  // Back/forward cache: pagehide stopped every timer and clock, so redraw and carry on.
  window.addEventListener('pageshow', function (ev) {
    if (!ev.persisted) return;
    renderAll();
    resumePending();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
