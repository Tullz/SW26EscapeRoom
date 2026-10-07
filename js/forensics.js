/* forensics.js — Network Forensics room (Room 6, Cyber Escape Rooms)
   Enhanced investigation with three phases:
   1) Timeline Analysis — drag-and-drop with log evidence
   2) Evidence Review — 5 questions with evidence panels
   3) Incident Response — budget-constrained mitigation picks
   Vault code word stored as vault_word_forensics = CIPHER
   IIFE, localStorage state, completable once
*/

(function () {
  'use strict';

  // ---------- DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const announce = (m) => { try { window.a11y?.announce?.(m); } catch (_) {} };

  // Guard: only run on forensics page
  const dashboard = $('#forensicsDashboard');
  if (!dashboard) return;

  // ---------- Constants ----------
  const CODE_WORD = 'CIPHER';
  const PUZZLE_KEY = 'forensics';
  const STORAGE_KEY = 'forensics_state';
  const PENALTY_TIMELINE = 3;
  const PENALTY_QUESTION = 3;
  const PENALTY_MITIGATION = 3;
  const HINT_BASIC = 5;
  const HINT_DETAILED = 10;

  // Ensure points are initialised
  window.utils?.points?.ensure();

  // ---------- Elements ----------
  const timelineEl = $('#timeline');
  const stagingCardsEl = $('#stagingCards');
  const partASubmit = $('#partASubmit');
  const partAHint = $('#partAHint');
  const partAFeedback = $('#partAFeedback');
  const partAContinue = $('#partAContinue');
  const partAResult = $('#partAResult');
  const partANext = $('#partANext');

  const partB = $('#partB');
  const partBContinue = $('#partBContinue');
  const partBResult = $('#partBResult');
  const partBNext = $('#partBNext');

  const partC = $('#partC');
  const partCSubmit = $('#partCSubmit');
  const partCHint = $('#partCHint');
  const partCFeedback = $('#partCFeedback');

  const incidentReport = $('#incidentReport');
  const reportBody = $('#reportBody');
  const vaultDisplay = $('#forensicsVaultValue');

  // ---------- Event card data ----------
  // order = correct chronological position (0-indexed)
  const ALL_EVENTS = [
    {
      id: 'e1', order: 0, time: '08:55',
      desc: 'Phishing email received by employee',
      log: 'Mail-GW | From: ceo-nexuscorp@mail.ru → j.chen@nexuscorp.com | Subj: "Urgent: Q3 Budget Review" | Link detected',
      icon: '\u{1F4E7}', phase: 'initial', anchor: true
    },
    {
      id: 'e2', order: 1, time: '09:14',
      desc: 'Employee clicks link, malware downloads silently',
      log: 'Proxy | j.chen GET hxxps://nexus-corp-portal[.]com/review → 302 → cdn-payload[.]ru/stage1.exe | 1.2 MB downloaded',
      icon: '\u{1F5B1}', phase: 'compromise', anchor: false
    },
    {
      id: 'e3', order: 2, time: '09:22',
      desc: 'Malware contacts command-and-control server',
      log: 'FW | 10.4.12.88 → 185.220.101.42:443 | Beacon interval: 60s | Encrypted channel established',
      icon: '\u{1F4E1}', phase: 'establish', anchor: false
    },
    {
      id: 'e4', order: 3, time: '10:05',
      desc: 'Attacker escalates to domain admin privileges',
      log: 'DC-01 | Kerberoast: SPN krbtgt/NEXUSCORP | Ticket granted → svc_backup (Domain Admin) | Src: 10.4.12.88',
      icon: '\u{1F510}', phase: 'attack', anchor: false
    },
    {
      id: 'e5', order: 4, time: '10:15',
      desc: 'Attacker accesses HR file server',
      log: 'FS-HR | Auth: svc_backup (DA) | SMB session from 10.4.12.88 | Browsing: /HR/Payroll/, /HR/Contracts/',
      icon: '\u{1F4C1}', phase: 'attack', anchor: true
    },
    {
      id: 'e6', order: 5, time: '10:47',
      desc: 'Attacker begins compressing sensitive files',
      log: 'FS-HR | Process: 7z.exe -mx9 | Src: /HR/Payroll/2026-Q3.xlsx + 847 files → archive.7z | 4.7 GB',
      icon: '\u{1F4E6}', phase: 'attack', anchor: false
    },
    {
      id: 'e7', order: 6, time: '11:18',
      desc: '4.7 GB exfiltrated to external server',
      log: 'FW | 10.4.12.88 → 91.234.56.78:443 | Outbound: 4.7 GB / 31 min | HTTPS (encrypted) | Dest: bulletproof hosting',
      icon: '\u{1F4E4}', phase: 'attack', anchor: false
    },
    {
      id: 'e8', order: 7, time: '11:31',
      desc: 'SIEM triggers automated alert',
      log: 'SIEM | Alert #4471: Anomalous outbound transfer | 10.4.12.88 → 91.234.56.78 | 4.7 GB | Severity: CRITICAL',
      icon: '\u{1F6A8}', phase: 'initial', anchor: true
    }
  ];

  const ANCHORS = ALL_EVENTS.filter(e => e.anchor);
  const DRAGGABLES = ALL_EVENTS.filter(e => !e.anchor);

  // ---------- Question data ----------
  const QUESTIONS = [
    {
      id: 1,
      type: 'mc',
      correct: 'b',
      evidence: [
        { source: 'Mail Gateway', entry: '[08:55] Inbound from ceo-nexuscorp@mail.ru → j.chen@nexuscorp.com | Subject: "Urgent: Q3 Budget Review" | Contains URL' },
        { source: 'Web Proxy', entry: '[09:14] j.chen accessed hxxps://nexus-corp-portal[.]com/review → 302 redirect → cdn-payload[.]ru/stage1.exe downloaded' }
      ],
      explanation: 'The Mail Gateway log shows a spoofed email from "ceo-nexuscorp@mail.ru" (note the .ru domain impersonating the CEO). The Web Proxy confirms the employee clicked the link 19 minutes later, triggering a drive-by download. This is textbook spear phishing.',
      hint: 'Look at the very first log entry — what arrived in the employee\'s inbox?',
      detailedHint: 'The Mail Gateway shows an email from a suspicious .ru domain spoofing the CEO. The proxy shows the employee clicked the link inside it.'
    },
    {
      id: 2,
      type: 'freetext',
      evidence: [
        { source: 'Web Proxy', entry: '[09:14] Malware download initiated — this is the moment of initial compromise' },
        { source: 'Firewall', entry: '[11:18] 4.7 GB outbound transfer began — this is when data exfiltration started' },
        { source: 'Analyst Note', entry: 'Calculate the elapsed time between initial compromise and data exfiltration.' }
      ],
      validate: (input) => {
        const s = (input || '').toLowerCase().trim();
        if (/^(about |approx\.?\s*|approximately |around |~|roughly )?\s*2\s*(hours?|hrs?|h)\s*$/i.test(s)) return true;
        if (/^120\s*(min(utes?)?|m)\s*$/i.test(s)) return true;
        if (/^(about |approx\.?\s*|approximately |around |~|roughly )?\s*120\s*(min(utes?)?|m)\s*$/i.test(s)) return true;
        if (/two\s*hours?/i.test(s)) return true;
        if (/^2$/i.test(s)) return true;
        if (/2\s*h(ou)?r?s?\s*(and\s*)?\s*4\s*min/i.test(s)) return true;
        if (/^124\s*min/i.test(s)) return true;
        return false;
      },
      explanation: 'The proxy log shows initial compromise at 09:14 (malware download). The firewall shows exfiltration beginning at 11:18. That is 2 hours and 4 minutes of attacker dwell time — approximately 2 hours.',
      hint: 'Subtract the first timestamp from the second. How many hours and minutes between them?',
      detailedHint: '09:14 to 11:18. Count: 09:14 → 11:14 = 2 hours, then +4 minutes = about 2 hours.'
    },
    {
      id: 3,
      type: 'mc',
      correct: 'a',
      evidence: [
        { source: 'Network Map', entry: 'Infection path: j.chen workstation (10.4.12.88) → DC-01 → FS-HR → External server' },
        { source: 'Firewall', entry: 'All C2 traffic originated from 10.4.12.88 (j.chen\'s workstation) — single pivot point' },
        { source: 'IR Playbook', entry: '"Isolate the earliest compromised host to sever the attacker\'s foothold and C2 channel."' }
      ],
      explanation: 'The employee\'s workstation (10.4.12.88) was the attacker\'s initial foothold and the source of ALL lateral movement. Every action — C2 beacons, Kerberoasting, file server access, exfiltration — originated from this single host. Isolating it first cuts everything.',
      hint: 'The incident playbook says to isolate the earliest compromised host. Which machine was that?',
      detailedHint: 'All C2 traffic and lateral movement originated from one IP: 10.4.12.88. That is the employee workstation.'
    },
    {
      id: 4,
      type: 'mc',
      correct: 'c',
      evidence: [
        { source: 'Attack Stages', entry: '1) Spear phishing → 2) Malware deployment → 3) C2 establishment → 4) Privilege escalation → 5) Lateral movement → 6) Exfiltration' },
        { source: 'Dwell Time', entry: 'Attacker was active for ~2.5 hours across multiple systems before detection' },
        { source: 'MITRE ATT&CK', entry: 'Techniques: T1566.002 (Phishing Link), T1059 (C2), T1558 (Kerberoasting), T1041 (Exfiltration Over C2)' }
      ],
      explanation: 'This timeline shows a classic Advanced Persistent Threat (APT) pattern: targeted spear phishing for initial access, C2 establishment, privilege escalation via Kerberoasting, lateral movement, and data exfiltration. Multiple MITRE ATT&CK techniques across the full cyber kill chain.',
      hint: 'The attack was methodical and multi-stage, progressing through the entire kill chain over hours — not fast and noisy.',
      detailedHint: 'This attack maps to multiple MITRE ATT&CK techniques across the kill chain. It was targeted, patient, and multi-stage. Think APT.'
    },
    {
      id: 5,
      type: 'mc',
      correct: 'b',
      evidence: [
        { source: 'Firewall', entry: '[09:22] 10.4.12.88 → 185.220.101.42:443 | Beacon interval: 60s — C2 channel established' },
        { source: 'DC-01 Logs', entry: '[10:05] Kerberoast attack against krbtgt/NEXUSCORP — 43 minutes after C2 started' },
        { source: 'SIEM', entry: '[11:31] Alert #4471 fired — triggered by volume anomaly, 2 hours 9 minutes after C2 was established' },
        { source: 'Analyst Note', entry: 'Compare when the C2 channel opened vs. when the SIEM alerted. What happened in between?' }
      ],
      explanation: 'The C2 beacon started at 09:22 with a regular 60-second interval — a detectable pattern. The SIEM only alerted at 11:31 (over 2 hours later) and only because of the large data transfer volume. If outbound C2 traffic had been detected at 09:22, everything that followed — privilege escalation, lateral movement, exfiltration — could have been prevented.',
      hint: 'Compare when the C2 channel opened versus when the SIEM finally alerted. What was missed in between?',
      detailedHint: 'The C2 beacon ran from 09:22 to 11:31 without detection. That 2-hour gap allowed the entire attack to succeed.'
    }
  ];

  // ---------- Mitigation data ----------
  const MITIGATIONS = [
    {
      id: 'email-filter',
      name: 'Advanced Email Security Gateway',
      icon: '✉',
      desc: 'AI-powered email scanning with URL sandboxing and real-time link rewriting.',
      cost: '$45K/year',
      pros: ['Blocks phishing at the perimeter before employees see it', 'URL sandboxing catches zero-day links'],
      cons: ['False positives on legitimate bulk emails', 'Does not protect against non-email attack vectors'],
      consequence: {
        prevents: 'Would have quarantined the spoofed email at 08:55 before it reached j.chen. The entire attack chain never starts.',
        misses: 'If the attacker used a different vector (watering hole site, USB drop, insider), this control alone would not help.'
      },
      correct: true
    },
    {
      id: 'edr',
      name: 'Endpoint Detection and Response (EDR)',
      icon: '\u{1F6E1}',
      desc: 'Real-time endpoint monitoring with behavioral analysis and automatic threat containment.',
      cost: '$38K/year',
      pros: ['Detects and blocks malware at download or execution', 'Behavioral analysis catches unknown threats'],
      cons: ['Requires endpoint agents on all devices', 'Can impact performance on older hardware'],
      consequence: {
        prevents: 'Would have blocked stage1.exe at 09:14, or detected the C2 beacon at 09:22 and auto-isolated the workstation.',
        misses: 'If the attacker used fileless or living-off-the-land techniques, detection depends on tuned behavioral rules.'
      },
      correct: true
    },
    {
      id: 'password',
      name: 'Enhanced Password Policy',
      icon: '\u{1F511}',
      desc: 'Require 16+ character passwords with complexity rules and 90-day rotation for all accounts.',
      cost: '$12K/year',
      pros: ['Reduces risk from credential-based brute-force attacks', 'Low implementation cost'],
      cons: ['Users write down complex passwords, creating new risks', 'Does not address phishing or malware-based attacks'],
      consequence: {
        prevents: 'Would NOT have prevented this attack. The attacker used Kerberoasting to extract service account ticket hashes, not password guessing.',
        misses: 'This attack bypassed passwords entirely. The initial access was phishing, and privilege escalation used Kerberoasting — neither involves weak passwords.'
      },
      correct: false
    },
    {
      id: 'bandwidth',
      name: 'Network Traffic Analytics (NTA)',
      icon: '\u{1F4CA}',
      desc: 'Monitor network flows for anomalous data transfers, lateral movement patterns, and C2 beacons.',
      cost: '$52K/year',
      pros: ['Detects C2 beacon patterns and large data exfiltration', 'Visibility into east-west lateral movement'],
      cons: ['High false-positive rate requires a dedicated SOC analyst', 'Detects threats but does not prevent them — response is still manual'],
      consequence: {
        prevents: 'Might have detected the C2 beacon at 09:22 or the 4.7 GB exfiltration — but detection only, not prevention. An analyst still must respond.',
        misses: 'NTA detects threats after they start, not before. The phishing email and malware download would still succeed. And detection without automated response means the attacker may finish before humans act.'
      },
      correct: false
    }
  ];

  const CORRECT_MITIGATIONS = new Set(MITIGATIONS.filter(m => m.correct).map(m => m.id));

  // ---------- Timeline hints (two tiers) ----------
  const TIMELINE_HINTS_BASIC = [
    'Look at the anchor timestamps: 08:55, 10:15, and 11:31. The five missing events fit between and around them.',
    'Malware has to be downloaded before it can phone home to a C2 server.',
    'An attacker needs elevated privileges before accessing restricted servers.',
    'You have to compress files before you can exfiltrate them.',
    'The security team was the last to know — the alert came after the damage was done.'
  ];

  const TIMELINE_HINTS_DETAILED = [
    'The employee clicked the phishing link at 09:14, just 19 minutes after the email arrived at 08:55.',
    'C2 communication started at 09:22 — 8 minutes after the malware download.',
    'Privilege escalation happened at 10:05, 10 minutes before the HR server was accessed.',
    'File compression started at 10:47 and exfiltration began at 11:18 — compression first, then exfil.',
    'The SIEM alert at 11:31 was triggered by the exfiltration volume, 13 minutes after it started.'
  ];

  // ---------- State ----------
  let state = loadState();

  function defaultState() {
    return {
      partADone: false,
      partACorrect: 0,
      partBDone: false,
      partBAnswers: {},
      partCDone: false,
      complete: false,
      currentQuestion: 1,
      slotAssignments: {},
      hintTiers: {}
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign(defaultState(), parsed);
      }
    } catch (_) {}
    return defaultState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  // ---------- Already complete? ----------
  function isAlreadyComplete() {
    try {
      const progress = window.utils?.readProgress?.() || {};
      return progress[PUZZLE_KEY] === true;
    } catch (_) {
      return false;
    }
  }

  // ---------- Phase class helper ----------
  function phaseClass(phase) {
    const map = {
      initial: 'phase-initial',
      compromise: 'phase-compromise',
      establish: 'phase-establish',
      attack: 'phase-attack'
    };
    return map[phase] || 'phase-initial';
  }

  // ---------- Build event card HTML ----------
  function buildCardHTML(event, opts = {}) {
    const isAnchor = opts.anchor || false;
    const showResult = opts.result;
    const draggable = !isAnchor && !opts.locked;

    const card = document.createElement('div');
    card.className = 'event-card';
    card.dataset.eventId = event.id;
    card.setAttribute('role', 'listitem');

    if (isAnchor) {
      card.classList.add('is-anchor');
    } else if (draggable) {
      card.classList.add('is-draggable');
      card.setAttribute('draggable', 'true');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Event: ${event.time} - ${event.desc}. Draggable.`);
    }

    if (showResult === 'correct') card.classList.add('is-correct');
    if (showResult === 'wrong') card.classList.add('is-wrong');

    const iconSpan = document.createElement('span');
    iconSpan.className = `event-icon ${phaseClass(event.phase)}`;
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = event.icon;

    const content = document.createElement('div');

    const meta = document.createElement('div');
    meta.className = 'event-meta';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'event-time';
    timeSpan.textContent = event.time;
    meta.appendChild(timeSpan);

    if (isAnchor) {
      const lockBadge = document.createElement('span');
      lockBadge.className = 'lock-badge';
      lockBadge.innerHTML = '\u{1F512} Anchored';
      meta.appendChild(lockBadge);
    }

    if (showResult) {
      const badge = document.createElement('span');
      badge.className = `result-badge ${showResult}`;
      badge.textContent = showResult === 'correct' ? '✓ Correct' : '✗ Wrong position';
      meta.appendChild(badge);
    }

    content.appendChild(meta);

    const descP = document.createElement('p');
    descP.className = 'event-desc';
    descP.textContent = event.desc;
    content.appendChild(descP);

    // Log excerpt
    if (event.log) {
      const logDiv = document.createElement('div');
      logDiv.className = 'event-log';
      logDiv.textContent = event.log;
      content.appendChild(logDiv);
    }

    // Move buttons for accessibility (only for draggable cards in staging)
    if (draggable && opts.showMoveButtons) {
      const moveDiv = document.createElement('div');
      moveDiv.className = 'move-buttons';

      const slots = getEmptySlotIndices();
      slots.forEach((slotIdx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = `Slot ${slotIdx + 1}`;
        btn.setAttribute('aria-label', `Place in timeline slot ${slotIdx + 1}`);
        btn.addEventListener('click', () => {
          placeCardInSlot(event.id, slotIdx);
        });
        moveDiv.appendChild(btn);
      });

      if (slots.length === 0) {
        const note = document.createElement('span');
        note.style.cssText = 'font-size:.75rem; color:var(--muted);';
        note.textContent = 'All slots filled';
        moveDiv.appendChild(note);
      }

      content.appendChild(moveDiv);
    }

    card.appendChild(iconSpan);
    card.appendChild(content);

    return card;
  }

  // ---------- Timeline rendering ----------
  const ANCHOR_POSITIONS = {};
  ANCHORS.forEach(a => { ANCHOR_POSITIONS[a.order] = a; });

  function getEmptySlotIndices() {
    const empty = [];
    for (let i = 0; i < 8; i++) {
      if (ANCHOR_POSITIONS[i]) continue;
      if (!state.slotAssignments[i]) empty.push(i);
    }
    return empty;
  }

  function getUnplacedCards() {
    const placedIds = new Set(Object.values(state.slotAssignments));
    return DRAGGABLES.filter(e => !placedIds.has(e.id));
  }

  function renderTimeline(results) {
    if (!timelineEl) return;
    timelineEl.innerHTML = '';

    for (let i = 0; i < 8; i++) {
      const slotDiv = document.createElement('div');
      slotDiv.className = 'timeline-slot';
      slotDiv.dataset.slotIndex = String(i);

      if (ANCHOR_POSITIONS[i]) {
        slotDiv.classList.add('is-anchor', 'has-card');
        const event = ANCHOR_POSITIONS[i];
        const resultType = results ? 'correct' : null;
        const card = buildCardHTML(event, { anchor: true, result: resultType });
        slotDiv.appendChild(card);
      } else {
        const assignedId = state.slotAssignments[i];
        if (assignedId) {
          slotDiv.classList.add('has-card');
          const event = ALL_EVENTS.find(e => e.id === assignedId);
          if (event) {
            let resultType = null;
            if (results) {
              resultType = (event.order === i) ? 'correct' : 'wrong';
            }
            const card = buildCardHTML(event, { locked: !!results, result: resultType });

            if (!results) {
              const removeBtn = document.createElement('button');
              removeBtn.type = 'button';
              removeBtn.className = 'btn ghost sm';
              removeBtn.textContent = 'Remove';
              removeBtn.style.cssText = 'margin-top:.35rem; font-size:.75rem;';
              removeBtn.setAttribute('aria-label', `Remove ${event.desc} from timeline`);
              removeBtn.addEventListener('click', () => {
                delete state.slotAssignments[i];
                saveState();
                renderTimeline();
                renderStaging();
              });
              card.querySelector('div:last-child').appendChild(removeBtn);
              setupCardDragEvents(card, event.id);
            }

            if (resultType === 'wrong') {
              const correctEvent = ALL_EVENTS.find(e => e.order === i);
              if (correctEvent) {
                const correction = document.createElement('p');
                correction.style.cssText = 'font-size:.82rem; color:var(--warn); margin-top:.25rem;';
                correction.textContent = `Should be: ${correctEvent.time} — ${correctEvent.desc}`;
                card.querySelector('div:last-child').appendChild(correction);
              }
            }

            slotDiv.appendChild(card);
          }
        } else {
          const dropZone = document.createElement('div');
          dropZone.className = 'drop-zone';
          dropZone.dataset.slotIndex = String(i);
          dropZone.setAttribute('aria-label', `Empty timeline slot ${i + 1}. Drop an event card here.`);

          const label = document.createElement('span');
          label.className = 'drop-label';
          label.textContent = 'Drop event here';
          dropZone.appendChild(label);

          setupDropZoneEvents(dropZone, i);
          slotDiv.appendChild(dropZone);
        }
      }

      timelineEl.appendChild(slotDiv);
    }
  }

  function renderStaging(results) {
    if (!stagingCardsEl) return;
    stagingCardsEl.innerHTML = '';

    const unplaced = getUnplacedCards();

    if (unplaced.length === 0 && !results) {
      const note = document.createElement('p');
      note.style.cssText = 'font-size:.85rem; color:var(--muted); text-align:center; padding:.5rem;';
      note.textContent = 'All cards placed. Click "Verify Timeline" to check.';
      stagingCardsEl.appendChild(note);
      return;
    }

    if (results) {
      const note = document.createElement('p');
      note.style.cssText = 'font-size:.85rem; color:var(--accent); text-align:center; padding:.5rem;';
      note.textContent = 'Timeline verified.';
      stagingCardsEl.appendChild(note);
      return;
    }

    unplaced.forEach(event => {
      const card = buildCardHTML(event, { showMoveButtons: true });
      setupCardDragEvents(card, event.id);
      stagingCardsEl.appendChild(card);
    });
  }

  // ---------- Drag and Drop ----------
  let draggedEventId = null;

  function setupCardDragEvents(cardEl, eventId) {
    cardEl.addEventListener('dragstart', (e) => {
      draggedEventId = eventId;
      cardEl.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', eventId); } catch (_) {}
    });

    cardEl.addEventListener('dragend', () => {
      cardEl.classList.remove('is-dragging');
      draggedEventId = null;
      $$('.drop-zone.drag-over').forEach(dz => dz.classList.remove('drag-over'));
    });

    // Touch support
    let touchStartY = 0;
    let touchStartX = 0;
    let isTouchDragging = false;

    cardEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      draggedEventId = eventId;
      isTouchDragging = false;
    }, { passive: true });

    cardEl.addEventListener('touchmove', (e) => {
      if (!draggedEventId || draggedEventId !== eventId) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      if (dx > 10 || dy > 10) {
        isTouchDragging = true;
        e.preventDefault();
      }

      $$('.drop-zone').forEach(dz => {
        const rect = dz.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          dz.classList.add('drag-over');
        } else {
          dz.classList.remove('drag-over');
        }
      });
    }, { passive: false });

    cardEl.addEventListener('touchend', (e) => {
      if (!isTouchDragging || !draggedEventId || draggedEventId !== eventId) {
        draggedEventId = null;
        return;
      }

      const touch = e.changedTouches[0];
      const dropTarget = $$('.drop-zone').find(dz => {
        const rect = dz.getBoundingClientRect();
        return touch.clientX >= rect.left && touch.clientX <= rect.right &&
               touch.clientY >= rect.top && touch.clientY <= rect.bottom;
      });

      if (dropTarget) {
        const slotIdx = parseInt(dropTarget.dataset.slotIndex, 10);
        placeCardInSlot(eventId, slotIdx);
      }

      $$('.drop-zone.drag-over').forEach(dz => dz.classList.remove('drag-over'));
      draggedEventId = null;
      isTouchDragging = false;
    });
  }

  function setupDropZoneEvents(dropZoneEl, slotIndex) {
    dropZoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      dropZoneEl.classList.add('drag-over');
    });

    dropZoneEl.addEventListener('dragleave', () => {
      dropZoneEl.classList.remove('drag-over');
    });

    dropZoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZoneEl.classList.remove('drag-over');

      const eventId = draggedEventId || e.dataTransfer.getData('text/plain');
      if (!eventId) return;

      placeCardInSlot(eventId, slotIndex);
      draggedEventId = null;
    });
  }

  function placeCardInSlot(eventId, slotIndex) {
    Object.keys(state.slotAssignments).forEach(key => {
      if (state.slotAssignments[key] === eventId) {
        delete state.slotAssignments[key];
      }
    });

    state.slotAssignments[slotIndex] = eventId;
    saveState();
    renderTimeline();
    renderStaging();
    announce(`Card placed in slot ${slotIndex + 1}`);
  }

  // ---------- Part A: Check Timeline ----------
  function checkTimeline() {
    const unplaced = getUnplacedCards();
    if (unplaced.length > 0) {
      setFeedback(partAFeedback, `Place all 5 event cards before verifying. ${unplaced.length} remaining.`, 'warn');
      announce(`${unplaced.length} cards still need to be placed.`);
      return;
    }

    let correct = 0;
    DRAGGABLES.forEach(event => {
      const placedSlot = Object.entries(state.slotAssignments).find(([, id]) => id === event.id);
      if (placedSlot && parseInt(placedSlot[0], 10) === event.order) {
        correct++;
      }
    });

    const wrong = 5 - correct;
    const penalty = wrong * PENALTY_TIMELINE;

    if (penalty > 0) {
      window.utils?.points?.spend(penalty, `Timeline: ${wrong} wrong`);
    }

    state.partACorrect = correct;

    if (correct === 5) {
      // All 5 correct — pass
      state.partADone = true;
      saveState();
      renderTimeline(true);
      renderStaging(true);

      setFeedback(partAFeedback, 'Perfect timeline! All 5 events in the correct order. Precision matters in forensics.', 'ok');
      announce('Timeline verified. All 5 events correct.');

      if (partASubmit) partASubmit.disabled = true;
      if (partAHint) partAHint.disabled = true;

      if (partAContinue) partAContinue.removeAttribute('hidden');
      if (partAResult) partAResult.textContent = '5/5 correct';

      const badge = $('#partABadge');
      if (badge) badge.classList.add('done');

      window.utils?.setProgressPercent?.(PUZZLE_KEY, 33);
    } else {
      // Not all correct — show results and allow retry
      renderTimeline(true);
      renderStaging(true);

      setFeedback(partAFeedback, `${correct}/5 correct. All 5 must be right — precision matters in forensics. Review the corrections and try again. (-${penalty} pts)`, 'warn');
      announce(`${correct} out of 5 correct. All 5 required. Try again.`);

      setTimeout(() => {
        state.slotAssignments = {};
        saveState();
        renderTimeline();
        renderStaging();
        setFeedback(partAFeedback, 'Cards reset. Study the log excerpts and anchor timestamps for ordering clues.', 'info');
      }, 5000);
    }
  }

  // ---------- Evidence panel rendering ----------
  function renderEvidencePanels() {
    QUESTIONS.forEach(q => {
      if (!q.evidence) return;
      const container = $(`#q${q.id}Evidence`);
      if (!container || container.children.length > 0) return;

      const panel = document.createElement('div');
      panel.className = 'evidence-panel';

      const title = document.createElement('div');
      title.className = 'evidence-panel-title';
      title.textContent = 'Evidence';
      panel.appendChild(title);

      q.evidence.forEach(item => {
        const entry = document.createElement('div');
        entry.className = 'evidence-entry';

        const source = document.createElement('span');
        source.className = 'evidence-source';
        source.textContent = item.source;
        entry.appendChild(source);

        const content = document.createElement('span');
        content.className = 'evidence-content';
        content.textContent = item.entry;
        entry.appendChild(content);

        panel.appendChild(entry);
      });

      container.appendChild(panel);
    });
  }

  // ---------- Part B: Investigation Questions ----------
  let currentQuestion = state.currentQuestion || 1;

  function showQuestion(qNum) {
    const total = QUESTIONS.length;
    for (let i = 1; i <= total; i++) {
      const block = $(`#questionBlock${i}`);
      if (!block) continue;
      if (i <= qNum || state.partBAnswers[i]) {
        block.removeAttribute('hidden');
      } else {
        block.setAttribute('hidden', '');
      }
    }
  }

  function setupQuestionHandlers() {
    QUESTIONS.forEach(q => {
      if (q.type === 'mc') {
        const submitBtn = $(`#q${q.id}Submit`);
        const hintBtn = $(`#q${q.id}Hint`);
        const feedbackEl = $(`#q${q.id}Feedback`);
        const optionsEl = $(`#q${q.id}Options`);

        if (state.partBAnswers[q.id]) {
          showQuestionResult(q);
          return;
        }

        let selected = null;
        if (optionsEl) {
          $$('.answer-card', optionsEl).forEach(card => {
            card.addEventListener('click', () => {
              if (card.disabled) return;
              $$('.answer-card', optionsEl).forEach(c => {
                c.classList.remove('is-selected');
                c.setAttribute('aria-checked', 'false');
              });
              card.classList.add('is-selected');
              card.setAttribute('aria-checked', 'true');
              selected = card.dataset.answer;
            });
          });
        }

        if (submitBtn) {
          submitBtn.addEventListener('click', () => {
            if (!selected) {
              setFeedback(feedbackEl, 'Select an answer first.', 'warn');
              return;
            }

            const isCorrect = selected === q.correct;
            state.partBAnswers[q.id] = { answer: selected, correct: isCorrect };
            saveState();

            if (!isCorrect) {
              window.utils?.points?.spend(PENALTY_QUESTION, `Q${q.id} wrong`);
            }

            showQuestionResult(q);
            advanceQuestion(q.id);
          });
        }

        if (hintBtn) {
          setupTwoTierHint(hintBtn, feedbackEl, q, `q${q.id}`);
        }
      } else if (q.type === 'freetext') {
        const submitBtn = $(`#q${q.id}Submit`);
        const hintBtn = $(`#q${q.id}Hint`);
        const feedbackEl = $(`#q${q.id}Feedback`);
        const inputEl = $(`#q${q.id}Input`);

        if (state.partBAnswers[q.id]) {
          showQuestionResult(q);
          return;
        }

        if (submitBtn && inputEl) {
          submitBtn.addEventListener('click', () => {
            const val = inputEl.value.trim();
            if (!val) {
              setFeedback(feedbackEl, 'Type an answer first.', 'warn');
              return;
            }

            const isCorrect = q.validate(val);
            state.partBAnswers[q.id] = { answer: val, correct: isCorrect };
            saveState();

            if (!isCorrect) {
              window.utils?.points?.spend(PENALTY_QUESTION, `Q${q.id} wrong`);
            }

            showQuestionResult(q);
            advanceQuestion(q.id);
          });

          inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitBtn.click();
            }
          });
        }

        if (hintBtn) {
          setupTwoTierHint(hintBtn, feedbackEl, q, `q${q.id}`);
        }
      }
    });
  }

  function setupTwoTierHint(hintBtn, feedbackEl, questionData, hintKey) {
    hintBtn.addEventListener('click', () => {
      const tier = state.hintTiers[hintKey] || 0;

      if (tier === 0) {
        // Basic hint
        window.utils?.points?.spend(HINT_BASIC, `${hintKey} hint (basic)`);
        setFeedback(feedbackEl, questionData.hint, 'info');
        announce(`Hint: ${questionData.hint}`);
        state.hintTiers[hintKey] = 1;
        saveState();

        if (questionData.detailedHint) {
          hintBtn.textContent = 'Detailed Hint (-10 pts)';
        } else {
          hintBtn.disabled = true;
        }
      } else if (tier === 1 && questionData.detailedHint) {
        // Detailed hint
        window.utils?.points?.spend(HINT_DETAILED, `${hintKey} hint (detailed)`);
        setFeedback(feedbackEl, questionData.detailedHint, 'info');
        announce(`Detailed hint: ${questionData.detailedHint}`);
        state.hintTiers[hintKey] = 2;
        saveState();
        hintBtn.disabled = true;
      } else {
        hintBtn.disabled = true;
      }
    });
  }

  function showQuestionResult(q) {
    const result = state.partBAnswers[q.id];
    if (!result) return;

    const feedbackEl = $(`#q${q.id}Feedback`);
    const explanationEl = $(`#q${q.id}Explanation`);
    const submitBtn = $(`#q${q.id}Submit`);
    const hintBtn = $(`#q${q.id}Hint`);

    if (q.type === 'mc') {
      const optionsEl = $(`#q${q.id}Options`);
      if (optionsEl) {
        $$('.answer-card', optionsEl).forEach(card => {
          card.disabled = true;
          if (card.dataset.answer === q.correct) {
            card.classList.add('is-correct');
          } else if (card.dataset.answer === result.answer && !result.correct) {
            card.classList.add('is-wrong');
          }
        });
      }
    } else if (q.type === 'freetext') {
      const inputEl = $(`#q${q.id}Input`);
      if (inputEl) {
        inputEl.disabled = true;
        inputEl.style.borderColor = result.correct ? 'var(--accent)' : 'var(--danger)';
      }
    }

    if (submitBtn) submitBtn.disabled = true;
    if (hintBtn) hintBtn.disabled = true;

    if (result.correct) {
      setFeedback(feedbackEl, 'Correct!', 'ok');
    } else {
      setFeedback(feedbackEl, `Incorrect. (-${PENALTY_QUESTION} pts)`, 'warn');
    }

    if (explanationEl) {
      explanationEl.removeAttribute('hidden');
      explanationEl.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'explanation-box';
      const h3 = document.createElement('h3');
      h3.textContent = result.correct ? 'Well done!' : 'Explanation';
      const p = document.createElement('p');
      p.textContent = q.explanation;
      box.appendChild(h3);
      box.appendChild(p);
      explanationEl.appendChild(box);
    }
  }

  function advanceQuestion(completedId) {
    const total = QUESTIONS.length;
    const answeredCount = Object.keys(state.partBAnswers).length;

    if (answeredCount >= total) {
      state.partBDone = true;
      state.currentQuestion = total + 1;
      saveState();

      const correctCount = Object.values(state.partBAnswers).filter(a => a.correct).length;

      if (partBContinue) partBContinue.removeAttribute('hidden');
      if (partBResult) partBResult.textContent = `${correctCount}/${total} correct`;

      const badge = $('#partBBadge');
      if (badge) badge.classList.add('done');

      announce('All questions answered. Proceed to Incident Response.');
      window.utils?.setProgressPercent?.(PUZZLE_KEY, 66);
      return;
    }

    const nextQ = QUESTIONS.find(q => !state.partBAnswers[q.id]);
    if (nextQ) {
      currentQuestion = nextQ.id;
      state.currentQuestion = currentQuestion;
      saveState();

      setTimeout(() => {
        showQuestion(currentQuestion);
        announce(`Question ${currentQuestion} of ${total}`);
      }, 1200);
    }
  }

  // ---------- Part C: Mitigation Picks ----------
  let selectedMitigations = new Set();

  function renderMitigationCards() {
    const container = $('#mitigationOptions');
    if (!container) return;
    container.innerHTML = '';

    MITIGATIONS.forEach(m => {
      const card = document.createElement('button');
      card.className = 'mitigation-card';
      card.type = 'button';
      card.dataset.mitigation = m.id;
      card.setAttribute('aria-pressed', 'false');

      const icon = document.createElement('span');
      icon.className = 'mitigation-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = m.icon;
      card.appendChild(icon);

      const content = document.createElement('div');

      const name = document.createElement('p');
      name.className = 'mitigation-name';
      name.textContent = m.name;
      content.appendChild(name);

      const cost = document.createElement('p');
      cost.className = 'mitigation-cost';
      cost.textContent = m.cost;
      content.appendChild(cost);

      const desc = document.createElement('p');
      desc.className = 'mitigation-desc';
      desc.textContent = m.desc;
      content.appendChild(desc);

      // Pros / Cons columns
      const detail = document.createElement('div');
      detail.className = 'mitigation-detail';

      const prosCol = document.createElement('div');
      prosCol.className = 'detail-col pros';
      const prosH4 = document.createElement('h4');
      prosH4.textContent = 'Strengths';
      prosCol.appendChild(prosH4);
      const prosList = document.createElement('ul');
      m.pros.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p;
        prosList.appendChild(li);
      });
      prosCol.appendChild(prosList);
      detail.appendChild(prosCol);

      const consCol = document.createElement('div');
      consCol.className = 'detail-col cons';
      const consH4 = document.createElement('h4');
      consH4.textContent = 'Limitations';
      consCol.appendChild(consH4);
      const consList = document.createElement('ul');
      m.cons.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        consList.appendChild(li);
      });
      consCol.appendChild(consList);
      detail.appendChild(consCol);

      content.appendChild(detail);
      card.appendChild(content);
      container.appendChild(card);
    });
  }

  function setupMitigationHandlers() {
    renderMitigationCards();

    const container = $('#mitigationOptions');
    if (!container) return;

    container.addEventListener('click', (e) => {
      const card = e.target.closest('.mitigation-card');
      if (!card || card.disabled) return;
      const key = card.dataset.mitigation;

      if (selectedMitigations.has(key)) {
        selectedMitigations.delete(key);
        card.classList.remove('is-selected');
        card.setAttribute('aria-pressed', 'false');
      } else {
        if (selectedMitigations.size >= 2) {
          setFeedback(partCFeedback, 'Budget allows only 2 controls. Deselect one first.', 'warn');
          return;
        }
        selectedMitigations.add(key);
        card.classList.add('is-selected');
        card.setAttribute('aria-pressed', 'true');
      }
    });

    if (partCSubmit) {
      partCSubmit.addEventListener('click', () => {
        if (selectedMitigations.size !== 2) {
          setFeedback(partCFeedback, 'Select exactly 2 controls within budget.', 'warn');
          return;
        }
        checkMitigations();
      });
    }

    if (partCHint) {
      setupTwoTierHint(partCHint, partCFeedback, {
        hint: 'Think about what could have stopped the attack at its earliest stages: the phishing email and the malware download.',
        detailedHint: 'One control blocks the email before it arrives. The other catches the malware when it runs. Neither involves passwords or monitoring alone.'
      }, 'partC');
    }
  }

  function checkMitigations() {
    const cards = $$('.mitigation-card', partC);
    let wrongCount = 0;

    cards.forEach(card => {
      card.disabled = true;
      const key = card.dataset.mitigation;
      const isCorrect = CORRECT_MITIGATIONS.has(key);
      const wasSelected = selectedMitigations.has(key);

      if (wasSelected) {
        if (isCorrect) {
          card.classList.add('is-correct');
        } else {
          card.classList.add('is-wrong');
          wrongCount++;
        }
      } else if (isCorrect) {
        card.classList.add('is-correct');
      }
    });

    const penalty = wrongCount * PENALTY_MITIGATION;
    if (penalty > 0) {
      window.utils?.points?.spend(penalty, `Mitigations: ${wrongCount} wrong`);
    }

    if (partCSubmit) partCSubmit.disabled = true;
    if (partCHint) partCHint.disabled = true;

    const feedbackMsg = wrongCount === 0
      ? 'Excellent picks! Both controls correctly identified.'
      : `${2 - wrongCount}/2 correct. (-${penalty} pts)`;
    setFeedback(partCFeedback, feedbackMsg, wrongCount === 0 ? 'ok' : 'warn');

    // Show consequence cards
    const consequenceDiv = document.createElement('div');
    consequenceDiv.className = 'consequence-section';
    consequenceDiv.style.cssText = 'display:grid; gap:.75rem; margin-top:1rem;';

    const consequenceTitle = document.createElement('h3');
    consequenceTitle.style.cssText = 'font-size:.9rem; text-transform:uppercase; letter-spacing:.06em; color:var(--brand); font-weight:600;';
    consequenceTitle.textContent = 'Impact Analysis';
    consequenceDiv.appendChild(consequenceTitle);

    MITIGATIONS.forEach(m => {
      const cCard = document.createElement('div');
      cCard.className = 'consequence-card';
      const isCorrect = CORRECT_MITIGATIONS.has(m.id);
      const wasSelected = selectedMitigations.has(m.id);

      cCard.style.borderColor = isCorrect ? 'rgba(9, 255, 136, .3)' : 'var(--border)';

      const header = document.createElement('h4');
      header.style.color = isCorrect ? 'var(--accent)' : 'var(--muted)';
      const marker = wasSelected ? (isCorrect ? '✓ ' : '✗ ') : '';
      header.textContent = `${marker}${m.name}`;
      cCard.appendChild(header);

      const prevents = document.createElement('p');
      prevents.textContent = m.consequence.prevents;
      cCard.appendChild(prevents);

      if (!isCorrect) {
        const misses = document.createElement('p');
        misses.style.cssText = 'color:var(--warn); font-style:italic;';
        misses.textContent = m.consequence.misses;
        cCard.appendChild(misses);
      }

      consequenceDiv.appendChild(cCard);
    });

    partCFeedback.parentNode.insertBefore(consequenceDiv, partCFeedback.nextSibling);

    state.partCDone = true;
    saveState();

    const badge = $('#partCBadge');
    if (badge) badge.classList.add('done');

    announce('Mitigation picks evaluated. Generating incident report.');

    setTimeout(() => {
      completePuzzle();
    }, 2000);
  }

  // ---------- Incident Report Generation ----------
  function generateIncidentReport() {
    if (!reportBody) return;
    reportBody.innerHTML = '';

    // Executive summary
    const execSection = makeReportSection('Executive Summary',
      'On September 17, 2026, a targeted spear-phishing attack compromised an employee workstation at Nexus Corp. The attacker established persistent command-and-control access, escalated privileges via Kerberoasting, and exfiltrated 4.7 GB of sensitive HR data over approximately 2.5 hours before the SIEM triggered a volume-based alert.'
    );
    reportBody.appendChild(execSection);

    // Timeline summary
    const timelineSection = document.createElement('div');
    timelineSection.className = 'report-section';
    const tlH3 = document.createElement('h3');
    tlH3.textContent = 'Attack Timeline';
    timelineSection.appendChild(tlH3);

    const tlSummary = document.createElement('div');
    tlSummary.className = 'report-timeline-summary';
    ALL_EVENTS.forEach(ev => {
      const row = document.createElement('div');
      row.className = 'report-timeline-entry';
      const time = document.createElement('span');
      time.className = 'report-time';
      time.textContent = ev.time;
      const desc = document.createElement('span');
      desc.textContent = ev.desc;
      row.appendChild(time);
      row.appendChild(desc);
      tlSummary.appendChild(row);
    });
    timelineSection.appendChild(tlSummary);
    reportBody.appendChild(timelineSection);

    // Key findings
    const findingsSection = document.createElement('div');
    findingsSection.className = 'report-section';
    const fH3 = document.createElement('h3');
    fH3.textContent = 'Key Findings';
    findingsSection.appendChild(fH3);
    const fList = document.createElement('ul');
    [
      'Initial access vector: Spear phishing email with spoofed CEO sender (ceo-nexuscorp@mail.ru)',
      'Attacker dwell time: Approximately 2 hours from initial compromise to data exfiltration',
      'Critical detection gap: C2 beacon ran from 09:22 to 11:31 (2+ hours) without network monitoring detection',
      'Privilege escalation: Kerberoasting attack against domain controller at 10:05',
      'Data loss: 4.7 GB of HR payroll and contract files exfiltrated to bulletproof hosting'
    ].forEach(finding => {
      const li = document.createElement('li');
      li.textContent = finding;
      fList.appendChild(li);
    });
    findingsSection.appendChild(fList);
    reportBody.appendChild(findingsSection);

    // Recommended controls (based on team picks)
    const controlsSection = document.createElement('div');
    controlsSection.className = 'report-section';
    const cH3 = document.createElement('h3');
    cH3.textContent = 'Recommended Controls';
    controlsSection.appendChild(cH3);

    const pickedCorrect = [];
    const pickedWrong = [];
    const missedCorrect = [];

    MITIGATIONS.forEach(m => {
      const wasSelected = selectedMitigations.has(m.id);
      if (wasSelected && m.correct) pickedCorrect.push(m);
      else if (wasSelected && !m.correct) pickedWrong.push(m);
      else if (!wasSelected && m.correct) missedCorrect.push(m);
    });

    if (pickedCorrect.length > 0) {
      const goodP = document.createElement('p');
      goodP.style.color = 'var(--accent)';
      goodP.textContent = `Correctly identified: ${pickedCorrect.map(m => m.name).join(', ')}`;
      controlsSection.appendChild(goodP);
    }
    if (pickedWrong.length > 0) {
      const badP = document.createElement('p');
      badP.style.color = 'var(--danger)';
      badP.textContent = `Suboptimal picks: ${pickedWrong.map(m => m.name).join(', ')}`;
      controlsSection.appendChild(badP);
    }
    if (missedCorrect.length > 0) {
      const missP = document.createElement('p');
      missP.style.color = 'var(--warn)';
      missP.textContent = `Missed: ${missedCorrect.map(m => m.name).join(', ')}`;
      controlsSection.appendChild(missP);
    }
    reportBody.appendChild(controlsSection);

    // Investigation score
    const scoreSection = document.createElement('div');
    scoreSection.className = 'report-section';
    const sH3 = document.createElement('h3');
    sH3.textContent = 'Investigation Performance';
    scoreSection.appendChild(sH3);

    const scoreList = document.createElement('ul');
    const tlCorrect = state.partACorrect || 0;
    const qCorrect = Object.values(state.partBAnswers || {}).filter(a => a.correct).length;
    const qTotal = QUESTIONS.length;
    const mCorrect = pickedCorrect.length;

    [
      `Timeline Analysis: ${tlCorrect}/5 events placed correctly`,
      `Evidence Review: ${qCorrect}/${qTotal} questions answered correctly`,
      `Incident Response: ${mCorrect}/2 controls correctly identified`,
      `Final Score: ${window.utils?.points?.get?.() || '---'} points`
    ].forEach(line => {
      const li = document.createElement('li');
      li.textContent = line;
      scoreList.appendChild(li);
    });
    scoreSection.appendChild(scoreList);
    reportBody.appendChild(scoreSection);
  }

  function makeReportSection(title, text) {
    const section = document.createElement('div');
    section.className = 'report-section';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    section.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = text;
    section.appendChild(p);
    return section;
  }

  // ---------- Completion ----------
  function completePuzzle() {
    if (state.complete) return;

    // Safety check: only complete if ALL three parts are genuinely done
    if (!state.partADone || !state.partBDone || !state.partCDone) return;

    state.complete = true;
    saveState();

    // Generate and show incident report
    generateIncidentReport();
    if (incidentReport) incidentReport.removeAttribute('hidden');

    // Update vault display in scenario banner
    if (vaultDisplay) vaultDisplay.textContent = CODE_WORD;

    // Store code word
    try {
      localStorage.setItem('vault_word_forensics', CODE_WORD);
    } catch (_) {}

    // Set progress
    window.utils?.setProgressPercent?.(PUZZLE_KEY, 100, { complete: true });
    window.utils?.setProgressFlag?.(PUZZLE_KEY, true);
    window.stateSync?.queueSave?.('forensics-complete');

    // Unlock vault
    window.vault?.unlock(PUZZLE_KEY, CODE_WORD, {
      message: 'Code word CIPHER secured.'
    });

    announce('Investigation complete! Code word CIPHER secured.');

    incidentReport?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Feedback helper ----------
  function setFeedback(el, text, tone) {
    if (!el) return;
    el.textContent = text;
    el.className = 'status-message';
    if (tone === 'ok') { el.classList.add('ok'); el.dataset.tone = 'success'; }
    else if (tone === 'warn') { el.classList.add('warn'); el.dataset.tone = 'warn'; }
    else if (tone === 'info') { el.dataset.tone = 'info'; }
    else { delete el.dataset.tone; }
  }

  // ---------- Init ----------
  let hintIndex = 0;

  function init() {
    // Status HUD
    window.utils?.initStatusHud?.(PUZZLE_KEY, {
      score: '#forensicsPointsTotal',
      delta: '#forensicsPointsDelta',
      progressFill: '#forensicsProgressFill',
      progressLabel: '#forensicsProgressText'
    });

    // Check if already complete via the authoritative progress flag ONLY.
    // Do NOT use state.complete — stale localStorage state could be true
    // even if progress was reset by an admin. The progress flag is the
    // single source of truth for completion.
    if (isAlreadyComplete()) {
      showCompletedState();
      return;
    }

    // If local state says complete but progress flag disagrees, clear it
    if (state.complete && !isAlreadyComplete()) {
      state.complete = false;
      saveState();
    }

    // Render evidence panels for all questions
    renderEvidencePanels();

    // Part A hint button (two-tier)
    if (partAHint) {
      partAHint.addEventListener('click', () => {
        const tier = state.hintTiers['partA'] || 0;

        if (tier === 0 && hintIndex < TIMELINE_HINTS_BASIC.length) {
          window.utils?.points?.spend(HINT_BASIC, 'Timeline hint (basic)');
          setFeedback(partAFeedback, TIMELINE_HINTS_BASIC[hintIndex], 'info');
          announce(`Hint: ${TIMELINE_HINTS_BASIC[hintIndex]}`);
          hintIndex++;
          if (hintIndex >= TIMELINE_HINTS_BASIC.length) {
            state.hintTiers['partA'] = 1;
            saveState();
            partAHint.textContent = 'Detailed Hint (-10 pts)';
            hintIndex = 0;
          }
        } else {
          if (hintIndex < TIMELINE_HINTS_DETAILED.length) {
            window.utils?.points?.spend(HINT_DETAILED, 'Timeline hint (detailed)');
            setFeedback(partAFeedback, TIMELINE_HINTS_DETAILED[hintIndex], 'info');
            announce(`Detailed hint: ${TIMELINE_HINTS_DETAILED[hintIndex]}`);
            hintIndex++;
            if (hintIndex >= TIMELINE_HINTS_DETAILED.length) {
              partAHint.disabled = true;
            }
          } else {
            partAHint.disabled = true;
          }
        }
      });
    }

    // Part A submit
    if (partASubmit) {
      partASubmit.addEventListener('click', checkTimeline);
    }

    // Part A -> Part B continue
    if (partANext) {
      partANext.addEventListener('click', () => {
        if (partB) partB.removeAttribute('hidden');
        showQuestion(currentQuestion);
        partB?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // Part B -> Part C continue
    if (partBNext) {
      partBNext.addEventListener('click', () => {
        if (partC) partC.removeAttribute('hidden');
        partC?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // Setup question handlers
    setupQuestionHandlers();

    // Setup mitigation handlers (renders cards from data)
    setupMitigationHandlers();

    // Restore state
    if (state.partADone) {
      // Ensure slot assignments exist for results render
      if (Object.keys(state.slotAssignments).length === 0) {
        DRAGGABLES.forEach(evt => {
          state.slotAssignments[evt.order] = evt.id;
        });
      }
      renderTimeline(true);
      renderStaging(true);
      if (partASubmit) partASubmit.disabled = true;
      if (partAHint) partAHint.disabled = true;
      if (partAContinue) partAContinue.removeAttribute('hidden');
      if (partAResult) partAResult.textContent = `${state.partACorrect}/5 correct`;
      const badge = $('#partABadge');
      if (badge) badge.classList.add('done');

      window.utils?.setProgressPercent?.(PUZZLE_KEY, 33);

      // Show Part B
      if (partB) partB.removeAttribute('hidden');

      if (state.partBDone) {
        const total = QUESTIONS.length;
        for (let i = 1; i <= total; i++) {
          const block = $(`#questionBlock${i}`);
          if (block) block.removeAttribute('hidden');
        }
        QUESTIONS.forEach(q => showQuestionResult(q));
        if (partBContinue) partBContinue.removeAttribute('hidden');
        const correctCount = Object.values(state.partBAnswers).filter(a => a.correct).length;
        if (partBResult) partBResult.textContent = `${correctCount}/${total} correct`;
        const badge2 = $('#partBBadge');
        if (badge2) badge2.classList.add('done');

        window.utils?.setProgressPercent?.(PUZZLE_KEY, 66);

        // Show Part C
        if (partC) partC.removeAttribute('hidden');

        if (state.partCDone) {
          // All three parts done in state — complete the puzzle
          completePuzzle();
        }
      } else {
        showQuestion(currentQuestion);
      }
    } else {
      renderTimeline();
      renderStaging();
    }
  }

  function showCompletedState() {
    state.complete = true;

    if (vaultDisplay) vaultDisplay.textContent = CODE_WORD;

    // Mark all parts done visually
    ['partABadge', 'partBBadge', 'partCBadge'].forEach(id => {
      const badge = $(`#${id}`);
      if (badge) badge.classList.add('done');
    });

    // Fill in correct timeline for display
    DRAGGABLES.forEach(evt => {
      state.slotAssignments[evt.order] = evt.id;
    });

    // Part A: show completed timeline
    const partA = $('#partA');
    if (partA) {
      partA.classList.add('is-complete');
      $$('button', partA).forEach(b => { b.disabled = true; });
    }
    renderTimeline(true);
    renderStaging(true);

    // Part B: show all questions with results
    if (partB) {
      partB.removeAttribute('hidden');
      partB.classList.add('is-complete');
      const total = QUESTIONS.length;
      for (let i = 1; i <= total; i++) {
        const block = $(`#questionBlock${i}`);
        if (block) block.removeAttribute('hidden');
      }
      $$('button', partB).forEach(b => { b.disabled = true; });
      $$('input', partB).forEach(inp => { inp.disabled = true; });

      // Render evidence panels first
      renderEvidencePanels();

      QUESTIONS.forEach(q => {
        if (q.type === 'mc') {
          const optionsEl = $(`#q${q.id}Options`);
          if (optionsEl) {
            $$('.answer-card', optionsEl).forEach(card => {
              card.disabled = true;
              if (card.dataset.answer === q.correct) card.classList.add('is-correct');
            });
          }
        }
        const explanationEl = $(`#q${q.id}Explanation`);
        if (explanationEl) {
          explanationEl.removeAttribute('hidden');
          explanationEl.innerHTML = '';
          const box = document.createElement('div');
          box.className = 'explanation-box';
          const h3 = document.createElement('h3');
          h3.textContent = 'Explanation';
          const p = document.createElement('p');
          p.textContent = q.explanation;
          box.appendChild(h3);
          box.appendChild(p);
          explanationEl.appendChild(box);
        }
      });
    }

    // Part C: show correct mitigations
    if (partC) {
      partC.removeAttribute('hidden');
      partC.classList.add('is-complete');
      renderMitigationCards();
      $$('.mitigation-card', partC).forEach(card => {
        card.disabled = true;
        if (CORRECT_MITIGATIONS.has(card.dataset.mitigation)) {
          card.classList.add('is-correct');
        }
      });
      $$('button', partC).forEach(b => { b.disabled = true; });
    }

    // Show incident report
    generateIncidentReport();
    if (incidentReport) incidentReport.removeAttribute('hidden');

    window.utils?.setProgressPercent?.(PUZZLE_KEY, 100);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
