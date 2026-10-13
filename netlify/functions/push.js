import { createClient, ensureTeamStateTable, dbNowMs, DEFAULT_PROGRESS, errorResponse } from './_shared/db.js';
import { mergeStates } from './_shared/merge.js';
import { stampVault } from './_shared/stamps.js';

function sanitizeRow(row = {}) {
  const progress = { ...DEFAULT_PROGRESS };
  Object.keys(DEFAULT_PROGRESS).forEach(key => {
    progress[key] = !!row?.progress?.[key];
  });

  const progressMeta = {};
  if (row.progressMeta && typeof row.progressMeta === 'object') {
    Object.entries(row.progressMeta).forEach(([key, value]) => {
      const percent = Math.max(0, Math.min(100, Math.round(Number(value?.percent ?? value ?? 0))));
      const updatedAt = Number(value?.updatedAt ?? Date.now());
      progressMeta[key] = {
        percent: Number.isFinite(percent) ? percent : 0,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
      };
    });
  }

  const times = Array.isArray(row.times)
    ? row.times.map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0)
    : [];

  const score = Number.isFinite(row.score) ? Math.max(0, Math.round(row.score)) : 100;

  const scoreLog = Array.isArray(row.scoreLog)
    ? row.scoreLog.map(entry => ({
        delta: Number.isFinite(entry?.delta) ? Math.round(entry.delta) : 0,
        total: Number.isFinite(entry?.total) ? Math.max(0, Math.round(entry.total)) : score,
        reason: entry?.reason || 'update',
        at: Number.isFinite(entry?.at) ? entry.at : Date.now()
      }))
    : [];

  const activity = Array.isArray(row.activity)
    ? row.activity.map(entry => ({
        type: entry?.type || 'event',
        detail: entry?.detail || '',
        puzzle: entry?.puzzle || null,
        status: entry?.status || null,
        delta: Number.isFinite(entry?.delta) ? Number(entry.delta) : null,
        total: Number.isFinite(entry?.total) ? Number(entry.total) : null,
        reason: entry?.reason || null,
        at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
      }))
    : [];

  const endless = Array.isArray(row.endless)
    ? row.endless.map(entry => ({
        name: String(entry?.name || 'Anonymous').slice(0, 80),
        score: Number.isFinite(entry?.score) ? Math.max(0, Math.round(entry.score)) : 0,
        level: Number.isFinite(entry?.level) ? Math.max(1, Math.round(entry.level)) : 1,
        at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
      }))
    : [];

  const bonus = row.bonus && typeof row.bonus === 'object' ? row.bonus : {};
  const vault = row.vault && typeof row.vault === 'object' ? row.vault : {};
  return { progress, progressMeta, times, score, scoreLog, activity, endless, bonus, vault };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await req.json().catch(() => ({}));
  const teams = Array.isArray(body.teams) ? body.teams : [];

  let client;
  try {
    client = createClient();
    await client.connect();
    await ensureTeamStateTable(client);
    for (const raw of teams) {
      const team = String(raw?.team || '').trim().toLowerCase();
      if (!team) continue;
      let sanitized = sanitizeRow(raw);
      await client.query('begin');
      try {
        // A new resetVersion (admin "Reset all teams", or a single-team reset) replaces the row.
        // The same resetVersion (admin "Push to Neon" from a possibly stale dashboard copy) is
        // merged, so it can't undo a room a team completed since the dashboard last pulled.
        const { rows } = await client.query('select * from team_state where team = $1 limit 1 for update', [team]);
        const stored = rows[0];
        const storedReset = Number(stored?.vault?.resetVersion || 0);
        const incomingReset = Number(sanitized.vault?.resetVersion || 0);
        let priorVault = {};
        if (stored && storedReset === incomingReset) {
          const current = sanitizeRow({
            progress: stored.progress, progressMeta: stored.progress_meta, times: stored.times, score: stored.score,
            scoreLog: stored.score_log, activity: stored.activity, endless: stored.endless, bonus: stored.bonus, vault: stored.vault
          });
          const merged = mergeStates(current, sanitized, { score: 'local', endless: 'local' });
          sanitized = sanitizeRow({ ...merged, bonus: sanitized.bonus });
          priorVault = stored.vault;
        }
        // solvedAt / openedAt: the server's own clock (admin "mark complete" stamps now, a reopen
        // or reset removes the stamp); stamps sent by the dashboard are ignored.
        sanitized.vault = stampVault(sanitized.vault, sanitized.progress, priorVault, await dbNowMs(client));
        await client.query(
          `insert into team_state (team, progress, progress_meta, times, score, score_log, activity, endless, bonus, vault, updated_at)
           values ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb, now())
           on conflict (team) do update set
             progress = excluded.progress,
             progress_meta = excluded.progress_meta,
             times = excluded.times,
             score = excluded.score,
             score_log = excluded.score_log,
             activity = excluded.activity,
             endless = excluded.endless,
             bonus = excluded.bonus,
             vault = excluded.vault,
             updated_at = now()`,
          // pg would send JS arrays as Postgres arrays, not JSON, so serialise jsonb values explicitly.
          [team, JSON.stringify(sanitized.progress), JSON.stringify(sanitized.progressMeta), JSON.stringify(sanitized.times), sanitized.score, JSON.stringify(sanitized.scoreLog), JSON.stringify(sanitized.activity), JSON.stringify(sanitized.endless), JSON.stringify(sanitized.bonus), JSON.stringify(sanitized.vault)]
        );
        await client.query('commit');
      } catch (err) {
        try { await client.query('rollback'); } catch (_) {}
        throw err;
      }
    }

    return Response.json({ ok: true, updated: teams.length });
  } catch (e) {
    console.error('[push] failed to sync teams', e);
    return errorResponse(500, { ok: false, error: e.message || 'Push failed' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
