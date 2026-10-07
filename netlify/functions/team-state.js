import { createClient, ensureTeamStateTable, DEFAULT_PROGRESS, errorResponse } from './_shared/db.js';
import { mergeStates } from './_shared/merge.js';

function normalizeProgress(raw) {
  const cleaned = { ...DEFAULT_PROGRESS };
  Object.keys(DEFAULT_PROGRESS).forEach(key => {
    cleaned[key] = !!raw?.[key];
  });
  return cleaned;
}

function normalizeProgressMeta(raw) {
  const meta = {};
  if (!raw || typeof raw !== 'object') return meta;
  Object.entries(raw).forEach(([key, value]) => {
    const percent = Math.max(0, Math.min(100, Math.round(Number(value?.percent ?? value ?? 0))));
    const updatedAt = Number(value?.updatedAt ?? Date.now());
    meta[key] = {
      percent: Number.isFinite(percent) ? percent : 0,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
    };
  });
  return meta;
}

function normalizeTimes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);
}

function normalizeScore(raw) {
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 100;
}

function normalizeScoreLog(raw, fallbackTotal) {
  if (!Array.isArray(raw)) return [];
  return raw.map(entry => ({
    delta: Number.isFinite(entry?.delta) ? Math.round(entry.delta) : 0,
    total: Number.isFinite(entry?.total) ? Math.max(0, Math.round(entry.total)) : fallbackTotal,
    reason: entry?.reason || 'update',
    at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
  }));
}

function normalizeActivity(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(entry => ({
    type: entry?.type || 'event',
    detail: entry?.detail || '',
    puzzle: entry?.puzzle || null,
    status: entry?.status || null,
    delta: Number.isFinite(entry?.delta) ? Number(entry.delta) : null,
    total: Number.isFinite(entry?.total) ? Number(entry.total) : null,
    reason: entry?.reason || null,
    at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
  }));
}

function normalizeEndless(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(entry => ({
    name: String(entry?.name || 'Anonymous').slice(0, 80),
    score: Number.isFinite(entry?.score) ? Math.max(0, Math.round(entry.score)) : 0,
    level: Number.isFinite(entry?.level) ? Math.max(1, Math.round(entry.level)) : 1,
    at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
  }));
}

const respond = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});

function sanitizePayload(body = {}) {
  const progress = normalizeProgress(body.progress);
  const progressMeta = normalizeProgressMeta(body.progressMeta);
  const times = normalizeTimes(body.times);
  const score = normalizeScore(body.score);
  const scoreLog = normalizeScoreLog(body.scoreLog, score);
  const activity = normalizeActivity(body.activity);
  const endless = normalizeEndless(body.endless);
  const vault = body.vault && typeof body.vault === 'object' ? body.vault : {};
  return { progress, progress_meta: progressMeta, times, score, score_log: scoreLog, activity, endless, vault };
}

function normalizeState(row) {
  if (!row) return null;
  const sanitized = sanitizePayload({
    progress: row.progress,
    progressMeta: row.progress_meta,
    times: row.times,
    score: row.score,
    scoreLog: row.score_log,
    activity: row.activity,
    endless: row.endless,
    vault: row.vault
  });
  return {
    team: row.team,
    progress: sanitized.progress,
    progressMeta: sanitized.progress_meta,
    times: sanitized.times,
    score: sanitized.score,
    scoreLog: sanitized.score_log,
    activity: sanitized.activity,
    endless: sanitized.endless,
    vault: sanitized.vault,
    updatedAt: row.updated_at || null
  };
}

export default async (req) => {
  let client;
  try {
    client = createClient();
    await client.connect();
    await ensureTeamStateTable(client);
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const team = url.searchParams.get('team');
      if (!team) return respond(400, { ok: false, error: 'Missing team parameter' });
      const teamKey = team.trim().toLowerCase();
      if (!teamKey) return respond(400, { ok: false, error: 'Invalid team parameter' });
      const { rows } = await client.query('select * from team_state where team = $1 limit 1', [teamKey]);
      if (rows.length) {
        return respond(200, { ok: true, state: normalizeState(rows[0]) });
      }
      const defaults = sanitizePayload({});
      await client.query(
        `insert into team_state (team, progress, progress_meta, times, score, score_log, activity, endless, vault, updated_at)
         values ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb, now())
         on conflict (team) do nothing`,
        [
          teamKey,
          JSON.stringify(defaults.progress),
          JSON.stringify(defaults.progress_meta),
          JSON.stringify(defaults.times),
          defaults.score,
          JSON.stringify(defaults.score_log),
          JSON.stringify(defaults.activity),
          JSON.stringify(defaults.endless),
          JSON.stringify(defaults.vault)
        ]
      );
      return respond(200, { ok: true, state: normalizeState({ team: teamKey, ...defaults }) });
    }

    if (req.method === 'PUT') {
      const body = await req.json().catch((err) => {
        console.error('[team-state] invalid JSON body', err);
        return null;
      });
      if (!body || typeof body !== 'object') {
        return respond(400, { ok: false, error: 'Invalid JSON payload' });
      }
      const team = String(body.team || '').trim().toLowerCase();
      if (!team) return respond(400, { ok: false, error: 'Missing team' });
      const incoming = sanitizePayload(body);
      // Read-merge-write under a row lock so two sessions pushing at once can't drop each other's changes.
      await client.query('begin');
      try {
        const { rows: existing } = await client.query('select * from team_state where team = $1 limit 1 for update', [team]);
        const storedRow = existing[0] || null;
        // Reject pushes from a client that hasn't applied the latest admin reset yet,
        // otherwise its stale local progress would overwrite the reset.
        const storedReset = Number(storedRow?.vault?.resetVersion || 0);
        const incomingReset = Number(incoming.vault?.resetVersion || 0);
        if (storedReset > incomingReset) {
          await client.query('rollback');
          return respond(409, { ok: false, error: 'Team was reset; pull latest state first', resetVersion: storedReset });
        }
        let next = incoming;
        if (storedRow && incomingReset === storedReset) {
          // Same reset epoch: merge, so a session holding an older copy can never undo a
          // completion, a code word or a points change made elsewhere. A newer resetVersion
          // (admin reset) replaces the row instead.
          const merged = mergeStates(normalizeState(storedRow), {
            progress: incoming.progress,
            progressMeta: incoming.progress_meta,
            times: incoming.times,
            score: incoming.score,
            scoreLog: incoming.score_log,
            activity: incoming.activity,
            endless: incoming.endless,
            vault: incoming.vault
          }, { score: body.source === 'admin' ? 'local' : 'merge', endless: 'local' });
          next = sanitizePayload(merged);
        }
        const values = [
          team,
          JSON.stringify(next.progress),
          JSON.stringify(next.progress_meta),
          JSON.stringify(next.times),
          next.score,
          JSON.stringify(next.score_log),
          JSON.stringify(next.activity),
          JSON.stringify(next.endless),
          JSON.stringify(next.vault)
        ];
        await client.query(
          `insert into team_state (team, progress, progress_meta, times, score, score_log, activity, endless, vault, updated_at)
           values ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb, now())
           on conflict (team) do update set
             progress = excluded.progress,
             progress_meta = excluded.progress_meta,
             times = excluded.times,
             score = excluded.score,
             score_log = excluded.score_log,
             activity = excluded.activity,
             endless = excluded.endless,
             vault = excluded.vault,
             updated_at = now()`,
          values
        );
        await client.query('commit');
        // Hand the stored (merged) state back so the pushing session is up to date at once.
        return respond(200, { ok: true, state: normalizeState({ team, ...next, updated_at: new Date().toISOString() }) });
      } catch (err) {
        try { await client.query('rollback'); } catch (_) {}
        throw err;
      }
    }

    return respond(405, { ok: false, error: 'Method Not Allowed' });
  } catch (e) {
    console.error('[team-state] request failed', e);
    return respond(500, { ok: false, error: e.message || 'Team state failure' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
