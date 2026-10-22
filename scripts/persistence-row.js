import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.js';
const pool = createPool(process.env.DATABASE_URL);
try {
  if (process.argv[2] === 'create') {
    const username = `control_${randomBytes(8).toString('hex')}`;
    const result = await pool.query("INSERT INTO users (username, password_hash, full_name) SELECT $1, password_hash, 'Control de persistencia' FROM users WHERE username='demo_ana' RETURNING id, username, created_at", [username]);
    assert.equal(result.rowCount, 1, 'Se requiere demo_ana para preparar el control.');
    console.log(JSON.stringify(result.rows[0]));
  } else {
    const expected = JSON.parse(readFileSync(0, 'utf8'));
    const result = await pool.query('SELECT id, username, created_at FROM users WHERE username=$1', [expected.username]);
    assert.equal(result.rowCount, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), expected);
    console.log(`Persistencia verificada: ID ${expected.id}, fecha ${expected.created_at}.`);
    await pool.query('DELETE FROM users WHERE username=$1 AND id=$2', [expected.username, expected.id]);
  }
} finally { await pool.end(); }
