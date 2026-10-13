/* scoring.js — the one scoring formula for Cyber Escape Rooms (hub, results page, admin)

   Total = points kept + room points + vault points + time bonus
   - points kept:  the team's running score (starts at 100; hints and mistakes subtract; floor 0)
   - room points:  CONFIG.roomPoints for each core room solved
   - vault points: CONFIG.vaultPoints once the vault is cracked
   - time bonus:   CONFIG.timeBonusPerMinute for each whole minute left on the clock when the
                   vault was cracked (competition mode only)

   In competition mode a room only counts if the server stamped it solved before the clock ran
   out, and the vault/time bonus only count if it was opened while the clock was running.
   Times come from the server (vault.solvedAt / vault.openedAt), never from a team's device.

   Pure functions: no DOM, no storage, no other scripts needed (the admin page loads it too).
*/

(function () {
  'use strict';

  const CONFIG = Object.freeze({
    roomPoints: 20,
    vaultPoints: 50,
    timeBonusPerMinute: 2,
    durationMin: 60,
    coreRooms: Object.freeze(['phishing', 'osint', 'incident', 'mfa', 'crypto']),
    bonusRoom: 'forensics'
  });

  const MINUTE = 60000;

  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const ms = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

  // The clock window, or null when there is no running/finished competition clock.
  //   endsAt:       when play stopped counting (the facilitator's early "End" if pressed)
  //   scheduledEnd: the full-length end; minutes left are counted against this, so ending the
  //                 game early never takes a time bonus away from a team that already finished.
  function clockWindow(game) {
    const g = obj(game);
    if (g.mode !== 'competition') return null;
    const startedAt = ms(g.startedAt);
    if (!startedAt) return null;
    const durationMin = Number(g.durationMin) > 0 ? Number(g.durationMin) : CONFIG.durationMin;
    const scheduledEnd = startedAt + durationMin * MINUTE;
    const endedAt = ms(g.endedAt);
    const endsAt = endedAt ? Math.min(endedAt, scheduledEnd) : scheduledEnd;
    return { startedAt, endsAt, scheduledEnd, durationMin };
  }

  // team = { progress, score, vault: { opened, openedAt, solvedAt } } (the server row shape)
  // game = { mode, status, startedAt, endedAt, endsAt, durationMin } or null (free roam)
  function compute(team, game, opts) {
    const t = obj(team);
    const progress = obj(t.progress);
    const vault = obj(t.vault);
    const solvedAt = obj(vault.solvedAt);
    const clock = clockWindow(game);
    const notes = [];

    const score = Number(t.score);
    const pot = Number.isFinite(score) ? Math.max(0, Math.round(score)) : 100;

    let roomsSolved = 0;
    CONFIG.coreRooms.forEach((room) => {
      if (progress[room] !== true) return;
      const at = ms(solvedAt[room]);
      if (clock && at && at > clock.endsAt) return; // solved after time ran out
      roomsSolved++;
    });
    const roomPoints = roomsSolved * CONFIG.roomPoints;

    const opened = vault.opened === true;
    const openedAt = opened ? (ms(vault.openedAt) || ms(obj(opts).provisionalOpenedAt)) : null;
    let vaultCracked = opened;
    let minutesLeft = null;
    let timeBonus = 0;
    if (opened && clock && openedAt) {
      if (openedAt > clock.endsAt) {
        vaultCracked = false;
        notes.push('Vault opened after time ran out');
      } else if (openedAt < clock.startedAt) {
        notes.push('Vault opened before the clock started');
      } else {
        minutesLeft = Math.max(0, Math.min(clock.durationMin, Math.floor((clock.scheduledEnd - openedAt) / MINUTE)));
        timeBonus = minutesLeft * CONFIG.timeBonusPerMinute;
      }
    }
    const vaultPoints = vaultCracked ? CONFIG.vaultPoints : 0;

    const finishMs = vaultCracked && clock && openedAt && openedAt >= clock.startedAt
      ? openedAt - clock.startedAt
      : null;

    return {
      pot,
      roomsSolved,
      roomPoints,
      vaultCracked,
      vaultPoints,
      minutesLeft,
      timeBonus,
      total: pot + roomPoints + vaultPoints + timeBonus,
      finishMs,
      openedAt: vaultCracked ? openedAt : null,
      bonusDone: progress[CONFIG.bonusRoom] === true,
      notes
    };
  }

  // rows: [{ team, result }] where result = compute(...). Highest total first; ties go to the
  // team that cracked the vault first, then more rooms solved, then name.
  function rank(rows) {
    return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
      const ra = obj(a && a.result);
      const rb = obj(b && b.result);
      const byTotal = (Number(rb.total) || 0) - (Number(ra.total) || 0);
      if (byTotal) return byTotal;
      const oa = ms(ra.openedAt) || Infinity;
      const ob = ms(rb.openedAt) || Infinity;
      if (oa !== ob) return oa < ob ? -1 : 1;
      const byRooms = (Number(rb.roomsSolved) || 0) - (Number(ra.roomsSolved) || 0);
      if (byRooms) return byRooms;
      return String(a && a.team || '').localeCompare(String(b && b.team || ''));
    });
  }

  // 'mm:ss', or 'h:mm:ss' from one hour; '—' when there is nothing to show.
  function fmtDuration(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const total = Math.max(0, Math.floor(Number(value) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  window.scoring = { CONFIG, compute, rank, fmtDuration };
})();
