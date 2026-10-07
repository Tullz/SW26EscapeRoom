/* incident.js — "The Midnight Alert" (Incident Management room)
   Four plain-English steps: Spot it -> Stop it -> Tell -> Fix it.
   Progress key: incident   Vault storage: vault_word_incident
*/

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const announce = (m) => { try { window.a11y?.announce?.(m); } catch (_) {} };

  if (!$('#incidentDashboard')) return;

  // ---------- Constants ----------
  const PUZZLE_KEY = 'incident';
  const CODE_WORD = 'BREACH';
  const VAULT_STORAGE_KEY = 'vault_word_incident';
  const LEGACY_STATE_KEY = 'incident_state';

  const PEN_WRONG = 2;
  const PEN_HINT = 5;

  const LEAK_START = 612408;     // records already copied when the room opens
  const LEAK_RATE = 37;          // records per second while the leak is live
  const LEAK_MAX = 847291;       // total customer records

  // Step 1: tonight's remote log-ins
  const LOGINS = [
    { id: 'priya', time: '6:40 PM', name: 'Priya Shah', team: 'Finance', from: 'Sydney, Australia', code: true },
    { id: 'ben', time: '8:15 PM', name: 'Ben Carter', team: 'Sales', from: 'Singapore', code: true },
    { id: 'sam1', time: '10:02 PM', name: 'Sam Lee', team: 'IT', from: 'Sydney, Australia', code: true },
    { id: 'jordan', time: '11:42 PM', name: 'Jordan Thompson', team: 'Finance', from: 'Bucharest, Romania', code: false },
    { id: 'sam2', time: '12:30 AM', name: 'Sam Lee', team: 'IT', from: 'Sydney, Australia', code: true }
  ];
  const S1_ANSWER = 'jordan';
  const S1_WRONG = {
    priya: 'Priya is on the calendar as working late from home in Sydney. That log-in checks out.',
    ben: 'Ben is on the calendar as being at a conference in Singapore. That log-in checks out.',
    sam1: 'Sam is on call tonight, working from home in Sydney. That log-in checks out.',
    sam2: 'Sam is on call tonight, working from home in Sydney. That log-in checks out.'
  };

  // Step 2: containment actions (choose 2)
  const ACTIONS = [
    { id: 'company', title: 'Switch off the internet for the whole company', sub: 'Nobody anywhere can work until it is back on' },
    { id: 'disconnect', title: 'Disconnect the customer database from the internet', sub: 'Only that one system goes offline' },
    { id: 'email', title: 'Email Jordan\'s work account: "Is this you?"', sub: 'Ask the account holder directly' },
    { id: 'lock', title: 'Lock Jordan\'s account and cancel its password', sub: 'Nobody can use the account until it is reset' },
    { id: 'wipe', title: 'Wipe the customer database and reload last week\'s copy', sub: 'Start again from a clean copy' }
  ];
  const S2_ANSWER = ['disconnect', 'lock'];

  // Step 3: contacts (choose 3)
  const CONTACTS = [
    { id: 'dana', name: 'Dana Wu', role: 'Head of Security', color: '#58a6ff' },
    { id: 'chris', name: 'Chris Nolan', role: 'Sales Manager', color: '#ffa657' },
    { id: 'social', name: 'Meridian Social Media Team', role: 'Runs our public accounts', color: '#c49aff' },
    { id: 'marcus', name: 'Marcus Reid', role: 'Privacy Officer', color: '#09ff88' },
    { id: 'tom', name: 'Tom Baxter', role: 'Reporter, Daily Herald', color: '#ff7b7b' },
    { id: 'helen', name: 'Helen Park', role: 'Finance Manager', color: '#ffd966' },
    { id: 'customers', name: 'All Customers', role: 'Email list, 847,291 people', color: '#8b949e' }
  ];
  const S3_ANSWER = ['dana', 'marcus', 'helen'];

  // Step 4A: story cards (correct order)
  const STORY = [
    { id: 'app', text: 'A fitness app Jordan uses is hacked, and its passwords are posted online.' },
    { id: 'reuse', text: 'Criminals notice Jordan\'s fitness-app password is also Jordan\'s work password.' },
    { id: 'login', text: 'They log in as Jordan. Only a password is needed — no phone code.' },
    { id: 'copy', text: 'They start copying customer data out of the company.' }
  ];
  const S4A_ANSWER = STORY.map(s => s.id);

  // Step 4B: the fix (choose 1)
  const FIXES = [
    { id: 'yearly', title: 'Make everyone change their password once a year', sub: 'Fresh passwords every January' },
    { id: 'mfa', title: 'Turn on the phone code at log-in for every account — including Jordan\'s', sub: 'Logging in needs the password AND a code sent to the person\'s phone' },
    { id: 'door', title: 'Put a stronger lock on the server room door', sub: 'Keep people away from the computers' }
  ];
  const S4B_ANSWER = 'mfa';

  const HINTS = {
    s1: 'Compare each log-in with the staff calendar. Someone logged in from a place they cannot possibly be tonight. (Also notice how that person signed in.)',
    s2: 'Go through the options one by one. Three of them break a "Never" rule on the card. The two that are left match the "Do this straight away" list.',
    s3: 'Jordan works in Finance, so you need the Finance manager. Add the Head of Security and the Privacy Officer.',
    s4a: 'Start with what happened two months ago, outside the company. Finish with the data leaving. Everything else happened in between.',
    s4b: 'The criminals already had the right password. Which fix still blocks someone who knows your password?'
  };

  const NOTES = {
    1: 'A criminal logged in as Jordan at 11:42 PM from Romania while Jordan was hiking in Tasmania. The account only asked for a password.',
    2: 'Leak stopped: the customer database was cut off from the internet and Jordan\'s account was locked. Evidence kept.',
    3: 'Called the Head of Security, the Privacy Officer and Jordan\'s manager. No public announcements.',
    4: 'Cause found: a leaked fitness-app password was reused at work, and Jordan\'s account had no phone code. Fix: phone codes for every account.'
  };

  // ---------- State ----------
  const points = window.utils?.points;
  points?.ensure?.();

  const user = window.utils?.getUser?.() || null;
  const TEAM = String(user?.username || 'team').toLowerCase();
  const STATE_KEY = `${TEAM}_incident_state`;
  const RESET_KEY = `${TEAM}_reset_version`;

  function readResetVersion() {
    try { return localStorage.getItem(RESET_KEY) || null; } catch (_) { return null; }
  }

  function freshState() {
    return {
      v: 2,
      step: 1,
      startedAt: Date.now(),
      resetVersion: readResetVersion(),
      leakFinal: null,
      s1Sel: null,
      s2Sel: [],
      s3Sel: [],
      s4Order: [],
      s4ADone: false,
      s1Solved: false,
      s3Solved: false,
      s4BSel: null,
      hints: {},
      complete: false
    };
  }

  function progressFlagSet() {
    try { return (window.utils?.readProgress?.() || {})[PUZZLE_KEY] === true; } catch (_) { return false; }
  }

  function loadState() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (_) { st = null; }
    try { localStorage.removeItem(LEGACY_STATE_KEY); } catch (_) {}
    if (!st || st.v !== 2) return freshState();

    // Admin reset since this state was saved? Start over.
    const rv = readResetVersion();
    if (rv && st.resetVersion !== rv) return freshState();
    // Room was finished before but progress + word have since been cleared: start over.
    let hasWord = false;
    try { hasWord = !!localStorage.getItem(VAULT_STORAGE_KEY); } catch (_) {}
    if (st.complete && !progressFlagSet() && !hasWord) return freshState();

    const base = freshState();
    return { ...base, ...st, hints: st.hints || {} };
  }

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  let state = loadState();
  saveState();

  // ---------- Small helpers ----------
  function setFeedback(id, msg, tone) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('ok', 'warn');
    if (tone === 'ok') el.classList.add('ok');
    if (tone === 'warn') el.classList.add('warn');
    if (msg) announce(msg);
  }

  function wrong(reason) {
    points?.spend?.(PEN_WRONG, reason);
  }

  function scrollToEl(el, where) {
    if (!el) return;
    const header = document.querySelector('.site-header');
    const pos = header ? getComputedStyle(header).position : '';
    const offset = (header && (pos === 'sticky' || pos === 'fixed')) ? header.getBoundingClientRect().height : 0;
    let top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
    if (where === 'center') {
      const room = window.innerHeight - offset;
      top -= Math.max(0, (room - el.getBoundingClientRect().height) / 2);
    }
    try { window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); } catch (_) { window.scrollTo(0, Math.max(0, top)); }
  }

  function sameSet(a, b) {
    return a.length === b.length && a.every(x => b.includes(x));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Leak counter ----------
  let leakTimer = null;

  function leakNow() {
    if (state.leakFinal != null) return state.leakFinal;
    const secs = Math.max(0, (Date.now() - (state.startedAt || Date.now())) / 1000);
    return Math.min(LEAK_MAX, Math.round(LEAK_START + secs * LEAK_RATE));
  }

  function renderLeak() {
    const box = $('#irLeak');
    const count = $('#irLeakCount');
    const text = $('#irLeakText');
    if (!box || !count || !text) return;
    const n = leakNow().toLocaleString('en-AU');
    if (state.leakFinal != null) {
      box.dataset.state = 'stopped';
      text.textContent = 'LEAK STOPPED — customer records copied before you cut it off:';
      count.textContent = n;
    } else {
      box.dataset.state = 'active';
      text.textContent = 'LIVE — customer records being copied out of the company:';
      count.textContent = n;
    }
  }

  function startLeakTicker() {
    if (leakTimer || state.leakFinal != null) return;
    leakTimer = setInterval(() => {
      if (state.leakFinal != null) { clearInterval(leakTimer); leakTimer = null; }
      renderLeak();
    }, 1000);
  }

  // ---------- Stepper / notes / visibility ----------
  function renderChrome() {
    const current = state.complete ? 5 : state.step;
    $$('#irStepper li').forEach(li => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-done', n < current);
      li.classList.toggle('is-current', n === current);
      const dot = $('.ir-dot', li);
      if (dot) dot.textContent = n < current ? '✔' : String(n);
      if (n === current) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });

    const doneSteps = [1, 2, 3, 4].filter(n => n < current);
    const notes = $('#irNotes');
    const list = $('#irNotesList');
    if (notes && list) {
      notes.hidden = doneSteps.length === 0;
      list.innerHTML = '';
      doneSteps.forEach(n => {
        const li = document.createElement('li');
        li.textContent = NOTES[n];
        list.appendChild(li);
      });
    }

    [1, 2, 3, 4].forEach(n => {
      const sec = $(`#irStep${n}`);
      if (sec) sec.hidden = state.complete || n !== state.step;
    });
    const done = $('#irComplete');
    if (done) done.hidden = !state.complete;
    const callout = $('.intro-banner .vault-callout p');
    if (callout) callout.textContent = state.complete ? 'Case closed \u2014 your code word is shown at the bottom of the page.' : 'Finish all four steps to reveal your code word.';

    renderLeak();
  }

  function renderHints() {
    Object.keys(HINTS).forEach(key => {
      const idPart = key.toUpperCase();
      const btn = $(`[data-hint="${key}"]`);
      const box = $(`#ir${idPart}HintBox`);
      if (state.hints[key]) {
        if (btn) { btn.disabled = true; btn.textContent = 'Hint used'; }
        if (box) { box.hidden = false; box.innerHTML = `<strong>Hint:</strong> ${escapeHtml(HINTS[key])}`; }
      }
    });
  }

  function useHint(key) {
    if (state.hints[key] || state.complete) return;
    state.hints[key] = true;
    saveState();
    points?.spend?.(PEN_HINT, 'Hint (Incident)');
    renderHints();
    announce(HINTS[key]);
  }

  function goToStep(n) {
    state.step = n;
    saveState();
    renderAll();
    const sec = $(`#irStep${n}`);
    if (sec) {
      scrollToEl(sec, 'start');
      const h = $('h2', sec);
      if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (_) {} }
    }
  }

  function stepSolved(n) {
    // record progress for the hub (25 / 50 / 75)
    if (n < 4) window.utils?.setProgressPercent?.(PUZZLE_KEY, n * 25);
    window.stateSync?.queueSave?.(`incident-step${n}`);
  }

  // ---------- Step 1 ----------
  function renderStep1() {
    const wrap = $('#irLog');
    if (!wrap) return;
    $$('.ir-row', wrap).forEach(r => r.remove());
    const solved = !!state.s1Solved || state.step > 1 || state.complete;
    LOGINS.forEach(l => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ir-row';
      b.dataset.id = l.id;
      b.setAttribute('aria-pressed', String(state.s1Sel === l.id));
      b.setAttribute('aria-label', `${l.time}, ${l.name} from ${l.team}, logged in from ${l.from}, ${l.code ? 'password plus phone code' : 'password only'}`);
      b.innerHTML =
        `<span><span class="ir-lbl">Time</span><span class="ir-time">${escapeHtml(l.time)}</span></span>` +
        `<span><span class="ir-lbl">Who</span><span class="ir-name">${escapeHtml(l.name)}</span><span class="ir-sub">${escapeHtml(l.team)}</span></span>` +
        `<span><span class="ir-lbl">Logged in from</span>${escapeHtml(l.from)}</span>` +
        `<span><span class="ir-lbl">How they signed in</span>${l.code ? '<span class="ir-check-yes">Password + phone code</span>' : '<span class="ir-check-no">Password only</span>'}</span>`;
      if (solved) {
        b.disabled = true;
        if (l.id === S1_ANSWER) b.classList.add('is-right');
      }
      b.addEventListener('click', () => {
        if (state.step !== 1 || state.s1Solved) return;
        state.s1Sel = l.id;
        saveState();
        $$('.ir-row', wrap).forEach(r => r.setAttribute('aria-pressed', String(r.dataset.id === l.id)));
        setFeedback('#irS1Feedback', '');
      });
      wrap.appendChild(b);
    });
    const submit = $('#irS1Submit');
    if (submit) submit.hidden = solved;
    const hint = $('#irS1Hint');
    if (hint && solved && !state.hints.s1) hint.hidden = true;
    const done = $('#irS1Done');
    if (done) done.hidden = !solved;
  }

  function submitStep1() {
    if (state.step !== 1 || state.s1Solved) return;
    if (!state.s1Sel) {
      setFeedback('#irS1Feedback', 'Click a log-in in the record first, then press "Flag this log-in".', 'warn');
      return;
    }
    if (state.s1Sel !== S1_ANSWER) {
      wrong('Wrong log-in flagged (Incident)');
      setFeedback('#irS1Feedback', `${S1_WRONG[state.s1Sel] || 'That log-in checks out.'} Try another. (-${PEN_WRONG} pts)`, 'warn');
      return;
    }
    // Solved: stay on this screen so the team can read why, then continue.
    state.s1Solved = true;
    saveState();
    setFeedback('#irS1Feedback', '');
    stepSolved(1);
    renderStep1();
    const done = $('#irS1Done'); if (done) scrollToEl(done, 'center');
    announce('Intruder spotted.');
  }

  // ---------- Generic multi-select renderer (steps 2, 3, 4B) ----------
  function renderOptions(containerSel, items, selected, opts) {
    const box = $(containerSel);
    if (!box) return;
    box.innerHTML = '';
    items.forEach(item => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ir-opt';
      b.dataset.id = item.id;
      const isSel = selected.includes(item.id);
      b.setAttribute('aria-pressed', String(isSel));
      const lead = opts.avatar
        ? `<span class="ir-avatar" style="background:${item.color}" aria-hidden="true">${escapeHtml(item.name.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>`
        : '<span class="ir-box" aria-hidden="true"></span>';
      const title = opts.avatar ? item.name : item.title;
      const sub = opts.avatar ? item.role : item.sub;
      b.innerHTML = `${lead}<span><span class="ir-opt-title">${escapeHtml(title)}</span><span class="ir-opt-sub">${escapeHtml(sub)}</span></span>`;
      if (opts.locked) {
        b.disabled = true;
        if (opts.answer.includes(item.id)) b.classList.add('is-right');
      } else {
        b.addEventListener('click', () => opts.onToggle(item.id));
      }
      box.appendChild(b);
    });
  }

  // ---------- Step 2 ----------
  function step2Solved() { return state.leakFinal != null; }

  function renderStep2() {
    const solved = step2Solved();
    renderOptions('#irS2Options', ACTIONS, solved ? S2_ANSWER : state.s2Sel, {
      locked: solved,
      answer: S2_ANSWER,
      onToggle: (id) => {
        const i = state.s2Sel.indexOf(id);
        if (i >= 0) state.s2Sel.splice(i, 1);
        else {
          if (state.s2Sel.length >= 2) {
            setFeedback('#irS2Feedback', 'You can only pick two. Untick one first.', 'warn');
            return;
          }
          state.s2Sel.push(id);
        }
        setFeedback('#irS2Feedback', '');
        saveState();
        renderStep2();
      }
    });
    const count = $('#irS2Count');
    if (count) { count.textContent = `${state.s2Sel.length} of 2 chosen`; count.hidden = solved; }
    const submit = $('#irS2Submit'); if (submit) submit.hidden = solved;
    const hint = $('#irS2Hint'); if (hint && solved && !state.hints.s2) hint.hidden = true;
    const done = $('#irS2Done'); if (done) done.hidden = !solved;
  }

  function submitStep2() {
    if (step2Solved()) return;
    if (state.s2Sel.length !== 2) {
      setFeedback('#irS2Feedback', 'Pick exactly two actions, then press "Take action".', 'warn');
      return;
    }
    if (!sameSet(state.s2Sel, S2_ANSWER)) {
      const right = state.s2Sel.filter(id => S2_ANSWER.includes(id)).length;
      wrong('Wrong containment actions (Incident)');
      const msg = right === 1
        ? 'The leak is still running. One of your two actions is right, but the other breaks a rule on the emergency card.'
        : 'The leak is still running. Neither action follows the emergency card. Read the "Do this straight away" list again.';
      setFeedback('#irS2Feedback', `${msg} (-${PEN_WRONG} pts)`, 'warn');
      return;
    }
    state.leakFinal = leakNow();
    saveState();
    if (leakTimer) { clearInterval(leakTimer); leakTimer = null; }
    setFeedback('#irS2Feedback', '');
    stepSolved(2);
    renderStep2();
    renderLeak();
    const done = $('#irS2Done'); if (done) scrollToEl(done, 'center');
    announce('Leak stopped.');
  }

  // ---------- Step 3 ----------
  function step3Solved() { return state.step > 3 || !!state.s3Solved; }

  function renderStep3() {
    const solved = step3Solved();
    renderOptions('#irS3Options', CONTACTS, solved ? S3_ANSWER : state.s3Sel, {
      avatar: true,
      locked: solved,
      answer: S3_ANSWER,
      onToggle: (id) => {
        const i = state.s3Sel.indexOf(id);
        if (i >= 0) state.s3Sel.splice(i, 1);
        else {
          if (state.s3Sel.length >= 3) {
            setFeedback('#irS3Feedback', 'You can only pick three. Tap one again to remove it first.', 'warn');
            return;
          }
          state.s3Sel.push(id);
        }
        setFeedback('#irS3Feedback', '');
        saveState();
        renderStep3();
      }
    });
    const count = $('#irS3Count');
    if (count) { count.textContent = `${state.s3Sel.length} of 3 chosen`; count.hidden = solved; }
    const submit = $('#irS3Submit'); if (submit) submit.hidden = solved;
    const hint = $('#irS3Hint'); if (hint && solved && !state.hints.s3) hint.hidden = true;
    const done = $('#irS3Done'); if (done) done.hidden = !solved;
  }

  function submitStep3() {
    if (step3Solved()) return;
    if (state.s3Sel.length !== 3) {
      setFeedback('#irS3Feedback', 'Pick exactly three people, then press "Make the calls".', 'warn');
      return;
    }
    if (!sameSet(state.s3Sel, S3_ANSWER)) {
      const right = state.s3Sel.filter(id => S3_ANSWER.includes(id)).length;
      wrong('Wrong people called (Incident)');
      setFeedback('#irS3Feedback', `${right} of your 3 calls ${right === 1 ? 'is' : 'are'} right. Check each person's job against the contact sheet. (-${PEN_WRONG} pts)`, 'warn');
      return;
    }
    state.s3Solved = true;
    saveState();
    setFeedback('#irS3Feedback', '');
    stepSolved(3);
    renderStep3();
    const done = $('#irS3Done'); if (done) scrollToEl(done, 'center');
    announce('The right people have been called.');
  }

  // ---------- Step 4A: story order ----------
  let storyDeck = null; // shuffled order of cards (not persisted; cheap to reshuffle)

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.every((x, i) => x.id === arr[i].id)) [a[0], a[a.length - 1]] = [a[a.length - 1], a[0]];
    return a;
  }

  function renderStep4A() {
    const slots = $('#irS4Slots');
    const cards = $('#irS4Cards');
    if (!slots || !cards) return;
    if (!storyDeck) storyDeck = state.s4ADone ? STORY.slice() : shuffled(STORY);
    const order = state.s4ADone ? S4A_ANSWER : state.s4Order;

    slots.innerHTML = '';
    STORY.forEach((_, idx) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ir-slot';
      const id = order[idx];
      const card = STORY.find(s => s.id === id);
      b.innerHTML = `<span class="ir-num">${idx + 1}</span><span>${card ? escapeHtml(card.text) : (idx === 0 ? 'What happened first?' : idx === STORY.length - 1 ? 'What happened last?' : 'Then...')}</span>`;
      if (card) {
        b.classList.add('is-filled');
        b.setAttribute('aria-label', `Box ${idx + 1}: ${card.text}. ${state.s4ADone ? '' : 'Tap to take this card back out.'}`);
      } else {
        b.setAttribute('aria-label', `Box ${idx + 1}: empty`);
      }
      if (state.s4ADone) {
        b.disabled = true;
        b.classList.add('is-right');
      } else if (card) {
        b.addEventListener('click', () => {
          state.s4Order.splice(idx, 1);
          saveState();
          setFeedback('#irS4AFeedback', '');
          renderStep4A();
        });
      } else {
        b.disabled = true;
      }
      li.appendChild(b);
      slots.appendChild(li);
    });

    cards.innerHTML = '';
    const remaining = storyDeck.filter(s => !order.includes(s.id));
    remaining.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ir-card';
      b.textContent = s.text;
      b.setAttribute('aria-label', `Story card: ${s.text}. Tap to place it in box ${order.length + 1}.`);
      b.addEventListener('click', () => {
        if (state.s4ADone) return;
        state.s4Order.push(s.id);
        saveState();
        setFeedback('#irS4AFeedback', '');
        renderStep4A();
        announce(`Placed in box ${state.s4Order.length}`);
      });
      cards.appendChild(b);
    });
    cards.previousElementSibling.hidden = remaining.length === 0;
    cards.hidden = remaining.length === 0;

    const submit = $('#irS4ASubmit'); if (submit) submit.hidden = state.s4ADone;
    const hint = $('#irS4AHint'); if (hint && state.s4ADone && !state.hints.s4a) hint.hidden = true;
    const partB = $('#irS4B'); if (partB) partB.hidden = !state.s4ADone;
    const task = $('#irS4Task');
    if (task && state.s4ADone) task.innerHTML = '<strong>Part A done:</strong> the story is complete. Now close the door they came through (Part B, below).';
  }

  function submitStep4A() {
    if (state.s4ADone) return;
    if (state.s4Order.length !== STORY.length) {
      setFeedback('#irS4AFeedback', 'Put all four story cards into the boxes first.', 'warn');
      return;
    }
    const inPlace = state.s4Order.filter((id, i) => id === S4A_ANSWER[i]).length;
    if (inPlace !== STORY.length) {
      wrong('Story out of order (Incident)');
      setFeedback('#irS4AFeedback', `Not quite: ${inPlace} of 4 cards ${inPlace === 1 ? 'is' : 'are'} in the right box. Tap a box to take a card out and try again. (-${PEN_WRONG} pts)`, 'warn');
      return;
    }
    state.s4ADone = true;
    saveState();
    setFeedback('#irS4AFeedback', 'That\'s the story. Two things let the criminals in: a reused password, and no phone code on Jordan\'s account.', 'ok');
    renderStep4A();
    renderStep4B();
    const partB = $('#irS4B'); if (partB) scrollToEl(partB, 'start');
  }

  // ---------- Step 4B: the fix ----------
  function renderStep4B() {
    const solved = state.complete;
    renderOptions('#irS4BOptions', FIXES, solved ? [S4B_ANSWER] : (state.s4BSel ? [state.s4BSel] : []), {
      locked: solved,
      answer: [S4B_ANSWER],
      onToggle: (id) => {
        state.s4BSel = state.s4BSel === id ? null : id;
        saveState();
        setFeedback('#irS4BFeedback', '');
        renderStep4B();
      }
    });
    const submit = $('#irS4BSubmit'); if (submit) submit.hidden = solved;
  }

  function submitStep4B() {
    if (state.complete || !state.s4ADone) return;
    if (!state.s4BSel) {
      setFeedback('#irS4BFeedback', 'Pick one fix first.', 'warn');
      return;
    }
    if (state.s4BSel !== S4B_ANSWER) {
      wrong('Wrong fix (Incident)');
      setFeedback('#irS4BFeedback', `That wouldn't have stopped this attack. Remember: the criminals already knew the password. (-${PEN_WRONG} pts)`, 'warn');
      return;
    }
    setFeedback('#irS4BFeedback', '');
    completeRoom();
  }

  // ---------- Completion ----------
  function showCodeWord() {
    const slot = $('#irWordSlot');
    if (!slot) return;
    slot.innerHTML = '';
    const label = document.createElement('p');
    label.textContent = 'Your code word';
    label.style.color = 'var(--muted)';
    const word = document.createElement('div');
    word.className = 'ir-word';
    word.textContent = CODE_WORD;
    const how = document.createElement('p');
    how.innerHTML = `Code word: <strong>${CODE_WORD}</strong> &mdash; enter it in the vault on the Mission Hub.`;
    slot.append(label, word, how);
  }

  function completeRoom() {
    state.complete = true;
    state.step = 4;
    saveState();

    // Completion contract (order matters)
    window.utils?.setProgressFlag?.(PUZZLE_KEY, true);
    window.utils?.setProgressPercent?.(PUZZLE_KEY, 100, { complete: true });
    try { localStorage.setItem(VAULT_STORAGE_KEY, CODE_WORD); } catch (_) {}
    window.vault?.unlock?.(PUZZLE_KEY, CODE_WORD, { message: `Code word ${CODE_WORD} secured.` });
    window.stateSync?.queueSave?.('incident-complete');

    renderAll();
    const done = $('#irComplete');
    if (done) scrollToEl(done, 'start');
    announce(`Case closed. Code word ${CODE_WORD}. Enter it in the vault on the Mission Hub.`);
  }

  // ---------- Render all ----------
  function renderAll() {
    renderChrome();
    renderStep1();
    renderStep2();
    renderStep3();
    renderStep4A();
    renderStep4B();
    renderHints();
    if (state.complete) showCodeWord();
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    window.utils?.initStatusHud?.(PUZZLE_KEY, {
      score: '#incidentPointsTotal',
      delta: '#incidentPointsDelta',
      progressFill: '#incidentProgressFill',
      progressLabel: '#incidentProgressText'
    });

    // Finished on another device / earlier session: show the solved room.
    if (!state.complete && progressFlagSet()) {
      state.complete = true;
      state.step = 4;
      state.s1Solved = true;
      state.s3Solved = true;
      state.s4ADone = true;
      if (state.leakFinal == null) state.leakFinal = leakNow();
      saveState();
    }
    if (state.complete) {
      try { if (!localStorage.getItem(VAULT_STORAGE_KEY)) localStorage.setItem(VAULT_STORAGE_KEY, CODE_WORD); } catch (_) {}
      try { window.vault?.refresh?.(); } catch (_) {}
    }

    $('#irS1Submit')?.addEventListener('click', submitStep1);
    $('#irS2Submit')?.addEventListener('click', submitStep2);
    $('#irS3Submit')?.addEventListener('click', submitStep3);
    $('#irS4ASubmit')?.addEventListener('click', submitStep4A);
    $('#irS4BSubmit')?.addEventListener('click', submitStep4B);
    $$('[data-hint]').forEach(b => b.addEventListener('click', () => useHint(b.dataset.hint)));
    $$('[data-next]').forEach(b => b.addEventListener('click', () => goToStep(Number(b.dataset.next))));

    renderAll();
    startLeakTicker();
  });
})();
