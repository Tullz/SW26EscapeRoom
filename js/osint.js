/* osint.js — OSINT Investigation (Cyber Escape Rooms)
   Room 2: Account Recovery Simulation — recover access to a locked
   employee account by investigating their social media profile.

   Flow:
   A – Profile Investigation (tab browsing, recon)
   B – Security Question Challenge (3 recovery questions, 2 attempts each)
   C – Password Prediction (multiple choice)
   D – Spear Phish Draft (multiple choice)

   Vault code word: SHADOW — awarded only if Part B passed (>=2/3 correct)
   AND Part C correct AND Part D completed.

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
  const STATE_KEY = 'osint_state';
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
      hint: 'Find the birthday post for Jordan\'s mum. The maiden name is part of a hyphenated surname.',
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

  // ---------- Check if already complete ----------
  function isAlreadyComplete() {
    const progress = window.utils?.readProgress?.() || {};
    return progress.osint === true;
  }

  // ---------- Progress tracking ----------
  function updateProgress() {
    let parts = 0;
    if (state.partADone) parts++;
    if (state.partBDone) parts++;
    if (state.partCDone) parts++;
    if (state.partDDone) parts++;
    const pct = Math.round((parts / TOTAL_PARTS) * 100);
    const vaultAwarded = canAwardVault() && parts === TOTAL_PARTS;
    window.utils?.setProgressPercent?.('osint', pct, { complete: vaultAwarded });
  }

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
    partBEl.classList.remove('is-locked');
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
    partCEl.classList.remove('is-locked');
  }

  pwChoices.forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.partCDone) return;

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
      explanationC.innerHTML = '<strong>Why Biscuit2021!?</strong> The most common weak password pattern is combining a pet name with a significant year. "Biscuit" is Jordan\'s dog (mentioned multiple times across posts and photos) and "2021" is the year they started at Meridian Solutions. Studies show that over 60% of people use personal information like pet names, birthdays, or anniversaries in their passwords. This is exactly the kind of information an attacker harvests through OSINT before attempting credential stuffing or targeted password guessing.';
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
  hintBtnC.addEventListener('click', () => {
    if (state.hintsUsed.hintC) {
      hintTextC.hidden = false;
      return;
    }
    state.hintsUsed.hintC = true;
    window.utils?.points?.spend(5, 'OSINT hint');
    saveState(state);
    hintTextC.textContent = 'Think about common password patterns — pet names and significant dates or years are the most frequently used combination.';
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
    partDEl.classList.remove('is-locked');
  }

  phishChoices.forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.partDDone) return;

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
      updateProgress();

      // Determine outcome — delay enough for explanation to render and settle
      setTimeout(() => {
        if (canAwardVault()) {
          completePuzzle();
        } else {
          showMissionFailed();
        }
      }, 1500);
    });
  });

  // Hint button D
  hintBtnD.addEventListener('click', () => {
    if (state.hintsUsed.hintD) {
      hintTextD.hidden = false;
      return;
    }
    state.hintsUsed.hintD = true;
    window.utils?.points?.spend(5, 'OSINT hint');
    saveState(state);
    hintTextD.textContent = 'The most effective spear phishing uses specific personal details about the target. Which option references something only someone who researched Jordan would know?';
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
  const CODE_WORD = 'SHADOW';

  function completePuzzle() {
    if (isAlreadyComplete()) return;

    vaultReveal.hidden = false;
    missionFailed.hidden = true;

    // Also inject code word banner directly into Part D so user sees it immediately
    const partDSection = $('#osintPartD');
    if (partDSection && !partDSection.querySelector('.inline-vault-reveal')) {
      const banner = document.createElement('div');
      banner.className = 'inline-vault-reveal';
      banner.innerHTML = '<strong style="color:var(--accent);font-size:1.4rem;display:block;margin-top:1rem">' +
        '✅ Code word: ' + CODE_WORD + '</strong>' +
        '<p style="color:var(--muted);font-size:.85rem;margin-top:.25rem">Recorded to your vault. Scroll down for the full debrief.</p>';
      partDSection.appendChild(banner);
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    window.utils?.setProgressFlag?.('osint', true);
    localStorage.setItem('vault_word_osint', CODE_WORD);
    window.vault?.unlock('osint', CODE_WORD, { message: 'Code word SHADOW secured.' });
    window.stateSync?.queueSave?.('osint-complete');

    announce('Mission complete! Code word SHADOW secured.');
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
    // Clear room state completely
    state = defaultState();
    saveState(state);
    // Clear progress flag
    window.utils?.setProgressFlag?.('osint', false);
    try { localStorage.removeItem('vault_word_osint'); } catch (_) {}
    // Reload page
    location.reload();
  });

  // ---------- Restore state on load ----------
  function restoreState() {
    if (isAlreadyComplete()) {
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

      partBEl.classList.remove('is-locked');
      partBEl.classList.add('is-complete');
      partBLabel.classList.add('is-done');
      partBLabel.textContent = 'Verification complete';
      const correctCountB = SECURITY_QUESTIONS.filter(q => state.questionResults[q.id] === true).length;
      recoveryBody.innerHTML = '';
      recoveryBody.appendChild(buildStepIndicator());
      const summary = document.createElement('div');
      summary.className = 'recovery-summary is-pass';
      summary.innerHTML = '<strong>Account access recovered</strong>' +
        '<p>Security verification passed. You answered ' + correctCountB + ' of ' +
        SECURITY_QUESTIONS.length + ' questions correctly.</p>';
      recoveryBody.appendChild(summary);
      hintBtnB.hidden = true;

      partCEl.classList.remove('is-locked');
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

      partDEl.classList.remove('is-locked');
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

      vaultReveal.hidden = false;
      updateProgress();
      return;
    }

    // Partial restore
    if (state.partADone) {
      partALabel.classList.add('is-done');
      partALabel.textContent = 'Recon complete';
      startRecoveryBtn.remove();
      partBEl.classList.remove('is-locked');
    }

    if (state.partBDone) {
      // Reconstruct the finish state
      finishPartBRestore();
    } else if (state.partADone) {
      renderSecurityQuestion();
    }

    if (state.partCDone) {
      partCEl.classList.remove('is-locked');
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
    }

    if (state.partDDone) {
      partDEl.classList.remove('is-locked');
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

      if (canAwardVault()) {
        vaultReveal.hidden = false;
      } else {
        showMissionFailed();
      }
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

})();
