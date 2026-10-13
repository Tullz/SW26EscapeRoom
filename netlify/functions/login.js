import { createClient, errorResponse } from './_shared/db.js';
import bcrypt from 'bcryptjs';
import { signAdminToken } from './_shared/admin-token.js';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return Response.json({ ok: false, error: 'Missing credentials' }, { status: 400 });
  }

  let client;
  try {
    client = createClient();
    await client.connect();
    const { rows } = await client.query(
      'select username, role, password_hash from users where lower(username)=lower($1) limit 1',
      [username]
    );
    if (!rows.length) {
      return Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }
    const user = { username: String(u.username).toLowerCase(), role: u.role };
    if (u.role !== 'admin') return Response.json({ ok: true, user });
    // Admins also get a signed token; the game clock (game.js POST) requires it.
    const token = signAdminToken(u.username);
    if (!token) console.warn('[login] ADMIN_TOKEN_SECRET / ADMIN_SEED_TOKEN not set: no admin token issued');
    return Response.json(token ? { ok: true, user, token } : { ok: true, user });
  } catch (e) {
    console.error('[login] authentication failed', e);
    return errorResponse(500, { ok: false, error: e.message || 'Login failed' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
