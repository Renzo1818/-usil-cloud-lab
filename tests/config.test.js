import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
const env = { DATABASE_URL: 'postgresql://user@db/test', SESSION_SECRET: 'a'.repeat(64) };
test('Valida configuración y no exige passwords con seed desactivado', () => {
  assert.equal(readConfig(env).seed, false);
  assert.throws(() => readConfig({ ...env, SESSION_SECRET: 'corto' }));
  assert.throws(() => readConfig({ ...env, DATABASE_URL: 'invalid' }));
  assert.throws(() => readConfig({ ...env, TRUST_PROXY: 'true' }));
  assert.throws(() => readConfig({ ...env, TRUST_PROXY: '0.0.0.0/0' }));
  assert.throws(() => readConfig({ ...env, SEED_ENABLED: 'true' }));
  assert.throws(() => readConfig({ ...env, COOKIE_SECURE: 'yes' }));
  assert.deepEqual(readConfig({ ...env, TRUST_PROXY: '172.30.10.2' }).trustProxy, ['172.30.10.2']);
});
