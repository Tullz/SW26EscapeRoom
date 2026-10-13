/* forensics.js — Bonus room: Network Forensics, "The Friday Night Leak" (Cyber Escape Rooms)

   Story: the secret designs for Copperleaf Games' "Project Aurora" leaked over the
   weekend. The team are the investigators, working from Glen the night guard's
   evidence board on Monday morning, with Rosa (head of studio) on the case chat.

   Stage 1  Rebuild Friday night: inspect evidence to uncover 7 "moment" cards (no
            times on them, tray order shuffled), then order them. Twist: Camera 2's
            clock is an hour fast (sticky note on the monitor, wall clock in shot).
   Stage 2  Name the culprit: refused badge #0417 -> IT notice -> leaving-drinks photo.
   Stage 3  Prove it: pin three pieces of evidence to the culprit's photo.
   Then: CASE CLOSED and the debrief.

   Bonus room (sixth round): it stays locked until the team has cracked the vault on
   the Mission Hub, it has no code word, and nothing in it touches the team score
   (hints are free, wrong answers cost nothing). Completion goes through
   window.vault.completeBonus('forensics'), which only sets progress.forensics.

   Room state: localStorage `${team}_forensics_state` (cleared by the admin reset).
*/

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const announce = (msg) => { try { window.a11y?.announce?.(msg); } catch (_) { /* ignore */ } };

  if (!$('#fxRoom') || !$('#fxBoard')) return;

  const utils = window.utils;
  const ROOM = 'forensics';
  const TEAM = String(utils?.getUser?.()?.username || 'team').toLowerCase();
  const STATE_KEY = `${TEAM}_forensics_state`;
  const STATE_VERSION = 1;
  const NARROW = () => window.matchMedia('(max-width: 900px)').matches;
  const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const els = {
    board: $('#fxBoard'),
    strings: $('#fxStrings'),
    stamp: $('#fxStamp'),
    closeup: $('#fxCloseup'),
    stage: $('#fxStage'),
    feed: $('#fxFeed'),
    hintBtn: $('#fxHintBtn'),
    hints: $('#fxHints'),
    pill: $('#fxStagePill'),
    pillTitle: $('#fxStageTitle'),
    help: $('#fxBoardHelp'),
    complete: $('#fxComplete'),
    locked: $('#fxLocked'),
    lockedDone: $('#fxLockedDone'),
    caseWrap: $('#fxCase')
  };

  // =====================================================================
  // Content
  // =====================================================================

  // The moments of Friday night. Listed here in no particular order; the real
  // order comes from the time each one happened.
  const MOMENTS = {
    usb: { at: 22 * 60 + 4, time: '22:04', from: 'laptop', text: 'The "Project Aurora" folder is copied onto a USB stick' },
    home: { at: 18 * 60 + 47, time: '18:47', from: 'doorlog', text: 'Maya heads home for the weekend, leaving her laptop unlocked' },
    leave: { at: 22 * 60 + 9, time: '22:09', from: 'cam3', text: 'The yellow raincoat hurries out across the car park' },
    refused: { at: 21 * 60 + 38, time: '21:38', from: 'doorlog', text: 'A cancelled badge is refused at the front door' },
    round: { at: 22 * 60 + 30, time: '22:30', from: 'notebook', text: 'Glen finds Maya\'s laptop open on his round and closes the lid' },
    desk: { at: 22 * 60 + 1, time: '22:01', from: 'cam2', text: 'The yellow raincoat sits down at Maya\'s desk', note: 'Camera 2 said 23:01, but its clock runs an hour fast' },
    tailgate: { at: 21 * 60 + 42, time: '21:42', from: 'cam1', text: 'Someone in a yellow raincoat slips in behind Theo at the side door' }
  };
  const ANSWER = Object.keys(MOMENTS).sort((a, b) => MOMENTS[a].at - MOMENTS[b].at);
  const SLOTS = ANSWER.length;

  const ITEMS = {
    cam1: { label: 'Camera 1: side door', eyebrow: 'CCTV still' },
    cam2: { label: 'Camera 2: design studio', eyebrow: 'CCTV still' },
    cam3: { label: 'Camera 3: car park', eyebrow: 'CCTV still' },
    doorlog: { label: 'Door log', eyebrow: 'Printout from the door system' },
    laptop: { label: 'Maya\'s laptop', eyebrow: 'Activity history' },
    notebook: { label: 'Glen\'s notebook', eyebrow: 'Night guard\'s notebook' },
    sticky: { label: 'Sticky note', eyebrow: 'Found at the guard desk' },
    receipt: { label: 'Pizza receipt', eyebrow: 'Found in the studio recycling' },
    itnotice: { label: 'IT notice', eyebrow: 'Pinned up in the kitchen' },
    farewell: { label: 'Leaving-drinks photo', eyebrow: 'From the staff noticeboard' }
  };
  const ITEM_ORDER = ['cam1', 'cam2', 'cam3', 'doorlog', 'laptop', 'notebook', 'sticky', 'receipt', 'itnotice', 'farewell'];
  const momentsFrom = (item) => Object.keys(MOMENTS).filter((id) => MOMENTS[id].from === item);

  const PEOPLE = {
    maya: { name: 'Maya Okoye', skin: '#8d5a3b', hair: '#1e1410', style: 'bun', top: '#3b6fd6', bg: '#d6e4f5' },
    theo: { name: 'Theo Wren', skin: '#efc6a2', hair: '#b8742e', style: 'short', top: '#5c8f63', bg: '#dcefdc' },
    glen: { name: 'Glen Marsh', skin: '#d7a77e', hair: '#9b9b9b', style: 'beard', top: '#363c66', bg: '#e1e1ef' },
    ruth: { name: 'Ruth Diaz', skin: '#c98f62', hair: '#2a1a12', style: 'long', top: '#a0436b', bg: '#f3dbe6' },
    lena: { name: 'Lena Fox', skin: '#f3cfb3', hair: '#b5532a', style: 'long', top: '#2f8f8a', bg: '#d8efed' },
    driver: { name: 'The pizza driver', skin: '#b97a50', hair: '#c3302f', style: 'cap', top: '#c3302f', bg: '#f6e0d6' }
  };

  const SUSPECTS = [
    { id: 'theo', role: 'Junior designer. Worked late on Friday.',
      why: 'Theo is on Camera 1, holding the side door. The raincoat is the person right behind him, so it can\'t be Theo.' },
    { id: 'ruth', role: 'Accounts. Lost her badge in September.',
      why: 'Ruth\'s cancelled badge was number 0388. The badge refused at the front door at 21:38 had a different number.' },
    { id: 'glen', role: 'Night guard. On shift on Friday.',
      why: 'Glen\'s own badge works and he was already inside on shift. Whoever was in the raincoat had a badge refused and had to sneak in behind Theo.' },
    { id: 'lena', role: 'Former designer. Left Copperleaf on 30 September.' },
    { id: 'maya', role: 'Designer. It\'s her laptop.',
      why: 'The door log shows Maya going home at 18:47, hours before anyone sat at her desk. The person on Camera 2 is using her laptop, not Maya.' },
    { id: 'driver', role: 'Slice Society Pizza. Delivered to the side door.',
      why: 'The person in the raincoat tried a Copperleaf staff badge at the front door. A pizza driver wouldn\'t have one.' }
  ];
  const CULPRIT = 'lena';

  const PROOFS = [
    { id: 'door', label: 'At the door', q: 'Proof that her old badge was tried at the front door', answer: 'doorlog',
      wrong: {
        itnotice: 'The IT notice says badge 0417 was Lena\'s, but it doesn\'t show anyone trying it on Friday. Which item recorded the badge being refused?',
        farewell: 'That photo is from her leaving drinks in September, not Friday night.',
        cam1: 'Camera 1 shows the side door, not her badge at the front door.',
        laptop: 'The laptop history shows what was copied, not her badge at the door.'
      } },
    { id: 'entry', label: 'Getting in', q: 'Proof of how she got inside', answer: 'cam1',
      wrong: {
        doorlog: 'The door log only shows ONE swipe at the side door at 21:42: Theo\'s. Which item shows a second person coming in with him?',
        laptop: 'The laptop history shows what happened once she was inside, not how she got in.',
        cam2: 'Camera 2 shows her already inside, at Maya\'s desk. How did she get past the doors?',
        cam3: 'Camera 3 shows her leaving, not getting in.'
      } },
    { id: 'took', label: 'What she took', q: 'Proof of what she took', answer: 'laptop',
      wrong: {
        cam2: 'Camera 2 shows her at Maya\'s desk, but you can\'t see what\'s on the screen. Which item recorded exactly what happened on that laptop?',
        cam3: 'Camera 3 shows her leaving with something small in her hand, but not what was on it.',
        doorlog: 'The door log shows badges at the doors, not what was taken.',
        cam1: 'Camera 1 shows her arriving, not what she took.'
      } }
  ];
  const PROOF_GENERIC = {
    receipt: 'The receipt proves Theo got a pizza at 9:40 pm. It says nothing about Lena.',
    sticky: 'That note is about Camera 2\'s clock, not about Lena.',
    notebook: 'Glen\'s notebook shows him closing the laptop at 22:30, after she\'d gone. It doesn\'t prove this.',
    farewell: 'That photo is from her leaving drinks in September. It shows the raincoat, but not what happened on Friday.',
    itnotice: 'The IT notice says badge 0417 was Lena\'s, but not what happened on Friday.'
  };

  const MSGS = {
    intro_rosa: { who: 'rosa', text: 'Thanks for coming in so early. On Saturday morning, the designs for <strong>Project Aurora</strong>, our big game for next year, appeared on <strong>Tinderbox Games</strong>\' website. They must have left this building on Friday night. The board meets at 9, and I need to know exactly what happened.' },
    intro_glen: { who: 'glen', text: 'Morning, detectives. I was on the night shift on Friday. Everything we\'ve got is pinned on the board: camera pictures, the door log, my notebook. Click anything to take a closer look.' },
    sticky: { who: 'glen', text: 'Ah. That camera. I really must get its clock fixed one of these days&hellip;' },
    all_found: { who: 'rosa', text: 'That looks like seven moments. Put them in the order they happened, earliest first, then press <strong>Check the timeline</strong>.' },
    nudge: { who: 'rosa', text: 'Every clue on this board should agree with the others. If one time doesn\'t fit, ask yourselves why.' },
    s1: { who: 'rosa', tone: 'good', text: 'So that\'s Friday night. Someone walked in behind Theo, went straight to Maya\'s unlocked laptop and copied Aurora in a few minutes flat.' },
    s1b: { who: 'glen', text: 'Theo says he never saw their face, the hood was up. But they knew exactly which desk to go to. That\'s someone who knows this office.' },
    stage2: { who: 'rosa', text: 'Look at the board again. Whoever was in that raincoat left more clues than they think. Who was it?' },
    s2: { who: 'rosa', tone: 'warn', text: 'Lena?! She sat next to Maya for three years, so she knew Maya never locks her laptop. And Tinderbox, the studio that posted Aurora, is where she works now.' },
    s2b: { who: 'rosa', text: 'I believe you, but the police will want proof. Pin three pieces of evidence to Lena\'s photo.' },
    s3: { who: 'rosa', tone: 'good', text: 'That\'s everything the police need. Thank you, detectives. Case closed!' }
  };
  const MSG_ORDER = ['intro_rosa', 'intro_glen', 'sticky', 'all_found', 's1', 's1b', 'stage2', 's2', 's2b', 's3'];

  const HINTS = {
    1: [
      'Open every item on the board. Each time you uncover a moment, a card drops into the tray: there are 7 to find. Each moment\'s time is written somewhere in the evidence: the corner of a camera picture, the door log, the laptop history or Glen\'s notebook.',
      'One clock on the board is wrong. Read Glen\'s yellow sticky note: Camera 2\'s clock runs an hour fast, so when it says 23:01 it was really 22:01.',
      'Earliest to latest: Maya heads home (18:47), a cancelled badge is refused (21:38), the raincoat slips in behind Theo (21:42), the raincoat sits down at Maya\'s desk (22:01), Aurora is copied onto a USB stick (22:04), the raincoat leaves across the car park (22:09), Glen closes the laptop (22:30).'
    ],
    2: [
      'Before sneaking in, the person in the raincoat tried a badge at the front door. Open the door log and find the badge that was refused.',
      'The refused badge was number 0417. The IT notice lists who each cancelled badge belonged to. Then look at the leaving-drinks photo.',
      'Badge 0417 belonged to Lena Fox, and her leaving-drinks photo shows the same yellow raincoat. Choose Lena Fox and press Accuse.'
    ],
    3: [
      'Each proof is a different item on the board. Which item recorded her badge at the front door? Which one shows the moment she got in? Which one records what was copied?',
      'At the door: something that records badges. Getting in: one of the camera pictures. What she took: something that records what happened on Maya\'s laptop.',
      'At the door: the Door log. Getting in: Camera 1 (side door). What she took: Maya\'s laptop.'
    ]
  };

  const STAGE_TITLES = {
    1: 'Stage 1 of 3: Rebuild Friday night',
    2: 'Stage 2 of 3: Name the culprit',
    3: 'Stage 3 of 3: Prove it',
    4: 'Bonus case closed'
  };

  // =====================================================================
  // State
  // =====================================================================

  // A tray order that never gives the answer away: no card sits in its real
  // position (or its reversed position), and no two neighbours in the tray are
  // neighbours in the real story.
  function isScrambled(order) {
    if (!Array.isArray(order) || order.length !== SLOTS) return false;
    if (new Set(order).size !== SLOTS || order.some((id) => !MOMENTS[id])) return false;
    for (let i = 0; i < SLOTS; i++) {
      if (order[i] === ANSWER[i] || order[i] === ANSWER[SLOTS - 1 - i]) return false;
    }
    for (let i = 0; i < SLOTS - 1; i++) {
      if (Math.abs(ANSWER.indexOf(order[i + 1]) - ANSWER.indexOf(order[i])) === 1) return false;
    }
    return true;
  }
  function makeTrayOrder() {
    for (let tries = 0; tries < 2000; tries++) {
      const p = ANSWER.slice();
      for (let i = p.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
      }
      if (isScrambled(p)) return p;
    }
    return [1, 4, 6, 2, 5, 0, 3].map((i) => ANSWER[i]);
  }

  function freshState() {
    return {
      v: STATE_VERSION,
      stage: 1,             // 1..3 = current stage, 4 = case closed
      seen: {},             // item id -> inspected
      found: [],            // moment ids uncovered
      fresh: [],            // found but not touched yet ("New" badge)
      order: makeTrayOrder(),
      slots: new Array(SLOTS).fill(null),
      pinned: [],           // moment ids locked in their correct slot
      checks: 0,
      badChecks: 0,
      s1: false,
      replayed: false,
      accused: [],          // wrong suspects tried
      s2: false,
      proofs: { door: null, entry: null, took: null },
      wrongProofs: 0,
      s3: false,
      solved: false,
      hints: { 1: 0, 2: 0, 3: 0 },
      msgs: [],
      focus: null
    };
  }

  function loadState() {
    const base = freshState();
    try {
      const raw = localStorage.getItem(STATE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (!saved || saved.v !== STATE_VERSION) return base;
      const s = Object.assign(base, saved);
      s.stage = [1, 2, 3, 4].includes(s.stage) ? s.stage : 1;
      s.seen = s.seen && typeof s.seen === 'object' ? s.seen : {};
      s.found = Array.isArray(s.found) ? s.found.filter((id) => MOMENTS[id]) : [];
      s.fresh = Array.isArray(s.fresh) ? s.fresh.filter((id) => MOMENTS[id]) : [];
      if (!isScrambled(s.order)) s.order = makeTrayOrder();
      s.slots = Array.isArray(s.slots) && s.slots.length === SLOTS ? s.slots.map((id) => (MOMENTS[id] ? id : null)) : new Array(SLOTS).fill(null);
      s.pinned = Array.isArray(s.pinned) ? s.pinned.filter((id) => s.slots[ANSWER.indexOf(id)] === id) : [];
      s.accused = Array.isArray(s.accused) ? s.accused.filter((id) => PEOPLE[id] && id !== CULPRIT) : [];
      s.proofs = Object.assign({ door: null, entry: null, took: null }, s.proofs || {});
      s.hints = Object.assign({ 1: 0, 2: 0, 3: 0 }, s.hints || {});
      s.msgs = Array.isArray(s.msgs) ? s.msgs.filter((id) => MSGS[id]) : [];
      return s;
    } catch (_) {
      return base;
    }
  }
  function save() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) { /* storage blocked */ }
  }

  // Everything filled in: used when the room was solved on another device.
  function solvedState() {
    const s = freshState();
    s.stage = 4;
    ITEM_ORDER.forEach((id) => { s.seen[id] = true; });
    s.found = ANSWER.slice();
    s.slots = ANSWER.slice();
    s.pinned = ANSWER.slice();
    s.s1 = s.s2 = s.s3 = s.solved = true;
    s.replayed = true;
    s.proofs = { door: 'doorlog', entry: 'cam1', took: 'laptop' };
    s.msgs = MSG_ORDER.filter((id) => id !== 'nudge');
    return s;
  }

  let state = loadState();
  let selected = null;        // moment card picked up (tap-to-place)
  let suspectSel = null;      // suspect chosen before pressing Accuse
  let proofSel = null;        // proof slot chosen before clicking the board
  let bounced = [];           // cards that just bounced back to the tray
  let newMsgs = new Set();
  let newFound = [];          // moments uncovered by the last inspection
  let stageFeedback = null;   // { text, tone } shown under the current stage
  let closeupFeedback = null;
  let animateStrings = new Set();
  let replayTimers = [];

  // =====================================================================
  // Small helpers
  // =====================================================================
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // The bonus case is recorded as progress.forensics only (no code word).
  function roomSolved() {
    try { if (typeof window.vault?.isBonusComplete === 'function') return window.vault.isBonusComplete(ROOM) === true; } catch (_) { /* ignore */ }
    try { return utils?.readProgress?.()[ROOM] === true; } catch (_) { return false; }
  }

  // The room only opens once the team has cracked the vault on the Mission Hub.
  function vaultOpened() {
    try { if (window.vault?.isVaultOpened?.() === true) return true; } catch (_) { /* ignore */ }
    try { if (localStorage.getItem('vault_opened') === '1') return true; } catch (_) { /* ignore */ }
    try { return window.stateSync?.lastRemote?.vault?.opened === true; } catch (_) { return false; }
  }

  // Intermediate progress for the Mission Hub. Completion itself (100%) only
  // ever goes through finishRoom().
  function syncPct() {
    if (!utils?.setProgressPercent || state.solved || roomSolved()) return;
    let pct = 0;
    if (Object.keys(state.seen).length) pct = 5;
    if (state.found.length === SLOTS) pct = 20;
    if (state.s1) pct = 40;
    if (state.s2) pct = 70;
    if (!pct) return;
    const existing = utils.getProgressPercent?.(ROOM) ?? 0;
    if (existing >= pct) return;
    utils.setProgressPercent(ROOM, pct);
    try { window.stateSync?.saveNow?.('forensics-progress'); } catch (_) { /* ignore */ }
  }

  function say(id) {
    if (!MSGS[id] || state.msgs.includes(id)) return;
    state.msgs.push(id);
    newMsgs.add(id);
  }

  // =====================================================================
  // Drawings (inline SVG)
  // =====================================================================
  let svgSeq = 0;

  function person(x, y, o) {
    const s = o.scale || 1;
    const body = o.body || '#556070';
    const legs = o.legs || '#262b33';
    const skin = o.skin || '#d2a47f';
    let g = `<g transform="translate(${x} ${y}) scale(${s})">`;
    if (!o.sitting) {
      g += `<rect x="-9" y="-26" width="7" height="26" rx="2" fill="${legs}"/><rect x="2" y="-26" width="7" height="26" rx="2" fill="${legs}"/>`;
    }
    if (o.longHair && !o.hood) g += `<path d="M-11 -70 Q-12 -82 0 -82 Q12 -82 11 -70 L13 -50 L-13 -50 Z" fill="${o.longHair}"/>`;
    if (o.hoodDown) g += `<path d="M-13 -60 Q0 -52 13 -60 L11 -52 L-11 -52 Z" fill="${body}" opacity=".85"/>`;
    g += `<rect x="-12" y="-58" width="24" height="36" rx="7" fill="${body}"/>`;
    g += `<rect x="-17" y="-55" width="7" height="27" rx="3" fill="${body}"/><rect x="10" y="-55" width="7" height="27" rx="3" fill="${body}"/>`;
    if (o.hood) {
      g += `<ellipse cx="0" cy="-68" rx="12" ry="13" fill="${body}"/><ellipse cx="0" cy="-66" rx="7.5" ry="8.5" fill="#15110a"/>`;
    } else {
      g += `<rect x="-3" y="-62" width="6" height="6" fill="${skin}"/><circle cx="0" cy="-68" r="9" fill="${skin}"/>`;
      if (o.hair) g += `<path d="M-9.5 -69 Q-9 -80 0 -80 Q9 -80 9.5 -69 Q5 -75 0 -74 Q-5 -75 -9.5 -69 Z" fill="${o.hair}"/>`;
    }
    if (o.pizza) g += `<rect x="-21" y="-48" width="42" height="12" rx="1.5" fill="#c99a5f" stroke="#8a6436" stroke-width="1"/><rect x="-21" y="-48" width="42" height="3" fill="#e6c48e"/><circle cx="0" cy="-41" r="3" fill="#b2352f"/>`;
    if (o.usb) g += `<rect x="14" y="-31" width="6" height="9" rx="1" fill="#3d8bff"/>`;
    if (o.glass) g += `<path d="M13 -50 h8 l-1.5 10 h-5 z" fill="#d9f1ff" opacity=".9"/>`;
    g += '</g>';
    return g;
  }

  function cctv(scene, cam, stamp, label) {
    const id = `fxScan${++svgSeq}`;
    const camW = cam.length * 6.7 + 14;
    return `<svg viewBox="0 0 320 200" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}>
      <defs><pattern id="${id}" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1.2" fill="rgba(0,0,0,.22)"/></pattern></defs>
      ${scene}
      <rect width="320" height="200" fill="url(#${id})"/>
      <rect x="6" y="6" width="${camW}" height="17" rx="2" fill="rgba(0,0,0,.6)"/>
      <text x="13" y="18.5" font-family="ui-monospace,Consolas,monospace" font-size="11" font-weight="700" fill="#e9ffe9">${cam}</text>
      <circle cx="303" cy="14" r="4.5" fill="#ff3b3b"/>
      <rect x="186" y="172" width="128" height="22" rx="2" fill="rgba(0,0,0,.65)"/>
      <text x="250" y="188.5" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="14.5" font-weight="800" fill="#ffffff">${stamp}</text>
    </svg>`;
  }

  const COAT = '#e9b92c';

  function sceneCam1() {
    return `<rect width="320" height="200" fill="#36423c"/>
      <rect y="150" width="320" height="50" fill="#29322e"/>
      <rect x="34" y="58" width="62" height="42" fill="#2e3933" stroke="#4a5650" stroke-width="2"/>
      <rect x="40" y="64" width="20" height="14" fill="#56645d"/><rect x="64" y="66" width="26" height="9" fill="#56645d"/><rect x="44" y="84" width="40" height="8" fill="#4a5650"/>
      <rect x="150" y="40" width="74" height="112" fill="#0b100e"/>
      <rect x="150" y="96" width="74" height="56" fill="#0f1714"/>
      <rect x="146" y="36" width="82" height="6" fill="#5b6a62"/>
      <rect x="146" y="36" width="5" height="116" fill="#5b6a62"/><rect x="223" y="36" width="5" height="116" fill="#5b6a62"/>
      <polygon points="228,40 262,28 262,166 228,152" fill="#4b5852"/>
      <rect x="166" y="21" width="42" height="11" rx="1" fill="#1e7a46"/>
      <text x="187" y="30" text-anchor="middle" font-size="8" font-weight="800" fill="#c9ffd9" font-family="system-ui,sans-serif">EXIT</text>
      <ellipse cx="170" cy="168" rx="80" ry="8" fill="#000" opacity=".25"/>
      ${person(197, 150, { scale: 0.95, body: COAT, hood: true })}
      ${person(126, 174, { scale: 1.18, body: '#5c8f63', skin: '#efc6a2', hair: '#b8742e', pizza: true })}`;
  }

  function sceneCam2() {
    return `<rect width="320" height="200" fill="#1b2420"/>
      <rect y="142" width="320" height="58" fill="#141b18"/>
      <rect x="18" y="20" width="74" height="52" fill="#0d1822" stroke="#33413a" stroke-width="3"/>
      <circle cx="74" cy="36" r="5" fill="#cfd8c8" opacity=".7"/>
      <circle cx="270" cy="44" r="15" fill="#d9ddd6" stroke="#59625c" stroke-width="2"/>
      <line x1="270" y1="44" x2="263" y2="40" stroke="#222" stroke-width="2.6" stroke-linecap="round"/>
      <line x1="270" y1="44" x2="270" y2="32" stroke="#222" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="270" cy="44" r="1.6" fill="#222"/>
      <rect x="4" y="116" width="78" height="9" fill="#2e3934"/><rect x="22" y="94" width="34" height="22" fill="#222b27"/>
      <rect x="244" y="116" width="72" height="9" fill="#2e3934"/><rect x="262" y="94" width="34" height="22" fill="#222b27"/>
      <ellipse cx="165" cy="80" rx="34" ry="26" fill="#9fd1ff" opacity=".16"/>
      ${person(165, 142, { scale: 1.1, body: COAT, hood: true, sitting: true })}
      <rect x="96" y="118" width="138" height="12" fill="#3a463f"/>
      <rect x="104" y="130" width="122" height="44" fill="#29322d"/>
      <rect x="141" y="100" width="48" height="20" rx="2" fill="#2a3540"/>
      <circle cx="165" cy="110" r="3" fill="#56687a"/>
      <rect x="145" y="138" width="40" height="13" rx="1" fill="#e8e3d4"/>
      <text x="165" y="147.8" text-anchor="middle" font-size="8.5" font-weight="800" fill="#333" font-family="system-ui,sans-serif">MAYA</text>`;
  }

  function sceneCam3() {
    return `<rect width="320" height="200" fill="#1a211d"/>
      <rect width="320" height="66" fill="#0f1412"/>
      <rect x="248" y="18" width="72" height="146" fill="#2b332f"/>
      <rect x="262" y="96" width="22" height="44" fill="#c9b36a" opacity=".5"/>
      <path d="M22 178 L54 120 M84 178 L106 120 M146 178 L158 120" stroke="#5d6a62" stroke-width="2"/>
      <rect x="40" y="126" width="54" height="26" rx="9" fill="#38433d"/><rect x="48" y="118" width="36" height="12" rx="5" fill="#2f3833"/>
      <circle cx="52" cy="152" r="5" fill="#111"/><circle cx="84" cy="152" r="5" fill="#111"/>
      <rect x="208" y="36" width="4" height="134" fill="#4a5550"/><rect x="198" y="32" width="24" height="6" rx="2" fill="#5d6a62"/>
      <polygon points="199,38 221,38 266,176 154,176" fill="#ffe9a8" opacity=".08"/>
      ${person(178, 170, { scale: 1.02, body: COAT, hood: true, usb: true })}`;
  }

  function farewellSVG(label) {
    return `<svg viewBox="0 0 240 170" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}>
      <rect width="240" height="170" fill="#4b3b64"/>
      <rect x="176" y="14" width="52" height="66" fill="#243149" stroke="#6d5a8a" stroke-width="3"/>
      <path d="M184 20 l-6 18 M198 22 l-6 18 M212 18 l-6 18 M190 46 l-6 18 M206 48 l-6 18 M220 44 l-6 18" stroke="#8fb3e0" stroke-width="1.4" opacity=".8"/>
      <path d="M0 14 Q90 34 172 14" stroke="#e6dccd" fill="none"/>
      <polygon points="14,17 24,17 19,27" fill="#ff7eb6"/><polygon points="40,21 50,21 45,31" fill="#ffd36b"/><polygon points="66,24 76,24 71,34" fill="#7fe0d0"/>
      <polygon points="96,25 106,25 101,35" fill="#ff7eb6"/><polygon points="124,23 134,23 129,33" fill="#ffd36b"/><polygon points="150,19 160,19 155,29" fill="#7fe0d0"/>
      <rect x="36" y="40" width="128" height="20" rx="3" fill="#fff4d6"/>
      <text x="100" y="54" text-anchor="middle" font-size="10.5" font-weight="800" fill="#b0306a" font-family="system-ui,sans-serif">GOOD LUCK LENA!</text>
      <circle cx="20" cy="70" r="11" fill="#ff7eb6"/><path d="M20 81 q3 12 -2 26" stroke="#eee" fill="none"/>
      <circle cx="222" cy="98" r="10" fill="#ffd36b"/><path d="M222 108 q-3 10 2 22" stroke="#eee" fill="none"/>
      <rect y="140" width="240" height="30" fill="#3a2d4a"/>
      ${person(62, 160, { body: '#3b6fd6', skin: '#8d5a3b', hair: '#1e1410', glass: true })}
      ${person(120, 162, { scale: 1.06, body: '#f2c230', skin: '#f3cfb3', longHair: '#b5532a', hoodDown: true, glass: true })}
      ${person(178, 160, { body: '#5c8f63', skin: '#efc6a2', hair: '#b8742e' })}
    </svg>`;
  }

  function portrait(id, label) {
    const p = PEOPLE[id];
    let back = '';
    let front = '';
    if (p.style === 'long') {
      back = `<path d="M23 38 Q21 15 40 15 Q59 15 57 38 L61 66 L19 66 Z" fill="${p.hair}"/>`;
      front = `<path d="M25 33 Q26 19 40 19 Q54 19 55 33 Q48 25 40 26 Q31 25 25 33 Z" fill="${p.hair}"/>`;
    } else if (p.style === 'bun') {
      back = `<circle cx="40" cy="15" r="8" fill="${p.hair}"/>`;
      front = `<path d="M25 34 Q25 18 40 18 Q55 18 55 34 Q50 25 40 25 Q30 25 25 34 Z" fill="${p.hair}"/>`;
    } else if (p.style === 'cap') {
      front = `<path d="M24 32 Q24 16 40 16 Q56 16 56 32 Z" fill="${p.hair}"/><rect x="40" y="29" width="22" height="5" rx="2" fill="${p.hair}"/>`;
    } else if (p.style === 'beard') {
      front = `<path d="M26 31 Q27 19 40 19 Q53 19 54 31 Q48 26 40 26 Q32 26 26 31 Z" fill="${p.hair}"/><path d="M27 42 Q40 63 53 42 Q50 52 40 53 Q30 52 27 42 Z" fill="${p.hair}"/>`;
    } else {
      front = `<path d="M25 34 Q25 17 40 17 Q55 17 55 34 Q50 24 40 24 Q30 24 25 34 Z" fill="${p.hair}"/>`;
    }
    return `<svg viewBox="0 0 80 90" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}>
      <rect width="80" height="90" fill="${p.bg}"/>
      ${back}
      <path d="M6 90 Q8 64 40 61 Q72 64 74 90 Z" fill="${p.top}"/>
      <rect x="34" y="50" width="12" height="13" fill="${p.skin}"/>
      <ellipse cx="40" cy="38" rx="15" ry="17" fill="${p.skin}"/>
      ${front}
      <circle cx="34" cy="38" r="1.8" fill="#222"/><circle cx="46" cy="38" r="1.8" fill="#222"/>
      <path d="M35 46 Q40 50 45 46" stroke="#5a2e22" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  function unknownSVG() {
    const id = `fxScan${++svgSeq}`;
    return `<svg viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <defs><pattern id="${id}" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1.2" fill="rgba(0,0,0,.25)"/></pattern></defs>
      <rect width="160" height="120" fill="#26302b"/>
      <path d="M40 120 Q44 74 80 70 Q116 74 120 120 Z" fill="${COAT}"/>
      <ellipse cx="80" cy="52" rx="27" ry="30" fill="${COAT}"/>
      <ellipse cx="80" cy="56" rx="17" ry="20" fill="#15110a"/>
      <text x="80" y="66" text-anchor="middle" font-size="26" font-weight="900" fill="${COAT}" font-family="system-ui,sans-serif">?</text>
      <rect width="160" height="120" fill="url(#${id})"/>
    </svg>`;
  }

  // Board thumbnails (decorative; the button carries the label)
  function thumb(item) {
    switch (item) {
      case 'cam1': return `<span class="fx-thumb fx-thumb--polaroid">${cctv(sceneCam1(), 'CAM 1 · SIDE DOOR', 'FRI 21:42:10')}</span>`;
      case 'cam2': return `<span class="fx-thumb fx-thumb--polaroid">${cctv(sceneCam2(), 'CAM 2 · STUDIO', 'FRI 23:01:37')}</span>`;
      case 'cam3': return `<span class="fx-thumb fx-thumb--polaroid">${cctv(sceneCam3(), 'CAM 3 · CAR PARK', 'FRI 22:09:52')}</span>`;
      case 'doorlog': return `<span class="fx-thumb fx-thumb--paper"><span class="fx-mini-title">Door log</span><span class="fx-mini"></span><span class="fx-mini"></span><span class="fx-mini"></span><span class="fx-mini fx-mini--red"></span><span class="fx-mini"></span><span class="fx-mini"></span></span>`;
      case 'laptop': return `<span class="fx-thumb fx-thumb--screen"><svg viewBox="0 0 120 80" aria-hidden="true" focusable="false"><rect width="120" height="70" rx="4" fill="#0f1724"/><rect x="8" y="10" width="70" height="5" rx="2" fill="#8fb6e8"/><rect x="8" y="22" width="96" height="4" rx="2" fill="#4c6688"/><rect x="8" y="32" width="88" height="4" rx="2" fill="#4c6688"/><rect x="8" y="42" width="100" height="4" rx="2" fill="#ffb36b"/><rect x="8" y="52" width="80" height="4" rx="2" fill="#4c6688"/><rect x="-6" y="70" width="132" height="8" rx="3" fill="#56606e"/></svg></span>`;
      case 'notebook': return `<span class="fx-thumb fx-thumb--note"><span class="fx-scrawl" style="text-align:left;color:#1f2a44">Fri 21:30&hellip;<br>Fri 22:30&hellip;</span></span>`;
      case 'sticky': return `<span class="fx-thumb fx-thumb--sticky"><span class="fx-scrawl">CAM 2 &hellip;!!</span></span>`;
      case 'receipt': return `<span class="fx-thumb fx-thumb--receipt"><span class="fx-mini-title" style="text-align:center">Slice Society</span><span class="fx-mini"></span><span class="fx-mini"></span><span class="fx-mini"></span><span class="fx-mini"></span></span>`;
      case 'itnotice': return `<span class="fx-thumb fx-thumb--paper" style="border-top:7px solid #2f6fd6"><span class="fx-mini-title" style="color:#173a7a">IT notice</span><span class="fx-mini"></span><span class="fx-mini"></span><span class="fx-mini"></span><span class="fx-mini"></span></span>`;
      case 'farewell': return `<span class="fx-thumb fx-thumb--polaroid">${farewellSVG()}</span>`;
      default: return '';
    }
  }

  // Close-up content for each item
  function evidenceHTML(item) {
    switch (item) {
      case 'cam1':
        return `<div class="fx-cctv-wrap">${cctv(sceneCam1(), 'CAM 1 · SIDE DOOR', 'FRI 21:42:10', 'Camera 1 still, side door, time stamp Friday 21:42')}</div>
          <p>Theo is coming back in through the side door with a pizza box. Right behind him, someone in a <strong>yellow raincoat</strong> with the hood up. You can't see their face.</p>`;
      case 'cam2':
        return `<div class="fx-cctv-wrap">${cctv(sceneCam2(), 'CAM 2 · STUDIO', 'FRI 23:01:37', 'Camera 2 still, design studio, time stamp Friday 23:01')}</div>
          <p>The studio is dark. Someone in the yellow raincoat, hood still up, is sitting at <strong>Maya's desk</strong>, using her laptop. There's a clock on the wall behind them.</p>`;
      case 'cam3':
        return `<div class="fx-cctv-wrap">${cctv(sceneCam3(), 'CAM 3 · CAR PARK', 'FRI 22:09:52', 'Camera 3 still, car park, time stamp Friday 22:09')}</div>
          <p>The yellow raincoat hurries across the car park towards the street, holding something small in one hand.</p>`;
      case 'doorlog':
        return `<div class="fx-paper">
          <div class="fx-paper__title">Copperleaf Games · Door log · Friday</div>
          <div class="fx-log-wrap"><table class="fx-log">
            <thead><tr><th>Time</th><th>Door</th><th>Badge</th><th>Result</th></tr></thead>
            <tbody>
              <tr><td>17:58</td><td>Front</td><td>#0522 Ruth Diaz</td><td>Out</td></tr>
              <tr><td>18:47</td><td>Front</td><td>#0233 Maya Okoye</td><td>Out</td></tr>
              <tr><td>19:15</td><td>Front</td><td>#0108 Rosa Hollis</td><td>Out</td></tr>
              <tr class="is-bad"><td>21:38</td><td>Front</td><td>#0417 (cancelled)</td><td>REFUSED</td></tr>
              <tr><td>21:42</td><td>Side</td><td>#0350 Theo Wren</td><td>In</td></tr>
              <tr><td>22:20</td><td>Front</td><td>#0350 Theo Wren</td><td>Out</td></tr>
            </tbody>
          </table></div>
          <p class="fx-paper__foot">One line = one badge swipe. Cancelled badges show no name. The doors can't tell if someone walks through without swiping.</p>
        </div>`;
      case 'laptop':
        return `<div class="fx-screen">
          <div class="fx-screen__bar">Maya's laptop · Activity history</div>
          <ul class="fx-activity">
            <li class="is-warn"><time>Fri 18:45</time><span>Maya's last activity. <b>Screen lock: OFF</b> (it never locks by itself)</span></li>
            <li class="is-warn"><time>Fri 22:02</time><span>Laptop woken up. <b>No password asked.</b></span></li>
            <li><time>Fri 22:03</time><span>USB stick plugged in: "BLUE 32GB"</span></li>
            <li class="is-warn"><time>Fri 22:04</time><span>Folder <b>"Project Aurora"</b> copied to "BLUE 32GB" (312 files)</span></li>
            <li><time>Fri 22:06</time><span>USB stick removed</span></li>
            <li><time>Fri 22:30</time><span>Lid closed. Laptop asleep.</span></li>
          </ul>
        </div>`;
      case 'notebook':
        return `<div class="fx-notebook fx-hand">
          <p>Fri 21:30 &ndash; Round 1. All quiet. Theo still here, working late on the Aurora box art. Ordered pizza (again!).</p>
          <p>Fri 22:30 &ndash; Round 2. Studio empty. Maya's laptop left open on her desk AGAIN. Closed the lid for her.</p>
          <p>Fri 23:00 &ndash; Locked the side door. Quiet night.</p>
          <p>Sat 07:40 &ndash; Rosa rang. Aurora designs all over the internet?!</p>
        </div>`;
      case 'sticky':
        return `<div class="fx-stickynote fx-hand">CAMERA 2 (studio): its clock is running <strong>1 HOUR FAST</strong>!! Must get it fixed. <br>&ndash; Glen</div>
          <p>Stuck to the corner of the camera screen at the guard desk.</p>`;
      case 'receipt':
        return `<div class="fx-receipt">
          <strong>SLICE SOCIETY PIZZA</strong><br>Order #2291
          <hr>
          <div class="fx-receipt__row"><span>For:</span><span>Theo</span></div>
          <div class="fx-receipt__row"><span>To:</span><span>Copperleaf Games, SIDE DOOR</span></div>
          <hr>
          <div class="fx-receipt__row"><span>1 x Large Hawaiian</span><span>$24</span></div>
          <div class="fx-receipt__row"><span>1 x Garlic bread</span><span>$7</span></div>
          <hr>
          Delivered: 9:40 pm<br>Paid by card. Thank you!
        </div>`;
      case 'itnotice':
        return `<div class="fx-notice">
          <h4>IT NOTICE: cancelled badges (September)</h4>
          <p style="margin:0">These badges no longer open any door. If you find one, hand it in at reception.</p>
          <ul>
            <li><strong>#0388</strong> Ruth Diaz: reported lost on 12 September (new badge issued)</li>
            <li><strong>#0417</strong> Lena Fox: left Copperleaf on 30 September</li>
          </ul>
        </div>`;
      case 'farewell':
        return `<div class="fx-photo">${farewellSVG('Photo of a leaving party: three colleagues with drinks, the one in the middle wearing a yellow raincoat')}
          <div class="fx-photo__caption fx-hand">Lena's leaving drinks, 30 Sept. Off to Tinderbox Games! (It poured all night, hence the raincoat.)</div></div>`;
      default:
        return '';
    }
  }

  function planSVG() {
    const actor = (id, letter, fill) =>
      `<g class="fx-actor" data-actor="${id}"><circle r="12" fill="${fill}" stroke="#0b0f14" stroke-width="2"/><text class="fx-plan-actor-txt">${letter}</text></g>`;
    return `<svg viewBox="0 0 640 360" role="img" aria-label="Floor plan of the Copperleaf office replaying Friday night">
      <rect width="640" height="360" fill="#0c1219"/>
      <rect width="128" height="322" fill="#151d18"/>
      <path d="M14 70 h96 M14 130 h96 M14 190 h96" stroke="#2c3a31" stroke-width="2"/>
      <text x="64" y="22" text-anchor="middle" class="fx-plan-lbl">Car park</text>
      <rect y="322" width="640" height="38" fill="#11161d"/>
      <text x="590" y="346" text-anchor="middle" class="fx-plan-lbl">Street</text>
      <rect x="128" y="2" width="510" height="320" fill="#18212c" stroke="#3a4a5e" stroke-width="4"/>
      <path d="M128 206 H330 M420 206 H638" stroke="#3a4a5e" stroke-width="4"/>
      <text x="146" y="26" class="fx-plan-lbl">Design studio</text>
      <rect x="200" y="56" width="110" height="26" rx="3" fill="#2b3646"/><text x="255" y="48" text-anchor="middle" class="fx-plan-lbl">Theo</text>
      <rect x="420" y="56" width="110" height="26" rx="3" fill="#2b3646"/><text x="475" y="48" text-anchor="middle" class="fx-plan-lbl">Maya</text>
      <rect x="200" y="142" width="110" height="26" rx="3" fill="#232d3b"/><rect x="420" y="142" width="110" height="26" rx="3" fill="#232d3b"/>
      <rect class="fx-plan-laptop" x="462" y="61" width="26" height="16" rx="2" fill="#9fd1ff"/>
      <text x="476" y="232" text-anchor="middle" class="fx-plan-lbl">Lobby</text>
      <rect x="524" y="252" width="80" height="24" rx="3" fill="#2b3646"/><text x="564" y="294" text-anchor="middle" class="fx-plan-lbl">Guard desk</text>
      <text x="230" y="232" text-anchor="middle" class="fx-plan-lbl">Corridor</text>
      <rect x="124" y="236" width="8" height="40" fill="#e0b54a"/><text x="168" y="298" text-anchor="middle" class="fx-plan-lbl">Side door</text>
      <rect x="380" y="318" width="60" height="8" fill="#e0b54a"/><text x="410" y="310" text-anchor="middle" class="fx-plan-lbl">Front door</text>
      <g class="fx-plan-flash" data-flash="front"><rect x="442" y="326" width="76" height="22" rx="4" fill="#c41f1f"/><text x="480" y="341" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">REFUSED</text></g>
      <g class="fx-plan-flash" data-flash="usb"><rect x="494" y="86" width="104" height="22" rx="4" fill="#3d8bff"/><text x="546" y="101" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">Copying to USB</text></g>
      ${actor('maya', 'M', '#6f9bff')}
      ${actor('theo', 'T', '#6bd38b')}
      ${actor('glen', 'G', '#b9a2ff')}
      ${actor('coat', '?', COAT)}
      <rect x="512" y="8" width="118" height="30" rx="6" fill="#000" stroke="#2a3a2e"/>
      <text class="fx-plan-clock" x="571" y="29" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="16" font-weight="800" fill="#7dffb0">FRI 18:40</text>
    </svg>`;
  }

  // =====================================================================
  // Board
  // =====================================================================
  function buildBoard() {
    const frag = document.createDocumentFragment();
    ITEM_ORDER.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fx-item';
      b.dataset.item = id;
      b.innerHTML = `<span class="fx-pin" aria-hidden="true"></span>${thumb(id)}<span class="fx-item__label">${esc(ITEMS[id].label)}</span>`;
      frag.appendChild(b);
    });
    const who = document.createElement('div');
    who.className = 'fx-who';
    who.id = 'fxWho';
    frag.appendChild(who);
    els.board.insertBefore(frag, els.strings);
  }

  function renderBoard() {
    $$('.fx-item', els.board).forEach((b) => {
      const id = b.dataset.item;
      const seen = !!state.seen[id];
      const proofOf = PROOFS.find((p) => state.proofs[p.id] === id);
      b.classList.toggle('is-seen', seen);
      b.classList.toggle('is-active', state.focus === id);
      b.classList.toggle('is-proof', !!proofOf);
      b.classList.toggle('is-target', state.stage === 3 && !state.s3 && !!proofSel && !proofOf);
      let label = ITEMS[id].label + (seen ? ' (looked at)' : '');
      if (proofOf) label += `, pinned as proof: ${proofOf.label}`;
      if (state.stage === 3 && !state.s3 && proofSel) label += `. Press to pin as proof: ${PROOFS.find((p) => p.id === proofSel).label}`;
      b.setAttribute('aria-label', label);
    });
    const who = $('#fxWho');
    if (who) {
      if (state.s2) {
        who.innerHTML = `<span class="fx-pin" aria-hidden="true"></span><div class="fx-who__photo">${portrait('lena', 'Photo of Lena Fox')}<span class="fx-who__stamp">${state.s3 ? 'Proven' : 'Identified'}</span></div><div class="fx-who__caption">Lena Fox</div>`;
      } else {
        who.innerHTML = `<span class="fx-pin" aria-hidden="true"></span><div class="fx-who__photo">${unknownSVG()}</div><div class="fx-who__caption">${state.s1 ? 'Who was in the raincoat?' : 'Who did it?'}</div>`;
      }
    }
    if (els.help) {
      let help = 'Click anything on the evidence board to take a closer look. Moments you uncover drop into the tray below the board.';
      let target = false;
      if (state.stage === 2) help = 'The answer is somewhere on the board. Click anything to look again.';
      if (state.stage === 3 && !state.s3) {
        if (proofSel) {
          help = `Now click the item on the board that proves: "${PROOFS.find((p) => p.id === proofSel).q}".`;
          target = true;
        } else {
          help = 'Choose a proof below the board, then click the evidence that proves it (or open an item and use its "Pin as proof" buttons).';
        }
      }
      if (state.stage === 4) help = 'Case closed. You can still look through the evidence.';
      els.help.textContent = help;
      els.help.classList.toggle('is-target', target);
    }
    if (els.stamp) els.stamp.hidden = !state.solved;
  }

  // ---- Red string ----
  function pinPoint(el, box) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - box.left, y: r.top + 1 - box.top };
  }
  function drawStrings() {
    const svg = els.strings;
    if (!svg) return;
    const b = els.board.getBoundingClientRect();
    const box = { left: b.left + els.board.clientLeft, top: b.top + els.board.clientTop };
    svg.setAttribute('viewBox', `0 0 ${els.board.clientWidth} ${els.board.clientHeight}`);
    const at = (id) => {
      const el = id === 'who' ? $('#fxWho .fx-pin') : $(`.fx-item[data-item="${id}"] .fx-pin`, els.board);
      return el ? pinPoint(el, box) : null;
    };
    const lines = [];
    if (state.s1 && state.stage < 3) {
      const chain = [];
      ANSWER.forEach((m) => { const it = MOMENTS[m].from; if (chain[chain.length - 1] !== it) chain.push(it); });
      for (let i = 0; i < chain.length - 1; i++) lines.push({ key: `t:${chain[i]}:${chain[i + 1]}`, a: chain[i], b: chain[i + 1], faint: state.s2 });
    }
    if (state.s2) {
      ['itnotice', 'farewell'].forEach((it) => lines.push({ key: `w:${it}`, a: it, b: 'who', faint: state.s3 }));
    }
    PROOFS.forEach((p) => { if (state.proofs[p.id]) lines.push({ key: `p:${p.id}`, a: state.proofs[p.id], b: 'who' }); });

    let html = '';
    lines.forEach((ln) => {
      const p1 = at(ln.a);
      const p2 = at(ln.b);
      if (!p1 || !p2) return;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const sag = Math.min(46, dist * 0.14);
      const d = `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q${((p1.x + p2.x) / 2).toFixed(1)} ${((p1.y + p2.y) / 2 + sag).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      const anim = animateStrings.has(ln.key) && !REDUCED();
      const len = Math.ceil(dist + sag * 2);
      html += `<path class="fx-string${ln.faint ? ' fx-string--faint' : ''}${anim ? ' is-drawing' : ''}" style="--len:${len}" d="${d}"/>`;
    });
    svg.innerHTML = html;
    animateStrings = new Set();
  }

  function snapString(itemId) {
    const svg = els.strings;
    const b = els.board.getBoundingClientRect();
    const box = { left: b.left + els.board.clientLeft, top: b.top + els.board.clientTop };
    const a = $(`.fx-item[data-item="${itemId}"] .fx-pin`, els.board);
    const w = $('#fxWho .fx-pin');
    if (!svg || !a || !w || REDUCED()) return;
    const p1 = pinPoint(a, box);
    const p2 = pinPoint(w, box);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'fx-string is-snap');
    path.setAttribute('d', `M${p1.x} ${p1.y} L${p2.x} ${p2.y}`);
    svg.appendChild(path);
    setTimeout(() => path.remove(), 1000);
  }

  // ---- Close-up ----
  function inspect(item, userAction) {
    if (!ITEMS[item]) return;
    state.focus = item;
    closeupFeedback = null;
    const firstLook = !state.seen[item];
    state.seen[item] = true;
    newFound = [];
    momentsFrom(item).forEach((m) => {
      if (!state.found.includes(m)) {
        state.found.push(m);
        state.fresh.push(m);
        newFound.push(m);
      }
    });
    if (item === 'sticky' && firstLook) say('sticky');
    if (newFound.length && state.found.length === SLOTS) say('all_found');
    save();
    syncPct();
    renderFeed();
    renderBoard();
    renderCloseup();
    if (newFound.length) {
      renderStage();
      const tray = $('.fx-tray', els.stage);
      if (tray && !REDUCED()) { tray.classList.remove('is-pulse'); void tray.offsetWidth; tray.classList.add('is-pulse'); }
      announce(`New moment found: ${newFound.map((m) => MOMENTS[m].text).join('. ')}. Added to the timeline tray.`);
    }
    if (userAction && NARROW()) {
      els.closeup.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function renderCloseup() {
    const item = state.focus;
    if (!item || !ITEMS[item]) {
      els.closeup.innerHTML = '<p class="fx-closeup-empty">Nothing picked up yet. Click something on the evidence board to look at it up close.</p>';
      return;
    }
    let h = `<p class="fx-eyebrow">${esc(ITEMS[item].eyebrow)}</p><h3>${esc(ITEMS[item].label)}</h3>${evidenceHTML(item)}`;
    const ms = momentsFrom(item);
    if (ms.length && !state.s1) {
      const fresh = ms.filter((m) => newFound.includes(m));
      if (fresh.length) {
        h += `<div class="fx-found is-new"><strong>New moment found!</strong> Added to your timeline tray below the board: ${fresh.map((m) => `<br>&ldquo;${esc(MOMENTS[m].text)}&rdquo;`).join('')}</div>`;
      } else {
        h += `<div class="fx-found">The moment${ms.length > 1 ? 's' : ''} from this evidence ${ms.length > 1 ? 'are' : 'is'} already in your tray or on the timeline.</div>`;
      }
    }
    if (state.stage === 3 && !state.s3) {
      const open = PROOFS.filter((p) => !state.proofs[p.id]);
      const usedAs = PROOFS.find((p) => state.proofs[p.id] === item);
      if (usedAs) {
        h += `<div class="fx-found">Pinned to Lena's photo as proof: <strong>${esc(usedAs.label)}</strong>.</div>`;
      } else if (open.length) {
        h += `<p class="fx-eyebrow" style="margin-top:.8rem">Pin to Lena's photo as proof of&hellip;</p><div class="fx-closeup__actions">${open.map((p) => `<button type="button" class="btn sm" data-pinproof="${p.id}" data-item="${item}">${esc(p.label)}</button>`).join('')}</div>`;
      }
      if (closeupFeedback) h += `<p class="fx-feedback is-${closeupFeedback.tone}" style="margin-top:.6rem">${esc(closeupFeedback.text)}</p>`;
    }
    h += '<div class="fx-closeup__actions"><button type="button" class="btn ghost sm fx-closeup__back" data-action="to-board">Back to the board</button></div>';
    els.closeup.innerHTML = h;
  }

  // =====================================================================
  // Feed, hints, stage pill
  // =====================================================================
  function renderFeed() {
    els.feed.innerHTML = '';
    state.msgs.forEach((id) => {
      const m = MSGS[id];
      const div = document.createElement('div');
      div.className = `fx-msg${m.tone ? ` is-${m.tone}` : ''}${newMsgs.has(id) ? ' is-new' : ''}`;
      div.innerHTML = `<span class="fx-who-name fx-who-name--${m.who}">${m.who === 'rosa' ? 'Rosa' : 'Glen'}</span>${m.text}`;
      els.feed.appendChild(div);
    });
    els.feed.scrollTop = els.feed.scrollHeight;
    newMsgs = new Set();
  }

  function hintStage() {
    if (state.stage === 1 && !state.s1) return 1;
    if (state.stage === 2 && !state.s2) return 2;
    if (state.stage === 3 && !state.s3) return 3;
    return 0;
  }

  function renderHints() {
    const hs = hintStage();
    const shown = hs ? Math.min(3, state.hints[hs] || 0) : 0;
    if (!hs) {
      els.hintBtn.hidden = true;
      els.hints.hidden = true;
      return;
    }
    els.hintBtn.hidden = false;
    if (shown >= 3) {
      els.hintBtn.textContent = 'All hints shown';
      els.hintBtn.disabled = true;
    } else {
      els.hintBtn.textContent = `Hint ${shown + 1} of 3 (free)`;
      els.hintBtn.disabled = false;
    }
    if (!shown) {
      els.hints.hidden = true;
      els.hints.innerHTML = '';
      return;
    }
    els.hints.hidden = false;
    els.hints.innerHTML = `<p class="fx-hints__title">Hints</p><ol>${HINTS[hs].slice(0, shown).map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
  }

  els.hintBtn.addEventListener('click', () => {
    const hs = hintStage();
    if (!hs) return;
    const shown = state.hints[hs] || 0;
    if (shown >= 3) return;
    state.hints[hs] = shown + 1;
    save();
    renderHints();
    announce(`Hint ${shown + 1}: ${HINTS[hs][shown]}`);
  });

  function renderPill() {
    els.pillTitle.textContent = STAGE_TITLES[state.stage];
    els.pill.classList.toggle('is-done', state.stage === 4);
  }

  // =====================================================================
  // Stage panel
  // =====================================================================
  function slotLabel(i) {
    if (i === 0) return '1 · Earliest';
    if (i === SLOTS - 1) return `${SLOTS} · Latest`;
    return String(i + 1);
  }

  function cardButton(id, slotIdx) {
    const m = MOMENTS[id];
    const cls = ['fx-mcard'];
    if (selected === id) cls.push('is-selected');
    if (state.fresh.includes(id)) cls.push('is-new');
    if (bounced.includes(id)) cls.push('is-bounced');
    const where = slotIdx >= 0 ? `Placed in position ${slotIdx + 1} of ${SLOTS}.` : 'In the tray.';
    const act = selected === id ? 'Picked up: now choose a position.' : 'Press to pick up.';
    return `<button type="button" class="${cls.join(' ')}" data-moment="${id}" draggable="true" aria-pressed="${selected === id}" aria-label="${esc(`${m.text}. ${where} ${act}`)}">${esc(m.text)}</button>`;
  }

  function timelineHTML(interactive) {
    let h = `<ol class="fx-slots" aria-label="Friday night, earliest first">`;
    for (let i = 0; i < SLOTS; i++) {
      const id = state.slots[i];
      const pinned = !!id && state.pinned.includes(id);
      h += `<li class="fx-slot${id ? ' is-filled' : ''}${pinned ? ' is-pinned' : ''}" data-slot="${i}"><span class="fx-slot__num" aria-hidden="true">${slotLabel(i)}</span>`;
      if (!id) {
        if (interactive) {
          const ready = !!selected;
          h += `<button type="button" class="fx-slot__drop${ready ? ' is-ready' : ''}" data-slot="${i}" aria-label="Position ${i + 1} of ${SLOTS}${i === 0 ? ', earliest' : i === SLOTS - 1 ? ', latest' : ''}: empty.${ready ? ' Press to place the card you picked up here.' : ''}">${ready ? 'Place here' : 'Empty'}</button>`;
        } else {
          h += '<span class="fx-slot__drop">Empty</span>';
        }
      } else if (pinned || !interactive) {
        const m = MOMENTS[id];
        h += `<div class="fx-mcard is-pinned"><span class="fx-mcard__time">${m.time}</span>${esc(m.text)}${m.note ? `<span class="fx-mcard__note">${esc(m.note)}</span>` : ''}</div>`;
      } else {
        h += cardButton(id, i);
        h += `<button type="button" class="fx-slot__out" data-out="${id}" aria-label="${esc(`Send "${MOMENTS[id].text}" back to the tray`)}">&times;</button>`;
      }
      h += '</li>';
    }
    return h + '</ol>';
  }

  function trayIds() {
    return state.order.filter((id) => state.found.includes(id) && !state.slots.includes(id));
  }

  function feedbackHTML(id) {
    const f = stageFeedback;
    return `<p class="fx-feedback${f ? ` is-${f.tone}` : ''}" id="${id}" role="status">${f ? esc(f.text) : ''}</p>`;
  }

  function stage1HTML() {
    if (state.s1) {
      return `<div class="fx-tl">
          <div class="fx-tl__head"><h3>Friday night, rebuilt</h3><span class="fx-tl__axis">Earliest &rarr; latest</span></div>
          ${timelineHTML(false)}
        </div>
        ${replayHTML()}
        <div class="fx-row"><button type="button" class="btn primary" data-action="to-stage2">Next: who was in the raincoat? &rarr;</button></div>`;
    }
    const tray = trayIds();
    const found = state.found.length;
    return `<div class="fx-tl">
        <div class="fx-tl__head"><h3>Friday night</h3><span class="fx-tl__axis">Earliest &rarr; latest</span></div>
        <p class="fx-stage__intro">Put the moments in the order they happened. Drag a card onto a position, or tap a card and then tap a position. Each moment's time is somewhere in the evidence on the board.</p>
        <div class="fx-tray" data-tray="1">
          <h4>Moments found <small>${found} of ${SLOTS} found${found < SLOTS ? ': keep searching the board' : ''}</small></h4>
          ${tray.length ? `<div class="fx-tray__cards">${tray.map((id) => cardButton(id, -1)).join('')}</div>` : `<p class="fx-tray__empty">${found ? 'All the moments you have found are on the timeline.' : 'Nothing yet. Open the evidence on the board: each moment you uncover lands here.'}</p>`}
        </div>
        ${timelineHTML(true)}
        <div class="fx-row">
          <button type="button" class="btn primary" data-action="check">Check the timeline</button>
        </div>
        ${feedbackHTML('fxTimelineFeedback')}
      </div>`;
  }

  function stage2HTML() {
    if (state.s2) {
      return `<div class="fx-tl">
          <h3>Unmasked: Lena Fox</h3>
          <p class="fx-stage__intro">Badge 0417 was refused at the front door at 21:38. The IT notice says 0417 was Lena Fox's badge, cancelled when she left for Tinderbox Games, the studio that posted Aurora. Her leaving-drinks photo shows the same yellow raincoat.</p>
          <div class="fx-row"><button type="button" class="btn primary" data-action="to-stage3">Next: prove it &rarr;</button></div>
        </div>`;
    }
    const chosen = suspectSel ? PEOPLE[suspectSel].name : null;
    return `<div class="fx-tl">
        <h3>Who was in the yellow raincoat?</h3>
        <p class="fx-stage__intro">Choose a suspect, then press Accuse. Check your choice against the evidence on the board first.</p>
        <div class="fx-suspects" role="group" aria-label="Suspects">
          ${SUSPECTS.map((s) => {
            const out = state.accused.includes(s.id);
            return `<button type="button" class="fx-suspect${suspectSel === s.id ? ' is-selected' : ''}${out ? ' is-out' : ''}" data-suspect="${s.id}" aria-pressed="${suspectSel === s.id}" ${out ? 'aria-disabled="true"' : ''} aria-label="${esc(`${PEOPLE[s.id].name}. ${s.role}${out ? ' Ruled out.' : ''}`)}">
              ${portrait(s.id)}
              <span class="fx-suspect__name">${esc(PEOPLE[s.id].name)}</span>
              <span class="fx-suspect__role">${esc(s.role)}</span>
              ${out ? '<span class="fx-suspect__out" aria-hidden="true">Ruled out</span>' : ''}
            </button>`;
          }).join('')}
        </div>
        <div class="fx-row"><button type="button" class="btn primary" data-action="accuse" ${chosen ? '' : 'disabled'}>${chosen ? `Accuse ${esc(chosen)}` : 'Choose a suspect to accuse'}</button></div>
        ${feedbackHTML('fxAccuseFeedback')}
      </div>`;
  }

  function stage3HTML() {
    return `<div class="fx-tl">
        <h3>Prove it</h3>
        <p class="fx-stage__intro">Rosa needs three pieces of proof for the police. Choose a proof below, then click the item on the board that proves it.</p>
        <div class="fx-proofs" role="group" aria-label="Proofs to pin to Lena's photo">
          ${PROOFS.map((p) => {
            const done = state.proofs[p.id];
            const sel = proofSel === p.id;
            return `<button type="button" class="fx-proof${done ? ' is-done' : ''}${sel ? ' is-selected' : ''}" data-proof="${p.id}" aria-pressed="${sel}" ${done ? 'aria-disabled="true"' : ''}>
              <span class="fx-proof__label">${esc(p.label)}</span>
              <span class="fx-proof__q">${esc(p.q)}</span>
              <span class="fx-proof__state">${done ? `Pinned: ${esc(ITEMS[done].label)}` : sel ? 'Now click the evidence on the board' : 'Choose this, then click the evidence'}</span>
            </button>`;
          }).join('')}
        </div>
        ${feedbackHTML('fxProofFeedback')}
      </div>`;
  }

  // The debrief lives in the end card (renderComplete), above the board.
  function debriefHTML() {
    return `<div class="fx-closed">
        <h3>What happened</h3>
        <p>Lena Fox left Copperleaf in September to join Tinderbox Games. On Friday night her old badge was refused at the front door, so she slipped in behind Theo at the side door, went straight to Maya's unlocked laptop, and copied Project Aurora onto a USB stick in a few minutes.</p>
      </div>
      <div class="fx-debrief">
        <div class="fx-debrief__bad"><h4>What let her in</h4><p>Theo held the side door open for someone he didn't know. Maya's laptop had no screen lock, so anyone could use it.</p></div>
        <div class="fx-debrief__good"><h4>What caught her</h4><p>Her badge was cancelled the day she left, so the door logged her failed try. The cameras and the laptop history filled in the rest, once you spotted that Camera 2's clock was an hour fast.</p></div>
        <div class="fx-debrief__tip"><h4>Take this back to your desk</h4><ul>
          <li>Lock your screen every time you walk away (Windows key + L, or Control + Command + Q on a Mac).</li>
          <li>Don't hold secure doors open for people you don't know. Let them use their own badge or send them to reception.</li>
          <li>Report a lost badge straight away, and hand yours back when you leave.</li>
        </ul></div>
      </div>`;
  }

  function closedHTML() {
    return `<div class="fx-tl">
        <div class="fx-tl__head"><h3>Friday night, rebuilt</h3><span class="fx-tl__axis">Earliest &rarr; latest</span></div>
        ${timelineHTML(false)}
      </div>
      ${replayHTML()}`;
  }

  function replayHTML() {
    return `<div class="fx-replay" id="fxReplay">
        <div class="fx-tl__head"><h3>Replay: Friday night on the floor plan</h3><button type="button" class="btn ghost sm" data-action="replay">Replay</button></div>
        ${planSVG()}
        <p class="fx-replay__caption" aria-live="polite">Press Replay to watch Friday night play out.</p>
      </div>`;
  }

  function renderStage(focusSel) {
    stopReplay();
    let h = '';
    if (state.stage === 1) h = stage1HTML();
    else if (state.stage === 2) h = stage2HTML() + summaryHTML();
    else if (state.stage === 3) h = stage3HTML() + summaryHTML();
    else h = closedHTML();
    els.stage.innerHTML = h;
    if ($('#fxReplay', els.stage)) setReplayFrame(PLAN_STEPS.length - 1, true);
    bounced = [];
    if (focusSel) {
      const el = $(focusSel, els.stage);
      if (el) el.focus();
    }
  }

  function summaryHTML() {
    return `<div class="fx-tl">
        <div class="fx-tl__head"><h3>Friday night, rebuilt</h3><span class="fx-tl__axis">Earliest &rarr; latest</span></div>
        ${timelineHTML(false)}
      </div>`;
  }

  // =====================================================================
  // Stage 1: placing and checking moments
  // =====================================================================
  function slotOf(id) { return state.slots.indexOf(id); }
  function untouch(id) { state.fresh = state.fresh.filter((x) => x !== id); }

  function pickUp(id) {
    if (state.s1 || state.pinned.includes(id)) return;
    if (selected === id) {
      selected = null;
      renderStage(`.fx-mcard[data-moment="${id}"]`);
      return;
    }
    // A card is already in hand and this one sits on the timeline: swap them.
    if (selected && slotOf(id) >= 0) {
      place(selected, slotOf(id));
      return;
    }
    selected = id;
    untouch(id);
    save();
    stageFeedback = null;
    renderStage(`.fx-mcard[data-moment="${id}"]`);
    announce(`Picked up: ${MOMENTS[id].text}. Now choose a position on the timeline.`);
  }

  function place(id, slot) {
    if (state.s1 || !MOMENTS[id] || slot < 0 || slot >= SLOTS) return;
    if (state.pinned.includes(id)) return;
    const occupant = state.slots[slot];
    if (occupant && state.pinned.includes(occupant)) return;
    const from = slotOf(id);
    state.slots[slot] = id;
    if (from >= 0 && from !== slot) state.slots[from] = occupant || null;
    untouch(id);
    selected = null;
    stageFeedback = null;
    save();
    renderStage(`.fx-slot[data-slot="${slot}"] .fx-mcard`);
    announce(`Placed in position ${slot + 1}: ${MOMENTS[id].text}.`);
  }

  function unplace(id) {
    const at = slotOf(id);
    if (at < 0 || state.pinned.includes(id)) return;
    state.slots[at] = null;
    if (selected === id) selected = null;
    save();
    renderStage(`.fx-slot[data-slot="${at}"] .fx-slot__drop`);
    announce(`Sent back to the tray: ${MOMENTS[id].text}.`);
  }

  function checkTimeline() {
    if (state.s1) return;
    if (state.found.length < SLOTS) {
      stageFeedback = { tone: 'info', text: `You've found ${state.found.length} of ${SLOTS} moments so far. Keep searching the board for the rest.` };
      renderStage('[data-action="check"]');
      return;
    }
    const empty = state.slots.filter((s) => !s).length;
    if (empty) {
      stageFeedback = { tone: 'info', text: `Fill every position first: ${empty} still empty.` };
      renderStage('[data-action="check"]');
      return;
    }
    state.checks++;
    selected = null;
    const back = [];
    state.slots.forEach((id, i) => {
      if (id === ANSWER[i]) {
        if (!state.pinned.includes(id)) state.pinned.push(id);
      } else {
        back.push(id);
        state.slots[i] = null;
      }
    });
    if (!back.length) {
      solveStage1();
      return;
    }
    state.badChecks++;
    if (state.badChecks === 2) say('nudge');
    save();
    bounced = back.slice();
    const pinnedN = state.pinned.length;
    stageFeedback = {
      tone: 'bad',
      text: `${pinnedN} of ${SLOTS} ${pinnedN === 1 ? 'moment is' : 'moments are'} now pinned in the right place. ${back.length} didn't fit and went back to the tray. Check the times in the evidence again.`
    };
    renderFeed();
    renderStage('[data-action="check"]');
    announce(stageFeedback.text);
  }

  function solveStage1() {
    state.s1 = true;
    state.pinned = ANSWER.slice();
    state.fresh = [];
    say('s1');
    say('s1b');
    save();
    syncPct();
    stageFeedback = null;
    animateStrings = new Set(['t:doorlog:cam1', 't:cam1:cam2', 't:cam2:laptop', 't:laptop:cam3', 't:cam3:notebook']);
    renderAll();
    announce('Timeline complete. Friday night is rebuilt. Watch the replay, then move on to the next stage.');
    if (!state.replayed) {
      state.replayed = true;
      save();
      setTimeout(() => {
        const r = $('#fxReplay', els.stage);
        if (r) {
          r.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' });
          playReplay();
        }
      }, 600);
    }
  }

  // ---- Floor-plan replay ----
  const PLAN_STEPS = [
    { clock: '18:40', caption: 'Friday, 18:40. Maya and Theo are still at their desks. Glen is at the guard desk.', laptop: true,
      moves: [{ maya: [475, 100, 1], theo: [255, 100, 1], glen: [564, 238, 1], coat: [470, 346, 0] }] },
    { clock: '18:47', caption: '18:47. Maya heads home for the weekend. Her laptop stays on, and it never locks itself.',
      moves: [{ maya: [375, 214, 1] }, { maya: [410, 346, 0] }] },
    { clock: '21:38', caption: '21:38. Someone in a yellow raincoat tries a cancelled badge at the front door. Refused.', flash: 'front',
      moves: [{ coat: [410, 344, 1] }] },
    { clock: '21:42', caption: '21:42. Theo pops out to the side door for his pizza, and the raincoat slips in right behind him.',
      moves: [{ coat: [110, 344, 1], theo: [230, 250, 1] }, { coat: [92, 256, 1], theo: [150, 256, 1] }, { theo: [255, 100, 1], coat: [196, 250, 1] }] },
    { clock: '22:01', caption: '22:01 (Camera 2 says 23:01, but its clock is an hour fast). The raincoat goes straight to Maya\'s desk.',
      moves: [{ coat: [375, 214, 1] }, { coat: [475, 100, 1] }] },
    { clock: '22:04', caption: '22:04. The Project Aurora folder is copied onto a USB stick. No password needed.', flash: 'usb',
      moves: [] },
    { clock: '22:09', caption: '22:09. The raincoat hurries out through the side door and across the car park.',
      moves: [{ coat: [375, 214, 1] }, { coat: [150, 256, 1] }, { coat: [60, 140, 0] }] },
    { clock: '22:30', caption: '22:30. Theo went home at 22:20. On his round, Glen finds Maya\'s laptop open and closes the lid.', laptop: false,
      moves: [{ theo: [375, 214, 1], glen: [375, 214, 1] }, { theo: [410, 346, 0], glen: [490, 112, 1] }] }
  ];
  const MOVE_MS = 850;

  function stopReplay() {
    replayTimers.forEach(clearTimeout);
    replayTimers = [];
  }

  function applyMove(svg, move, instant) {
    Object.keys(move).forEach((actor) => {
      const g = $(`[data-actor="${actor}"]`, svg);
      if (!g) return;
      const [x, y, vis] = move[actor];
      if (instant) g.style.transition = 'none';
      g.style.transform = `translate(${x}px, ${y}px)`;
      g.style.opacity = vis ? '1' : '0';
      if (instant) { void g.getBoundingClientRect(); g.style.transition = ''; }
    });
  }

  function setFlash(svg, which) {
    $$('.fx-plan-flash', svg).forEach((f) => f.classList.toggle('is-on', f.dataset.flash === which));
  }

  function setLaptop(svg, on) {
    const l = $('.fx-plan-laptop', svg);
    if (l) l.setAttribute('fill', on ? '#9fd1ff' : '#3a4656');
  }

  // Jump straight to the end of a step (used to draw the final picture).
  function setReplayFrame(upto, instant) {
    const svg = $('#fxReplay svg', els.stage);
    if (!svg) return;
    let laptop = true;
    for (let i = 0; i <= upto; i++) {
      const s = PLAN_STEPS[i];
      s.moves.forEach((m) => applyMove(svg, m, instant));
      if (typeof s.laptop === 'boolean') laptop = s.laptop;
    }
    setLaptop(svg, laptop);
    setFlash(svg, null);
    const clock = $('.fx-plan-clock', svg);
    if (clock) clock.textContent = `FRI ${PLAN_STEPS[upto].clock}`;
  }

  function playReplay() {
    stopReplay();
    const wrap = $('#fxReplay', els.stage);
    const svg = wrap && $('svg', wrap);
    const cap = wrap && $('.fx-replay__caption', wrap);
    if (!svg) return;
    setReplayFrame(0, true);
    let t = 0;
    PLAN_STEPS.forEach((s, i) => {
      replayTimers.push(setTimeout(() => {
        const clock = $('.fx-plan-clock', svg);
        if (clock) clock.textContent = `FRI ${s.clock}`;
        if (cap) cap.textContent = s.caption;
        setFlash(svg, s.flash || null);
        if (typeof s.laptop === 'boolean') setLaptop(svg, s.laptop);
        s.moves.forEach((m, k) => {
          replayTimers.push(setTimeout(() => applyMove(svg, m, i === 0), k * MOVE_MS));
        });
      }, t));
      t += Math.max(2300, s.moves.length * MOVE_MS + 1500);
    });
    replayTimers.push(setTimeout(() => {
      setFlash(svg, null);
      if (cap) cap.textContent = 'That\'s Friday night, rebuilt from the evidence.';
    }, t));
  }

  // =====================================================================
  // Stage 2: name the culprit
  // =====================================================================
  function accuse() {
    if (state.s2 || !suspectSel) return;
    const id = suspectSel;
    if (id === CULPRIT) {
      state.s2 = true;
      suspectSel = null;
      stageFeedback = null;
      say('s2');
      say('s2b');
      save();
      syncPct();
      animateStrings = new Set(['w:itnotice', 'w:farewell']);
      renderAll('[data-action="to-stage3"]');
      announce('Correct. The person in the raincoat was Lena Fox.');
      return;
    }
    if (!state.accused.includes(id)) state.accused.push(id);
    suspectSel = null;
    save();
    const s = SUSPECTS.find((x) => x.id === id);
    stageFeedback = { tone: 'bad', text: `Not ${PEOPLE[id].name}. ${s.why}` };
    renderStage('[data-action="accuse"]');
    announce(stageFeedback.text);
  }

  // =====================================================================
  // Stage 3: prove it
  // =====================================================================
  function pinProof(proofId, item) {
    if (state.s3 || state.stage !== 3) return;
    const p = PROOFS.find((x) => x.id === proofId);
    if (!p || state.proofs[p.id] || !ITEMS[item]) return;
    const usedAs = PROOFS.find((x) => state.proofs[x.id] === item);
    let fb;
    if (usedAs) {
      fb = { tone: 'info', text: `${ITEMS[item].label} is already pinned as proof: ${usedAs.label}. Try a different item.` };
    } else if (item === p.answer) {
      state.proofs[p.id] = item;
      proofSel = null;
      animateStrings = new Set([`p:${p.id}`]);
      fb = { tone: 'good', text: `Pinned: ${ITEMS[item].label} proves "${p.label}".` };
    } else {
      state.wrongProofs++;
      snapString(item);
      fb = { tone: 'bad', text: p.wrong[item] || PROOF_GENERIC[item] || 'That item doesn\'t prove this.' };
    }
    stageFeedback = fb;
    closeupFeedback = fb;
    save();
    if (PROOFS.every((x) => state.proofs[x.id])) {
      solveStage3();
      return;
    }
    renderBoard();
    renderCloseup();
    renderStage();
    drawStrings();
    announce(fb.text);
  }

  function solveStage3() {
    state.s3 = true;
    state.solved = true;
    state.stage = 4;
    proofSel = null;
    stageFeedback = null;
    closeupFeedback = null;
    say('s3');
    save();
    renderAll();
    if (els.stamp && !REDUCED()) {
      els.stamp.classList.remove('is-thump');
      void els.stamp.offsetWidth;
      els.stamp.classList.add('is-thump');
    }
    finishRoom(true);
  }

  // =====================================================================
  // Completion (bonus room: no code word, no points)
  // =====================================================================
  function renderComplete() {
    const c = els.complete;
    if (!c) return;
    if (!state.solved) {
      c.hidden = true;
      c.innerHTML = '';
      return;
    }
    const hints = (state.hints[1] || 0) + (state.hints[2] || 0) + (state.hints[3] || 0);
    c.innerHTML = `<h2>Bonus case closed</h2>
      <p>You rebuilt Friday night, named the culprit and proved it. Nice work, detectives!</p>
      ${debriefHTML()}
      <p class="fx-complete__stats">Wrong timeline checks: ${state.badChecks} · Wrong accusations: ${state.accused.length} · Wrong proofs: ${state.wrongProofs} · Hints used: ${hints}. This bonus case doesn't change your score.</p>
      <div class="fx-complete__actions">
        <a class="btn primary" href="game.html">Back to the Mission Hub</a>
        <a class="btn ghost" href="celebration.html">See your results</a>
      </div>`;
    c.hidden = false;
  }

  // Records the bonus room as done (progress.forensics only: no code word, and the
  // score is never touched). window.vault.completeBonus() syncs and shows a toast; it
  // returns true only the first time. justSolved: the case was closed on this page.
  function finishRoom(justSolved) {
    let first = false;
    if (!roomSolved()) {
      try {
        if (typeof window.vault?.completeBonus === 'function') {
          first = window.vault.completeBonus(ROOM) === true;
        } else if (utils?.setProgressPercent) {
          utils.setProgressPercent(ROOM, 100, { complete: true });
          first = true;
        }
      } catch (_) { /* ignore */ }
    }
    renderComplete();
    if (justSolved || first) {
      announce('Bonus case closed. Nice work, detectives!');
      setTimeout(() => {
        els.complete?.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'start' });
      }, 1300);
    }
  }

  // =====================================================================
  // Render all + events
  // =====================================================================
  function renderAll(focusSel) {
    renderPill();
    renderHints();
    renderFeed();
    renderBoard();
    renderCloseup();
    renderStage(focusSel);
    renderComplete();
    requestAnimationFrame(drawStrings);
  }

  els.board.addEventListener('click', (ev) => {
    const b = ev.target.closest('.fx-item');
    if (!b) return;
    const item = b.dataset.item;
    if (state.stage === 3 && !state.s3 && proofSel) {
      state.focus = item;
      pinProof(proofSel, item);
      if (NARROW()) {
        const fbEl = $('#fxProofFeedback', els.stage) || els.stage;
        fbEl.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' });
      }
      return;
    }
    inspect(item, true);
  });

  els.closeup.addEventListener('click', (ev) => {
    const pinBtn = ev.target.closest('[data-pinproof]');
    if (pinBtn) {
      pinProof(pinBtn.dataset.pinproof, pinBtn.dataset.item);
      return;
    }
    if (ev.target.closest('[data-action="to-board"]')) {
      els.board.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'start' });
      const active = $(`.fx-item[data-item="${state.focus}"]`, els.board);
      if (active) active.focus({ preventScroll: true });
    }
  });

  els.stage.addEventListener('click', (ev) => {
    const t = ev.target;
    const out = t.closest('[data-out]');
    if (out) { unplace(out.dataset.out); return; }
    const card = t.closest('.fx-mcard[data-moment]');
    if (card && !card.classList.contains('is-pinned')) { pickUp(card.dataset.moment); return; }
    const drop = t.closest('.fx-slot__drop[data-slot]');
    if (drop) {
      const slot = Number(drop.dataset.slot);
      if (selected) place(selected, slot);
      else {
        stageFeedback = { tone: 'info', text: 'Pick up a moment card first (tap it), then tap the position where it belongs.' };
        renderStage(`.fx-slot__drop[data-slot="${slot}"]`);
      }
      return;
    }
    const action = t.closest('[data-action]')?.dataset.action;
    if (action === 'check') { checkTimeline(); return; }
    if (action === 'replay') { playReplay(); return; }
    if (action === 'to-stage2' && state.s1 && state.stage === 1) {
      state.stage = 2;
      say('stage2');
      stageFeedback = null;
      save();
      renderAll('.fx-suspect');
      $('#fxRoom')?.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (action === 'to-stage3' && state.s2 && state.stage === 2) {
      state.stage = 3;
      stageFeedback = null;
      save();
      renderAll('.fx-proof');
      if (NARROW()) els.stage.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (action === 'accuse') { accuse(); return; }
    const sus = t.closest('[data-suspect]');
    if (sus && state.stage === 2 && !state.s2) {
      const id = sus.dataset.suspect;
      if (state.accused.includes(id)) return;
      suspectSel = suspectSel === id ? null : id;
      stageFeedback = null;
      renderStage(`[data-suspect="${id}"]`);
      return;
    }
    const proof = t.closest('[data-proof]');
    if (proof && state.stage === 3 && !state.s3) {
      const id = proof.dataset.proof;
      if (state.proofs[id]) return;
      proofSel = proofSel === id ? null : id;
      stageFeedback = null;
      renderBoard();
      renderStage(`[data-proof="${id}"]`);
      if (proofSel) {
        announce(`Now choose the evidence on the board that proves: ${PROOFS.find((p) => p.id === id).q}.`);
        if (NARROW()) els.board.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'start' });
      }
    }
  });

  // Drag and drop (mouse). Touch and keyboard use tap-to-place.
  let dragId = null;
  els.stage.addEventListener('dragstart', (ev) => {
    const card = ev.target.closest?.('.fx-mcard[data-moment]');
    if (!card || card.classList.contains('is-pinned') || state.s1) { ev.preventDefault?.(); return; }
    dragId = card.dataset.moment;
    card.classList.add('is-dragging');
    try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', dragId); } catch (_) { /* ignore */ }
  });
  els.stage.addEventListener('dragend', () => {
    dragId = null;
    $$('.is-over', els.stage).forEach((el) => el.classList.remove('is-over'));
    $$('.is-dragging', els.stage).forEach((el) => el.classList.remove('is-dragging'));
  });
  const dropTarget = (ev) => ev.target.closest?.('.fx-slot:not(.is-pinned), [data-tray]');
  els.stage.addEventListener('dragover', (ev) => {
    const target = dropTarget(ev);
    if (!target || !dragId) return;
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = 'move'; } catch (_) { /* ignore */ }
    $$('.is-over', els.stage).forEach((el) => { if (el !== target) el.classList.remove('is-over'); });
    target.classList.add('is-over');
  });
  els.stage.addEventListener('drop', (ev) => {
    const target = dropTarget(ev);
    if (!target) return;
    ev.preventDefault();
    let id = dragId;
    try { id = id || ev.dataTransfer.getData('text/plain'); } catch (_) { /* ignore */ }
    dragId = null;
    if (!MOMENTS[id]) return;
    if (target.dataset.tray) unplace(id);
    else place(id, Number(target.dataset.slot));
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawStrings, 120);
  });
  if (window.ResizeObserver) new ResizeObserver(() => drawStrings()).observe(els.board);

  // =====================================================================
  // Boot: locked screen until the vault is open, then the case
  // =====================================================================
  let started = false;

  function startCase(liveUnlock) {
    if (started) return;
    started = true;
    state = loadState();
    const hadFocus = els.locked?.contains(document.activeElement);
    if (els.locked) els.locked.hidden = true;
    if (els.caseWrap) els.caseWrap.hidden = false;

    utils?.initStatusHud?.(ROOM, {
      progressFill: '#fxProgressFill',
      progressLabel: '#fxProgressText'
    });
    // The previous version of this room kept its state under a shared key.
    try { localStorage.removeItem('forensics_state'); } catch (_) { /* ignore */ }

    const registered = roomSolved();
    if (!state.solved && registered) {
      // Solved on another device or browser (or before this became the bonus room):
      // show the closed case.
      state = solvedState();
      save();
    }
    if (!state.msgs.length) {
      say('intro_rosa');
      say('intro_glen');
      save();
    }
    buildBoard();
    renderAll();
    if (state.solved && !registered) {
      // Solved here but the shared progress doesn't know yet (e.g. a sync was lost).
      finishRoom(false);
    } else if (!state.solved) {
      syncPct();
    }
    if (liveUnlock) {
      if (hadFocus) $('#main')?.focus({ preventScroll: true });
      announce('The vault is open, so the bonus case is unlocked.');
    }
  }

  function showLocked() {
    if (els.lockedDone) els.lockedDone.hidden = !roomSolved();
    if (els.caseWrap) els.caseWrap.hidden = true;
    if (els.locked) els.locked.hidden = false;
  }

  function checkLock(liveUnlock) {
    if (started) return;
    if (vaultOpened()) startCase(liveUnlock);
    else showLocked();
  }

  function boot() {
    checkLock(false);
    // Open the case without a reload when the vault is cracked: on the hub in another
    // tab, on another laptop (picked up by the sync), or while this page sat in the
    // back/forward cache.
    const recheck = () => checkLock(true);
    window.addEventListener('vault:opened', recheck);
    document.addEventListener('vault:opened', recheck);
    window.addEventListener('state-sync:applied', recheck);
    window.addEventListener('pageshow', recheck);
    window.addEventListener('storage', (ev) => {
      if (!ev.key || ev.key === 'vault_opened' || ev.key === utils?.progressKey?.()) recheck();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
