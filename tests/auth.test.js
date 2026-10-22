import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcrypt';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { initialize } from '../scripts/init-db.js';

const base = process.env.DATABASE_URL;
test('Integración de autenticación con PostgreSQL aislado', { skip: !base, timeout: 90000 }, async t => {
  const database = `test_peru_${randomBytes(8).toString('hex')}`;
  const admin = new pg.Pool({ connectionString: base });
  let pool, server;
  try {
    // Identificador generado internamente, nunca proviene de una entrada HTTP.
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(base); url.pathname = `/${database}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 5 });
    const passwords = [randomBytes(20).toString('hex'), randomBytes(20).toString('hex')];
    const config = readConfig({ DATABASE_URL: url.toString(), SESSION_SECRET: randomBytes(32).toString('hex'),
      SEED_ENABLED: 'true', SEED_USER1_PASSWORD: passwords[0], SEED_USER2_PASSWORD: passwords[1] });
    await initialize(pool, config);
    const original = (await pool.query('SELECT * FROM users ORDER BY id')).rows;
    await initialize(pool, { ...config, seedPasswords: ['different-password', 'different-password'] });
    assert.deepEqual((await pool.query('SELECT * FROM users ORDER BY id')).rows, original);
    assert.equal(await bcrypt.compare(passwords[0], original[0].password_hash), true);
    assert.notEqual(original[0].password_hash, passwords[0]);
    await initialize(pool, { ...config, seed: false, seedPasswords: [] });
    const app = await createApp(config, pool);
    server = app.listen(0, '0.0.0.0');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = () => {
      let cookie = '';
      return { get cookie() { return cookie; }, async request(path, options = {}) {
        const response = await fetch(origin + path, { redirect: 'manual', ...options,
          headers: { ...(cookie ? { cookie } : {}), ...options.headers } });
        const set = response.headers.getSetCookie();
        if (set.length) cookie = set[0].split(';')[0];
        return response;
      }};
    };
    const token = html => html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
    const login = async (b, username, password) => {
      const page = await b.request('/login');
      return b.request('/login', { method: 'POST', body: new URLSearchParams({ username, password, _csrf: token(await page.text()) }) });
    };
    await t.test('Dos usuarios, regeneración de sesión, bienvenida y logout', async () => {
      for (const [i, username] of ['demo_ana', 'demo_luis'].entries()) {
        const b = browser();
        const first = await b.request('/login');
        assert.match(first.headers.get('set-cookie'), /HttpOnly/);
        assert.match(first.headers.get('set-cookie'), /SameSite=Lax/);
        const old = b.cookie;
        const response = await login(b, username, passwords[i]);
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/welcome');
        assert.notEqual(b.cookie, old);
        const welcome = await b.request('/welcome');
        assert.equal(welcome.headers.get('cache-control'), 'no-store');
        const html = await welcome.text();
        assert.match(html, new RegExp(`Bienvenido, ${original[i].full_name}`));
        assert.match(html, /Machu Picchu/);
        const authorizedCookie = b.cookie;
        const logout = await b.request('/logout', { method: 'POST', body: new URLSearchParams({ _csrf: token(html) }) });
        assert.equal(logout.status, 302);
        const reused = await fetch(origin + '/welcome', { redirect: 'manual', headers: { cookie: authorizedCookie } });
        assert.equal(reused.headers.get('location'), '/login');
      }
    });
    await t.test('Inválidos, SQL, CSRF y rutas protegidas', async () => {
      const b = browser();
      assert.equal((await b.request('/welcome')).headers.get('location'), '/login');
      for (const [username, password] of [['demo_ana', 'incorrecta'], ['no_existe', 'incorrecta'], ["' OR 1=1 --", 'incorrecta']]) {
        const response = await login(b, username, password);
        assert.equal(response.status, 401);
        assert.match(await response.text(), /Usuario o contraseña incorrectos/);
        assert.equal((await b.request('/welcome')).headers.get('location'), '/login');
      }
      assert.equal((await b.request('/login', { method: 'POST', body: new URLSearchParams({ username: 'demo_ana', password: passwords[0] }) })).status, 403);
      assert.equal((await b.request('/logout', { method: 'POST', body: new URLSearchParams({ _csrf: 'é'.repeat(64) }) })).status, 403);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 2);
    });
    await t.test('Escapa el nombre en HTML', async () => {
      await pool.query('UPDATE users SET full_name=$1 WHERE username=$2', ['<script>alert(1)</script>', 'demo_ana']);
      const b = browser(); await login(b, 'demo_ana', passwords[0]);
      const html = await (await b.request('/welcome')).text();
      assert.ok(!html.includes('<script>alert(1)</script>'));
      assert.match(html, /&lt;script&gt;/);
    });
    await t.test('Limita los intentos de login', async () => {
      const b = browser(); let status;
      for (let i = 0; i < 11; i++) status = (await login(b, 'no_existe', 'incorrecta')).status;
      assert.equal(status, 429);
    });
    await t.test('Cookie Secure exige un proxy explícitamente confiable', async () => {
      for (const trusted of [false, ['loopback']]) {
        const secureApp = await createApp({ ...config, secure: true, trustProxy: trusted }, pool);
        const secureServer = secureApp.listen(0, '127.0.0.1');
        await new Promise(resolve => secureServer.once('listening', resolve));
        try {
          const response = await fetch(`http://127.0.0.1:${secureServer.address().port}/login`, { headers: { 'x-forwarded-proto': 'https' } });
          if (trusted) assert.match(response.headers.get('set-cookie'), /; Secure/);
          else assert.equal(response.headers.get('set-cookie'), null);
        } finally { await new Promise(resolve => secureServer.close(resolve)); }
      }
    });
    await t.test('Salud y DB no disponible', async () => {
      assert.equal((await fetch(origin + '/health')).status, 200);
      assert.equal((await fetch(origin + '/ready')).status, 200);
      await pool.end(); pool = null;
      assert.equal((await fetch(origin + '/ready')).status, 503);
      assert.equal((await fetch(origin + '/health')).status, 200);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
