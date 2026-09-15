import { createClient } from './_shared/db.js';
import bcrypt from 'bcryptjs';

export default async (req, context) => {
  const tokenHeader = req.headers.get('x-seed-token') || '';
  const tokenEnv = process.env.ADMIN_SEED_TOKEN || '';
  if (!tokenEnv || tokenHeader !== tokenEnv) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEON_DATABASE_URL;
  const plain = process.env.ADMIN_SEED_PASSWORD;
  if (!url)   return Response.json({ ok: false, error: 'NEON_DATABASE_URL not set' }, { status: 500 });
  if (!plain) return Response.json({ ok: false, error: 'ADMIN_SEED_PASSWORD not set' }, { status: 500 });

  let client;
  try {
    client = createClient();
    await client.connect();
    await client.query(`
      create table if not exists users (
        username text primary key,
        role text not null,
        password_hash text not null
      )
    `);

    const existing = await client.query('select 1 from users where username=$1 limit 1', ['admin']);
    if (existing.rowCount) return Response.json({ ok: false, error: 'admin already exists; refusing to overwrite' }, { status: 409 });

    const hash = await bcrypt.hash(plain, Number(process.env.BCRYPT_ROUNDS) || 12);
    await client.query(
      `insert into users (username, role, password_hash) values ($1,'admin',$2)`,
      ['admin', hash]
    );
    return Response.json({ ok: true, user: 'admin' });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
