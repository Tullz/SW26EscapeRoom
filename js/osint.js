/* osint.js — OSINT Investigation (Cyber Escape Rooms)
   Room 2: Account Recovery Simulation — recover access to a locked
   employee account by investigating their social media profile.

   Flow:
   A – Profile Investigation (tab browsing, recon)
   B – Security Question Challenge (3 recovery questions, 2 attempts each)
   C – Password Prediction (multiple choice)
   D – Spear Phish Draft (multiple choice)

   Vault code word: awarded only if Part B passed (>=2/3 correct)
   AND Part C correct AND Part D completed. Completion goes through
   window.vault.completeRoom() so the word, progress flag, server sync and
   header tracker all update together.

   Scoring:
   - Wrong security question answer: -3 pts
   - Wrong password prediction: -3 pts
   - Wrong spear phish pick: -3 pts
   - Hints: -5 pts each
*/

(function () {
  'use strict';

  // ---------- DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const announce = (m) => { try { window.a11y?.announce?.(m); } catch (_) {} };

  // ---------- Guard: only run on osint page ----------
  if (!$('#osintPartA')) return;

  // ---------- Constants ----------
  const ROOM_KEY = 'osint';
  // Room state is saved per team (matches the state-sync reset pattern `${team}_osint_*`),
  // so a second team on the same browser never inherits another team's run.
  const TEAM = String(window.utils?.getUser?.()?.username || 'team').toLowerCase();
  const STATE_KEY = `${TEAM}_osint_state`;
  // Code word is assembled at runtime so it never appears in the page markup.
  const WORD = [83, 72, 65, 68, 79, 87].map((c) => String.fromCharCode(c)).join('');
  const TOTAL_PARTS = 4;
  const MAX_ATTEMPTS = 2;
  const MIN_CORRECT_B = 2; // must get at least 2/3 security questions right

  // ---------- Security questions (Part B) ----------
  const SECURITY_QUESTIONS = [
    {
      id: 'sq1',
      label: 'What is your pet\'s name?',
      answer: 'biscuit',
      hint: 'Check the Posts tab — look for mentions of a dog. Jordan talks about them often.',
    },
    {
      id: 'sq2',
      label: 'What city did you grow up in?',
      answer: 'ballarat',
      hint: 'Look for a throwback post about Jordan\'s hometown — it mentions the old neighbourhood.',
    },
    {
      id: 'sq3',
      label: 'What is your mother\'s maiden name?',
      answer: 'chen',
      hint: 'Find Jordan\'s birthday post for their mum, then look at who replied to it. The maiden name is part of a hyphenated surname.',
    }
  ];

  // ---------- Load / save state ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return defaultState();
  }

  function defaultState() {
    return {
      partADone: false,
      partBDone: false,
      partBPassed: false,
      partCDone: false,
      partCCorrect: false,
      partDDone: false,
      currentQuestion: 0,
      questionAttempts: {},
      questionResults: {},
      partCAnswer: null,
      partDAnswer: null,
      hintsUsed: {},
      missionFailed: false
    };
  }

  function saveState(s) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch (_) {}
  }

  let state = loadState();

  // ---------- Init status HUD ----------
  window.utils?.points?.ensure();
  window.utils?.initStatusHud?.('osint', {
    score: '#osintPointsTotal',
    delta: '#osintPointsDelta',
    progressFill: '#osintProgressFill',
    progressLabel: '#osintProgressText'
  });

  // ---------- Completion check ----------
  // Complete = progress flag set AND code word stored (see vault.js).
  function roomComplete() {
    try { return window.vault?.isRoomComplete?.(ROOM_KEY) === true; } catch (_) { return false; }
  }

  function progressFlagSet() {
    try { return (window.utils?.readProgress?.() || {})[ROOM_KEY] === true; } catch (_) { return false; }
  }

  // ---------- Progress tracking ----------
  // Intermediate progress only. It never passes `complete`, so it can never mark the
  // room solved (or un-solve it); completion is handled by completePuzzle().
  function updateProgress(opts = {}) {
    if (roomComplete()) return;
    let parts = 0;
    if (state.partADone) parts++;
    if (state.partBDone) parts++;
    if (state.partCDone) parts++;
    if (state.partDDone) parts++;
    // 100% is reserved for a genuine pass; a failed run tops out below it.
    const pct = Math.min(90, Math.round((parts / TOTAL_PARTS) * 100));
    const existing = window.utils?.getProgressPercent?.(ROOM_KEY) ?? 0;
    if (pct === existing) return;
    // Only move forward, unless this is an explicit restart (Retry), so a fresh
    // device opening the room never knocks another device's progress back to 0.
    if (pct < existing && !opts.force) return;
    window.utils?.setProgressPercent?.(ROOM_KEY, pct);
  }

  // ---------- Locked sections ----------
  // Locked sections are greyed out AND inert, so keyboard users can't tab into a
  // later step (e.g. pick a password) before it is unlocked.
  function setLocked(section, locked) {
    if (!section) return;
    section.classList.toggle('is-locked', locked);
    section.inert = locked;
  }
  $$('.osint-section.is-locked').forEach((section) => setLocked(section, true));

  // ---------- Tab switching ----------
  const tabs = $$('.sm-tab');
  const panels = $$('.sm-tab-panel');

  function switchTab(tabEl) {
    tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
    panels.forEach(p => p.classList.remove('is-active'));
    tabEl.setAttribute('aria-selected', 'true');
    const targetId = tabEl.getAttribute('aria-controls');
    const panel = $('#' + targetId);
    if (panel) panel.classList.add('is-active');
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab));
    tab.addEventListener('keydown', (e) => {
      const idx = tabs.indexOf(tab);
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = (idx + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = (idx - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        next = 0;
      } else if (e.key === 'End') {
        next = tabs.length - 1;
      }
      if (next >= 0) {
        e.preventDefault();
        switchTab(tabs[next]);
        tabs[next].focus();
      }
    });
  });

  // ---------- Part A: Profile Investigation ----------
  const partAEl = $('#osintPartA');
  const partALabel = $('#partALabel');
  const startRecoveryBtn = document.createElement('button');
  startRecoveryBtn.className = 'btn primary mt-1';
  startRecoveryBtn.type = 'button';
  startRecoveryBtn.textContent = 'I\'ve reviewed the profile — begin account recovery';
  startRecoveryBtn.id = 'startRecoveryBtn';
  startRecoveryBtn.setAttribute('aria-label', 'Continue to the account recovery security questions');

  if (!state.partADone) {
    partAEl.appendChild(startRecoveryBtn);
  } else {
    partALabel.classList.add('is-done');
    partALabel.textContent = 'Recon complete';
  }

  startRecoveryBtn.addEventListener('click', () => {
    state.partADone = true;
    saveState(state);
    partALabel.classList.add('is-done');
    partALabel.textContent = 'Recon complete';
    startRecoveryBtn.remove();
    unlockPartB();
    updateProgress();
    announce('Recon complete. Proceeding to account recovery.');
    const partB = $('#osintPartB');
    if (partB) partB.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- Part B: Security Question Challenge ----------
  const partBEl = $('#osintPartB');
  const partBLabel = $('#partBLabel');
  const recoveryBody = $('#recoveryBody');
  const hintBtnB = $('#osintHintBtnB');
  const hintTextB = $('#osintHintTextB');

  function unlockPartB() {
    setLocked(partBEl, false);
    renderSecurityQuestion();
  }

  function buildStepIndicator() {
    const container = document.createElement('div');
    container.className = 'recovery-step-indicator';

    SECURITY_QUESTIONS.forEach((q, i) => {
      if (i > 0) {
        const bar = document.createElement('div');
        bar.className = 'recovery-step-bar';
        container.appendChild(bar);
      }
      const dot = document.createElement('div');
      dot.className = 'recovery-step-dot';
      if (i < state.currentQuestion) {
        const result = state.questionResults[q.id];
        dot.classList.add(result === true ? 'is-done' : 'is-failed');
      } else if (i === state.currentQuestion && !state.partBDone) {
        dot.classList.add('is-active');
      }
      container.appendChild(dot);
    });

    return container;
  }

  function renderSecurityQuestion() {
    const idx = state.currentQuestion;

    if (idx >= SECURITY_QUESTIONS.length) {
      finishPartB();
      return;
    }

    const q = SECURITY_QUESTIONS[idx];
    const attempts = state.questionAttempts[q.id] || 0;
    const isDone = state.questionResults[q.id] != null;

    // Reset hint
    hintTextB.hidden = true;
    hintTextB.textContent = '';

    recoveryBody.innerHTML = '';
    recoveryBody.appendChild(buildStepIndicator());

    // If this question is already answered (restore), show result briefly and advance
    if (isDone) {
      const result = state.questionResults[q.id];
      const labelEl = document.createElement('p');
      labelEl.className = 'recovery-question-label';
      labelEl.textContent = q.label;
      recoveryBody.appendChild(labelEl);

      const resultEl = document.createElement('p');
      resultEl.className = 'recovery-result ' + (result ? 'is-pass' : 'is-fail');
      resultEl.textContent = result ? 'Verified' : 'Failed — answer: ' + displayAnswer(q);
      recoveryBody.appendChild(resultEl);

      setTimeout(() => {
        state.currentQuestion = idx + 1;
        saveState(state);
        renderSecurityQuestion();
      }, 1000);
      return;
    }

    const labelEl = document.createElement('p');
    labelEl.className = 'recovery-question-label';
    labelEl.textContent = q.label;
    recoveryBody.appendChild(labelEl);

    const inputGroup = document.createElement('div');
    inputGroup.className = 'recovery-input-group';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'osintAnswer_' + q.id;
    input.placeholder = 'Type your answer...';
    input.setAttribute('aria-label', q.label);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('data-sanitize', 'loose');
    input.setAttribute('data-sanitize-allow-quotes', 'true');

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn primary sm';
    submitBtn.type = 'button';
    submitBtn.textContent = 'Verify';

    inputGroup.appendChild(input);
    inputGroup.appendChild(submitBtn);
    recoveryBody.appendChild(inputGroup);

    const attemptsEl = document.createElement('p');
    attemptsEl.className = 'recovery-attempts';
    attemptsEl.textContent = 'Attempts remaining: ' + (MAX_ATTEMPTS - attempts);
    recoveryBody.appendChild(attemptsEl);

    function handleSubmit() {
      const val = input.value.trim();
      if (!val) return;

      const correct = checkAnswer(q, val);
      const currentAttempts = (state.questionAttempts[q.id] || 0) + 1;
      state.questionAttempts[q.id] = currentAttempts;

      if (correct) {
        state.questionResults[q.id] = true;
        input.disabled = true;
        submitBtn.disabled = true;

        const resultEl = document.createElement('p');
        resultEl.className = 'recovery-result is-pass';
        resultEl.textContent = 'Verified';
        recoveryBody.appendChild(resultEl);
        announce('Answer verified.');

        saveState(state);
        setTimeout(() => {
          state.currentQuestion = idx + 1;
          saveState(state);
          renderSecurityQuestion();
        }, 1200);
      } else {
        if (currentAttempts >= MAX_ATTEMPTS) {
          state.questionResults[q.id] = false;
          window.utils?.points?.spend(3, 'Wrong security answer');
          input.disabled = true;
          submitBtn.disabled = true;

          const resultEl = document.createElement('p');
          resultEl.className = 'recovery-result is-fail';
          resultEl.textContent = 'Failed — the answer was: ' + displayAnswer(q);
          recoveryBody.appendChild(resultEl);
          announce('Incorrect. The answer was ' + displayAnswer(q));

          saveState(state);
          setTimeout(() => {
            state.currentQuestion = idx + 1;
            saveState(state);
            renderSecurityQuestion();
          }, 2000);
        } else {
          window.utils?.points?.spend(3, 'Wrong security answer');
          attemptsEl.textContent = 'Attempts remaining: ' + (MAX_ATTEMPTS - currentAttempts);

          const resultEl = document.createElement('p');
          resultEl.className = 'recovery-result is-fail';
          resultEl.textContent = 'Incorrect. Try again.';
          recoveryBody.appendChild(resultEl);
          announce('Incorrect. One attempt remaining.');

          input.value = '';
          input.focus();
          saveState(state);

          // Remove the "try again" message after a moment
          setTimeout(() => {
            if (resultEl.parentNode) resultEl.remove();
          }, 1500);
        }
      }
    }

    submitBtn.addEventListener('click', handleSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });

    requestAnimationFrame(() => input.focus());
  }

  function checkAnswer(q, input) {
    const normalised = input.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const expected = q.answer.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalised === expected;
  }

  function displayAnswer(q) {
    return q.answer.charAt(0).toUpperCase() + q.answer.slice(1);
  }

  function finishPartB() {
    const correctCount = SECURITY_QUESTIONS.filter(q => state.questionResults[q.id] === true).length;
    const passed = correctCount >= MIN_CORRECT_B;

    state.partBDone = true;
    state.partBPassed = passed;
    saveState(state);

    partBLabel.classList.add('is-done');
    partBLabel.textContent = 'Verification complete';
    hintBtnB.hidden = true;
    hintTextB.hidden = true;

    recoveryBody.innerHTML = '';
    recoveryBody.appendChild(buildStepIndicator());

    const summary = document.createElement('div');
    summary.className = 'recovery-summary ' + (passed ? 'is-pass' : 'is-fail');

    if (passed) {
      summary.innerHTML = '<strong>Account access recovered</strong>' +
        '<p>Security verification passed. You answered ' + correctCount + ' of ' +
        SECURITY_QUESTIONS.length + ' questions correctly.</p>';
      announce('Security verification passed. Account access recovered.');
    } else {
      summary.innerHTML = '<strong>Verification failed</strong>' +
        '<p>You answered only ' + correctCount + ' of ' +
        SECURITY_QUESTIONS.length + ' correctly. At least ' + MIN_CORRECT_B +
        ' correct answers were required to recover the account.</p>';
      announce('Security verification failed.');
    }

    recoveryBody.appendChild(summary);
    partBEl.classList.add('is-complete');
    updateProgress();

    if (passed) {
      unlockPartC();
      const partC = $('#osintPartC');
      if (partC) {
        setTimeout(() => partC.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
      }
    } else {
      // Mission failed — can't proceed. Show failed panel.
      state.missionFailed = true;
      saveState(state);
      showMissionFailed();
    }
  }

  // Hint button B
  hintBtnB.addEventListener('click', () => {
    const idx = state.currentQuestion;
    if (idx >= SECURITY_QUESTIONS.length) return;
    const q = SECURITY_QUESTIONS[idx];
    const hintKey = 'hintB_' + q.id;
    if (state.hintsUsed[hintKey]) {
      hintTextB.textContent = q.hint;
      hintTextB.hidden = false;
      return;
    }
    state.hintsUsed[hintKey] = true;
    window.utils?.points?.spend(5, 'OSINT hint');
    saveState(state);
    hintTextB.textContent = q.hint;
    hintTextB.hidden = false;
    announce('Hint: ' + q.hint);
  });

  // ---------- Part C: Password Prediction ----------
  const partCEl = $('#osintPartC');
  const partCLabel = $('#partCLabel');
  const pwChoices = $$('#osintPasswordChoices .osint-choice');
  const hintBtnC = $('#osintHintBtnC');
  const hintTextC = $('#osintHintTextC');
  const feedbackC = $('#osintFeedbackC');
  const explanationC = $('#osintExplanationC');

  function unlockPartC() {
    setLocked(partCEl, false);
  }

  pwChoices.forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.partCDone || !state.partBPassed) return;

      const picked = btn.dataset.pw;
      const correct = picked === 'biscuit2021';

      state.partCAnswer = picked;
      state.partCCorrect = correct;

      // Disable all buttons
      pwChoices.forEach(b => {
        b.disabled = true;
        b.classList.remove('is-selected');
      });

      if (correct) {
        btn.classList.add('is-correct');
        feedbackC.textContent = 'Correct!';
        feedbackC.className = 'status-message mt-1 ok';
        announce('Correct! Biscuit2021 is the most likely password.');
      } else {
        btn.classList.add('is-wrong');
        window.utils?.points?.spend(3, 'Wrong password prediction');
        pwChoices.forEach(b => {
          if (b.dataset.pw === 'biscuit2021') b.classList.add('is-correct');
        });
        feedbackC.textContent = 'Not quite. The most likely password was Biscuit2021! (-3 pts)';
        feedbackC.className = 'status-message mt-1 warn';
        announce('Incorrect. The answer was Biscuit2021.');
      }

      // Show explanation
      explanationC.innerHTML = '<strong>Why Biscuit2021!?</strong> The most common weak password pattern is combining a pet name with a significant year. "Biscuit" is Jordan\'s dog (mentioned in posts, check-ins and the About section) and "2021" is the year they started at Meridian Solutions. Studies show that over 60% of people use personal information like pet names, birthdays, or anniversaries in their passwords. This is exactly the kind of information an attacker harvests through OSINT before attempting credential stuffing or targeted password guessing.';
      explanationC.hidden = false;

      state.partCDone = true;
      partCLabel.classList.add('is-done');
      partCLabel.textContent = 'Password cracked';
      hintBtnC.hidden = true;
      saveState(state);
      updateProgress();

      if (correct) {
        unlockPartD();
        announce('Password predicted. Proceeding to threat assessment.');
        const partD = $('#osintPartD');
        if (partD) {
          setTimeout(() => partD.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
        }
      } else {
        // Wrong password — mission failed, code word not awarded
        state.missionFailed = true;
        saveState(state);
        // Still unlock Part D so they can finish for learning, but no code word
        unlockPartD();
        const partD = $('#osintPartD');
        if (partD) {
          setTimeout(() => partD.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
        }
      }
    });
  });

  // Hint button C
  const HINT_C = 'Think about common password patterns — pet names and significant dates or years are the most frequently used combination.';
  hintBtnC.addEventListener('click', () => {
    if (state.hintsUsed.hintC) {
      hintTextC.textContent = HINT_C;
      hintTextC.hidden = false;
      return;
    }
    state.hintsUsed.hintC = true;
    window.utils?.points?.spend(5, 'OSINT hint');
    saveState(state);
    hintTextC.textContent = HINT_C;
    hintTextC.hidden = false;
    announce('Hint: Think about common password patterns.');
  });

  // ---------- Part D: Spear Phish Draft ----------
  const partDEl = $('#osintPartD');
  const partDLabel = $('#partDLabel');
  const phishChoices = $$('#osintPhishChoices .osint-choice');
  const hintBtnD = $('#osintHintBtnD');
  const hintTextD = $('#osintHintTextD');
  const feedbackD = $('#osintFeedbackD');
  const explanationD = $('#osintExplanationD');
  const vaultReveal = $('#osintVaultReveal');
  const missionFailed = $('#osintMissionFailed');
  const retryBtn = $('#osintRetryBtn');

  function unlockPartD() {
    setLocked(partDEl, false);
  }

  phishChoices.forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.partDDone || !state.partCDone) return;

      const picked = btn.dataset.phish;
      const correct = picked === 'fitzone';

      state.partDAnswer = picked;

      // Disable all buttons
      phishChoices.forEach(b => {
        b.disabled = true;
        b.classList.remove('is-selected');
      });

      if (correct) {
        btn.classList.add('is-correct');
        feedbackD.textContent = 'Correct!';
        feedbackD.className = 'status-message mt-1 ok';
        announce('Correct! The FitZone email is the most effective spear phish.');
      } else {
        btn.classList.add('is-wrong');
        window.utils?.points?.spend(3, 'Wrong phishing pick');
        phishChoices.forEach(b => {
          if (b.dataset.phish === 'fitzone') b.classList.add('is-correct');
        });
        feedbackD.textContent = 'Not quite. The FitZone email would be most effective. (-3 pts)';
        feedbackD.className = 'status-message mt-1 warn';
        announce('Incorrect. The FitZone email was the best choice.');
      }

      // Show explanation
      explanationD.innerHTML = '<strong>Why "Your FitZone membership renewal is overdue"?</strong> This is the most effective spear-phishing subject line because it uses <em>specific personal information</em> harvested from OSINT. Jordan regularly checks in at FitZone Gym on Collins Street every Tuesday and Thursday morning — this is publicly visible in their check-in history. An email about their actual gym feels legitimate and creates urgency ("overdue"). The other options are generic phishing templates that any spam filter might catch and any security-aware person might question. Personalised phishing using OSINT is <strong>4.5 times more effective</strong> than generic phishing because it exploits the victim\'s trust in familiar brands and services they actually use.';
      explanationD.hidden = false;

      state.partDDone = true;
      partDLabel.classList.add('is-done');
      partDLabel.textContent = 'Assessment complete';
      hintBtnD.hidden = true;
      saveState(state);

      if (canAwardVault()) {
        // Genuine pass: award the code word now (header tick + top-of-page reveal).
        completePuzzle({ celebrate: true });
      } else {
        updateProgress();
        // Give the explanation a moment to land before the failure panel.
        setTimeout(showMissionFailed, 1500);
      }
    });
  });

  // Hint button D
  const HINT_D = 'The most effective spear phishing uses specific personal details about the target. Which option references something only someone who researched Jordan would know?';
  hintBtnD.addEventListener('click', () => {
    if (state.hintsUsed.hintD) {
      hintTextD.textContent = HINT_D;
      hintTextD.hidden = false;
      return;
    }
    state.hintsUsed.hintD = true;
    window.utils?.points?.spend(5, 'OSINT hint');
    saveState(state);
    hintTextD.textContent = HINT_D;
    hintTextD.hidden = false;
    announce('Hint: Look for the option that uses specific personal information.');
  });

  // ---------- Vault gating ----------
  function canAwardVault() {
    return state.partBPassed === true &&
           state.partCCorrect === true &&
           state.partDDone === true;
  }

  // ---------- Puzzle completion ----------
  const vaultCallout = $('#osintVaultValue');
  const completeEl = $('#osintComplete');

  function el(tag, props = {}, text) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'className') node.className = v;
      else node.setAttribute(k, v);
    });
    if (text != null) node.textContent = text;
    return node;
  }

  // "Code word" callout in the briefing: Locked -> the word.
  function renderVaultCallout() {
    if (!vaultCallout || !roomComplete()) return;
    vaultCallout.textContent = '';
    vaultCallout.appendChild(document.createTextNode('Code word: '));
    vaultCallout.appendChild(el('strong', {}, WORD));
    vaultCallout.appendChild(document.createTextNode(' — enter it in the vault on the Mission Hub.'));
  }

  // Completion card near the top of the page.
  function renderComplete() {
    if (!completeEl) return;
    if (!roomComplete()) {
      completeEl.hidden = true;
      completeEl.innerHTML = '';
      return;
    }
    completeEl.innerHTML = '';
    completeEl.appendChild(el('h2', {}, 'Account recovered'));
    completeEl.appendChild(el('p', {}, 'You got into Jordan\'s account, predicted the password and spotted how an attacker would use the same public information.'));
    completeEl.appendChild(el('div', { className: 'osint-codeword', 'aria-label': `Code word ${WORD}` }, WORD));
    const p = el('p');
    p.appendChild(document.createTextNode('Code word: '));
    p.appendChild(el('strong', {}, WORD));
    p.appendChild(document.createTextNode(' — enter it in the vault on the Mission Hub.'));
    completeEl.appendChild(p);
    if (state.partDAnswer) {
      const wrongB = SECURITY_QUESTIONS.reduce((n, q) => {
        const tries = state.questionAttempts[q.id] || 0;
        return n + Math.max(0, tries - (state.questionResults[q.id] === true ? 1 : 0));
      }, 0);
      const wrong = wrongB + (state.partDAnswer !== 'fitzone' ? 1 : 0);
      const hints = Object.keys(state.hintsUsed || {}).length;
      completeEl.appendChild(el('p', { className: 'muted' }, `Wrong answers: ${wrong} · Hints used: ${hints}`));
    }
    const row = el('div', { className: 'osint-complete__actions' });
    row.appendChild(el('a', { className: 'btn primary', href: 'game.html' }, 'Go to the Mission Hub'));
    row.appendChild(el('a', { className: 'btn ghost', href: 'incident.html' }, 'Next room: Incident Management →'));
    completeEl.appendChild(row);
    completeEl.hidden = false;
  }

  // Debrief card under Part D (the word is shown here as well as at the top).
  function renderVaultReveal() {
    if (!roomComplete()) return;
    const big = $('#osintVaultWord');
    const inline = $('#osintVaultWordInline');
    if (big) big.textContent = WORD;
    if (inline) inline.textContent = WORD;
    vaultReveal.hidden = false;
    missionFailed.hidden = true;
  }

  function renderSolvedBanners() {
    renderVaultCallout();
    renderComplete();
    renderVaultReveal();
  }

  // Only ever called on a genuine pass (or to repair a pass recorded before this fix).
  function completePuzzle(opts = {}) {
    let first = false;
    try {
      first = window.vault?.completeRoom?.(ROOM_KEY, WORD, { message: `Code word ${WORD} secured.` }) === true;
    } catch (_) { /* ignore */ }
    renderSolvedBanners();
    if (first && opts.celebrate) {
      announce(`Mission complete. Code word ${WORD}. Enter it in the vault on the Mission Hub.`);
      // Let the "Correct!" feedback land, then bring the code word card into view once.
      setTimeout(() => completeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 1500);
    }
  }

  // ---------- Mission failed ----------
  function showMissionFailed() {
    missionFailed.hidden = false;
    vaultReveal.hidden = true;
    missionFailed.scrollIntoView({ behavior: 'smooth', block: 'center' });
    announce('Mission failed. The code word was not awarded.');
  }

  // ---------- Retry ----------
  retryBtn.addEventListener('click', () => {
    // Clear this room's run. A failed run never set the progress flag or stored the
    // code word, so those are left alone (another device may have passed meanwhile).
    state = defaultState();
    saveState(state);
    updateProgress({ force: true });
    location.reload();
  });

  // ---------- Restore state on load ----------
  function restoreState() {
    // Repair: a pass recorded on this device, or a room the team already has marked
    // complete (e.g. by the old progress bug or by the facilitator), but whose code
    // word was never stored. completeRoom() stores it and ticks the header.
    if (!roomComplete() && (progressFlagSet() || (state.partDDone && canAwardVault()))) {
      completePuzzle({ celebrate: false });
    }

    if (roomComplete()) {
      // Already done — show full completion state
      state.partADone = true;
      state.partBDone = true;
      state.partBPassed = true;
      state.partCDone = true;
      state.partCCorrect = true;
      state.partDDone = true;
      saveState(state);

      partALabel.classList.add('is-done');
      partALabel.textContent = 'Recon complete';
      startRecoveryBtn.remove();

      setLocked(partBEl, false);
      partBEl.classList.add('is-complete');
      partBLabel.classList.add('is-done');
      partBLabel.textContent = 'Verification complete';
      const correctCountB = SECURITY_QUESTIONS.filter(q => state.questionResults[q.id] === true).length;
      state.currentQuestion = SECURITY_QUESTIONS.length;
      recoveryBody.innerHTML = '';
      recoveryBody.appendChild(buildStepIndicator());
      const summary = document.createElement('div');
      summary.className = 'recovery-summary is-pass';
      summary.innerHTML = '<strong>Account access recovered</strong>' +
        (correctCountB > 0
          ? '<p>Security verification passed. You answered ' + correctCountB + ' of ' +
            SECURITY_QUESTIONS.length + ' questions correctly.</p>'
          : '<p>Security verification passed.</p>');
      recoveryBody.appendChild(summary);
      hintBtnB.hidden = true;

      setLocked(partCEl, false);
      partCEl.classList.add('is-complete');
      partCLabel.classList.add('is-done');
      partCLabel.textContent = 'Password cracked';
      pwChoices.forEach(b => {
        b.disabled = true;
        if (b.dataset.pw === 'biscuit2021') b.classList.add('is-correct');
        if (b.dataset.pw === state.partCAnswer && state.partCAnswer !== 'biscuit2021') b.classList.add('is-wrong');
      });
      explanationC.innerHTML = '<strong>Why Biscuit2021!?</strong> The most common weak password pattern is combining a pet name with a significant year. "Biscuit" is Jordan\'s dog and "2021" is the year they started at Meridian Solutions.';
      explanationC.hidden = false;
      hintBtnC.hidden = true;

      setLocked(partDEl, false);
      partDEl.classList.add('is-complete');
      partDLabel.classList.add('is-done');
      partDLabel.textContent = 'Assessment complete';
      phishChoices.forEach(b => {
        b.disabled = true;
        if (b.dataset.phish === 'fitzone') b.classList.add('is-correct');
        if (b.dataset.phish === state.partDAnswer && state.partDAnswer !== 'fitzone') b.classList.add('is-wrong');
      });
      explanationD.innerHTML = '<strong>Why "Your FitZone membership renewal is overdue"?</strong> This uses specific personal information harvested from OSINT — Jordan\'s actual gym name and routine.';
      explanationD.hidden = false;
      hintBtnD.hidden = true;

      renderSolvedBanners();
      return;
    }

    // Partial restore
    if (state.partADone) {
      partALabel.classList.add('is-done');
      partALabel.textContent = 'Recon complete';
      startRecoveryBtn.remove();
      setLocked(partBEl, false);
    }

    if (state.partBDone) {
      // Reconstruct the finish state
      finishPartBRestore();
    } else if (state.partADone) {
      renderSecurityQuestion();
    }

    if (state.partCDone) {
      setLocked(partCEl, false);
      partCEl.classList.add('is-complete');
      partCLabel.classList.add('is-done');
      partCLabel.textContent = 'Password cracked';
      pwChoices.forEach(b => {
        b.disabled = true;
        if (b.dataset.pw === 'biscuit2021') b.classList.add('is-correct');
        if (b.dataset.pw === state.partCAnswer && state.partCAnswer !== 'biscuit2021') b.classList.add('is-wrong');
      });
      explanationC.innerHTML = '<strong>Why Biscuit2021!?</strong> The most common weak password pattern is combining a pet name with a significant year. "Biscuit" is Jordan\'s dog and "2021" is the year they started at Meridian Solutions.';
      explanationC.hidden = false;
      hintBtnC.hidden = true;
      // Part D opens after Part C whatever the answer (a wrong password is a
      // learning run that ends in "Mission failed"), so reopen it on reload.
      if (!state.partDDone) unlockPartD();
    }

    if (state.partDDone) {
      setLocked(partDEl, false);
      partDEl.classList.add('is-complete');
      partDLabel.classList.add('is-done');
      partDLabel.textContent = 'Assessment complete';
      phishChoices.forEach(b => {
        b.disabled = true;
        if (b.dataset.phish === 'fitzone') b.classList.add('is-correct');
        if (b.dataset.phish === state.partDAnswer && state.partDAnswer !== 'fitzone') b.classList.add('is-wrong');
      });
      explanationD.innerHTML = '<strong>Why "Your FitZone membership renewal is overdue"?</strong> This uses specific personal information harvested from OSINT — Jordan\'s actual gym name and routine.';
      explanationD.hidden = false;
      hintBtnD.hidden = true;

      // A pass was completed above, so reaching here means the run failed.
      if (!canAwardVault()) showMissionFailed();
    }

    // If mission was failed mid-way (Part B failed), show the failed panel
    if (state.missionFailed && !state.partDDone && state.partBDone && !state.partBPassed) {
      showMissionFailed();
    }

    updateProgress();
  }

  // Restore Part B completion without re-triggering scroll/unlock logic
  function finishPartBRestore() {
    const correctCount = SECURITY_QUESTIONS.filter(q => state.questionResults[q.id] === true).length;
    const passed = state.partBPassed;

    partBLabel.classList.add('is-done');
    partBLabel.textContent = 'Verification complete';
    hintBtnB.hidden = true;
    hintTextB.hidden = true;

    recoveryBody.innerHTML = '';
    // Force currentQuestion to end for step indicator
    state.currentQuestion = SECURITY_QUESTIONS.length;
    recoveryBody.appendChild(buildStepIndicator());

    const summary = document.createElement('div');
    summary.className = 'recovery-summary ' + (passed ? 'is-pass' : 'is-fail');

    if (passed) {
      summary.innerHTML = '<strong>Account access recovered</strong>' +
        '<p>Security verification passed. You answered ' + correctCount + ' of ' +
        SECURITY_QUESTIONS.length + ' questions correctly.</p>';
    } else {
      summary.innerHTML = '<strong>Verification failed</strong>' +
        '<p>You answered only ' + correctCount + ' of ' +
        SECURITY_QUESTIONS.length + ' correctly. At least ' + MIN_CORRECT_B +
        ' correct answers were required.</p>';
    }

    recoveryBody.appendChild(summary);
    partBEl.classList.add('is-complete');

    if (passed && !state.partCDone) {
      unlockPartC();
    }
  }

  // Run restore
  restoreState();

  // The team may be split across devices: when a background sync brings in a
  // completion (or a pass recorded before the progress fix), show the word here too.
  window.addEventListener('state-sync:applied', () => {
    if (!roomComplete() && progressFlagSet()) completePuzzle({ celebrate: false });
    if (roomComplete() && completeEl?.hidden) renderSolvedBanners();
  });

})();
