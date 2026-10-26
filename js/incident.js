/* incident.js — Incident Management room: "The Midnight Alert" (Cyber Escape Rooms)

   Story: 2:13 AM in the Ops Room at Larkspur. Ray, the night security guard,
   has called the team in because an alarm says customer records are leaking
   out. The team search the room and follow the Incident Playbook:

     1. Spot it  - log-in map + whiteboard + Alex's voicemail -> put the red
                   SUSPECT magnet on Alex Ellis (account used from Romania
                   while Alex is offline in Tasmania).
     2. Stop it  - break the glass for the Emergency Card, unplug ONLY the
                   Customer Records cable (cable map in the server cabinet),
                   and lock Alex's account on the Admin screen.
     3. Tell     - dial the Head of Security, the Privacy Officer and Alex's
                   manager on the desk phone (extensions on the phone list).
     4. Fix it   - printer tray warning (fitness app leak) + Admin screen
                   (Alex is the only account without a phone code) -> switch
                   the phone code ON.

   Points: wrong guess -2, breaking a "Never" rule -3 (Ray undoes it),
   hint -5. The leak counter is cosmetic.
   State: localStorage `${team}_incident_state` (cleared by admin reset).
   Vault key: incident (completion via window.vault.completeRoom).
*/

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function announce(msg) { try { window.a11y?.announce?.(msg); } catch (_) {} }

  if (!$('#irRoom') || !$('#irScene')) return;

  // ---------- Constants ----------
  const ROOM = 'incident';
  // Assembled at runtime so the word never appears in the page markup or source.
  const WORD = [66, 82, 69, 65, 67, 72].map((c) => String.fromCharCode(c)).join('');
  const COST = { wrong: 2, never: 3, hint: 5 };
  const LEAK = { start: 612408, rate: 37, max: 847291 };
  const STATE_VERSION = 3;
  const STEP_KEYS = ['spot', 'stop', 'tell', 'fix'];
  const STEP_TITLES = ['Spot it', 'Stop it', 'Tell', 'Fix it'];

  // Small inline icons (SVG, so they look the same on every device).
  const ICON = {
    lock: '<svg class="irc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    trash: '<svg class="irc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    mail: '<svg class="irc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    phone: '<svg class="irc-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
    hammer: '<svg class="irc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 4l6 6-3 3-6-6zM11 7L3 15l3 3 8-8"/></svg>',
    play: '<svg class="irc-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>'
  };
  const PIZZA_SVG = '<svg viewBox="0 0 90 52" aria-hidden="true"><path d="M14 30 L22 4 L76 4 L68 30 Z" fill="#c8a777"/><path d="M6 30 L84 30 L80 50 L10 50 Z" fill="#d9b98a"/><path d="M16 33 L74 33 L71 47 L19 47 Z" fill="#a0522d"/><path d="M45 40 L19 47 L22 34 Z" fill="#f4c542"/><path d="M45 40 L71 47 L68 34 Z" fill="#f4c542"/><g fill="#c0392b"><circle cx="27" cy="40" r="2.2"/><circle cx="62" cy="41" r="2.2"/></g><g fill="#ffe680"><rect x="32" y="38" width="4" height="3" rx="1"/><rect x="57" y="36.5" width="4" height="3" rx="1"/></g></svg>';

  const utils = window.utils;
  const points = utils?.points;
  const user = utils?.getUser?.() || null;
  const TEAM = String(user?.username || 'team').toLowerCase();
  const STATE_KEY = `${TEAM}_incident_state`;
  const RESET_KEY = `${TEAM}_reset_version`;

  // ---------- Content ----------
  const BOARD = [
    { id: 'alex', name: 'Alex Ellis', team: 'Finance', where: 'Annual leave. Back Monday!' },
    { id: 'ben', name: 'Ben Carter', team: 'Sales', where: 'Sales conference in Singapore (all week)' },
    { id: 'grace', name: 'Grace Ho', team: 'Finance', where: 'Holiday in Fiji. "I\'ll still check my emails!"' },
    { id: 'omar', name: 'Omar Haddad', team: 'IT', where: 'On call tonight, working from home (Sydney)' }
  ];
  const WRONG_FLAG = {
    ben: 'Ben\'s log-in checks out: he\'s at the conference in Singapore, and he typed the code sent to his phone.',
    grace: 'Grace is on holiday, but she said she\'d check her emails, and she typed the code sent to her phone. That log-in checks out.',
    omar: 'Omar is on call tonight from home in Sydney, and he used a phone code. That log-in checks out.'
  };

  // Map pins: x/y are % positions on the close-up map.
  const PINS = [
    { id: 'fiji', x: 94.6, y: 70.9, city: 'Nadi, Fiji', time: '7:30 PM', who: 'Grace Ho', team: 'Finance', code: true },
    { id: 'singapore', x: 56.2, y: 53.6, city: 'Singapore', time: '8:15 PM', who: 'Ben Carter', team: 'Sales', code: true },
    { id: 'sydney', x: 81.6, y: 85.5, city: 'Sydney, Australia', time: '10:02 PM', who: 'Omar Haddad', team: 'IT', code: true },
    { id: 'bucharest', x: 14.1, y: 14.5, city: 'Bucharest, Romania', time: '11:42 PM', who: 'Alex Ellis', team: 'Finance', code: false }
  ];

  const CABLES = [
    { id: 'blue', n: 1, colour: 'Blue', hex: '#3b82f6', system: 'Customer Records system' },
    { id: 'red', n: 2, colour: 'Red', hex: '#ef4444', system: 'Main internet line (the whole building)' },
    { id: 'green', n: 3, colour: 'Green', hex: '#22c55e', system: 'Phones' },
    { id: 'yellow', n: 4, colour: 'Yellow', hex: '#eab308', system: 'Payroll' },
    { id: 'white', n: 5, colour: 'White', hex: '#e5e7eb', system: 'Company website' }
  ];

  const STAFF = [
    { id: 'alex', name: 'Alex Ellis', team: 'Finance', code: false, last: '11:42 PM tonight, Bucharest, Romania' },
    { id: 'ben', name: 'Ben Carter', team: 'Sales', code: true, last: '8:15 PM tonight, Singapore' },
    { id: 'dana', name: 'Dana Wu', team: 'Security', code: true, last: '5:40 PM, Larkspur office' },
    { id: 'grace', name: 'Grace Ho', team: 'Finance', code: true, last: '7:30 PM tonight, Nadi, Fiji' },
    { id: 'helen', name: 'Helen Park', team: 'Finance', code: true, last: '6:05 PM, Larkspur office' },
    { id: 'omar', name: 'Omar Haddad', team: 'IT', code: true, last: '10:02 PM tonight, Sydney' }
  ];

  const PHONE_LIST = [
    { ext: '214', id: 'dana', name: 'Dana Wu', role: 'Head of Security', kind: 'right' },
    { ext: '118', id: 'chris', name: 'Chris Nolan', role: 'Facilities (building and car park)', kind: 'wrong' },
    { ext: '307', id: 'marcus', name: 'Marcus Reid', role: 'Privacy Officer', kind: 'right' },
    { ext: '520', id: 'social', name: 'Social Media Team', role: 'Runs our public accounts', kind: 'never' },
    { ext: '452', id: 'helen', name: 'Helen Park', role: 'Finance Team Manager', kind: 'right' }
  ];
  const REPORTER = { ext: '0491570737', display: '0491 570 737', id: 'tom', name: 'Tom Baxter', role: 'Reporter, Daily Herald', kind: 'never' };
  const CALL_ORDER = ['dana', 'marcus', 'helen'];

  const SETTINGS = [
    { id: 'yearly', label: 'Password must change every 12 months', sub: 'Everyone picks a new password each January' },
    { id: 'phonecode', label: 'Phone code at sign-in', sub: 'Signing in needs the password AND a code sent to the person\'s own phone', right: true },
    { id: 'screen', label: 'Lock the screen after 5 minutes idle', sub: 'Locks Alex\'s office computer when nobody is using it' }
  ];
  const WRONG_SETTING = {
    yearly: 'A yearly password change wouldn\'t have stopped this. Whenever a password leaks, a password on its own still lets criminals in. What would stop someone who already HAS the password?',
    screen: 'That protects a computer left switched on in the office. The criminals were in Romania, not sitting at Alex\'s desk.'
  };

  const WHO = {
    ray: 'Ray (night security)',
    dana: 'Dana Wu (Head of Security)',
    marcus: 'Marcus Reid (Privacy Officer)',
    helen: 'Helen Park (Finance Team Manager)',
    chris: 'Chris Nolan (Facilities)'
  };
  const MSGS = {
    intro1: { who: 'ray', text: 'Thanks for coming in so fast. That alarm has been going since 11:47 and the number on the screen just keeps going up. I don\'t know computers, so it\'s all yours.' },
    intro2: { who: 'ray', text: 'The IT team left an <strong>Incident Playbook</strong> for nights like this: look for the Playbook panel. Step 1 says find out who\'s behind it. Have a look around, click anything!' },
    vm: { who: 'ray', text: 'Tasmania? No signal for a week? Lucky Alex.' },
    pizza: { who: 'ray', text: 'Oi, hands off, that\'s my dinner.' },
    card: { who: 'ray', text: 'That reporter came sniffing around last week asking questions. He left his card on the desk.' },
    s1_done: { who: 'ray', tone: 'warn', text: 'Hang on. Alex is up a mountain in Tasmania with no signal&hellip; so someone in <strong>Romania</strong> is using Alex\'s account? And the leak started five minutes later?!' },
    s1_done2: { who: 'ray', text: 'Playbook step 2 says <strong>stop it</strong>. And look, that red <strong>BREAK GLASS</strong> box on the wall. I\'ve always wanted to break that.' },
    glass: { who: 'ray', text: 'Ha! That was very satisfying. What does the card inside say?' },
    cable_ok: { who: 'ray', text: 'Blue cable\'s out. The Customer Records system is cut off from the internet.' },
    lock_ok: { who: 'ray', text: 'Alex\'s account is locked. Nobody can sign in with it now, not even the crook.' },
    one_more: { who: 'ray', text: 'One down. The Emergency Card says to do <strong>two</strong> things straight away.' },
    contained: { who: 'ray', tone: 'good', text: 'The counter\'s stopped! And the alarm lights have gone off. Phew. You stopped the leak.' },
    contained2: { who: 'ray', text: 'So&hellip; who do we wake up at this hour? That\'s Playbook step 3. There\'s a phone list taped next to the desk phone.' },
    never_red: { who: 'ray', tone: 'warn', text: 'Whoa, the WHOLE building just went dark! The card says never do that: it stops everyone working and doesn\'t help. I\'ve plugged it back in.' },
    never_delete: { who: 'ray', tone: 'warn', text: 'Stop! I hit Undo just in time. Deleting the account would destroy the evidence the investigators need. The card says never delete anything.' },
    never_message: { who: 'ray', tone: 'warn', text: 'I unsent it just in time! The crook is signed in as Alex, so they\'d read it and know we\'re onto them. The card says never message the hacked account.' },
    never_social: { who: 'ray', tone: 'warn', text: 'I grabbed the handset and hung up! The social media team would have posted about it publicly. The Playbook says never go public first.' },
    never_tom: { who: 'ray', tone: 'warn', text: 'I hung up before it rang! Telling a reporter makes it public before the facts are known and before customers are told properly. Never go public first.' },
    call_dana: { who: 'dana', tone: 'good', text: 'Thanks for calling. I\'m on my way in and I\'ll take charge from here. Great work stopping the leak.' },
    call_marcus: { who: 'marcus', tone: 'good', text: 'Customers\' payment details? Thank you for calling straight away. I\'ll decide how and when customers are told. Please don\'t contact them yourselves.' },
    call_helen: { who: 'helen', tone: 'good', text: 'Alex is hiking in Tasmania, so that definitely wasn\'t Alex! I\'ll let Alex know first thing Monday. Thanks for telling me.' },
    call_chris: { who: 'chris', text: 'Uh&hellip; hello? It\'s 2 AM. The building and the car park are fine. I don\'t think I\'m who you need.' },
    tell_done: { who: 'ray', tone: 'good', text: 'That\'s all three people on the Playbook\'s list, and nobody went public. Nice.' },
    dana_fix: { who: 'dana', text: 'Dana again. I\'ve reset Alex\'s password. Funny thing: it was exactly the same as the one Alex uses for a fitness app. Playbook step 4: work out how they got it, and <strong>close that door</strong> so this can\'t happen again.' },
    printer_nudge: { who: 'ray', text: 'Speaking of which, that printer has been beeping since yesterday afternoon. Nobody ever collected the page.' },
    fix_done: { who: 'dana', tone: 'good', text: 'Phone code switched on. Even with a leaked password, nobody gets in without Alex\'s phone. Case closed. Brilliant work, team!' }
  };
  const FOLLOW = { intro1: 'intro2', s1_done: 's1_done2', contained: 'contained2', tell_done: 'dana_fix', dana_fix: 'printer_nudge' };
  const REPEATABLE = { never_red: 1, never_delete: 1, never_message: 1, never_social: 1, never_tom: 1, call_chris: 1, one_more: 0 };

  const CLUES = {
    alarm: '<b>Alarm screen:</b> since 11:47 PM, customer records are being copied from the <b>Customer Records system</b> to an unknown computer overseas.',
    map: '<b>Log-in map (tonight):</b> Grace, Nadi, Fiji, 7:30 PM &middot; Ben, Singapore, 8:15 PM &middot; Omar, Sydney, 10:02 PM &middot; Alex, Bucharest, Romania, 11:42 PM. Everyone used a phone code except Alex.',
    board: '<b>Whiteboard:</b> Alex on annual leave &middot; Ben at a conference in Singapore &middot; Grace on holiday in Fiji (checking emails) &middot; Omar on call from home.',
    voicemail: '<b>Voicemail from Alex (Friday 5:58 PM):</b> hiking in Tasmania, <b>no phone signal or internet</b> until Monday. Anything urgent: talk to Alex\'s manager, <b>Helen</b>.',
    ecard: '<b>Emergency Card:</b> do straight away: cut off ONLY the leaking system, and lock the account the intruder is using. Never delete anything, cut off the whole building, or message the hacked account.',
    cablemap: '<b>Cable map:</b> 1 Blue = Customer Records &middot; 2 Red = whole-building internet &middot; 3 Green = phones &middot; 4 Yellow = payroll &middot; 5 White = website.',
    admin: '<b>Admin screen:</b> Alex Ellis is the only account with the phone code at sign-in switched <b>OFF</b>.',
    phonelist: '<b>Phone list:</b> Dana Wu, Head of Security 214 &middot; Chris Nolan, Facilities 118 &middot; Marcus Reid, Privacy Officer 307 &middot; Social Media Team 520 &middot; Helen Park, Finance Team Manager 452.',
    reporter: '<b>Business card:</b> Tom Baxter, reporter at the Daily Herald, 0491 570 737.',
    printout: '<b>Printer tray (unread since yesterday):</b> FitTracker, a fitness app Alex uses, was hacked. Alex\'s password from it was posted online for anyone to see.'
  };

  const PLAYBOOK = {
    1: '<p>Something set off the alarm. Find out <strong>whose account</strong> is being used.</p><p>Look at what\'s happening, where everyone is this week, and who logged in tonight. When a log-in doesn\'t add up, put the <strong>red SUSPECT magnet</strong> on that person\'s name on the whiteboard.</p>',
    2: '<p>Stop the damage getting worse, <strong>fast</strong>.</p><p>The <strong>Emergency Card</strong> in the red BREAK GLASS box on the wall says exactly what to do.</p>',
    3: '<p>Call these three people, even in the middle of the night:</p><ul><li>the <strong>Head of Security</strong>: they take charge</li><li>the <strong>Privacy Officer</strong>, whenever customers\' personal details are involved</li><li>the <strong>manager</strong> of the person whose account was used</li></ul><p>Use the desk phone. <strong>Never</strong> go public first: no reporters, no social media, and don\'t contact customers yourself.</p>',
    4: '<p>Find out <strong>how</strong> they got in, then close that door, so a stolen password on its own can never get in again.</p><p>Account settings are on the Admin screen.</p>'
  };
  const DONE_NOTES = {
    1: 'Someone in Romania was using Alex\'s account while Alex was offline in Tasmania.',
    2: 'Customer Records cut off from the internet and Alex\'s account locked. Nothing deleted.',
    3: 'Called the Head of Security, the Privacy Officer and Alex\'s manager. Nobody went public.',
    4: 'A leaked fitness-app password was reused at work, and Alex had no phone code. Phone code now ON.'
  };

  const HINTS = {
    spot: [
      'Start with the three screens on the wall. One of them is a map of everyone who logged in from outside the office tonight. Compare it with the whiteboard.',
      'Two people on the whiteboard are on holiday, but only one of them could not possibly have logged in tonight. The desk phone has a voicemail you should listen to.',
      'Alex is hiking in Tasmania with no phone signal, yet "Alex" logged in from Romania without a phone code. Open the Whiteboard, pick up the red magnet and put it on Alex Ellis.'
    ],
    stop: [
      'The Playbook says to follow the Emergency Card. It\'s inside the red BREAK GLASS box on the wall.',
      'The card asks for two things: cut off only the leaking system (the Alarm screen says which system; the cable map is inside the Server cabinet door), and lock the account the intruder is using (on the Admin screen).',
      'Open the Server cabinet and unplug cable 1 (blue, Customer Records). Then on the Admin screen open Alex Ellis and press "Lock account".'
    ],
    tell: [
      'The Playbook lists three people to call. Their numbers are on the phone list taped next to the desk phone.',
      'Customers\' payment details were copied, so you need the Privacy Officer. For the manager: whose account was used, and what did their voicemail say?',
      'On the desk phone dial 214 (Dana, Head of Security), 307 (Marcus, Privacy Officer) and 452 (Helen, Alex\'s manager), pressing Call after each one.'
    ],
    fix: [
      'A page has been waiting in the Printer since yesterday. Read it, then look at the Admin screen.',
      'The criminals already had Alex\'s real password from the fitness app leak. On the Admin screen, which setting is different for Alex than for everyone else?',
      'Open the Admin screen, click Alex Ellis, and switch "Phone code at sign-in" ON.'
    ]
  };

  // ---------- State ----------
  function readResetVersion() {
    try { return localStorage.getItem(RESET_KEY) || null; } catch (_) { return null; }
  }

  function freshState() {
    return {
      v: STATE_VERSION,
      resetVersion: readResetVersion(),
      startedAt: Date.now(),
      step: 1,               // 1 spot, 2 stop, 3 tell, 4 fix
      complete: false,
      seen: {},              // item -> inspected
      focus: null,           // item in the close-up
      clues: [],             // evidence ids, in the order found
      msgs: [],              // feed message ids shown
      hints: {},             // step key -> hints revealed
      page: null,            // Playbook tab being viewed (null = current step)
      flagged: false,
      pin: null,
      vmHeard: false,
      glassBroken: false,
      cabOpen: false,
      cablePulled: false,
      acctLocked: false,
      adminView: 'list',
      leakFinal: null,
      calls: [],
      printoutRead: false
    };
  }

  function solvedState() {
    const s = freshState();
    Object.assign(s, {
      step: 4, complete: true, flagged: true, vmHeard: true, glassBroken: true, cabOpen: true, cablePulled: true,
      acctLocked: true, calls: CALL_ORDER.slice(), printoutRead: true, leakFinal: LEAK.start + 11000,
      clues: Object.keys(CLUES), msgs: ['fix_done']
    });
    return s;
  }

  function loadState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (_) { s = null; }
    try { localStorage.removeItem('incident_state'); } catch (_) {}
    if (!s || s.v !== STATE_VERSION) return freshState();
    const rv = readResetVersion();
    if (rv && s.resetVersion != null && String(s.resetVersion) !== String(rv)) return freshState();
    const merged = Object.assign(freshState(), s);
    if (!Array.isArray(merged.clues)) merged.clues = [];
    if (!Array.isArray(merged.msgs)) merged.msgs = [];
    if (!Array.isArray(merged.calls)) merged.calls = [];
    merged.hints = merged.hints || {};
    merged.seen = merged.seen || {};
    return merged;
  }

  function save() {
    if (state.resetVersion == null) state.resetVersion = readResetVersion();
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function vaultSolved() {
    try { return !!window.vault?.isRoomComplete?.(ROOM); } catch (_) { return false; }
  }
  function progressFlag() {
    try { return (utils?.readProgress?.() || {})[ROOM] === true; } catch (_) { return false; }
  }

  let state = loadState();

  // Keep the saved room in line with the shared vault.
  if (state.complete && !vaultSolved() && !progressFlag()) {
    // The team was reset by the admin: start over.
    state = freshState();
  } else if (!state.complete && (vaultSolved() || progressFlag())) {
    // Solved on another device or in another session: show the solved room.
    state = solvedState();
  }
  if (state.complete && !vaultSolved()) {
    // Room is marked done but this device lost the word: restore it.
    try { window.vault?.completeRoom?.(ROOM, WORD, { message: `Code word ${WORD} secured.` }); } catch (_) {}
  }
  save();

  // Things that only live while the page is open.
  const live = { holding: false, dial: '', lcd: '', calling: false, playing: false, fb: null, justBroke: false, justClosed: false, yank: null };

  // ---------- Helpers ----------
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }

  function h(tag, attrs, html) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    if (html != null) el.innerHTML = html;
    return el;
  }
  function button(cls, html, onClick, attrs) {
    const b = h('button', Object.assign({ class: cls, type: 'button' }, attrs || {}), html);
    b.addEventListener('click', onClick);
    return b;
  }
  function spend(amount, reason) { try { points?.spend?.(amount, reason); } catch (_) {} }
  function isSmall() { return !!(window.matchMedia && window.matchMedia('(max-width: 960px)').matches); }
  function reduceMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function fmt(n) { return Number(n).toLocaleString('en-AU'); }

  // Scroll a panel (never the page) just enough to show el. A tall el is shown from its top.
  // In the close-up, the feedback line pinned to the bottom of the panel is allowed for.
  function revealIn(panel, el, smooth) {
    if (!panel || !el || panel.scrollHeight <= panel.clientHeight) return;
    const p = panel.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const gap = 8;
    const bottom = p.bottom - (parseFloat(panel.style.getPropertyValue('--ir-fb-h')) || 0);
    let delta = 0;
    if (r.top < p.top + gap) delta = r.top - p.top - gap;
    else if (r.bottom > bottom - gap) delta = Math.min(r.bottom - bottom + gap, r.top - p.top - gap);
    if (!delta) return;
    const top = panel.scrollTop + delta;
    try { panel.scrollTo({ top, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' }); } catch (_) { panel.scrollTop = top; }
  }

  function setPct(n) {
    if (state.complete) return;
    try {
      const cur = utils?.getProgressPercent?.(ROOM) || 0;
      if (n > cur && n < 100) utils?.setProgressPercent?.(ROOM, n);
    } catch (_) {}
  }

  const els = {
    room: $('#irRoom'),
    scene: $('#irScene'),
    closeup: $('#irCloseup'),
    feed: $('#irFeed'),
    pill: $('#irPill'),
    pillTitle: $('#irStepTitle'),
    hintBtn: $('#irHintBtn'),
    hintText: $('#irHintText'),
    leak: $('#irLeak'),
    leakText: $('#irLeakText'),
    leakCount: $('#irLeakCount'),
    tabs: $('#irTabs'),
    page: $('#irPage'),
    book: $('#irBook'),
    bookCount: $('#irBookCount'),
    evidence: $('#irEvidence'),
    complete: $('#irComplete'),
    vaultValue: $('#irVaultValue')
  };

  // ---------- Leak counter ----------
  function leakNow() {
    if (state.leakFinal != null) return state.leakFinal;
    const secs = Math.max(0, (Date.now() - (state.startedAt || Date.now())) / 1000);
    return Math.min(LEAK.max, Math.round(LEAK.start + secs * LEAK.rate));
  }
  function phase() {
    if (state.complete) return 'clear';
    if (state.leakFinal != null) return 'calm';
    return 'alarm';
  }
  function renderLeak() {
    const p = phase();
    els.leak.dataset.state = p === 'alarm' ? 'live' : (p === 'calm' ? 'stopped' : 'clear');
    els.leakText.textContent = p === 'alarm'
      ? 'LIVE: customer records being copied out of Larkspur'
      : (p === 'calm' ? 'LEAK STOPPED: records copied before you cut it off' : 'ALL CLEAR: the leak was stopped at');
    const n = fmt(leakNow());
    els.leakCount.textContent = n;
    const alarmCount = $('#ircAlarmCount');
    if (alarmCount) alarmCount.textContent = n;
  }
  setInterval(() => { if (state.leakFinal == null) renderLeak(); }, 1000);

  // ---------- Feed (Ray's radio) ----------
  function renderFeed(newId) {
    const keep = els.feed.scrollTop; // rebuilding resets the scroll; restore it so the glide starts from where it was
    els.feed.innerHTML = '';
    state.msgs.forEach((id, i) => {
      const m = MSGS[id];
      if (!m) return;
      const isNew = id === newId && i === state.msgs.length - 1;
      const el = h('div', { class: 'ir-msg' + (m.tone ? ' is-' + m.tone : '') + (isNew ? ' is-new' : '') });
      el.appendChild(h('span', { class: 'ir-msg__who ir-msg__who--' + m.who, text: WHO[m.who] }));
      el.appendChild(h('span', null, m.text));
      els.feed.appendChild(el);
    });
    els.feed.scrollTop = keep;
    showNewestMsg(!!newId);
  }
  // Keep the newest radio message in view inside the feed (from its top, if it is taller than the panel).
  function showNewestMsg(smooth) {
    const last = els.feed.lastElementChild;
    if (!last) return;
    const pad = parseFloat(getComputedStyle(els.feed).paddingTop) || 0;
    const top = Math.min(last.offsetTop - pad, els.feed.scrollHeight - els.feed.clientHeight);
    try { els.feed.scrollTo({ top, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' }); } catch (_) { els.feed.scrollTop = top; }
  }
  function say(id, noFollow) {
    const m = MSGS[id];
    if (!m) return;
    if (id === 'printer_nudge' && state.printoutRead) return;
    if (!REPEATABLE[id] && state.msgs.includes(id)) return;
    state.msgs.push(id);
    if (state.msgs.length > 40) state.msgs = state.msgs.slice(-40);
    save();
    renderFeed(id);
    announce(WHO[m.who] + ': ' + h('div', null, m.text).textContent);
    if (!noFollow && FOLLOW[id]) later(() => say(FOLLOW[id]), 1600);
  }
  // A follow-up message that was still pending when the page was left.
  function flushFollowUps() {
    let changed = true;
    while (changed) {
      changed = false;
      state.msgs.slice().forEach((id) => {
        const next = FOLLOW[id];
        if (next && !state.msgs.includes(next) && !(next === 'printer_nudge' && state.printoutRead)) {
          state.msgs.push(next);
          changed = true;
        }
      });
    }
  }

  // ---------- Evidence ----------
  function addClue(id) {
    if (!CLUES[id] || state.clues.includes(id)) return;
    state.clues.push(id);
    save();
    renderEvidence(id);
  }
  function renderEvidence(newId) {
    els.evidence.innerHTML = '';
    if (!state.clues.length) {
      els.evidence.appendChild(h('li', { class: 'ir-evidence__empty' }, 'Nothing yet. Inspect things in the Ops Room: anything useful gets written down here.'));
      return;
    }
    state.clues.forEach((id) => {
      els.evidence.appendChild(h('li', { class: id === newId ? 'is-new' : '' }, CLUES[id]));
    });
    if (newId) revealIn(els.evidence, $('.is-new', els.evidence), true);
  }

  // ---------- Playbook ----------
  function viewingPage() {
    const max = state.complete ? 4 : state.step;
    if (state.page && state.page >= 1 && state.page <= max) return state.page;
    return state.complete ? 4 : state.step;
  }
  function stepDone(i) { return state.complete || i < state.step; }

  function renderBook() {
    const view = viewingPage();
    els.tabs.innerHTML = '';
    for (let i = 1; i <= 4; i++) {
      const done = stepDone(i);
      const current = !state.complete && i === state.step;
      const locked = !state.complete && i > state.step;
      const tab = button('ir-tab' + (done ? ' is-done' : '') + (current ? ' is-current' : ''),
        '<span class="ir-tab__n" aria-hidden="true">' + (done ? '&#10003;' : i) + '</span><span class="ir-tab__t">' + STEP_TITLES[i - 1] + '</span>',
        () => { state.page = i; save(); renderBook(); const t = $$('.ir-tab', els.tabs)[i - 1]; if (t) t.focus({ preventScroll: true }); },
        { role: 'tab', 'aria-selected': String(view === i), 'aria-label': `Step ${i}: ${STEP_TITLES[i - 1]}${done ? ' (done)' : current ? ' (now)' : locked ? ' (locked)' : ''}` });
      if (locked) tab.disabled = true;
      els.tabs.appendChild(tab);
    }
    els.page.innerHTML = '';
    els.page.appendChild(h('h4', null, `Step ${view}: ${STEP_TITLES[view - 1]}`));
    els.page.appendChild(h('div', null, PLAYBOOK[view]));
    if (stepDone(view)) els.page.appendChild(h('p', { class: 'ir-page__done' }, '&#10003; Done: ' + DONE_NOTES[view]));
    els.bookCount.textContent = state.complete ? 'Case closed' : `Step ${state.step} of 4`;
    els.book.classList.toggle('is-closed', !!state.complete);
    const oldStamp = $('.ir-stamp', els.book);
    if (oldStamp) oldStamp.remove();
    if (state.complete) {
      els.book.appendChild(h('div', { class: 'ir-stamp' + (live.justClosed ? ' is-new' : ''), 'aria-hidden': 'true' }, 'CASE CLOSED'));
    }
  }

  // ---------- Hints + chrome ----------
  function hintKey() { return state.complete ? null : STEP_KEYS[state.step - 1]; }
  function renderHint() {
    const key = hintKey();
    if (!key) { els.hintBtn.hidden = true; els.hintText.hidden = true; return; }
    const list = HINTS[key];
    const shown = Math.min(state.hints[key] || 0, list.length);
    els.hintBtn.hidden = false;
    if (shown) {
      els.hintText.innerHTML = '';
      list.slice(0, shown).forEach((t, i) => els.hintText.appendChild(h('div', { text: `Hint ${i + 1}: ${t}` })));
      els.hintText.hidden = false;
      els.hintText.scrollTop = els.hintText.scrollHeight; // the box is capped on wide screens: show the newest hint
    } else {
      els.hintText.hidden = true;
    }
    if (shown >= list.length) {
      els.hintBtn.disabled = true;
      els.hintBtn.textContent = 'No more hints';
    } else {
      els.hintBtn.disabled = false;
      els.hintBtn.textContent = `Hint ${shown + 1} of ${list.length} (−${COST.hint} pts)`;
    }
  }
  els.hintBtn.addEventListener('click', () => {
    const key = hintKey();
    if (!key) return;
    const shown = state.hints[key] || 0;
    if (shown >= HINTS[key].length) return;
    state.hints[key] = shown + 1;
    spend(COST.hint, 'Incident room hint');
    save();
    renderHint();
    announce('Hint: ' + HINTS[key][shown]);
  });

  function renderChrome() {
    els.pill.classList.remove('is-calm', 'is-done');
    if (state.complete) {
      els.pill.classList.add('is-done');
      els.pillTitle.textContent = 'Case closed';
    } else {
      if (state.leakFinal != null) els.pill.classList.add('is-calm');
      els.pillTitle.textContent = `Step ${state.step} of 4: ${STEP_TITLES[state.step - 1]}`;
    }
    renderHint();
    renderLeak();
  }

  // ---------- Scene ----------
  function renderScene() {
    const s = els.scene;
    s.dataset.phase = phase();
    s.classList.toggle('is-flagged', !!state.flagged);
    s.classList.toggle('is-glass-broken', !!state.glassBroken);
    s.classList.toggle('is-vm-heard', !!state.vmHeard);
    s.classList.toggle('is-printout-read', !!state.printoutRead);
    s.classList.toggle('is-cable-pulled', !!state.cablePulled);
    $$('.irx-hot', s).forEach((b) => {
      b.classList.toggle('is-seen', !!state.seen[b.dataset.item]);
      b.classList.toggle('is-active', state.focus === b.dataset.item);
    });
  }
  $$('.irx-hot', els.scene).forEach((b) => b.addEventListener('click', () => inspect(b.dataset.item, true)));

  function blackout() {
    els.scene.classList.add('is-blackout');
    later(() => els.scene.classList.remove('is-blackout'), 1300);
  }

  // ---------- Close-up ----------
  function inspect(item, userAction) {
    if (state.focus !== item) { live.fb = null; live.holding = false; }
    if (userAction) live.fb = null;
    state.focus = item;
    state.seen[item] = true;
    save();
    renderScene();
    renderCloseup();
    if (userAction) {
      try { els.closeup.focus({ preventScroll: true }); } catch (_) {}
      if (isSmall()) { try { els.closeup.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (_) {} }
    }
  }

  function shell(eyebrow, title) {
    els.closeup.innerHTML = '';
    els.closeup.appendChild(h('p', { class: 'irc-eyebrow' }, eyebrow));
    els.closeup.appendChild(h('h3', null, title));
    return els.closeup;
  }

  function setFb(text, tone) {
    live.fb = text ? { item: state.focus, text, tone: tone || 'info' } : null;
    const el = $('#ircFb', els.closeup);
    if (el) {
      el.className = 'irc-fb' + (text ? ' is-' + (tone || 'info') : '');
      el.textContent = text || '';
    }
    syncFbSpace();
    // Don't let the (pinned) feedback cover the control the player is using.
    const active = document.activeElement;
    if (text && active && active !== els.closeup && els.closeup.contains(active)) revealIn(els.closeup, active);
    if (text) announce(text);
  }
  // On wide screens the feedback line is pinned to the bottom of the close-up panel: tell the CSS how
  // tall it is, so the whiteboard's magnet dock (also pinned) sits just above it.
  function syncFbSpace() {
    const el = $('#ircFb', els.closeup);
    const pinned = el && el.textContent && getComputedStyle(el).position === 'sticky';
    els.closeup.style.setProperty('--ir-fb-h', (pinned ? el.offsetHeight : 0) + 'px');
  }
  function fbEl() {
    const el = h('p', { class: 'irc-fb', id: 'ircFb', role: 'status' });
    if (live.fb && live.fb.item === state.focus) {
      el.className = 'irc-fb is-' + live.fb.tone;
      el.textContent = live.fb.text;
    }
    return el;
  }

  // Re-render the close-up and put keyboard focus back on the same control.
  function rerender(focusSel) {
    renderCloseup();
    if (focusSel) {
      const el = $(focusSel, els.closeup);
      if (el) { try { el.focus({ preventScroll: true }); } catch (_) {} revealIn(els.closeup, el); }
    }
  }

  function notYet(needStep) {
    const what = needStep === 1 ? 'work out who\'s behind this first (step 1: Spot it)'
      : needStep === 2 ? 'stop the leak first (step 2: Stop it)'
        : needStep === 3 ? 'tell the right people first (step 3: Tell)' : 'follow the steps in order';
    setFb(`Ray: Hold your horses! The Playbook says to ${what}.`, 'info');
  }

  const RENDERERS = {
    alarm: renderAlarm,
    map: renderMap,
    admin: renderAdmin,
    board: renderBoard,
    glass: renderGlass,
    cabinet: renderCabinet,
    phone: renderPhone,
    card: renderCard,
    pizza: renderPizza,
    printer: renderPrinter
  };

  function renderCloseup() {
    const item = state.focus;
    // The close-up scrolls inside its panel on wide screens: keep the place when the same thing re-draws.
    const keep = els.closeup.dataset.item === String(item) ? els.closeup.scrollTop : 0;
    els.closeup.dataset.item = String(item);
    if (!item || !RENDERERS[item]) {
      els.closeup.innerHTML = '<p class="irc-empty">Nothing picked up yet. Click something in the Ops Room to look at it up close.</p>';
      return;
    }
    RENDERERS[item]();
    els.closeup.appendChild(fbEl());
    syncFbSpace();
    els.closeup.scrollTop = keep;
  }

  // --- Alarm screen ---
  function renderAlarm() {
    const c = shell('Wall monitor 1', 'The alarm screen');
    const p = phase();
    const scr = h('div', { class: 'irc-screen irc-alarm' + (p === 'calm' ? ' is-stopped' : p === 'clear' ? ' is-clear' : '') });
    scr.appendChild(h('div', { class: 'irc-screen__bar' }, '<i></i><i></i><i></i>Larkspur security alarm'));
    const title = p === 'alarm' ? '&#9888; Customer records are leaving the company'
      : p === 'calm' ? 'Leak stopped. Investigation in progress.' : 'ALL CLEAR';
    scr.appendChild(h('p', { class: 'irc-alarm__title' }, title));
    const status = p === 'alarm' ? '<dd class="irc-red">Still happening</dd>' : p === 'calm' ? '<dd class="irc-orange">Stopped</dd>' : '<dd class="irc-green">All clear</dd>';
    scr.appendChild(h('dl', { class: 'irc-dl' },
      '<dt>Started</dt><dd>11:47 PM</dd>' +
      '<dt>Leaving from</dt><dd>Customer Records system</dd>' +
      '<dt>What</dt><dd>Customer names, addresses and payment details</dd>' +
      '<dt>Going to</dt><dd>An unknown computer overseas</dd>' +
      '<dt>Status</dt>' + status +
      '<dt>Records copied</dt><dd id="ircAlarmCount">' + fmt(leakNow()) + '</dd>'));
    c.appendChild(scr);
    addClue('alarm');
  }

  // --- Log-in map ---
  const MAP_SVG = '<svg viewBox="0 0 185 110" aria-hidden="true" preserveAspectRatio="none">' +
    '<rect width="185" height="110" fill="#0b1a2c"/>' +
    '<g stroke="#13304d" stroke-width=".4"><path d="M0 20H185M0 40H185M0 60H185M0 80H185M0 100H185M30 0V110M60 0V110M90 0V110M120 0V110M150 0V110M180 0V110"/></g>' +
    '<g fill="#1f3b5c">' +
    '<path d="M0 2 L40 0 L46 10 L40 20 L28 24 L15 22 L5 24 L0 14 Z"/>' +
    '<path d="M0 27 L12 25 L34 28 L50 47 L44 60 L32 95 L22 93 L15 70 L10 56 L0 50 Z"/>' +
    '<path d="M40 0 L150 0 L146 14 L140 24 L126 34 L110 50 L102 40 L86 42 L74 33 L62 36 L46 21 L46 10 Z"/>' +
    '<ellipse cx="108" cy="62" rx="7" ry="2.2"/><ellipse cx="122" cy="64" rx="6" ry="2"/><ellipse cx="136" cy="63" rx="6" ry="2.5"/>' +
    '<path d="M114 82 L124 72 L136 70 L143 74 L151 82 L154 92 L147 99 L133 96 L119 97 Z"/>' +
    '<path d="M170 92 L174 94 L172 104 L167 103 Z"/><circle cx="175" cy="78" r="1.4"/>' +
    '</g></svg>';
  const PIN_SVG = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 29 C12 29 2 17 2 11 A10 10 0 0 1 22 11 C22 17 12 29 12 29 Z" fill="#ff5555" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="11" r="3.6" fill="#fff"/></svg>';

  function pinText(pin) {
    return `${pin.time}: ${pin.who} (${pin.team}) from ${pin.city}. ${pin.code ? 'Password + phone code' : 'Password only, no phone code'}.`;
  }
  function choosePin(id, focusSel) {
    state.pin = id;
    save();
    rerender(focusSel);
    const pin = PINS.find((p) => p.id === id);
    if (pin) announce(pinText(pin));
  }

  function renderMap() {
    const c = shell('Wall monitor 2', 'Tonight\'s log-in map');
    c.appendChild(h('p', null, 'Everyone who signed in to Larkspur from <strong>outside the office</strong> tonight (Sydney time). Click a pin.'));
    const scr = h('div', { class: 'irc-screen' });
    scr.appendChild(h('div', { class: 'irc-screen__bar' }, '<i></i><i></i><i></i>Remote log-ins tonight'));
    const map = h('div', { class: 'irc-map' }, MAP_SVG);
    PINS.forEach((pin) => {
      const b = button('irc-pin' + (state.pin === pin.id ? ' is-on' : ''), PIN_SVG, () => choosePin(pin.id, `.irc-pin[data-pin="${pin.id}"]`),
        { 'data-pin': pin.id, 'aria-label': `Pin: ${pin.city}`, 'aria-pressed': String(state.pin === pin.id), style: `left:${pin.x}%;top:${pin.y}%` });
      map.appendChild(b);
    });
    scr.appendChild(map);
    const chips = h('div', { class: 'irc-pinlist', role: 'group', 'aria-label': 'Log-ins by time' });
    PINS.forEach((pin) => {
      chips.appendChild(button('irc-chip', `${pin.time} &middot; ${pin.city.split(',')[0]}`, () => choosePin(pin.id, `.irc-chip[data-chip="${pin.id}"]`),
        { 'data-chip': pin.id, 'aria-pressed': String(state.pin === pin.id) }));
    });
    scr.appendChild(chips);
    const sel = PINS.find((p) => p.id === state.pin);
    if (sel) {
      scr.appendChild(h('div', { class: 'irc-pincard', role: 'status' },
        `<b>${sel.time}</b> &middot; <b>${sel.who}</b> (${sel.team})<br>Signed in from: <b>${sel.city}</b><br>How: ` +
        (sel.code ? '<span class="irc-green">password + phone code</span>' : '<span class="irc-orange">password only (no phone code)</span>')));
    } else {
      scr.appendChild(h('div', { class: 'irc-pincard irc-note' }, 'Pick a pin (or a time above) to see who signed in.'));
    }
    c.appendChild(scr);
    c.appendChild(h('p', { class: 'irc-note' }, '"Phone code" means they also typed a code sent to their own phone.'));
    addClue('map');
  }

  // --- Admin screen ---
  function renderAdmin() {
    const c = shell('Wall monitor 3', 'The admin screen');
    const scr = h('div', { class: 'irc-screen' });
    scr.appendChild(h('div', { class: 'irc-screen__bar' }, '<i></i><i></i><i></i>Larkspur admin &middot; staff accounts'));
    const view = state.adminView && state.adminView !== 'list' ? STAFF.find((p) => p.id === state.adminView) : null;
    if (!view) {
      const table = h('table', { class: 'irc-table' });
      table.appendChild(h('thead', null, '<tr><th scope="col">Name</th><th scope="col">Team</th><th scope="col">Phone code at sign-in</th></tr>'));
      const tb = h('tbody');
      STAFF.forEach((p) => {
        const tr = h('tr');
        const td = h('td');
        td.appendChild(button('irc-rowbtn', p.name, () => { state.adminView = p.id; save(); rerender('.irc-back'); }, { 'data-staff': p.id }));
        tr.appendChild(td);
        tr.appendChild(h('td', { text: p.team }));
        tr.appendChild(h('td', { class: p.code ? 'irc-green' : 'irc-orange', text: p.code ? 'ON' : 'OFF' }));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      scr.appendChild(table);
      scr.appendChild(h('p', { class: 'irc-note', style: 'margin:.5rem 0 0' }, 'Phone codes were switched on for everyone last year. Click a name to open the account.'));
      c.appendChild(scr);
      addClue('admin');
      return;
    }

    scr.appendChild(button('irc-rowbtn irc-back', '&larr; All accounts', () => { state.adminView = 'list'; save(); rerender(`.irc-rowbtn[data-staff="${view.id}"]`); }));
    const acct = h('div', { class: 'irc-acct' });
    acct.appendChild(h('h4', null, view.name));
    const locked = view.id === 'alex' && state.acctLocked;
    const codeOn = view.code || (view.id === 'alex' && state.complete);
    acct.appendChild(h('dl', { class: 'irc-dl' },
      `<dt>Team</dt><dd>${view.team}</dd>` +
      `<dt>Status</dt><dd class="${locked ? 'irc-orange' : ''}">${locked ? 'LOCKED' : 'Active'}</dd>` +
      `<dt>Phone code</dt><dd class="${codeOn ? 'irc-green' : 'irc-orange'}">${codeOn ? 'ON' : 'OFF'}</dd>` +
      `<dt>Last sign-in</dt><dd>${view.last}</dd>`));

    if (view.id !== 'alex') {
      acct.appendChild(h('p', { class: 'irc-note', style: 'margin:.5rem 0 0' }, 'Nothing unusual on this account.'));
    } else {
      if (!state.acctLocked) {
        const acts = h('div', { class: 'irc-actions', role: 'group', 'aria-label': 'Account actions' });
        acts.appendChild(button('irc-act', '<span class="irc-act__icon" aria-hidden="true">' + ICON.lock + '</span><span><b>Lock account</b><small>Nobody can sign in with it until IT unlocks it</small></span>', () => adminAction('lock'), { 'data-act': 'lock' }));
        acts.appendChild(button('irc-act', '<span class="irc-act__icon" aria-hidden="true">' + ICON.trash + '</span><span><b>Delete account and all its files</b><small>Removes the account for good</small></span>', () => adminAction('delete'), { 'data-act': 'delete' }));
        acts.appendChild(button('irc-act', '<span class="irc-act__icon" aria-hidden="true">' + ICON.mail + '</span><span><b>Message the account: "Is this you?"</b><small>Sends a chat message to whoever is signed in as Alex</small></span>', () => adminAction('message'), { 'data-act': 'message' }));
        acct.appendChild(acts);
      } else {
        acct.appendChild(h('p', { class: 'irc-green', style: 'margin:.5rem 0 0;font-weight:700' }, '&#10003; Account locked. Nobody can sign in as Alex.'));
      }
      if (state.step >= 4) {
        acct.appendChild(h('h4', { style: 'margin:.8rem 0 .2rem' }, 'Account settings'));
        const list = h('div', { class: 'irc-actions', role: 'group', 'aria-label': 'Alex\'s account settings' });
        SETTINGS.forEach((st) => {
          const on = st.right ? !!state.complete : live.flash === st.id;
          const b = button('irc-switch' + (live.shake === st.id ? ' is-shake' : ''),
            `<span><b>${st.label}</b><small>${st.sub}</small></span><span class="irc-toggle" aria-hidden="true"></span>`,
            () => flipSetting(st.id), { role: 'switch', 'aria-checked': String(on), 'data-setting': st.id });
          if (state.complete) b.disabled = true;
          list.appendChild(b);
        });
        acct.appendChild(list);
      }
    }
    scr.appendChild(acct);
    c.appendChild(scr);
  }

  function adminAction(kind) {
    if (state.complete || state.acctLocked) return;
    const sel = `.irc-act[data-act="${kind}"]`;
    if (state.step < 2) { notYet(1); return; }
    if (kind === 'lock') {
      state.acctLocked = true;
      save();
      setPct(state.cablePulled ? 45 : 40);
      say('lock_ok');
      live.fb = null;
      if (!checkContained()) setFb('Alex\'s account is locked. One of the two things on the Emergency Card is done.', 'good');
      rerender('.irc-back');
      return;
    }
    spend(COST.never, 'Incident: broke a "Never" rule');
    if (kind === 'delete') {
      say('never_delete');
      setFb(`Ray undid it (−${COST.never} pts). Never delete or wipe anything: the investigators need the evidence.`, 'bad');
    } else {
      say('never_message');
      setFb(`Ray unsent it (−${COST.never} pts). Never message the hacked account: the intruder would read it.`, 'bad');
    }
    rerender(sel);
  }

  function flipSetting(id) {
    if (state.complete) return;
    if (state.step < 4) { notYet(state.step); return; }
    const st = SETTINGS.find((s) => s.id === id);
    if (!st) return;
    if (st.right) { finish(); return; }
    spend(COST.wrong, 'Incident: wrong setting');
    live.flash = id;
    rerender(`.irc-switch[data-setting="${id}"]`);
    setFb(`${WRONG_SETTING[id]} (−${COST.wrong} pts)`, 'bad');
    later(() => {
      live.flash = null;
      live.shake = id;
      if (state.focus === 'admin') rerender(`.irc-switch[data-setting="${id}"]`);
      later(() => { live.shake = null; }, 450);
    }, 700);
  }

  // --- Whiteboard + magnet ---
  let drag = null;
  let suppressClick = false;

  function renderBoard() {
    const c = shell('On the wall', 'The whiteboard');
    const board = h('div', { class: 'irc-board' + (live.holding ? ' is-holding' : '') + (live.shakeBoard ? ' is-shake' : '') });
    board.appendChild(h('p', { class: 'irc-board__title' }, 'WHO\'S WHERE THIS WEEK'));
    const rows = h('div', { class: 'irc-board__rows' });
    BOARD.forEach((p) => {
      const flaggedHere = state.flagged && p.id === 'alex';
      const label = live.holding ? `Put the magnet on ${p.name}` : `${p.name}, ${p.team}: ${p.where}`;
      const row = button('irc-board__row' + (flaggedHere ? ' is-flagged' : ''),
        `<span><b>${p.name}</b> (${p.team})<br>${p.where.replace(/"/g, '&quot;')}</span><span class="irc-board__slot">${flaggedHere ? '<span class="irc-mag" aria-hidden="true">SUSPECT</span>' : ''}</span>`,
        () => onRow(p.id), { 'data-person': p.id, 'aria-label': label });
      rows.appendChild(row);
    });
    board.appendChild(rows);
    if (!state.flagged) {
      const dock = h('div', { class: 'irc-magdock' });
      const mag = button('irc-magbtn', '<span class="irc-mag" aria-hidden="true">SUSPECT</span>', onMagnetClick,
        { 'aria-pressed': String(live.holding), 'aria-label': live.holding ? 'Red SUSPECT magnet (picked up). Now choose a name.' : 'Red SUSPECT magnet. Pick it up.' });
      mag.addEventListener('pointerdown', onMagDown);
      dock.appendChild(mag);
      dock.appendChild(h('span', null, live.holding
        ? '<strong>Magnet picked up.</strong> Now tap the name it belongs on.'
        : 'Red SUSPECT magnet. Pick it up, then tap a name (or drag it onto one).'));
      board.appendChild(dock);
    }
    c.appendChild(board);
    if (state.flagged) c.appendChild(h('p', { class: 'irc-note' }, 'The red magnet is on Alex Ellis.'));
    addClue('board');
  }

  function onMagnetClick() {
    if (suppressClick) { suppressClick = false; return; }
    if (state.flagged) return;
    live.holding = !live.holding;
    setFb('', '');
    rerender('.irc-magbtn');
    announce(live.holding ? 'Magnet picked up. Choose a name on the whiteboard.' : 'Magnet put back.');
  }

  function onRow(id) {
    if (state.flagged) return;
    if (!live.holding) {
      setFb('To flag someone, pick up the red SUSPECT magnet (bottom of the board) first, then tap a name.', 'info');
      return;
    }
    placeMagnet(id);
  }

  function placeMagnet(id) {
    if (state.flagged) return;
    live.holding = false;
    if (id === 'alex') { solveSpot(); return; }
    spend(COST.wrong, 'Incident: wrong person flagged');
    live.shakeBoard = true;
    rerender(`.irc-board__row[data-person="${id}"]`);
    live.shakeBoard = false;
    setFb(`${WRONG_FLAG[id] || 'That log-in checks out.'} The magnet falls off. (−${COST.wrong} pts)`, 'bad');
  }

  function onMagDown(ev) {
    if (state.flagged || ev.button > 0) return;
    const btn = ev.currentTarget;
    drag = { x: ev.clientX, y: ev.clientY, moved: false, ghost: null, btn, id: ev.pointerId, over: null };
    try { btn.setPointerCapture(ev.pointerId); } catch (_) {}
    btn.addEventListener('pointermove', onMagMove);
    btn.addEventListener('pointerup', onMagUp);
    btn.addEventListener('pointercancel', onMagCancel);
  }
  function onMagMove(ev) {
    if (!drag) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.style.userSelect = 'none';
      try { window.getSelection()?.removeAllRanges(); } catch (_) {}
      drag.ghost = h('div', { class: 'irc-magghost', 'aria-hidden': 'true' }, '<span class="irc-mag">SUSPECT</span>');
      document.body.appendChild(drag.ghost);
      const board = $('.irc-board', els.closeup);
      if (board) board.classList.add('is-holding');
    }
    ev.preventDefault();
    drag.ghost.style.left = ev.clientX + 'px';
    drag.ghost.style.top = ev.clientY + 'px';
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const row = under && under.closest ? under.closest('.irc-board__row') : null;
    if (drag.over && drag.over !== row) drag.over.classList.remove('is-drop');
    if (row) row.classList.add('is-drop');
    drag.over = row;
  }
  function endDrag() {
    if (!drag) return null;
    const d = drag;
    drag = null;
    d.btn.removeEventListener('pointermove', onMagMove);
    d.btn.removeEventListener('pointerup', onMagUp);
    d.btn.removeEventListener('pointercancel', onMagCancel);
    try { d.btn.releasePointerCapture(d.id); } catch (_) {}
    document.body.style.userSelect = '';
    if (d.ghost) d.ghost.remove();
    if (d.over) d.over.classList.remove('is-drop');
    return d;
  }
  function onMagUp(ev) {
    const d = endDrag();
    if (!d || !d.moved) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 400);
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const row = under && under.closest ? under.closest('.irc-board__row') : null;
    if (row && row.dataset.person) placeMagnet(row.dataset.person);
    else { const board = $('.irc-board', els.closeup); if (board && !live.holding) board.classList.remove('is-holding'); }
  }
  function onMagCancel() { endDrag(); }

  function solveSpot() {
    state.flagged = true;
    state.step = 2;
    state.page = null;
    save();
    setPct(25);
    say('s1_done');
    renderAll();
    setFb('The magnet sticks on Alex Ellis. Someone is using Alex\'s account! Next, Playbook step 2: stop it.', 'good');
    const row = $('.irc-board__row[data-person="alex"]', els.closeup);
    if (row) { try { row.focus({ preventScroll: true }); } catch (_) {} }
  }

  // --- Break glass ---
  function renderGlass() {
    const c = shell('On the wall', state.glassBroken ? 'The emergency box (glass broken)' : 'A red emergency box');
    const box = h('div', { class: 'irc-glassbox' + (state.glassBroken ? ' is-broken' : '') + (state.glassBroken && !live.justBroke ? ' is-instant' : '') + (live.justBroke ? ' irc-shake' : '') });
    box.appendChild(h('div', { class: 'irc-glassbox__label' }, 'IN AN EMERGENCY'));
    const pane = h('div', { class: 'irc-glassbox__pane' }, state.glassBroken ? '' : '<span>BREAK<br>GLASS</span>');
    if (state.glassBroken) {
      pane.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
        '<path class="irc-crack" d="M50 50 L8 6 M50 50 L94 4 M50 50 L4 92 M50 50 L96 96 M50 50 L50 100 M50 50 L100 52 M50 50 L0 46 M50 50 L54 0"/>' +
        '<path class="irc-crack" d="M30 30 L42 22 L60 26 L72 36 M28 70 L44 80 L66 74 L76 62"/></svg>';
    }
    box.appendChild(pane);
    c.appendChild(box);
    live.justBroke = false;
    if (!state.glassBroken) {
      c.appendChild(h('p', null, 'A sticker says: <em>"In an emergency, break the glass. Instructions inside."</em> A little hammer hangs on a chain beside it.'));
      c.appendChild(button('btn primary irc-break', ICON.hammer + ' Break the glass', breakGlass));
      return;
    }
    c.appendChild(h('p', null, 'Inside the box is a laminated card:'));
    c.appendChild(h('div', { class: 'irc-paper irc-paper--card' },
      '<h4>EMERGENCY CARD: data leaking out?</h4>' +
      '<p class="irc-do">Do this straight away</p>' +
      '<ul class="irc-ticks yes"><li>Cut <strong>only the leaking system</strong> off from the internet. (The cable map is inside the server cabinet door.)</li>' +
      '<li><strong>Lock the account</strong> the intruder is using.</li></ul>' +
      '<p class="irc-dont">Never</p>' +
      '<ul class="irc-ticks no"><li>Delete or wipe anything: investigators need the evidence.</li>' +
      '<li>Cut off the whole building: everyone stops working and it doesn\'t help.</li>' +
      '<li>Message the hacked account: the intruder will read it.</li></ul>'));
    addClue('ecard');
  }

  function breakGlass() {
    if (state.glassBroken) return;
    state.glassBroken = true;
    live.justBroke = !reduceMotion();
    save();
    if (state.step === 2) setPct(30);
    say('glass');
    renderScene();
    rerender();
    try { els.closeup.focus({ preventScroll: true }); } catch (_) {}
    // Bring the Emergency Card into view once the glass has cracked (it can sit below the fold of the panel).
    later(() => { if (state.focus === 'glass') revealIn(els.closeup, $('.irc-paper--card', els.closeup), true); }, reduceMotion() ? 0 : 650);
  }

  // --- Server cabinet ---
  function renderCabinet() {
    const c = shell('Corner of the room', 'The server cabinet');
    if (!state.cabOpen) {
      c.appendChild(h('p', null, 'A tall black cabinet, humming away. Lots of blinking lights and cables inside. The door isn\'t locked.'));
      c.appendChild(button('btn primary irc-open', 'Open the cabinet door', () => {
        state.cabOpen = true;
        save();
        rerender('.irc-port');
      }));
      return;
    }
    c.appendChild(h('p', null, 'Five cables are plugged into the network switch. A cable map is stuck inside the door.'));
    const grid = h('div', { class: 'irc-cab' });
    const door = h('div', { class: 'irc-cab__door' });
    door.appendChild(h('div', { class: 'irc-paper' },
      '<h4>CABLE MAP</h4><ol>' + CABLES.map((cb) => `<li><strong>${cb.colour}</strong>: ${cb.system}</li>`).join('') + '</ol>'));
    grid.appendChild(door);
    const sw = h('div', { class: 'irc-sw', role: 'group', 'aria-label': 'Network switch cables' });
    sw.appendChild(h('div', { class: 'irc-sw__title' }, 'Network switch: tap a cable to unplug it'));
    CABLES.forEach((cb) => {
      const out = cb.id === 'blue' && state.cablePulled;
      const b = button('irc-port' + (out ? ' is-out' : '') + (live.yank === cb.id ? ' is-yank' : ''),
        `<span class="irc-port__led" aria-hidden="true"></span><span class="irc-port__plug"><span class="irc-port__wire" style="background:${cb.hex}" aria-hidden="true"></span><span class="irc-port__tag">${cb.n} &middot; ${cb.colour}</span></span><span class="irc-port__do">${out ? 'Unplugged' : 'Unplug'}</span>`,
        () => pullCable(cb.id), { 'data-cable': cb.id, 'aria-label': `Cable ${cb.n}, ${cb.colour}${out ? ', unplugged' : '. Unplug it'}` });
      sw.appendChild(b);
    });
    live.yank = null;
    grid.appendChild(sw);
    c.appendChild(grid);
    addClue('cablemap');
  }

  function pullCable(id) {
    if (state.complete) return;
    const sel = `.irc-port[data-cable="${id}"]`;
    if (id === 'blue' && state.cablePulled) { setFb('That cable is already unplugged.', 'info'); return; }
    if (state.step < 2) { setFb('Ray: Whoa, let\'s not start pulling cables until we know what\'s going on. The Playbook says to do step 1 (Spot it) first.', 'info'); return; }
    if (state.step > 2) { setFb('The leak is already stopped. Best leave the other cables alone.', 'info'); return; }
    const cb = CABLES.find((x) => x.id === id);
    if (id === 'blue') {
      state.cablePulled = true;
      save();
      setPct(state.acctLocked ? 45 : 40);
      say('cable_ok');
      live.fb = null;
      renderScene();
      if (!checkContained()) setFb('Unplugged. The Customer Records system is cut off from the internet. One of the two things on the Emergency Card is done.', 'good');
      rerender(sel);
      return;
    }
    live.yank = id;
    if (id === 'red') {
      spend(COST.never, 'Incident: broke a "Never" rule');
      blackout();
      say('never_red');
      rerender(sel);
      setFb(`The whole building went dark! Never cut off the whole building. Ray plugged it back in. (−${COST.never} pts)`, 'bad');
      return;
    }
    spend(COST.wrong, 'Incident: wrong cable');
    rerender(sel);
    setFb(`${cb.system} went offline, but the counter kept climbing, so Ray plugged it back in. Which system does the Alarm screen say the data is leaving from? (−${COST.wrong} pts)`, 'bad');
  }

  // Both containment actions done: the leak stops and the lights come up.
  function checkContained() {
    if (!(state.cablePulled && state.acctLocked) || state.leakFinal != null) {
      if (state.cablePulled !== state.acctLocked) say('one_more');
      return false;
    }
    state.leakFinal = leakNow();
    state.step = 3;
    state.page = null;
    save();
    setPct(50);
    say('contained');
    renderAll();
    setFb('The counter has stopped and the alarm lights are off. Leak stopped! Next, Playbook step 3: tell the right people.', 'good');
    return true;
  }

  // --- Desk phone ---
  function renderPhone() {
    const c = shell('On the desk', 'The desk phone');
    const wrap = h('div', { class: 'irc-phone' });

    const hand = h('div', { class: 'irc-handset', role: 'group', 'aria-label': 'Desk phone keypad' });
    const lcd = h('div', { class: 'irc-lcd' });
    lcd.appendChild(h('div', { class: 'irc-lcd__top', 'aria-hidden': 'true' }, `<span>OPS ROOM</span><span>${state.vmHeard ? 'NO NEW MSGS' : '1 NEW MSG'}</span>`));
    lcd.appendChild(h('div', { class: 'irc-lcd__num', id: 'ircDial', 'aria-live': 'polite', text: live.dial }));
    lcd.appendChild(h('div', { class: 'irc-lcd__msg', id: 'ircLcdMsg', text: live.lcd || 'Dial a number, then press Call.' }));
    hand.appendChild(lcd);
    const keys = h('div', { class: 'irc-keys' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].forEach((k) => {
      keys.appendChild(button('irc-key', k, () => pressKey(k), { 'data-key': k, 'aria-label': k === '*' ? 'Star' : k === '#' ? 'Hash' : k }));
    });
    keys.appendChild(button('irc-key irc-key--del', '&#9003;', () => pressKey('del'), { 'aria-label': 'Delete last digit' }));
    const call = button('irc-key irc-key--call', ICON.phone + ' Call', placeCall, { 'aria-label': 'Call', style: 'grid-column: span 2' });
    keys.appendChild(call);
    hand.appendChild(keys);
    hand.addEventListener('keydown', (ev) => {
      if (/^[0-9*#]$/.test(ev.key)) { ev.preventDefault(); pressKey(ev.key); }
      else if (ev.key === 'Backspace') { ev.preventDefault(); pressKey('del'); }
    });
    const vmBtn = button('btn ghost sm irc-vm', live.playing ? '<span class="irc-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Playing&hellip;' : (state.vmHeard ? ICON.play + ' Replay voicemail' : ICON.play + ' Play voicemail (1 new)'), playVoicemail);
    hand.appendChild(vmBtn);
    let transcript = null;
    if (state.vmHeard && !live.playing) {
      transcript = (h('div', { class: 'irc-transcript irc-phone__full' },
        '<b>Friday, 5:58 PM. From: Alex Ellis (mobile)</b><br>"Hi, it\'s Alex from Finance. Just letting you know I\'m off hiking in <b>Tasmania</b> from tonight. There\'s <b>no phone signal and no internet</b> out there, so I\'m completely offline until Monday! If anything urgent comes up, please talk to <b>my manager, Helen</b>. Bye!"'));
    }
    wrap.appendChild(hand);

    const side = h('div');
    side.appendChild(h('div', { class: 'irc-paper irc-paper--yellow' },
      '<h4>LARKSPUR PHONE LIST (after hours)</h4><ul class="irc-plist">' +
      PHONE_LIST.map((p) => `<li><span><strong>${p.name}</strong>, ${p.role}</span><span class="ext">${p.ext}</span></li>`).join('') +
      '</ul>'));
    if (state.step >= 3) {
      side.appendChild(h('p', { class: 'irc-note', style: 'margin:.2rem 0 0' }, `Calls made: ${state.calls.length} of 3`));
      const list = h('ul', { class: 'irc-calls' });
      for (let i = 0; i < 3; i++) {
        const id = state.calls[i];
        const p = id ? PHONE_LIST.find((x) => x.id === id) : null;
        list.appendChild(h('li', { class: p ? 'is-done' : '' }, p ? `${p.name}, ${p.role}` : 'Not called yet'));
      }
      side.appendChild(list);
    }
    wrap.appendChild(side);
    if (transcript) wrap.appendChild(transcript);
    c.appendChild(wrap);
    addClue('phonelist');
  }

  function setLcd(msg) {
    live.lcd = msg;
    const el = $('#ircLcdMsg', els.closeup);
    if (el) el.textContent = msg;
  }

  function pressKey(k) {
    if (live.calling) return;
    if (k === 'del') live.dial = live.dial.slice(0, -1);
    else if (live.dial.length < 12) live.dial += k;
    const el = $('#ircDial', els.closeup);
    if (el) el.textContent = live.dial;
    setLcd(live.dial ? 'Press Call when ready.' : 'Dial a number, then press Call.');
  }

  function placeCall() {
    if (live.calling) return;
    const num = live.dial.replace(/\D/g, '');
    if (!num) { setLcd('Type a number first.'); setFb('Dial a number on the keypad first, then press Call.', 'info'); return; }
    live.calling = true;
    setLcd('Calling ' + num + ' ...');
    later(() => {
      live.calling = false;
      live.dial = '';
      handleCall(num);
    }, reduceMotion() ? 300 : 1100);
  }

  function handleCall(num) {
    const entry = PHONE_LIST.find((p) => p.ext === num) || (num === REPORTER.ext || num === REPORTER.ext.slice(1) || num === '61' + REPORTER.ext.slice(1) ? REPORTER : null);
    let msg = '';
    let tone = 'info';
    if (!entry) {
      setLcd('Number not in use.');
      msg = `Beep beep beep. Nobody answers on ${num}: that number isn't in use. Check the phone list.`;
    } else if (entry.kind === 'never') {
      spend(COST.never, 'Incident: broke a "Never" rule');
      say(entry.id === 'tom' ? 'never_tom' : 'never_social');
      setLcd('Call ended.');
      msg = (entry.id === 'tom'
        ? 'Ray hung up for you. Never go public first: no reporters.'
        : 'Ray hung up for you. Never go public first: no social media.') + ` (−${COST.never} pts)`;
      tone = 'bad';
    } else if (state.step < 3 && !state.complete) {
      setLcd('Call ended.');
      msg = state.step === 1
        ? 'Ray: Who are we calling? We don\'t even know what\'s going on yet. The Playbook says to work out who\'s behind this first (step 1).'
        : 'Ray: Calls can wait a minute. The Playbook says to stop the leak first (step 2).';
    } else if (state.step > 3 || state.complete) {
      setLcd('Call ended.');
      msg = 'Everyone who needs to know has already been told.';
    } else if (entry.kind === 'right') {
      if (state.calls.includes(entry.id)) {
        setLcd('Call ended.');
        msg = `You've already spoken to ${entry.name}. Who else does the Playbook list?`;
      } else {
        state.calls.push(entry.id);
        save();
        setLcd('Connected: ' + entry.name);
        say('call_' + entry.id);
        setPct(50 + state.calls.length * 8);
        tone = 'good';
        msg = `${entry.name} (${entry.role}) knows. ${state.calls.length} of 3 calls made.`;
        if (state.calls.length >= 3) { tellDone(); return; }
      }
    } else {
      spend(COST.wrong, 'Incident: wrong person called');
      say('call_chris');
      setLcd('Call ended.');
      tone = 'bad';
      msg = `Chris looks after the building and car park. He isn't one of the three people the Playbook lists. (−${COST.wrong} pts)`;
    }
    if (state.focus === 'phone') rerender('.irc-key--call');
    setFb(msg, tone);
  }

  function tellDone() {
    state.step = 4;
    state.page = null;
    save();
    setPct(75);
    say('tell_done');
    renderAll();
    if (state.focus === 'phone') { const b = $('.irc-key--call', els.closeup); if (b) { try { b.focus({ preventScroll: true }); } catch (_) {} } }
    setFb('All three calls made, and nobody went public. Next, Playbook step 4: find out how they got in and fix it.', 'good');
  }

  function playVoicemail() {
    if (live.playing) return;
    live.playing = true;
    rerender('.irc-vm');
    announce('Playing voicemail.');
    later(() => {
      live.playing = false;
      const first = !state.vmHeard;
      state.vmHeard = true;
      save();
      addClue('voicemail');
      renderScene();
      if (state.focus === 'phone') rerender('.irc-vm');
      if (first) say('vm');
      const t = $('.irc-transcript', els.closeup);
      if (t) announce(t.textContent);
    }, reduceMotion() ? 300 : 1800);
  }

  // --- Small props ---
  function renderCard() {
    const c = shell('On the desk', 'A business card');
    c.appendChild(h('div', { class: 'irc-biz' },
      `<div class="irc-biz__name">${REPORTER.name}</div><div class="irc-biz__role">${REPORTER.role}</div>` +
      `<div class="irc-biz__line">"Got a story? Call me any time, day or night!"</div><div>Mobile: <span class="irc-biz__num">${REPORTER.display}</span></div>`));
    addClue('reporter');
    say('card');
  }

  function renderPizza() {
    const c = shell('On the desk', 'A pizza box');
    c.appendChild(h('div', { class: 'irc-pizza', 'aria-hidden': 'true' }, PIZZA_SVG));
    c.appendChild(h('p', null, 'Half a Hawaiian pizza, stone cold. Nothing useful here, but at least you know who eats pineapple on pizza.'));
    say('pizza');
  }

  function renderPrinter() {
    const c = shell('On the side desk', 'The printer');
    c.appendChild(h('p', null, state.printoutRead
      ? 'The page that was waiting in the tray:'
      : 'The "paper waiting" light is blinking. One page has been sitting in the tray since yesterday afternoon. Nobody collected it.'));
    c.appendChild(h('div', { class: 'irc-paper irc-paper--print' },
      '<p><strong>From:</strong> PassWatch (password leak alerts)<br><strong>To:</strong> Larkspur IT<br><strong>Sent:</strong> Yesterday, 3:10 PM<br><strong>Subject:</strong> One of your staff was in a password leak</p>' +
      '<p>Two months ago a fitness app called <strong>FitTracker</strong> was hacked. Its members\' email addresses and passwords were posted online for anyone to see.</p>' +
      '<p>One of them belongs to your staff member <strong>Alex Ellis</strong> (Alex\'s personal email address).</p>' +
      '<p>If Alex uses the same password at work, anyone who found it online can sign in as Alex.</p>'));
    if (!state.printoutRead) {
      state.printoutRead = true;
      save();
      renderScene();
    }
    addClue('printout');
  }

  // ---------- Completion ----------
  function renderVaultCallout() {
    if (!els.vaultValue) return;
    els.vaultValue.innerHTML = '';
    if (state.complete) {
      els.vaultValue.appendChild(document.createTextNode('Code word: '));
      els.vaultValue.appendChild(h('strong', { text: WORD }));
      els.vaultValue.appendChild(document.createTextNode(' — enter it in the vault on the Mission Hub.'));
    } else {
      els.vaultValue.appendChild(h('span', { class: 'ir-lock', text: 'Locked.' }));
      els.vaultValue.appendChild(document.createTextNode(' Handle the incident to reveal this room\'s code word.'));
    }
  }

  function renderComplete() {
    const c = els.complete;
    if (!state.complete) { c.hidden = true; c.innerHTML = ''; return; }
    c.hidden = false;
    c.innerHTML = '';
    c.appendChild(h('h2', { text: 'Case closed' }));
    c.appendChild(h('p', null, `You spotted the intruder, stopped the leak at ${fmt(leakNow())} records, called the right people and closed the door they came in through.`));
    c.appendChild(h('div', { class: 'ir-complete__word', text: WORD }));
    c.appendChild(h('p', { class: 'ir-complete__cta', text: `Code word: ${WORD} — enter it in the vault on the Mission Hub` }));
    c.appendChild(h('a', { class: 'btn primary', href: 'game.html', text: 'Go to the Mission Hub' }));
    const deb = h('div', { class: 'ir-debrief' });
    [
      ['Spot it', 'Something that doesn\'t add up, like a log-in from somewhere impossible, is worth reporting straight away.'],
      ['Stop it', 'Act fast to limit the damage: cut off only the affected system and lock the account. Keep the evidence.'],
      ['Tell', 'Tell the right people quickly: security, privacy and the manager. Never go public first.'],
      ['Fix it', 'Find how they got in and close that door. A different password for every site, plus a phone code at sign-in, stops attacks like this.']
    ].forEach(([t, p]) => {
      const card = h('div', { class: 'ir-debrief__card' });
      card.appendChild(h('h3', { text: t }));
      card.appendChild(h('p', { text: p }));
      deb.appendChild(card);
    });
    c.appendChild(deb);
    c.appendChild(h('p', { class: 'ir-complete__foot' }, 'If you ever notice something odd at work, <strong>report it to IT or security straight away</strong>. You could be the one who spots it.'));
  }

  function finish() {
    if (state.complete) return;
    state.complete = true;
    if (state.leakFinal == null) state.leakFinal = leakNow();
    state.page = null;
    save();
    live.justClosed = true;
    live.fb = null;
    try { window.vault?.completeRoom?.(ROOM, WORD, { message: `Code word ${WORD} secured.` }); } catch (_) {}
    try { window.stateSync?.saveNow?.('incident-complete'); } catch (_) {}
    say('fix_done');
    renderAll();
    live.justClosed = false;
    setFb('Phone code at sign-in: ON. Even with a leaked password, nobody gets in without Alex\'s phone. Case closed!', 'good');
    announce(`Case closed. Code word ${WORD}. Enter it in the vault on the Mission Hub.`);
    later(() => {
      try { els.complete.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (_) {}
      const link = $('a', els.complete);
      if (link) { try { link.focus({ preventScroll: true }); } catch (_) {} }
    }, 500);
  }

  // ---------- Layout: the whole room on one screen ----------
  // From 1260px wide the room card is sized to the window below the sticky site header (see the
  // page CSS). The CSS needs the header's height, and a click in the room lines the card up with
  // the top of the window when part of it is cut off.
  const header = $('.site-header');
  const dashQuery = window.matchMedia ? window.matchMedia('(min-width: 1260px)') : null;
  function headHeight() {
    if (!header || !/sticky|fixed/.test(getComputedStyle(header).position)) return 0;
    return Math.round(header.getBoundingClientRect().height);
  }
  function syncHeadHeight() { document.documentElement.style.setProperty('--ir-head', headHeight() + 'px'); }

  function scrollPageTo(top) {
    try { window.scrollTo({ top, behavior: reduceMotion() ? 'instant' : 'smooth' }); } catch (_) { window.scrollTo(0, top); }
  }
  function roomTarget() {
    return Math.max(0, Math.round(window.scrollY + els.room.getBoundingClientRect().top - headHeight() - 8));
  }
  // Only when the dashboard layout is on, the card fits in the window and part of it is out of view.
  function alignRoom() {
    if (state.complete || !dashQuery || !dashQuery.matches) return;
    const r = els.room.getBoundingClientRect();
    const top = headHeight() + 8;
    if (r.height > window.innerHeight - top + 2) return;
    if (r.top >= top - 2 && r.bottom <= window.innerHeight + 2) return;
    scrollPageTo(roomTarget());
  }

  function initLayout() {
    syncHeadHeight();
    if (window.ResizeObserver) {
      try {
        if (header) new ResizeObserver(syncHeadHeight).observe(header);
        // The radio panel gets shorter when hint text appears: keep the newest message in view.
        new ResizeObserver(() => showNewestMsg(false)).observe(els.feed);
      } catch (_) {}
    }
    window.addEventListener('resize', syncHeadHeight);
    // Runs after the clicked control has done its job (bubbling), so it never steals the click.
    els.room.addEventListener('click', alignRoom);
    const jump = $('#irJump');
    if (jump) jump.addEventListener('click', () => scrollPageTo(roomTarget()));
  }

  // ---------- Boot ----------
  function renderAll() {
    renderChrome();
    renderScene();
    renderCloseup();
    renderBook();
    renderEvidence();
    renderVaultCallout();
    renderComplete();
  }

  function boot() {
    try { points?.ensure?.(); } catch (_) {}
    try {
      utils?.initStatusHud?.(ROOM, {
        score: '#incidentPointsTotal',
        delta: '#incidentPointsDelta',
        progressFill: '#incidentProgressFill',
        progressLabel: '#incidentProgressText'
      });
    } catch (_) {}

    initLayout();
    flushFollowUps();
    const fresh = !state.msgs.length && !state.complete;
    if (fresh) {
      state.msgs = ['intro1'];
      save();
      later(() => say('intro2', true), 1400);
    } else {
      save();
    }
    renderFeed();
    renderAll();
  }

  window.addEventListener('pagehide', () => { timers.forEach(clearTimeout); timers.clear(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
