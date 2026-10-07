/* supply-chain.js — Supply Chain Attack puzzle (Room 5)
   Nexus Corp Breach Investigation — narrative-driven escape room
   Three challenges:
   1) Trace the attack path step by step through the vendor network
   2) Study real-world case files and answer one question each
   3) Pick 3 defenses for Nexus Corp's security budget
   Code word: VIPER
*/

(function () {
  'use strict';

  // ---------- DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function announce(msg) { try { window.a11y?.announce?.(msg); } catch (_) {} }

  // ---------- Constants ----------
  const CODE_WORD = 'VIPER';
  const PUZZLE_KEY = 'supply';
  const STORAGE_KEY = 'vault_word_supply';
  const STATE_KEY = 'supply_puzzle_state';

  const PENALTY_WRONG = 3;
  const HINT_COST_BASIC = 5;
  const HINT_COST_DETAILED = 10;

  // ---------- Network connections for SVG lines ----------
  const CONNECTIONS = [
    ['codeforge', 'pinnacle'],
    ['cloudsync', 'pinnacle'],
    ['datapure', 'orion'],
    ['netshield', 'trustguard'],
    ['pinnacle', 'cicd'],
    ['orion', 'cicd'],
    ['trustguard', 'cicd'],
    ['cicd', 'production']
  ];

  const CORRECT_PATH = ['codeforge', 'pinnacle', 'cicd', 'production'];

  // ---------- Attack Path Steps (Part 1) ----------
  const STEPS = [
    {
      prompt: 'The investigation starts here. Someone slipped malicious code into a sub-contractor\'s product. Look at the bottom row — which company makes development tools?',
      correct: 'codeforge',
      wrongFeedback: {
        datapure: 'DataPure processes data — they don\'t create development tools. Look for the company that builds tools developers use.',
        cloudsync: 'CloudSync handles cloud backups. The attacker needed to hide code inside a development tool, not a backup service.',
        netshield: 'NetShield does security monitoring — they watch for attacks, not build developer tools. Look at the other sub-contractors.',
        pinnacle: 'Pinnacle is a vendor (middle row), not a sub-contractor. The attack started further down the chain.',
        orion: 'Orion provides data services. The attacker targeted development tools specifically — tools that get built into other software.',
        trustguard: 'TrustGuard handles compliance reviews, not software development. Look for who builds the development tools.',
        cicd: 'That\'s Nexus Corp\'s own build system. The attack started outside the company, at a sub-contractor.',
        production: 'That\'s where the attack ends up, not where it started. Begin at the bottom of the diagram.'
      },
      reveal: 'An attacker secretly added malicious code to CodeForge\'s development tools. It looked like a normal code change — no one at CodeForge noticed anything unusual.'
    },
    {
      prompt: 'CodeForge\'s tools have been compromised. Now the bad code needs to travel up the chain. Which vendor uses CodeForge\'s tools and sends software updates to its customers?',
      correct: 'pinnacle',
      wrongFeedback: {
        datapure: 'DataPure doesn\'t use CodeForge\'s development tools. Look at the vendors in the middle row.',
        cloudsync: 'CloudSync does backups, not software development. Which vendor would package CodeForge\'s tools into their products?',
        netshield: 'NetShield monitors security. They don\'t ship software built with CodeForge\'s tools.',
        orion: 'Orion handles data services. They don\'t build software using CodeForge\'s development tools.',
        trustguard: 'TrustGuard does compliance. They review security rules, not build and ship software.',
        cicd: 'The attack hasn\'t reached Nexus Corp yet. It\'s still traveling through the vendor network.',
        production: 'Production is the final target. The compromised code is still making its way through the vendor chain.'
      },
      reveal: 'Pinnacle Software uses CodeForge\'s tools to build their products. They unknowingly baked the malicious code into their next update and sent it to all their customers — including Nexus Corp.'
    },
    {
      prompt: 'Pinnacle sent the infected update to Nexus Corp. Which system inside Nexus Corp automatically downloads and installs software updates?',
      correct: 'cicd',
      wrongFeedback: {
        codeforge: 'The attack has already passed through CodeForge. Look inside Nexus Corp now.',
        datapure: 'The attack has entered Nexus Corp. Which internal system handles incoming software updates?',
        cloudsync: 'The attack is now inside Nexus Corp. Look at their internal systems.',
        netshield: 'The attack is past the vendor network. Which of Nexus Corp\'s systems processes new software?',
        pinnacle: 'Already traced. The attack has moved past Pinnacle. What\'s the next stop inside Nexus Corp?',
        orion: 'The attack bypassed Orion entirely. It\'s now inside Nexus Corp.',
        trustguard: 'The attack skipped TrustGuard. Look at Nexus Corp\'s own systems.',
        production: 'Almost — but the update needs to be processed first. Which system builds and prepares software before it goes live?'
      },
      reveal: 'Nexus Corp\'s CI/CD pipeline — their automated build system — pulled in Pinnacle\'s update and processed it automatically. The system treated it like any other trusted update. The malicious code was now inside the building.'
    },
    {
      prompt: 'The infected code is inside Nexus Corp\'s build system. Where does the build system send finished software when it\'s ready to go live?',
      correct: 'production',
      wrongFeedback: {
        codeforge: 'The attack is fully inside Nexus Corp now. Where does software go after it\'s built?',
        datapure: 'The attack is inside Nexus Corp. The code has been built — where does it get deployed?',
        cloudsync: 'The attack is inside Nexus Corp. Built software goes to one specific place.',
        netshield: 'The attack is inside Nexus Corp. Where do applications run when they\'re live?',
        pinnacle: 'The attack has long passed the vendor stage. Where does Nexus Corp deploy finished software?',
        orion: 'The attack is inside Nexus Corp. Where does deployed software run?',
        trustguard: 'The attack is inside Nexus Corp. The build is done — where does finished software go?',
        cicd: 'The CI/CD pipeline already has the code. Where does it send the finished build?'
      },
      reveal: 'The build system deployed the infected software straight to production — Nexus Corp\'s live servers. The attacker now had access to customer data, internal systems, everything. And it all looked like perfectly normal, trusted software.'
    }
  ];

  // ---------- Case Files (Part 2) ----------
  const CASE_FILES = [
    {
      id: 'notpetya',
      title: 'The Tax Software Weapon',
      year: '2017',
      desc: 'A popular accounting and tax software used by businesses in Ukraine was hacked. A fake update spread a destructive virus worldwide. It shut down shipping giant Maersk and caused over $10 billion in damage.',
      question: 'How did the virus spread to companies around the world?',
      options: [
        { text: 'Through a fake software update', correct: true },
        { text: 'Through infected USB drives shared at a conference', correct: false },
        { text: 'Through links posted on social media', correct: false }
      ],
      lesson: 'This was the NotPetya attack. A single compromised update caused billions in damage across the globe — showing that attacks through trusted software can have massive, worldwide consequences.'
    },
    {
      id: 'eventstream',
      title: 'The Volunteer Handoff',
      year: '2018',
      desc: 'A popular open-source coding library was maintained by a single volunteer developer. When they got tired, a stranger offered to take over. The new maintainer quietly added hidden code designed to steal cryptocurrency.',
      question: 'How did the attacker gain control of the library?',
      options: [
        { text: 'They offered to take over from a tired volunteer', correct: true },
        { text: 'They hacked into the code storage system', correct: false },
        { text: 'They bribed the original developer', correct: false }
      ],
      lesson: 'This was the event-stream attack. It revealed a hidden risk: popular tools are sometimes maintained by one person — and anyone can offer to take over.'
    },
    {
      id: 'solarwinds',
      title: 'The Monitoring Tool Backdoor',
      year: '2020',
      desc: 'A popular tool for monitoring computer networks sent out a routine software update. Someone had secretly hidden a backdoor in it. Over 18,000 companies and government agencies installed it, giving attackers silent access for months.',
      question: 'How did the attackers get into those 18,000 organizations?',
      options: [
        { text: 'Through a trusted software update', correct: true },
        { text: 'By sending phishing emails to employees', correct: false },
        { text: 'By guessing passwords on their systems', correct: false }
      ],
      lesson: 'This was the SolarWinds attack — the most similar to what happened to Nexus Corp. A trusted software update became a weapon, and thousands of organizations installed it without question.'
    },
    {
      id: 'codecov',
      title: 'The Secret Key Thief',
      year: '2021',
      desc: 'A tool that developers use to check their code was quietly tampered with. For two months, it secretly collected passwords, access keys, and other secrets from every company using it — including major tech firms.',
      question: 'What did the attackers steal from the companies?',
      options: [
        { text: 'Passwords and secret access keys', correct: true },
        { text: 'Customer credit card numbers', correct: false },
        { text: 'Employee personal information', correct: false }
      ],
      lesson: 'This was the Codecov breach. The attackers didn\'t steal end-user data directly — they stole the digital keys that unlock other systems, making the damage much harder to contain.'
    },
    {
      id: 'kaseya',
      title: 'The IT Tool Takeover',
      year: '2021',
      desc: 'A software tool used by IT companies to manage their clients\' computers was exploited by a ransomware gang. Through this one tool, they locked the files of over 1,500 businesses at once and demanded payment.',
      question: 'What made this attack hit so many businesses at once?',
      options: [
        { text: 'One tool connected to hundreds of businesses', correct: true },
        { text: 'The ransomware spread through email attachments', correct: false },
        { text: 'Each business was targeted individually', correct: false }
      ],
      lesson: 'This was the Kaseya attack. When one tool serves many companies, compromising it gives attackers a shortcut to all of them — a single point of failure.'
    }
  ];

  // ---------- Defenses (Part 3) ----------
  const DEFENSES = [
    {
      id: 'verify-updates',
      icon: '\u{1F50D}',
      label: 'Verify Software Updates',
      desc: 'Before installing any update, automatically check that it hasn\'t been tampered with — like checking the seal on a medicine bottle before taking it.',
      protects: 'Catches tampered updates before they enter your systems',
      correct: true
    },
    {
      id: 'vendor-checks',
      icon: '\u{1F4CB}',
      label: 'Review Your Vendors\' Security',
      desc: 'Regularly check whether the companies you buy software from follow good security practices. Ask them how they protect their own code.',
      protects: 'Spots weak vendor security before it becomes your problem',
      correct: true
    },
    {
      id: 'network-walls',
      icon: '\u{1F9F1}',
      label: 'Separate Your Networks',
      desc: 'Keep different parts of your network isolated so if one area is breached, the attacker can\'t easily reach everything else. Like fireproof walls between rooms.',
      protects: 'Limits how far an attacker can spread once inside',
      correct: true
    },
    {
      id: 'phishing-training',
      icon: '\u{1F4E7}',
      label: 'Anti-Phishing Email Training',
      desc: 'Train employees to spot fake emails, suspicious links, and social engineering tricks sent to their inbox.',
      protects: 'Stops attacks that arrive through email',
      correct: false,
      consequence: 'Good training to have, but this attack didn\'t come through email. It rode in on a trusted software update that no email filter would catch.'
    },
    {
      id: 'longer-passwords',
      icon: '\u{1F511}',
      label: 'Require Longer Passwords',
      desc: 'Make all employees use longer, more complex passwords for their accounts.',
      protects: 'Prevents password-guessing attacks',
      correct: false,
      consequence: 'Stronger passwords are smart, but the attacker didn\'t need any passwords. They came in through a trusted software update that the system installed automatically.'
    },
    {
      id: 'physical-security',
      icon: '\u{1F3E2}',
      label: 'Better Building Security',
      desc: 'Install security cameras and badge readers to control who can physically enter the building and server rooms.',
      protects: 'Prevents unauthorized physical access',
      correct: false,
      consequence: 'This was entirely a digital attack through software. The attacker was never physically near the building — they didn\'t need to be.'
    }
  ];

  const DEFENSE_EXPLANATIONS = {
    'verify-updates': 'Verifying software updates would have detected that Pinnacle\'s update had been tampered with before the CI/CD pipeline accepted it.',
    'vendor-checks': 'Reviewing vendor security would have flagged CodeForge\'s weak security practices before Pinnacle (and then Nexus Corp) trusted their tools.',
    'network-walls': 'Separating networks would have limited the infected code\'s ability to jump from the CI/CD system straight to production servers.'
  };

  // ---------- Hints (basic = 5 pts, detailed = 10 pts) ----------
  const HINTS = {
    trace: [
      { cost: HINT_COST_BASIC, text: 'The attack started at the bottom of the diagram — at the sub-contractor level. Look for the company that builds tools used by software developers.' },
      { cost: HINT_COST_DETAILED, text: 'Follow the chain step by step: a tool maker, then the vendor that ships their tools, then the system that automatically installs updates, then where the finished software runs.' }
    ],
    cases: [
      { cost: HINT_COST_BASIC, text: 'Each attack involved something companies already trusted — a software update, a tool, or a library. The attackers used that trust to get in.' },
      { cost: HINT_COST_DETAILED, text: 'Focus on HOW the attackers got access, not what they did afterward. In every case, the entry point was something the victims chose to install or use.' }
    ],
    defend: [
      { cost: HINT_COST_BASIC, text: 'Think about what would have stopped THIS specific attack — one that came through a trusted software update. General security measures might not apply here.' },
      { cost: HINT_COST_DETAILED, text: 'The three correct choices protect at three different stages: before trusting a vendor, before installing their updates, and limiting damage if something still gets through.' }
    ]
  };

  // ---------- State persistence ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  let saved = loadState();

  let currentStep = typeof saved.currentStep === 'number' ? saved.currentStep : 0;
  let traceComplete = saved.traceComplete || false;
  let caseAnswers = saved.caseAnswers || {};
  let casesComplete = saved.casesComplete || false;
  let defendComplete = saved.defendComplete || false;
  let allComplete = false;

  let defenseSelections = new Set();
  let caseOptionsMap = {}; // caseId -> shuffled options array

  let traceHintIndex = saved.traceHintIndex || 0;
  let casesHintIndex = saved.casesHintIndex || 0;
  let defendHintIndex = saved.defendHintIndex || 0;

  const points = window.utils?.points;

  function persistState() {
    saveState({
      currentStep,
      traceComplete,
      caseAnswers,
      casesComplete,
      defendComplete,
      traceHintIndex,
      casesHintIndex,
      defendHintIndex
    });
  }

  // ---------- Elements ----------
  const diagramEl = $('#networkDiagram');
  const linesEl = $('#diagramLines');
  const stepListEl = $('#stepList');
  const promptTextEl = $('#promptText');
  const traceFeedback = $('#traceFeedback');
  const traceResult = $('#traceResult');
  const traceStatus = $('#traceStatus');
  const traceHintBtn = $('#traceHintBtn');
  const traceHintText = $('#traceHintText');
  const traceResetBtn = $('#traceResetBtn');

  const casesSection = $('#casesSection');
  const caseFilesGrid = $('#caseFilesGrid');
  const casesFeedback = $('#casesFeedback');
  const casesResult = $('#casesResult');
  const casesStatus = $('#casesStatus');
  const casesHintBtn = $('#casesHintBtn');
  const casesHintText = $('#casesHintText');

  const defendSection = $('#defendSection');
  const defenseGridEl = $('#defenseGrid');
  const defendSubmitBtn = $('#defendSubmitBtn');
  const defendFeedback = $('#defendFeedback');
  const defendResult = $('#defendResult');
  const defendStatus = $('#defendStatus');
  const defendHintBtn = $('#defendHintBtn');
  const defendHintText = $('#defendHintText');
  const budgetSlotsEl = $('#budgetSlots');

  const vaultRevealEl = $('#vaultReveal');
  const vaultDigitDisplay = $('#supplyVaultDigit');

  if (!diagramEl) return; // not on this page

  // ---------- Utilities ----------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function setFeedback(el, msg, ok) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('ok', !!ok);
    el.classList.toggle('warn', !ok && !!msg);
  }

  function setPill(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('ok', 'warn', 'pending');
    if (ok === true) el.classList.add('ok');
    else if (ok === false) el.classList.add('warn');
    else el.classList.add('pending');
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function updateProgress() {
    let pct = 0;
    if (traceComplete) pct += 40;
    if (casesComplete) pct += 30;
    if (defendComplete) pct += 30;
    window.utils?.setProgressPercent?.(PUZZLE_KEY, pct, { complete: pct >= 100 });
  }

  function updateVaultDisplay(value) {
    if (!vaultDigitDisplay) return;
    vaultDigitDisplay.textContent = value ?? '—';
  }

  function updateHintButton(btn, hints, index) {
    if (!btn) return;
    if (index >= hints.length) {
      btn.textContent = 'No more hints';
      btn.disabled = true;
    } else {
      const cost = hints[index].cost;
      btn.textContent = index === 0 ? `Hint (-${cost} pts)` : `More detail (-${cost} pts)`;
    }
  }

  function checkAlreadyComplete() {
    try {
      const progress = window.utils?.readProgress?.() || {};
      if (progress[PUZZLE_KEY]) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          updateVaultDisplay(stored);
          showAllComplete();
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // ============================================================
  // PART 1: Trace the Attack Path
  // ============================================================

  function getNodeEl(nodeId) {
    return $(`[data-node="${nodeId}"]`, diagramEl);
  }

  function getNodeCenter(nodeId) {
    const el = getNodeEl(nodeId);
    if (!el || !diagramEl) return null;
    const dRect = diagramEl.getBoundingClientRect();
    const nRect = el.getBoundingClientRect();
    return {
      x: nRect.left - dRect.left + nRect.width / 2,
      y: nRect.top - dRect.top + nRect.height / 2
    };
  }

  function drawConnections() {
    if (!linesEl) return;
    linesEl.innerHTML = '';
    const dRect = diagramEl.getBoundingClientRect();
    linesEl.setAttribute('width', dRect.width);
    linesEl.setAttribute('height', dRect.height);
    linesEl.style.width = dRect.width + 'px';
    linesEl.style.height = dRect.height + 'px';

    // Build the traced path so far
    const traced = CORRECT_PATH.slice(0, currentStep);

    CONNECTIONS.forEach(([from, to]) => {
      const fromC = getNodeCenter(from);
      const toC = getNodeCenter(to);
      if (!fromC || !toC) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', fromC.x);
      line.setAttribute('y1', fromC.y);
      line.setAttribute('x2', toC.x);
      line.setAttribute('y2', toC.y);

      // Check if this connection is part of the traced path
      const fromIdx = traced.indexOf(from);
      const toIdx = traced.indexOf(to);
      const isActive = fromIdx !== -1 && toIdx !== -1 && toIdx === fromIdx + 1;

      line.classList.add('supply-line');
      if (isActive) line.classList.add('supply-line--active');

      linesEl.appendChild(line);
    });
  }

  function updateStepTracker() {
    if (!stepListEl) return;
    const items = $$('.step-tracker__item', stepListEl);
    items.forEach((item, idx) => {
      const textEl = $('.step-tracker__text', item);
      if (idx < currentStep) {
        item.classList.add('step-tracker__item--revealed');
        item.classList.remove('step-tracker__item--current');
        if (textEl) textEl.textContent = STEPS[idx].reveal;
      } else if (idx === currentStep && !traceComplete) {
        item.classList.add('step-tracker__item--current');
        item.classList.remove('step-tracker__item--revealed');
        if (textEl) textEl.textContent = 'Investigating...';
      } else {
        item.classList.remove('step-tracker__item--revealed', 'step-tracker__item--current');
        if (textEl) textEl.textContent = '?';
      }
    });
  }

  function updatePrompt() {
    if (!promptTextEl) return;
    if (traceComplete) {
      promptTextEl.textContent = 'Attack path fully traced. You can see how each link in the chain led to the next.';
      return;
    }
    if (currentStep < STEPS.length) {
      promptTextEl.textContent = STEPS[currentStep].prompt;
    }
  }

  function handleNodeClick(nodeId) {
    if (traceComplete) return;
    if (currentStep >= STEPS.length) return;

    const step = STEPS[currentStep];
    const nodeEl = getNodeEl(nodeId);

    // Check if already part of the traced path
    if (CORRECT_PATH.indexOf(nodeId) < currentStep && CORRECT_PATH.indexOf(nodeId) !== -1) {
      setFeedback(traceFeedback, 'You\'ve already traced through that node. Look for the next step.', false);
      announce('Node already traced.');
      return;
    }

    if (nodeId === step.correct) {
      // Correct click
      currentStep++;
      if (nodeEl) {
        nodeEl.classList.add('supply-node--correct');
        nodeEl.setAttribute('aria-pressed', 'true');
      }
      drawConnections();
      updateStepTracker();

      if (currentStep >= STEPS.length) {
        // Part 1 complete
        traceComplete = true;
        persistState();
        setPill(traceStatus, 'Complete', true);
        updatePrompt();
        setFeedback(traceFeedback, '', false);
        traceResult?.removeAttribute('hidden');
        updateProgress();

        // Disable all nodes
        $$('.supply-node', diagramEl).forEach(n => { n.disabled = true; });

        announce('Attack path fully traced. Case files unlocked.');
        setTimeout(unlockCases, 1200);
      } else {
        updatePrompt();
        setFeedback(traceFeedback, `Step ${currentStep} of ${STEPS.length} confirmed.`, true);
        announce(`Correct. Step ${currentStep} confirmed.`);
      }
      persistState();
    } else {
      // Wrong click
      points?.spend(PENALTY_WRONG, 'Wrong node (attack path)');
      if (nodeEl) {
        nodeEl.classList.add('supply-node--wrong');
        setTimeout(() => nodeEl.classList.remove('supply-node--wrong'), 800);
      }
      const feedback = step.wrongFeedback[nodeId] || 'That\'s not the right node. Read the prompt and try again.';
      setFeedback(traceFeedback, feedback + ' (-3 pts)', false);
      announce('Wrong node. Minus 3 points.');
    }
  }

  function resetPath() {
    if (traceComplete) return;
    currentStep = 0;
    persistState();
    $$('.supply-node', diagramEl).forEach(n => {
      n.classList.remove('supply-node--correct', 'supply-node--wrong');
      n.removeAttribute('aria-pressed');
    });
    updateStepTracker();
    updatePrompt();
    drawConnections();
    setFeedback(traceFeedback, 'Path reset. Start from the beginning.', false);
  }

  function initTrace() {
    // Click handlers for nodes
    $$('.supply-node', diagramEl).forEach(node => {
      node.addEventListener('click', () => {
        const nodeId = node.dataset.node;
        if (nodeId) handleNodeClick(nodeId);
      });
    });

    traceResetBtn?.addEventListener('click', resetPath);

    traceHintBtn?.addEventListener('click', () => {
      if (traceHintIndex >= HINTS.trace.length) return;
      const hint = HINTS.trace[traceHintIndex];
      points?.spend(hint.cost, 'Attack path hint');
      if (traceHintText) {
        traceHintText.textContent = hint.text;
        traceHintText.removeAttribute('hidden');
      }
      traceHintIndex++;
      persistState();
      updateHintButton(traceHintBtn, HINTS.trace, traceHintIndex);
      announce(`Hint revealed. Minus ${hint.cost} points.`);
    });

    updateHintButton(traceHintBtn, HINTS.trace, traceHintIndex);

    // Restore traced steps visually
    for (let i = 0; i < currentStep && i < CORRECT_PATH.length; i++) {
      const el = getNodeEl(CORRECT_PATH[i]);
      if (el) {
        el.classList.add('supply-node--correct');
        el.setAttribute('aria-pressed', 'true');
      }
    }

    drawConnections();
    updateStepTracker();
    updatePrompt();

    // Redraw on resize
    window.addEventListener('resize', window.utils?.debounce?.(() => drawConnections(), 200) || drawConnections);
  }

  // ============================================================
  // PART 2: Case Files
  // ============================================================

  function unlockCases() {
    if (!casesSection) return;
    casesSection.removeAttribute('hidden');
    setPill(casesStatus, 'In progress', null);
    casesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    announce('Case files unlocked. Study real-world attacks and answer one question each.');
    renderCaseFiles();
    updateCasesCount();
  }

  function renderCaseFiles() {
    if (!caseFilesGrid) return;
    caseFilesGrid.innerHTML = '';

    CASE_FILES.forEach(cf => {
      const card = document.createElement('article');
      card.className = 'case-card';
      card.dataset.caseId = cf.id;

      // Header
      const header = document.createElement('div');
      header.className = 'case-card__header';
      header.innerHTML = '<span class="case-card__year">' + escapeHtml(cf.year) + '</span>' +
        '<h3 class="case-card__title">' + escapeHtml(cf.title) + '</h3>';

      // Description
      const desc = document.createElement('p');
      desc.className = 'case-card__desc';
      desc.textContent = cf.desc;

      // Question area
      const question = document.createElement('div');
      question.className = 'case-card__question';
      question.dataset.caseId = cf.id;

      const qText = document.createElement('p');
      qText.className = 'case-card__q';
      qText.innerHTML = '<strong>' + escapeHtml(cf.question) + '</strong>';

      const options = document.createElement('div');
      options.className = 'case-card__options';

      // Shuffle options
      const shuffled = shuffle(cf.options.slice());
      caseOptionsMap[cf.id] = shuffled;

      shuffled.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'case-option';
        btn.textContent = opt.text;
        btn.dataset.optIndex = String(i);
        btn.addEventListener('click', () => handleCaseAnswer(cf.id, i, btn, card));
        options.appendChild(btn);
      });

      question.appendChild(qText);
      question.appendChild(options);

      // Lesson (hidden until correct)
      const lesson = document.createElement('div');
      lesson.className = 'case-card__lesson';
      lesson.setAttribute('hidden', '');
      lesson.innerHTML = '<p>' + escapeHtml(cf.lesson) + '</p>';

      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(question);
      card.appendChild(lesson);
      caseFilesGrid.appendChild(card);

      // If already answered, show solved state
      if (caseAnswers[cf.id]) {
        markCaseSolved(card, cf.id);
      }
    });
  }

  function handleCaseAnswer(caseId, optIndex, btn, card) {
    if (casesComplete) return;
    if (caseAnswers[caseId]) return; // already solved

    const opts = caseOptionsMap[caseId];
    if (!opts || !opts[optIndex]) return;
    const isCorrect = opts[optIndex].correct;

    if (isCorrect) {
      caseAnswers[caseId] = true;
      persistState();
      btn.classList.add('case-option--correct');
      markCaseSolved(card, caseId);
      updateCasesCount();

      const solvedCount = Object.keys(caseAnswers).length;
      setFeedback(casesFeedback, `Case solved! ${solvedCount} of ${CASE_FILES.length} complete.`, true);
      announce(`Correct. ${solvedCount} of ${CASE_FILES.length} cases solved.`);

      if (solvedCount >= CASE_FILES.length) {
        casesComplete = true;
        persistState();
        setPill(casesStatus, 'Complete', true);
        casesResult?.removeAttribute('hidden');
        updateProgress();
        announce('All cases investigated. Defense challenge unlocked.');
        setTimeout(unlockDefend, 1200);
      }
    } else {
      points?.spend(PENALTY_WRONG, 'Wrong case answer');
      btn.classList.add('case-option--wrong');
      setTimeout(() => btn.classList.remove('case-option--wrong'), 800);
      setFeedback(casesFeedback, 'Not quite. Read the case again carefully. (-3 pts)', false);
      announce('Incorrect answer. Minus 3 points.');
    }
  }

  function markCaseSolved(card, caseId) {
    if (!card) return;
    card.classList.add('case-card--solved');
    // Disable all options
    $$('.case-option', card).forEach(btn => {
      btn.disabled = true;
      // Mark the correct one
      const opts = caseOptionsMap[caseId];
      if (opts) {
        const idx = parseInt(btn.dataset.optIndex, 10);
        if (opts[idx] && opts[idx].correct) {
          btn.classList.add('case-option--correct');
        }
      }
    });
    // Show lesson
    const lesson = $('.case-card__lesson', card);
    if (lesson) lesson.removeAttribute('hidden');
  }

  function updateCasesCount() {
    const solved = Object.keys(caseAnswers).length;
    if (solved > 0 && solved < CASE_FILES.length) {
      setPill(casesStatus, `${solved} of ${CASE_FILES.length}`, null);
    }
  }

  function initCases() {
    casesHintBtn?.addEventListener('click', () => {
      if (casesHintIndex >= HINTS.cases.length) return;
      const hint = HINTS.cases[casesHintIndex];
      points?.spend(hint.cost, 'Case files hint');
      if (casesHintText) {
        casesHintText.textContent = hint.text;
        casesHintText.removeAttribute('hidden');
      }
      casesHintIndex++;
      persistState();
      updateHintButton(casesHintBtn, HINTS.cases, casesHintIndex);
      announce(`Hint revealed. Minus ${hint.cost} points.`);
    });

    updateHintButton(casesHintBtn, HINTS.cases, casesHintIndex);
  }

  // ============================================================
  // PART 3: Defend Nexus Corp
  // ============================================================

  function unlockDefend() {
    if (!defendSection) return;
    defendSection.removeAttribute('hidden');
    setPill(defendStatus, 'In progress', null);
    defendSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    announce('Defense challenge unlocked. Pick 3 security improvements for Nexus Corp.');
    renderDefenses();
  }

  function renderDefenses() {
    if (!defenseGridEl) return;
    defenseGridEl.innerHTML = '';

    const shuffled = shuffle(DEFENSES.slice());
    shuffled.forEach(def => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'defense-card';
      btn.dataset.defenseId = def.id;
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML =
        '<span class="defense-card__icon" aria-hidden="true">' + def.icon + '</span>' +
        '<span class="defense-card__label">' + escapeHtml(def.label) + '</span>' +
        '<span class="defense-card__desc">' + escapeHtml(def.desc) + '</span>' +
        '<span class="defense-card__protects">' + escapeHtml(def.protects) + '</span>';
      btn.addEventListener('click', () => toggleDefense(def.id));
      defenseGridEl.appendChild(btn);
    });
  }

  function toggleDefense(id) {
    if (defendComplete) return;

    if (defenseSelections.has(id)) {
      defenseSelections.delete(id);
    } else {
      if (defenseSelections.size >= 3) {
        setFeedback(defendFeedback, 'Budget allows only 3 improvements. Deselect one first.', false);
        return;
      }
      defenseSelections.add(id);
    }

    // Update card visuals
    $$('.defense-card', defenseGridEl).forEach(btn => {
      const selected = defenseSelections.has(btn.dataset.defenseId);
      btn.classList.toggle('defense-card--selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });

    // Update budget slots
    updateBudgetSlots();

    // Update submit button
    if (defendSubmitBtn) {
      const count = defenseSelections.size;
      defendSubmitBtn.textContent = `Lock in your choices (${count}/3)`;
      defendSubmitBtn.disabled = count !== 3;
    }

    setFeedback(defendFeedback, '', false);
  }

  function updateBudgetSlots() {
    if (!budgetSlotsEl) return;
    const slots = $$('.budget-slot', budgetSlotsEl);
    const selected = Array.from(defenseSelections);

    slots.forEach((slot, i) => {
      const valueEl = $('.budget-slot__value', slot);
      if (i < selected.length) {
        const def = DEFENSES.find(d => d.id === selected[i]);
        slot.classList.add('budget-slot--filled');
        if (valueEl) valueEl.textContent = def ? def.label : selected[i];
      } else {
        slot.classList.remove('budget-slot--filled');
        if (valueEl) valueEl.textContent = 'Empty';
      }
    });
  }

  function handleDefendSubmit() {
    if (defendComplete) return;
    if (defenseSelections.size !== 3) return;

    const selected = Array.from(defenseSelections);
    const correctIds = DEFENSES.filter(d => d.correct).map(d => d.id);
    const wrongPicks = selected.filter(id => !correctIds.includes(id));

    if (wrongPicks.length > 0) {
      const penalty = wrongPicks.length * PENALTY_WRONG;
      points?.spend(penalty, 'Wrong defense picks');

      // Build consequence messages
      const consequences = wrongPicks.map(id => {
        const def = DEFENSES.find(d => d.id === id);
        return def ? `${def.label}: ${def.consequence}` : '';
      }).filter(Boolean);

      setFeedback(defendFeedback, `${wrongPicks.length} wrong pick(s). -${penalty} pts. See why below.`, false);
      announce(`${wrongPicks.length} wrong picks. Minus ${penalty} points.`);

      // Show consequences temporarily
      if (defendResult) {
        let html = '<p style="color:var(--warn);font-weight:600;">Why those didn\'t work:</p><ul class="mt-1">';
        consequences.forEach(c => {
          html += '<li class="mt-1" style="color:var(--ink);font-size:.9rem;line-height:1.5">' + escapeHtml(c) + '</li>';
        });
        html += '</ul><p class="mt-1" style="color:var(--muted);font-size:.88rem;">Try again — think about what would stop an attack through trusted software.</p>';
        defendResult.innerHTML = html;
        defendResult.removeAttribute('hidden');
      }

      // Flash wrong cards
      wrongPicks.forEach(id => {
        const btn = $(`[data-defense-id="${id}"]`, defenseGridEl);
        if (btn) {
          btn.classList.add('defense-card--wrong');
          setTimeout(() => btn.classList.remove('defense-card--wrong'), 1200);
        }
      });

      // Reset selections
      defenseSelections.clear();
      $$('.defense-card', defenseGridEl).forEach(btn => {
        btn.classList.remove('defense-card--selected');
        btn.setAttribute('aria-pressed', 'false');
      });
      updateBudgetSlots();
      if (defendSubmitBtn) {
        defendSubmitBtn.textContent = 'Lock in your choices (0/3)';
        defendSubmitBtn.disabled = true;
      }
      return;
    }

    // All correct
    defendComplete = true;
    persistState();
    setPill(defendStatus, 'Complete', true);
    setFeedback(defendFeedback, 'All 3 defenses correctly chosen.', true);

    // Show explanations
    if (defendResult) {
      let html = '<p class="ok"><strong>Correct!</strong> These three improvements each address a different stage of the attack.</p>';
      html += '<ul class="mt-1">';
      DEFENSES.forEach(def => {
        if (def.correct) {
          html += '<li class="mt-1"><strong>' + escapeHtml(def.label) + '</strong><br>' +
            '<span style="color:var(--ink);font-size:.88rem;">' + escapeHtml(DEFENSE_EXPLANATIONS[def.id] || '') + '</span></li>';
        }
      });
      html += '</ul>';
      html += '<p class="mt-1" style="color:var(--muted);font-size:.88rem;">The other options (phishing training, longer passwords, building security) are good general practices, but none of them would have stopped an attack that came through a trusted software update.</p>';
      defendResult.innerHTML = html;
      defendResult.removeAttribute('hidden');
    }

    // Mark all cards
    $$('.defense-card', defenseGridEl).forEach(btn => {
      const def = DEFENSES.find(d => d.id === btn.dataset.defenseId);
      if (def) {
        btn.classList.add(def.correct ? 'defense-card--correct' : 'defense-card--incorrect');
        btn.disabled = true;
      }
    });

    updateProgress();
    announce('All defenses correctly chosen. Puzzle complete.');
    setTimeout(completePuzzle, 1500);
  }

  function initDefend() {
    defendSubmitBtn?.addEventListener('click', handleDefendSubmit);

    defendHintBtn?.addEventListener('click', () => {
      if (defendHintIndex >= HINTS.defend.length) return;
      const hint = HINTS.defend[defendHintIndex];
      points?.spend(hint.cost, 'Defense hint');
      if (defendHintText) {
        defendHintText.textContent = hint.text;
        defendHintText.removeAttribute('hidden');
      }
      defendHintIndex++;
      persistState();
      updateHintButton(defendHintBtn, HINTS.defend, defendHintIndex);
      announce(`Hint revealed. Minus ${hint.cost} points.`);
    });

    updateHintButton(defendHintBtn, HINTS.defend, defendHintIndex);
  }

  // ============================================================
  // COMPLETION
  // ============================================================

  function completePuzzle() {
    if (allComplete) return;
    allComplete = true;

    try { localStorage.setItem(STORAGE_KEY, CODE_WORD); } catch (_) {}
    updateVaultDisplay(CODE_WORD);

    window.utils?.setProgressFlag?.(PUZZLE_KEY, true);

    window.vault?.unlock(PUZZLE_KEY, CODE_WORD, {
      message: 'Code word VIPER secured.'
    });

    window.stateSync?.queueSave?.('supply-complete');

    showVaultReveal();
  }

  function showVaultReveal() {
    if (vaultRevealEl) {
      vaultRevealEl.removeAttribute('hidden');
      vaultRevealEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showAllComplete() {
    traceComplete = true;
    casesComplete = true;
    defendComplete = true;
    allComplete = true;
    currentStep = STEPS.length;

    // Trace section: show complete
    setPill(traceStatus, 'Complete', true);
    $$('.supply-node', diagramEl).forEach(n => { n.disabled = true; });
    CORRECT_PATH.forEach(nodeId => {
      const el = getNodeEl(nodeId);
      if (el) {
        el.classList.add('supply-node--correct');
        el.setAttribute('aria-pressed', 'true');
      }
    });
    drawConnections();
    updateStepTracker();
    updatePrompt();
    traceResult?.removeAttribute('hidden');

    // Cases section: show complete
    if (casesSection) {
      casesSection.removeAttribute('hidden');
      setPill(casesStatus, 'Complete', true);
      // Mark all cases as answered
      CASE_FILES.forEach(cf => { caseAnswers[cf.id] = true; });
      renderCaseFiles();
      casesResult?.removeAttribute('hidden');
    }

    // Defend section: show complete
    if (defendSection) {
      defendSection.removeAttribute('hidden');
      setPill(defendStatus, 'Complete', true);
      renderDefenses();
      $$('.defense-card', defenseGridEl).forEach(btn => {
        const def = DEFENSES.find(d => d.id === btn.dataset.defenseId);
        if (def) {
          btn.classList.add(def.correct ? 'defense-card--correct' : 'defense-card--incorrect');
          btn.disabled = true;
        }
      });
      if (defendResult) {
        defendResult.innerHTML = '<p class="ok"><strong>Previously completed.</strong></p>';
        defendResult.removeAttribute('hidden');
      }
    }

    // Disable all hints and controls
    if (traceHintBtn) traceHintBtn.disabled = true;
    if (traceResetBtn) traceResetBtn.disabled = true;
    if (casesHintBtn) casesHintBtn.disabled = true;
    if (defendHintBtn) defendHintBtn.disabled = true;
    if (defendSubmitBtn) defendSubmitBtn.disabled = true;

    showVaultReveal();
    updateProgress();
  }

  // ============================================================
  // INIT
  // ============================================================

  document.addEventListener('DOMContentLoaded', () => {
    points?.ensure();

    window.utils?.initStatusHud?.('supply', {
      score: '#supplyPointsTotal',
      delta: '#supplyPointsDelta',
      progressFill: '#supplyProgressFill',
      progressLabel: '#supplyProgressText'
    });

    if (checkAlreadyComplete()) return;

    initTrace();
    initCases();
    initDefend();

    // Restore saved progress
    if (traceComplete) {
      // Mark trace as done, disable nodes
      setPill(traceStatus, 'Complete', true);
      $$('.supply-node', diagramEl).forEach(n => { n.disabled = true; });
      traceResult?.removeAttribute('hidden');
      if (traceHintBtn) traceHintBtn.disabled = true;
      if (traceResetBtn) traceResetBtn.disabled = true;

      unlockCases();
      if (casesComplete) {
        // Mark all cases as solved
        setPill(casesStatus, 'Complete', true);
        casesResult?.removeAttribute('hidden');
        if (casesHintBtn) casesHintBtn.disabled = true;

        unlockDefend();
      }
    }

    updateProgress();
  });
})();
