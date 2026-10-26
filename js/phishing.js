/* phishing.js — Phishing Spotter (Cyber Escape Rooms)
   ---------------------------------------------------------------------------
   Players inspect four realistic email screenshots. For each one they:
     1. drop red flags (click / tap / keyboard) on anything suspicious,
     2. choose a verdict (Phishing or Legitimate),
     3. press "Submit highlights".
   Nothing about correctness is revealed until the team submits. A correct
   submission unlocks a debrief that outlines every red flag (found / missed)
   with a short explanation. Wrong submissions cost a few points and can be
   retried. Hints are progressive and cost points.

   Red-flag areas are rectangles in the image's natural pixel space, so they
   stay accurate at any rendered size or zoom level.

   ---------------------------------------------------------------------------
   HOW TO SWAP IN NEW EMAIL EXAMPLES (no other code needs to change)
   ---------------------------------------------------------------------------
   1. Images: put each email screenshot (PNG/JPG/WebP) in assets/. Use NEW file
      names (e.g. phish-2027-1.webp): saved progress is keyed by file name, so
      new names mean nobody keeps flags from the old emails. Also update the
      starting <img id="phishingImage" src="..."> in phishing.html.
   2. Data: edit the EMAILS array below, one object per email, in inbox order:
        img       file name in assets/
        w, h      the image's real size in pixels (Windows: right-click the
                  file > Properties > Details; Mac: Get Info). Must be exact,
                  because every rectangle below is measured in these pixels.
        from, subject   what the inbox list shows for this email
        phishing  true for a phishing email, false for a genuine one
        required  how many DIFFERENT red flags a team must find to pass
                  (use 0 for a genuine email)
        flags     the red flags (phishing emails only). Each one is
                    { key: true?, title, rects: [[left, top, right, bottom]], text }
                  key: true    = must be found to pass (the biggest giveaway,
                                 usually the sender address). Optional.
                  rects        one or more boxes, in image pixels, measured
                                 from the image's top-left corner. Use two boxes
                                 when one clue appears in two places.
                  title, text  shown in the debrief after the email is solved
        trust     genuine emails only: same shape as flags (title, rects,
                  text), shown as "Checks out" in the debrief
        hints     two hint strings (may contain <strong>). The third, priciest
                  hint is automatic: it spotlights a missed red flag, or for a
                  genuine email shows finalHint.
        finalHint genuine emails only: the third hint text
   3. Measuring a rectangle: open the image in any editor that shows the
      cursor's pixel position (Paint, GIMP, Photopea, Preview's Inspector).
      Note the top-left corner (left, top) and bottom-right corner (right,
      bottom) of the clue. Clicks within HIT_PAD pixels of the box still count.
      Quick check in the browser: open phishing.html, press F12, paste this
      into the Console, then click the email to print the image-pixel position:
        document.getElementById('phishingImage').addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(); console.log(Math.round((e.clientX - r.left) / r.width * e.target.naturalWidth), Math.round((e.clientY - r.top) / r.height * e.target.naturalHeight)); });
   4. If the number of emails changes, also update the words "four" in
      phishing.html (intro line, briefing callout, "How to play" dialog).
      The completion card counts the emails automatically.
   5. After changing emails, reset the teams from the admin page before the
      event so nobody keeps old flags. (Saved progress is keyed by img name.)
*/
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- Config ----------
  const ROOM_KEY = 'phishing';
  const MAX_FLAGS = 6;          // flags per email
  const MAX_FALSE_FLAGS = 2;    // flags on harmless areas tolerated on a passing submission
  const WRONG_COST = 3;         // points lost for a wrong submission
  const HINT_COSTS = [5, 5, 10];
  const HIT_PAD = 14;           // tolerance (natural px) around each red-flag area
  const ZOOM_STEPS = [1, 1.5, 2, 2.5];
  const KEY_STEP = 0.015;       // keyboard reticle step (fraction of image)
  const KEY_STEP_BIG = 0.06;
  // Code word is assembled at runtime so it never appears in the page markup.
  const WORD = [77, 69, 82, 67, 85, 82, 89].map((c) => String.fromCharCode(c)).join('');

  const EMAILS = [
    {
      img: 'phish-2026-1.webp', w: 1356, h: 1159,
      from: 'Find My',
      subject: 'New sign-in to Find My',
      phishing: true,
      required: 3,
      flags: [
        {
          key: true,
          title: 'Fake sender address',
          rects: [[126, 331, 578, 357]],
          text: 'The email comes from findmy@apple.com-alerts.info. It starts with “apple.com”, but a domain is decided by its very end: this one is com-alerts.info, which has nothing to do with Apple. Read a sender address from the @ all the way to the end.'
        },
        {
          title: 'A sign-in alert John didn’t trigger',
          rects: [[212, 616, 1144, 654], [395, 677, 961, 861]],
          text: 'A sign-in at 3:47 AM, from a Windows PC in a location it “doesn’t recognise”, is built to make John panic. If an alert surprises you, check it in the Find My app or in your iPhone’s Settings yourself, not via the email.'
        },
        {
          title: 'A threat with a deadline',
          rects: [[213, 884, 1144, 937]],
          text: '“Devices that are not secured within 24 hours will be erased.” Apple will never threaten to wipe your devices by email. Deadlines and threats are there to rush you past thinking.'
        },
        {
          title: 'The “Lock My Account” button',
          rects: [[515, 960, 842, 1022]],
          text: 'The button promises safety, but it would take John to a fake Apple sign-in page that steals his password: the very thing the email pretends to protect. To secure an account, open the app or type the website address yourself.'
        }
      ],
      hints: [
        'A scary alert is the perfect disguise. Before you react, check exactly <strong>who</strong> sent it, all the way to the end of the address.',
        'Where does the sender’s domain really end: at apple.com, or somewhere after it? Then ask: did John do this, and what does the email want him to do, and how fast?'
      ]
    },
    {
      img: 'phish-2026-2.webp', w: 1445, h: 1088,
      from: 'iCloud',
      subject: 'iCloud payment failed!!',
      phishing: true,
      required: 4,
      flags: [
        {
          key: true,
          title: 'Lookalike sender domain',
          rects: [[148, 405, 606, 433]],
          text: 'billing@icloud-payments.co is not an Apple address. Gluing an extra word like “payments” onto a brand name, and ending in .co instead of .com, are classic tricks to look official.'
        },
        {
          title: 'Urgent, shouty subject',
          rects: [[42, 321, 477, 365]],
          text: '“iCloud payment failed!!” Two exclamation marks are there to alarm you. Urgency is the number one tool of phishers.'
        },
        {
          title: 'No name, just “Dear Customer”',
          rects: [[42, 560, 217, 582]],
          text: 'Apple knows John’s name: it’s on his account. A generic greeting usually means the same email went out to thousands of people.'
        },
        {
          title: 'Sloppy grammar',
          rects: [[41, 618, 1403, 679]],
          text: '“We was unable”, “you’re account”, “has not been renew”. Big companies proofread their emails; repeated mistakes are a strong phishing sign.'
        },
        {
          title: 'A threat with a deadline',
          rects: [[41, 707, 895, 733]],
          text: '“Permanently deleted in 48 hours” is designed to panic John into acting before he thinks. Real services warn you well ahead of time, and you can check your plan in Settings without clicking anything.'
        },
        {
          title: 'Pressure to pay through a link',
          rects: [[41, 763, 632, 788], [40, 820, 517, 855]],
          text: 'The email pushes John to “update payment details” through a link. Payment links in unexpected emails lead to card-stealing pages. Manage subscriptions in your device settings instead.'
        },
        {
          title: 'Sloppy sign-off',
          rects: [[40, 887, 223, 940]],
          text: '“Thanks you” and “The Icloud Team”: Apple always writes its own brand as iCloud. Small mistakes in names give fakes away.'
        }
      ],
      hints: [
        'Real companies proofread their emails and know your name. Scammers often don’t, and they love urgency and payments.',
        'Check the sender domain and how John is greeted. Then read the main paragraph word by word, and look at what the red line and the blue link want him to do.'
      ]
    },
    {
      img: 'phish-2026-3.webp', w: 1359, h: 1158,
      from: 'Amazon.com',
      subject: 'Your Amazon.com order #114-8512462-3346182',
      phishing: false,
      required: 0,
      flags: [],
      trust: [
        {
          title: 'Genuine sender domain',
          rects: [[131, 342, 579, 368]],
          text: 'no-reply@amazon.com is Amazon’s real domain: no extra words, numbers or odd endings.'
        },
        {
          title: 'Details that match',
          rects: [[29, 279, 783, 308], [255, 730, 545, 749]],
          text: 'The order number in the subject matches the one in the body, and the email is addressed to John by name.'
        },
        {
          title: 'No pressure, no password request',
          rects: [[254, 1114, 1103, 1130]],
          text: 'It doesn’t rush you, threaten you or ask you to log in or pay. It even says the address can’t receive replies. Still, if in doubt, open the Amazon app yourself rather than clicking.'
        }
      ],
      hints: [
        'Not every email in this inbox is a trap. Judge it on evidence, not nerves.',
        'Compare the sender domain with the company name, check the order number in the subject against the body, and ask: does it rush you, or ask you to log in or pay?'
      ],
      finalHint: 'Analyst note: the sender is the genuine amazon.com domain, the details are consistent and there is no pressure or request for credentials. Our analysts would treat this one as legitimate.'
    },
    {
      img: 'phish-2026-4.webp', w: 1330, h: 1183,
      from: 'SharePoint',
      subject: 'HR Department shared “Staff Pay Rises 2027” with you',
      phishing: true,
      required: 4,
      flags: [
        {
          key: true,
          title: 'Lookalike sender: “rn” posing as “m”',
          rects: [[121, 331, 557, 357]],
          text: 'sharepoint@rnicrosoft.com: an r and an n squeezed together look like an m at a glance. Real SharePoint notifications come from Microsoft’s own domains. Zoom in on any address that looks almost right.'
        },
        {
          title: 'HR sharing from a Gmail address',
          rects: [[477, 742, 881, 822], [268, 644, 1062, 691]],
          text: 'The share claims to come from the HR Department, but the sharer is hr.payroll.department@gmail.com. A real HR team shares company files from a company account, never a free personal email address.'
        },
        {
          title: 'Tempting file name',
          rects: [[439, 843, 890, 937], [24, 267, 854, 302]],
          text: '“Staff Pay Rises 2027” is chosen to make John too curious to stop and think. Attackers love money, HR and payroll topics.'
        },
        {
          title: 'A deadline on the link',
          rects: [[526, 960, 803, 993]],
          text: '“This link expires in 24 hours” adds pressure to click right now. A file a real colleague shares will still be there after you check with them.'
        },
        {
          title: 'The “Sign in to view” button',
          rects: [[549, 1016, 782, 1070]],
          text: 'This button would take John to a fake Microsoft sign-in page to harvest his password. Open shared files from SharePoint or Teams directly instead.'
        },
        {
          title: 'Fake brand name',
          rects: [[210, 1121, 356, 1155]],
          text: '“Mircosoft” is not Microsoft: two letters are swapped. Copycat logos are built to pass a quick glance.'
        }
      ],
      hints: [
        'Scammers imitate the tools you use at work every day. Check the small print as carefully as the big print, and zoom in if you need to.',
        'Zoom in on the sender domain and the company name at the bottom: is every letter right? Then check who really shared the file, and what the email wants John to do, and how fast.'
      ]
    }
  ];

  // ---------- Elements ----------
  const img = $('#phishingImage');
  const stage = $('#phishStage');
  if (!img || !stage) return;

  const viewport = $('#phishViewport');
  const pinsLayer = $('#phishPins');
  const boxesLayer = $('#phishBoxes');
  const reticle = $('#phishReticle');
  const inboxEl = $('#phishInbox');
  const viewerHeading = $('#phishViewerHeading');
  const flagCountEl = $('#phishFlagCount');
  const zoomInBtn = $('#phishZoomInBtn');
  const zoomOutBtn = $('#phishZoomOutBtn');
  const zoomLabel = $('#phishZoomLabel');
  const flagListEl = $('#phishFlagList');
  const undoBtn = $('#phishUndoBtn');
  const clearBtn = $('#phishClearBtn');
  const phishBtn = $('#markPhish');
  const legitBtn = $('#markLegit');
  const submitBtn = $('#submitButton');
  const feedbackEl = $('#phishingFeedback');
  const hintBtn = $('#phishHintBtn');
  const hintListEl = $('#phishHintList');
  const workPanel = $('#phishWorkPanel');
  const debriefPanel = $('#phishDebriefPanel');
  const debriefSummary = $('#phishDebriefSummary');
  const debriefList = $('#phishDebriefList');
  const nextBtn = $('#phishNextBtn');
  const completeEl = $('#phishComplete');
  const vaultCallout = $('#phishVaultValue');

  const utils = window.utils;
  const points = utils?.points;
  const announce = (msg) => { try { window.a11y?.announce?.(msg); } catch (_) { /* ignore */ } };

  const user = utils?.getUser?.() || null;
  const TEAM = String(user?.username || 'team').toLowerCase();
  // Prefix matches state-sync / admin reset patterns (`${team}_phishing_…`).
  const STORE_KEY = `${TEAM}_phishing_room_v2`;

  // ---------- State ----------
  let state = freshState();
  let zoomIndex = 0;
  const cursor = { x: 0.5, y: 0.3 };

  function freshEmailState() {
    return { pins: [], verdict: null, attempts: 0, hints: 0, spotlight: null, done: false, found: [], feedback: null };
  }

  function freshState() {
    const emails = {};
    EMAILS.forEach((e) => { emails[e.img] = freshEmailState(); });
    return { v: 2, current: 0, seq: 0, pctAt: 0, emails };
  }

  function loadState() {
    const base = freshState();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      if (!saved || saved.v !== 2 || typeof saved.emails !== 'object') return base;
      base.current = Math.max(0, Math.min(EMAILS.length - 1, Number(saved.current) || 0));
      base.seq = Number(saved.seq) || 0;
      base.pctAt = Number(saved.pctAt) || 0;
      EMAILS.forEach((e) => {
        const s = saved.emails[e.img];
        if (!s) return;
        const t = base.emails[e.img];
        t.pins = Array.isArray(s.pins)
          ? s.pins
              .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
              .slice(0, MAX_FLAGS)
              .map((p) => ({ id: Number(p.id) || ++base.seq, x: clamp01(p.x), y: clamp01(p.y), result: p.result === 'hit' || p.result === 'miss' ? p.result : null }))
          : [];
        t.verdict = s.verdict === 'phish' || s.verdict === 'legit' ? s.verdict : null;
        t.attempts = Number(s.attempts) || 0;
        t.hints = Math.max(0, Math.min(3, Number(s.hints) || 0));
        t.spotlight = Number.isInteger(s.spotlight) ? s.spotlight : null;
        t.done = !!s.done;
        t.found = Array.isArray(s.found) ? s.found.filter(Number.isInteger) : [];
        t.feedback = s.feedback && typeof s.feedback.msg === 'string' ? { msg: s.feedback.msg, tone: s.feedback.tone } : null;
      });
    } catch (_) {
      return base;
    }
    return base;
  }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* storage full / blocked */ }
  }

  function save() {
    persist();
    syncProgress();
  }

  const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
  const cur = () => EMAILS[state.current];
  const st = (e = cur()) => state.emails[e.img];
  const doneCount = () => EMAILS.filter((e) => state.emails[e.img].done).length;
  const allDone = () => doneCount() === EMAILS.length;

  function hasStarted() {
    return EMAILS.some((e) => {
      const s = state.emails[e.img];
      return s.done || s.pins.length || s.verdict || s.attempts || s.hints;
    });
  }

  function roomFlagComplete() {
    try { return !!utils?.readProgress?.().phishing; } catch (_) { return false; }
  }

  // Solved = the shared vault says so (progress flag set AND code word stored).
  function roomSolved() {
    try {
      if (window.vault?.isRoomComplete) return window.vault.isRoomComplete(ROOM_KEY);
    } catch (_) { /* fall back below */ }
    return roomFlagComplete();
  }

  const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const numWord = (n) => NUM_WORDS[n] || String(n);

  // ---------- Progress broadcast (Mission Hub + HUD) ----------
  function syncProgress() {
    if (!utils?.setProgressPercent) return;
    if (roomFlagComplete()) return;
    const done = doneCount();
    let pct = Math.round((done / EMAILS.length) * 100);
    if (pct >= 100) return; // completion handled by completeRoom()
    // A small non-zero value once the team has started, so a background
    // sync never mistakes an in-progress room for a freshly reset one.
    if (pct === 0 && hasStarted()) pct = 5;
    if (pct === 0) return;
    const existing = utils.getProgressPercent?.(ROOM_KEY) ?? 0;
    if (existing === pct) return;
    utils.setProgressPercent(ROOM_KEY, pct);
    state.pctAt = Date.now();
    persist();
    try { window.stateSync?.saveNow?.('phishing-progress'); } catch (_) { /* ignore */ }
  }

  // ---------- Geometry ----------
  function rectContains(e, rect, x, y, pad) {
    const px = x * e.w;
    const py = y * e.h;
    return px >= rect[0] - pad && px <= rect[2] + pad && py >= rect[1] - pad && py <= rect[3] + pad;
  }

  function rectDistance(e, rect, x, y) {
    const cx = (rect[0] + rect[2]) / 2;
    const cy = (rect[1] + rect[3]) / 2;
    return Math.hypot(x * e.w - cx, y * e.h - cy);
  }

  /** Which red flag (index) a pin lands on, or -1. */
  function flagForPin(e, pin) {
    let best = -1;
    let bestDist = Infinity;
    e.flags.forEach((flag, idx) => {
      flag.rects.forEach((rect) => {
        if (!rectContains(e, rect, pin.x, pin.y, HIT_PAD)) return;
        const d = rectDistance(e, rect, pin.x, pin.y);
        if (d < bestDist) { bestDist = d; best = idx; }
      });
    });
    return best;
  }

  function evaluate(e, pins) {
    const found = new Set();
    let misses = 0;
    let duplicates = 0;
    const results = new Map();
    pins.forEach((pin) => {
      const idx = flagForPin(e, pin);
      if (idx < 0) {
        misses += 1;
        results.set(pin.id, 'miss');
      } else {
        if (found.has(idx)) duplicates += 1;
        found.add(idx);
        results.set(pin.id, 'hit');
      }
    });
    return { found, misses, duplicates, results };
  }

  // ---------- Feedback ----------
  function setFeedback(msg, tone = 'info', { persistIt = true } = {}) {
    if (persistIt) st().feedback = msg ? { msg, tone } : null;
    renderFeedback(msg ? { msg, tone } : null);
    if (msg) announce(msg);
  }

  // Messages may hold several short lines separated by "\n": the first line is
  // shown in bold, each following line on its own row.
  function renderFeedback(fb) {
    if (!feedbackEl) return;
    feedbackEl.classList.remove('ok', 'warn');
    feedbackEl.removeAttribute('data-tone');
    feedbackEl.textContent = '';
    if (!fb?.msg) return;
    String(fb.msg).split('\n').filter((line) => line.trim()).forEach((line, i) => {
      feedbackEl.appendChild(el('span', { className: i === 0 ? 'phx-fb-line phx-fb-lead' : 'phx-fb-line' }, line));
    });
    if (fb.tone === 'success') { feedbackEl.classList.add('ok'); feedbackEl.setAttribute('data-tone', 'success'); }
    else if (fb.tone === 'warn') { feedbackEl.classList.add('warn'); feedbackEl.setAttribute('data-tone', 'warn'); }
    else feedbackEl.setAttribute('data-tone', 'info');
  }

  // ---------- Rendering ----------
  function el(tag, props = {}, text) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'className') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else node.setAttribute(k, v);
    });
    if (text != null) node.textContent = text;
    return node;
  }

  function statusFor(e) {
    const s = state.emails[e.img];
    if (s.done) return { key: 'done', label: e.phishing ? 'Phishing — reported' : 'Safe — cleared' };
    if (s.pins.length || s.verdict || s.attempts || s.hints) return { key: 'progress', label: 'In review' };
    return { key: 'new', label: 'Unread' };
  }

  function renderInbox() {
    if (!inboxEl) return;
    inboxEl.innerHTML = '';
    EMAILS.forEach((e, idx) => {
      const status = statusFor(e);
      const li = el('li');
      const btn = el('button', {
        type: 'button',
        className: 'phx-mail',
        'data-status': status.key,
        'aria-current': idx === state.current ? 'true' : 'false',
        'aria-label': `Email ${idx + 1}: ${e.from}, “${e.subject}”. ${status.label}.`
      });
      btn.appendChild(el('span', { className: 'phx-mail__from' }, e.from));
      btn.appendChild(el('span', { className: 'phx-mail__subject' }, e.subject));
      btn.appendChild(el('span', { className: 'phx-mail__status' }, status.label));
      btn.addEventListener('click', () => goTo(idx));
      li.appendChild(btn);
      inboxEl.appendChild(li);
    });
  }

  function pctStyle(e, rect) {
    return {
      left: `${(rect[0] / e.w) * 100}%`,
      top: `${(rect[1] / e.h) * 100}%`,
      width: `${((rect[2] - rect[0]) / e.w) * 100}%`,
      height: `${((rect[3] - rect[1]) / e.h) * 100}%`
    };
  }

  function addBox(e, rect, cls, tag) {
    const box = el('div', { className: `phx-box ${cls}`.trim(), style: pctStyle(e, rect) });
    if (tag != null) box.appendChild(el('span', { className: 'phx-box__tag' }, String(tag)));
    boxesLayer.appendChild(box);
  }

  function renderBoxes() {
    boxesLayer.innerHTML = '';
    const e = cur();
    const s = st();
    if (s.done) {
      if (e.phishing) {
        const found = new Set(s.found);
        e.flags.forEach((flag, idx) => {
          flag.rects.forEach((rect, rIdx) => addBox(e, rect, found.has(idx) ? '' : 'is-missed', rIdx === 0 ? idx + 1 : null));
        });
      } else {
        (e.trust || []).forEach((t, idx) => {
          t.rects.forEach((rect, rIdx) => addBox(e, rect, 'is-trust', rIdx === 0 ? idx + 1 : null));
        });
      }
      return;
    }
    if (Number.isInteger(s.spotlight) && e.flags[s.spotlight]) {
      e.flags[s.spotlight].rects.forEach((rect) => addBox(e, rect, 'is-spotlight', null));
    }
  }

  function pinLabel(pin, n) {
    if (pin.result === 'hit') return `Flag ${n}: on a real warning sign`;
    if (pin.result === 'miss') return `Flag ${n}: on something harmless`;
    return `Flag ${n}`;
  }

  function renderPins() {
    pinsLayer.innerHTML = '';
    const s = st();
    s.pins.forEach((pin, i) => {
      const n = i + 1;
      const btn = el('button', {
        type: 'button',
        className: `phx-pin${pin.result === 'hit' ? ' is-hit' : ''}${pin.result === 'miss' ? ' is-miss' : ''}`,
        tabindex: '-1',
        'aria-label': s.done ? pinLabel(pin, n) : `${pinLabel(pin, n)}. Remove`,
        title: s.done ? pinLabel(pin, n) : 'Click to remove this flag',
        style: { left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }
      });
      btn.appendChild(el('span', { className: 'phx-pin__num', 'aria-hidden': 'true' }, pin.result === 'hit' ? '✓' : pin.result === 'miss' ? '✕' : String(n)));
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (st().done) return;
        removePin(pin.id);
      });
      pinsLayer.appendChild(btn);
    });
  }

  function renderFlagList() {
    const s = st();
    flagListEl.innerHTML = '';
    if (!s.pins.length) {
      const li = el('li', { className: 'phx-empty' }, 'No flags yet. Click or tap the email to add one.');
      flagListEl.appendChild(li);
    }
    s.pins.forEach((pin, i) => {
      const n = i + 1;
      const li = el('li');
      const chip = el('button', {
        type: 'button',
        className: `phx-flagchip${pin.result ? ` is-${pin.result}` : ''}`,
        'aria-label': `Remove ${pinLabel(pin, n).toLowerCase()}`
      });
      const suffix = pin.result === 'hit' ? ' ✓' : pin.result === 'miss' ? ' (miss)' : '';
      chip.appendChild(document.createTextNode(`Flag ${n}${suffix}`));
      chip.appendChild(el('span', { 'aria-hidden': 'true' }, '×'));
      chip.addEventListener('click', () => removePin(pin.id));
      li.appendChild(chip);
      flagListEl.appendChild(li);
    });
    undoBtn.disabled = !s.pins.length;
    clearBtn.disabled = !s.pins.length;
    flagCountEl.textContent = `${s.pins.length} / ${MAX_FLAGS} flags`;
  }

  function renderVerdict() {
    const v = st().verdict;
    [[phishBtn, 'phish'], [legitBtn, 'legit']].forEach(([btn, val]) => {
      if (!btn) return;
      const on = v === val;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-selected', on);
    });
  }

  function hintButtonLabel(e, level) {
    if (level >= 3) return 'No more hints for this email';
    if (level === 2) return e.phishing ? `Spotlight a warning sign (−${HINT_COSTS[2]} pts)` : `Analyst verdict (−${HINT_COSTS[2]} pts)`;
    if (level === 1) return `Stronger hint (−${HINT_COSTS[1]} pts)`;
    return `Get a hint (−${HINT_COSTS[0]} pts)`;
  }

  function hintText(e, level, s) {
    if (level < 2) return e.hints[level];
    if (!e.phishing) return e.finalHint;
    if (Number.isInteger(s.spotlight)) return 'Spotlight: one warning sign is outlined in yellow on the email. Drop a flag on it.';
    return 'Spotlight: every warning sign on this email already has one of your flags on it. Check your verdict and submit.';
  }

  function renderHints() {
    const e = cur();
    const s = st();
    hintListEl.innerHTML = '';
    for (let i = 0; i < s.hints; i += 1) {
      const li = el('li');
      const p = el('p', { className: 'hint-callout' });
      const strong = el('strong', {}, `Hint ${i + 1}: `);
      p.appendChild(strong);
      const span = el('span');
      // Hint copy is static and trusted (authored above); allow <strong>.
      span.innerHTML = hintText(e, i, s);
      p.appendChild(span);
      li.appendChild(p);
      hintListEl.appendChild(li);
    }
    hintBtn.textContent = hintButtonLabel(e, s.hints);
    hintBtn.disabled = s.hints >= 3;
  }

  function renderDebrief() {
    const e = cur();
    const s = st();
    debriefList.innerHTML = '';
    const heading = $('#phxDebriefHeading');
    if (e.phishing) {
      const found = new Set(s.found);
      if (heading) heading.textContent = 'What gave it away';
      debriefSummary.textContent = `Phishing confirmed. You found ${found.size} of the ${e.flags.length} warning signs${s.attempts > 1 ? ` (in ${s.attempts} attempts)` : ' on the first try'}. Green boxes are the ones you found; orange dashed boxes are the ones you missed.`;
      e.flags.forEach((flag, idx) => {
        const isFound = found.has(idx);
        const li = el('li', { className: isFound ? '' : 'is-missed' });
        li.appendChild(el('span', { className: 'phx-debrief__num', 'aria-hidden': 'true' }, String(idx + 1)));
        const body = el('div');
        const h = el('h4', {}, flag.title);
        h.appendChild(el('span', { className: 'phx-debrief__state' }, isFound ? 'Found' : 'Missed'));
        body.appendChild(h);
        body.appendChild(el('p', {}, flag.text));
        li.appendChild(body);
        debriefList.appendChild(li);
      });
    } else {
      if (heading) heading.textContent = 'Why this one is genuine';
      debriefSummary.textContent = `Correct: this email is legitimate${s.attempts > 1 ? ` (in ${s.attempts} attempts)` : ''}. Not every email is a trap. Being able to trust the real ones matters too.`;
      (e.trust || []).forEach((t, idx) => {
        const li = el('li', { className: 'is-trust' });
        li.appendChild(el('span', { className: 'phx-debrief__num', 'aria-hidden': 'true' }, String(idx + 1)));
        const body = el('div');
        const h = el('h4', {}, t.title);
        h.appendChild(el('span', { className: 'phx-debrief__state' }, 'Checks out'));
        body.appendChild(h);
        body.appendChild(el('p', {}, t.text));
        li.appendChild(body);
        debriefList.appendChild(li);
      });
    }
    nextBtn.textContent = allDone() ? 'See your code word ↑' : 'Next email →';
  }

  function renderZoom() {
    const z = ZOOM_STEPS[zoomIndex];
    stage.style.width = `${z * 100}%`;
    zoomLabel.textContent = `${Math.round(z * 100)}%`;
    zoomOutBtn.disabled = zoomIndex <= 0;
    zoomInBtn.disabled = zoomIndex >= ZOOM_STEPS.length - 1;
  }

  function renderReticle() {
    reticle.style.left = `${cursor.x * 100}%`;
    reticle.style.top = `${cursor.y * 100}%`;
  }

  function renderStage() {
    const e = cur();
    const s = st();
    const src = `assets/${e.img}`;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.alt = `Screenshot of email ${state.current + 1}: from ${e.from}, subject “${e.subject}”.`;
    stage.classList.toggle('is-locked', s.done);
    stage.setAttribute('aria-label', s.done
      ? `Email ${state.current + 1} (reviewed). Flags are locked.`
      : `Email ${state.current + 1} from ${e.from}. Click or tap to drop a red flag.`);
    viewerHeading.textContent = `Email ${state.current + 1} of ${EMAILS.length} — ${e.from}`;
    renderBoxes();
    renderPins();
    renderReticle();
  }

  function renderPanel() {
    const s = st();
    workPanel.hidden = s.done;
    debriefPanel.hidden = !s.done;
    if (s.done) {
      renderDebrief();
    } else {
      renderFlagList();
      renderVerdict();
      renderHints();
      renderFeedback(s.feedback);
    }
    flagCountEl.textContent = `${s.pins.length} / ${MAX_FLAGS} flags`;
  }

  function renderVaultCallout() {
    if (!vaultCallout) return;
    if (allDone() && roomSolved()) {
      vaultCallout.textContent = '';
      vaultCallout.appendChild(document.createTextNode('Code word: '));
      vaultCallout.appendChild(el('strong', {}, WORD));
      vaultCallout.appendChild(document.createTextNode(' — enter it in the vault on the Mission Hub.'));
    }
  }

  function renderComplete() {
    if (!completeEl) return;
    if (!(allDone() && roomSolved())) {
      completeEl.hidden = true;
      completeEl.innerHTML = '';
      return;
    }
    const attempts = EMAILS.reduce((n, e) => n + Math.max(0, state.emails[e.img].attempts - 1), 0);
    const hints = EMAILS.reduce((n, e) => n + state.emails[e.img].hints, 0);
    completeEl.innerHTML = '';
    completeEl.appendChild(el('h2', {}, 'Inbox secured'));
    const phishCount = EMAILS.filter((e) => e.phishing).length;
    const genuineCount = EMAILS.length - phishCount;
    const handled = [];
    if (phishCount) handled.push(`${numWord(phishCount)} phishing attempt${phishCount === 1 ? '' : 's'} reported`);
    if (genuineCount) handled.push(`${numWord(genuineCount)} genuine email${genuineCount === 1 ? '' : 's'} trusted`);
    completeEl.appendChild(el('p', {}, `All ${numWord(EMAILS.length)} emails handled: ${handled.join(', ')}.`));
    completeEl.appendChild(el('div', { className: 'phx-codeword', 'aria-label': `Code word ${WORD}` }, WORD));
    const p = el('p');
    p.appendChild(document.createTextNode('Code word: '));
    p.appendChild(el('strong', {}, WORD));
    p.appendChild(document.createTextNode(' — enter it in the vault on the Mission Hub.'));
    completeEl.appendChild(p);
    completeEl.appendChild(el('p', { className: 'muted' }, `Retries: ${attempts} · Hints used: ${hints}`));
    const row = el('div', { className: 'phx-row', style: { justifyContent: 'center' } });
    row.appendChild(el('a', { className: 'btn primary', href: 'game.html' }, 'Go to the Mission Hub'));
    row.appendChild(el('a', { className: 'btn ghost', href: 'osint.html' }, 'Next room: OSINT →'));
    completeEl.appendChild(row);
    completeEl.hidden = false;
  }

  function render() {
    renderInbox();
    renderStage();
    renderPanel();
    renderZoom();
    renderVaultCallout();
    renderComplete();
  }

  // ---------- Actions ----------
  function goTo(idx) {
    const next = Math.max(0, Math.min(EMAILS.length - 1, idx));
    if (next === state.current) return;
    state.current = next;
    cursor.x = 0.5; cursor.y = 0.3;
    persist();
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('img', EMAILS[next].img);
      history.replaceState(null, '', url);
    } catch (_) { /* ignore */ }
    render();
    if (viewport) viewport.scrollTop = 0;
    announce(`Email ${next + 1} of ${EMAILS.length}: from ${EMAILS[next].from}.`);
  }

  function addPin(x, y) {
    const s = st();
    if (s.done) return;
    if (s.pins.length >= MAX_FLAGS) {
      setFeedback(`You've used all ${MAX_FLAGS} flags. Remove one before adding another.`, 'warn', { persistIt: false });
      return;
    }
    state.seq += 1;
    s.pins.push({ id: state.seq, x: clamp01(x), y: clamp01(y), result: null });
    save();
    renderPins();
    renderFlagList();
    renderInbox();
    announce(`Flag ${s.pins.length} dropped.`);
  }

  function removePin(id) {
    const s = st();
    if (s.done) return;
    const before = s.pins.length;
    s.pins = s.pins.filter((p) => p.id !== id);
    if (s.pins.length === before) return;
    save();
    renderPins();
    renderFlagList();
    renderInbox();
    announce('Flag removed.');
  }

  function undoPin() {
    const s = st();
    if (s.done || !s.pins.length) return;
    removePin(s.pins[s.pins.length - 1].id);
  }

  function clearPins() {
    const s = st();
    if (s.done || !s.pins.length) return;
    s.pins = [];
    save();
    renderPins();
    renderFlagList();
    renderInbox();
    announce('All flags cleared.');
  }

  function setVerdict(v) {
    const s = st();
    if (s.done) return;
    s.verdict = s.verdict === v ? null : v;
    save();
    renderVerdict();
    renderInbox();
  }

  function useHint() {
    const e = cur();
    const s = st();
    if (s.done || s.hints >= 3) return;
    const level = s.hints;
    const cost = HINT_COSTS[level];
    points?.spend?.(cost, `Phishing hint ${level + 1} (email ${state.current + 1})`);
    if (level === 2 && e.phishing) {
      const hitNow = evaluate(e, s.pins).found;
      const order = e.flags.map((f, i) => i).sort((a, b) => (e.flags[b].key ? 1 : 0) - (e.flags[a].key ? 1 : 0));
      const target = order.find((i) => !hitNow.has(i));
      s.spotlight = Number.isInteger(target) ? target : null;
    }
    s.hints = level + 1;
    save();
    renderHints();
    renderBoxes();
    renderInbox();
    announce(`Hint ${level + 1} revealed. ${cost} points deducted.`);
  }

  function markSuccess(e, s, found) {
    s.done = true;
    s.found = Array.from(found || []);
    s.spotlight = null;
    s.feedback = null;
    save();
    render();
    announce(e.phishing ? 'Correct. Phishing email reported. Debrief shown.' : 'Correct. This email is legitimate. Debrief shown.');
    if (allDone()) completeRoom();
  }

  function submit() {
    const e = cur();
    const s = st();
    if (s.done) return;

    // Validation only (no penalty, no correctness info)
    if (!s.verdict) {
      setFeedback('Pick your verdict first: Phishing or Legitimate.', 'warn', { persistIt: false });
      return;
    }
    if (s.verdict === 'phish' && !s.pins.length) {
      setFeedback([
        'You picked Phishing. Now show your evidence.',
        'Click or tap the email to flag what gave it away.'
      ].join('\n'), 'warn', { persistIt: false });
      return;
    }
    if (s.verdict === 'legit' && s.pins.length) {
      setFeedback([
        'You picked Legitimate, but there are still flags on the email.',
        'Clear your flags, or change your verdict.'
      ].join('\n'), 'warn', { persistIt: false });
      return;
    }

    s.attempts += 1;
    const saidPhish = s.verdict === 'phish';

    if (saidPhish !== e.phishing) {
      points?.spend?.(WRONG_COST, 'Phishing: wrong verdict');
      setFeedback([
        'Wrong verdict.',
        'Look again at who sent it and what it wants John to do.',
        `−${WRONG_COST} points. Try again.`
      ].join('\n'), 'warn');
      save();
      renderInbox();
      return;
    }

    if (!e.phishing) {
      markSuccess(e, s, []);
      return;
    }

    const ev = evaluate(e, s.pins);
    s.pins.forEach((p) => { p.result = ev.results.get(p.id) || null; });
    const keyMissing = e.flags.some((f, i) => f.key && !ev.found.has(i));
    const enough = ev.found.size >= e.required;
    const tooMany = ev.misses > MAX_FALSE_FLAGS;

    if (enough && !keyMissing && !tooMany) {
      markSuccess(e, s, ev.found);
      return;
    }

    // Right verdict, not enough proof. One short idea per line (see renderFeedback).
    points?.spend?.(WRONG_COST, 'Phishing: not enough red flags');
    const hits = ev.found.size;
    const lines = ['Right verdict: this email is phishing.'];
    if (!enough) {
      const more = e.required - hits;
      lines.push(hits === 0
        ? `But none of your flags are on a warning sign yet. Find ${e.required === 1 ? 'one' : `${e.required} different ones`}.`
        : `But you’ve found ${hits} of the ${e.required} warning signs needed. Find ${more} more.`);
      if (ev.duplicates) lines.push('Flags on the same warning sign only count once.');
    } else if (keyMissing) {
      lines.push('But you haven’t flagged the biggest giveaway yet. Find it.');
    }
    if (tooMany) {
      const remove = ev.misses - MAX_FALSE_FLAGS;
      lines.push(`${lines.length > 1 ? 'Also, too' : 'But too'} many flags are on harmless parts of the email. Remove at least ${remove} of the grey ✕ ones.`);
    }
    // Explain the colours only for the kinds of flag actually on the email
    // (the "too many" line above already explains the grey ones).
    if (hits && ev.misses && !tooMany) lines.push('Green ✓ flags are on real warning signs. Grey ✕ flags are on harmless parts.');
    else if (hits) lines.push('Your green ✓ flags are on real warning signs. Keep them.');
    else if (ev.misses && !tooMany) lines.push('Grey ✕ flags are on harmless parts of the email.');
    lines.push(`−${WRONG_COST} points. Try again.`);
    setFeedback(lines.join('\n'), 'warn');
    save();
    renderPins();
    renderFlagList();
    renderInbox();
  }

  function goNext() {
    if (allDone()) {
      completeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      completeEl?.querySelector('a')?.focus({ preventScroll: true });
      return;
    }
    for (let step = 1; step <= EMAILS.length; step += 1) {
      const idx = (state.current + step) % EMAILS.length;
      if (!state.emails[EMAILS[idx].img].done) { goTo(idx); stage.focus({ preventScroll: true }); break; }
    }
  }

  // ---------- Completion ----------
  // Shared completion contract: vault.completeRoom() sets the progress flag,
  // stores the code word, syncs to the server and ticks the header tracker, in
  // the right order. It returns true only the first time (safe to repeat).
  function completeRoom() {
    let first = false;
    try { first = window.vault?.completeRoom?.(ROOM_KEY, WORD, { message: `Code word ${WORD} secured.` }) === true; } catch (_) { /* ignore */ }
    if (first) {
      state.pctAt = Date.now();
      persist();
    }
    renderVaultCallout();
    renderComplete();
    renderInbox();
    if (first) {
      announce(`Room complete. Code word ${WORD}. Enter it in the vault on the Mission Hub.`);
      setTimeout(() => completeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    }
  }

  // ---------- Input: pointer (mouse + touch) ----------
  stage.addEventListener('click', (ev) => {
    if (ev.target.closest('.phx-pin')) return;
    stage.classList.remove('is-kbd');
    if (st().done) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    cursor.x = x; cursor.y = y;
    renderReticle();
    addPin(x, y);
  });

  stage.addEventListener('pointerdown', () => stage.classList.remove('is-kbd'));

  // ---------- Input: keyboard ----------
  stage.addEventListener('keydown', (ev) => {
    const step = ev.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    let handled = true;
    switch (ev.key) {
      case 'ArrowLeft': cursor.x = clamp01(cursor.x - step); break;
      case 'ArrowRight': cursor.x = clamp01(cursor.x + step); break;
      case 'ArrowUp': cursor.y = clamp01(cursor.y - step); break;
      case 'ArrowDown': cursor.y = clamp01(cursor.y + step); break;
      case 'Enter':
      case ' ': {
        if (st().done) break;
        const e = cur();
        const near = st().pins.find((p) => Math.hypot((p.x - cursor.x) * e.w, (p.y - cursor.y) * e.h) < 18);
        if (near) removePin(near.id); else addPin(cursor.x, cursor.y);
        break;
      }
      case 'Backspace':
      case 'Delete':
        undoPin();
        break;
      default:
        handled = false;
    }
    if (!handled) return;
    ev.preventDefault();
    stage.classList.add('is-kbd');
    renderReticle();
    if (ev.key.startsWith('Arrow')) {
      try { reticle.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { /* ignore */ }
    }
  });

  stage.addEventListener('focus', () => {
    // Show the aiming reticle for keyboard users (not after a mouse click).
    if (!stage.matches(':focus-visible')) return;
    stage.classList.add('is-kbd');
  });

  // ---------- Wire controls ----------
  undoBtn?.addEventListener('click', undoPin);
  clearBtn?.addEventListener('click', clearPins);
  phishBtn?.addEventListener('click', () => setVerdict('phish'));
  legitBtn?.addEventListener('click', () => setVerdict('legit'));
  submitBtn?.addEventListener('click', submit);
  hintBtn?.addEventListener('click', useHint);
  nextBtn?.addEventListener('click', goNext);
  zoomInBtn?.addEventListener('click', () => { zoomIndex = Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1); renderZoom(); });
  zoomOutBtn?.addEventListener('click', () => { zoomIndex = Math.max(0, zoomIndex - 1); renderZoom(); });

  // ---------- Background sync safety ----------
  // state-sync wipes `${team}_phishing_*` keys when the server says this room
  // is at 0%. That's how an admin "reopen" works, but it can also fire if a
  // pull lands before our first progress push. Tell the two apart by time.
  window.addEventListener('state-sync:applied', (ev) => {
    const remote = ev?.detail?.state || {};
    const remoteReset = remote.vault?.resetVersion;
    if (remoteReset && String(remoteReset) !== String(bootResetVersion)) return; // full reset → page reloads

    if (remote.progress?.phishing && !allDone()) {
      // Completed elsewhere (another device or facilitator).
      EMAILS.forEach((e) => { state.emails[e.img].done = true; });
      persist();
      render();
      completeRoom();
      return;
    }

    const stillStored = localStorage.getItem(STORE_KEY) != null;
    if (stillStored || !hasStarted()) return;
    const remoteMetaAt = Number(remote.progressMeta?.phishing?.updatedAt) || 0;
    if (!remote.progress?.phishing && remoteMetaAt > (state.pctAt || 0)) {
      // Facilitator reopened the room: start fresh.
      state = freshState();
      persist();
      render();
      setFeedback('This room was reset by the facilitator.', 'info', { persistIt: false });
      return;
    }
    // Race with our own push: restore what we had.
    persist();
    try { window.utils?.setProgressPercent?.(ROOM_KEY, Math.max(5, Math.round((doneCount() / EMAILS.length) * 100))); } catch (_) { /* ignore */ }
    state.pctAt = Date.now();
    persist();
    try { window.stateSync?.saveNow?.('phishing-restore'); } catch (_) { /* ignore */ }
  });

  // ---------- Boot ----------
  const bootResetVersion = localStorage.getItem(`${TEAM}_reset_version`);

  function cleanupLegacyKeys() {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (/^class_Picture\d/.test(k) || /^phish_done_Picture\d/.test(k) || k.startsWith(`${TEAM}_phishing_Picture`)) {
          localStorage.removeItem(k);
        }
      });
    } catch (_) { /* ignore */ }
  }

  function boot() {
    cleanupLegacyKeys();
    state = loadState();
    // Deep link support (?img=phish-2026-3.webp)
    try {
      const q = new URLSearchParams(location.search).get('img');
      const idx = EMAILS.findIndex((e) => e.img === q);
      if (idx >= 0) state.current = idx;
    } catch (_) { /* ignore */ }
    // Room already completed (e.g. on another device): show everything cleared.
    if (roomFlagComplete() && !allDone()) {
      EMAILS.forEach((e) => { state.emails[e.img].done = true; });
    }
    persist();

    utils?.initStatusHud?.(ROOM_KEY, {
      score: '#phishPointsTotal',
      delta: '#phishPointsDelta',
      progressFill: '#phishProgressFill',
      progressLabel: '#phishProgressText'
    });
    points?.ensure?.();

    render();
    if (allDone()) {
      // Already solved: render() above restored the code word and card.
      // Otherwise (e.g. solved on another device) finish completing here.
      if (!roomSolved()) completeRoom();
    } else {
      syncProgress();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
