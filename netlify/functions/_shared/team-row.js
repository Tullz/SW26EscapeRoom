// A team's team_state row <-> the state shape the browser sees. Used by team-state.js and
// vault.js (push.js and pull.js keep their own, admin-side copies).

import { DEFAULT_PROGRESS } from './db.js';

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

// Request body (or merged state, camelCase) -> row values (snake_case keys).
export function sanitizePayload(body = {}) {
  const progress = normalizeProgress(body.progress);
  const progressMeta = normalizeProgressMeta(body.progressMeta);
  const times = normalizeTimes(body.times);
  const score = normalizeScore(body.score);
  const scoreLog = normalizeScoreLog(body.scoreLog, score);
  const activity = normalizeActivity(body.activity);
  const endless = normalizeEndless(body.endless);
  const vault = body.vault && typeof body.vault === 'object' && !Array.isArray(body.vault) ? body.vault : {};
  return { progress, progress_meta: progressMeta, times, score, score_log: scoreLog, activity, endless, vault };
}

// Row (snake_case) -> the state the browser sees (camelCase).
export function normalizeState(row) {
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

// Insert or replace a team's row with sanitised values (`next` = sanitizePayload(...) shape).
export async function writeRow(client, team, next) {
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
    // pg would send JS arrays as Postgres arrays, not JSON, so serialise jsonb values explicitly.
    [
      team,
      JSON.stringify(next.progress),
      JSON.stringify(next.progress_meta),
      JSON.stringify(next.times),
      next.score,
      JSON.stringify(next.score_log),
      JSON.stringify(next.activity),
      JSON.stringify(next.endless),
      JSON.stringify(next.vault)
    ]
  );
}
