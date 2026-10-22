import assert from 'node:assert/strict';
const origin = process.env.TEST_BASE_URL ?? 'http://proxy';
const token = html => html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
for (const [i, username] of ['demo_ana', 'demo_luis'].entries()) {
  let cookie = '';
  const request = async (path, options = {}) => {
    const response = await fetch(origin + path, { redirect: 'manual', ...options, headers: { cookie } });
    const set = response.headers.getSetCookie();
    if (set.length) cookie = set[0].split(';')[0];
    return response;
  };
  const page = await request('/login');
  const login = await request('/login', { method: 'POST', body: new URLSearchParams({ _csrf: token(await page.text()), username, password: process.env[`SEED_USER${i + 1}_PASSWORD`] }) });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/welcome');
  const welcome = await request('/welcome');
  const html = await welcome.text();
  assert.match(html, /Bienvenido, /);
  const previous = cookie;
  assert.equal((await request('/logout', { method: 'POST', body: new URLSearchParams({ _csrf: token(html) }) })).status, 302);
  const denied = await fetch(origin + '/welcome', { redirect: 'manual', headers: { cookie: previous } });
  assert.equal(denied.headers.get('location'), '/login');
  console.log(`${username}: login, bienvenida y logout correctos.`);
}
console.log('Smoke test completado.');
