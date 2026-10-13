/* celebration.js — the results page shown after a team cracks the vault
   - Score breakdown and total from window.scoring.compute (same formula as the hub and admin)
   - "Cracked in mm:ss" when the facilitator ran the clock; nothing about time in free roam
   - Links to the bonus room (Network Forensics) and back to the Mission Hub
   Updates live when the server's openedAt stamp arrives (state-sync) or the clock changes.
*/

(function () {
  'use strict';

  const CORE_ROOMS = ['phishing', 'osint', 'incident', 'mfa', 'crypto'];
  const BONUS_ROOM = 'forensics';

  const $ = (s) => document.querySelector(s);

  function readUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }

  function readProgress() {
    try {
      return JSON.parse(localStorage.getItem(`${readUser()?.username || 'team'}_progress`) || '{}') || {};
    } catch {
      return {};
    }
  }

  function hasVaultAccess() {
    try {
      if (window.vault?.isVaultOpened?.() === true) return true;
    } catch (_) {}
    try {
      return localStorage.getItem('vault_opened') === '1';
    } catch {
      return false;
    }
  }

  // Set by the hub the moment the vault was cracked; used until the server stamps openedAt.
  function readProvisional() {
    try {
      const v = Number(sessionStorage.getItem(`${readUser()?.username || 'team'}_vault_cracked_at`));
      return v > 0 ? v : null;
    } catch (_) { return null; }
  }

  function readPoints() {
    try {
      const v = Number(window.utils?.points?.get?.());
      return Number.isFinite(v) ? v : null;
    } catch (_) { return null; }
  }

  function currentGame() {
    try { return window.gameClock?.get?.() || null; } catch (_) { return null; }
  }

  // Same team shape the hub builds: local OR synced progress, running score, server stamps.
  function teamSnapshot() {
    const local = readProgress();
    const remote = window.stateSync?.lastRemote || null;
    const progress = {};
    [...CORE_ROOMS, BONUS_ROOM].forEach(k => {
      progress[k] = local[k] === true || remote?.progress?.[k] === true;
    });
    const rv = remote?.vault || {};
    return {
      progress,
      score: readPoints(),
      vault: { opened: hasVaultAccess(), openedAt: rv.openedAt ?? null, solvedAt: rv.solvedAt || {} }
    };
  }

  function setText(sel, value) {
    const node = $(sel);
    if (node) node.textContent = value;
  }

  function render() {
    const scoring = window.scoring;
    const team = teamSnapshot();
    setText('#celeTeam', String(readUser()?.username || 'TEAM').toUpperCase());

    const bonusBtn = $('#celeBonusBtn');
    if (bonusBtn && team.progress[BONUS_ROOM]) {
      bonusBtn.textContent = '';
      bonusBtn.append(document.createTextNode('Bonus room done! Visit it again '));
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      bonusBtn.appendChild(arrow);
    }

    if (typeof scoring?.compute !== 'function') {
      // No scoring.js: show the running score only, nothing invented.
      const pts = readPoints() ?? 100;
      setText('#celePot', String(pts));
      setText('#celeTotal', String(pts));
      return;
    }

    const game = currentGame();
    const timed = game?.mode === 'competition';
    let r;
    try {
      r = scoring.compute(team, game, { provisionalOpenedAt: readProvisional() });
    } catch (err) {
      console.warn('[celebration] could not compute the score', err);
      return;
    }
    const c = scoring.CONFIG;

    setText('#celePot', String(r.pot));
    setText('#celeRooms', `+${r.roomPoints}`);
    setText('#celeRoomsNote', `${r.roomsSolved} of ${c.coreRooms.length} · +${c.roomPoints} each`);
    setText('#celeVault', `+${r.vaultPoints}`);
    setText('#celeTotal', String(r.total));

    // Time: only in a timed game (competition mode); never in free roam.
    const timeRow = $('#celeTimeRow');
    if (timeRow) timeRow.hidden = !timed;
    if (timed) {
      setText('#celeTimeBonus', `+${r.timeBonus}`);
      setText('#celeTimeNote', r.minutesLeft != null
        ? `${r.minutesLeft} min left × ${c.timeBonusPerMinute}`
        : `+${c.timeBonusPerMinute} per whole minute left`);
    }
    const timeChip = $('#celeTime');
    const showTime = timed && r.finishMs != null;
    if (timeChip) timeChip.hidden = !showTime;
    if (showTime) setText('#celeTimeValue', scoring.fmtDuration(r.finishMs));

    const notes = $('#celeNotes');
    if (notes) {
      notes.hidden = !r.notes.length;
      notes.textContent = r.notes.length ? `Note: ${r.notes.join('. ')}.` : '';
    }
  }

  // A short burst of confetti (skipped by CSS when the player prefers reduced motion).
  function confetti() {
    const box = $('#confetti');
    if (!box || box.childElementCount) return;
    const colours = ['#09ff88', '#58a6ff', '#ffc457', '#d2a8ff', '#ff7b72'];
    for (let i = 0; i < 48; i++) {
      const bit = document.createElement('i');
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = colours[i % colours.length];
      bit.style.setProperty('--delay', `${(Math.random() * 1.2).toFixed(2)}s`);
      bit.style.setProperty('--dur', `${(2.6 + Math.random() * 2).toFixed(2)}s`);
      bit.style.setProperty('--drift', `${Math.round((Math.random() - .5) * 160)}px`);
      bit.style.setProperty('--spin', `${Math.round(360 + Math.random() * 540)}deg`);
      box.appendChild(bit);
    }
    setTimeout(() => { box.textContent = ''; }, 6000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!hasVaultAccess()) {
      window.location.replace('game.html');
      return;
    }
    render();
    confetti();
    window.addEventListener('state-sync:applied', render);
    window.addEventListener('score:change', render);
    window.addEventListener('game:change', render);
  });
})();
