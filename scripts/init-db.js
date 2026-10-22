import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcrypt';
import { readConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
export async function initialize(pool, config) {
  let client;
  for (let attempt = 0; attempt < 15; attempt++) {
    try { client = await pool.connect(); break; }
    catch {
      if (attempt === 14) throw new Error('PostgreSQL no disponible tras los reintentos.');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query('SELECT pg_advisory_xact_lock(739120)');
    await client.query(await readFile(new URL('../db/migrations/001_init.sql', import.meta.url), 'utf8'));
    if (config.seed) {
      const users = [['demo_ana', 'Ana Torres'], ['demo_luis', 'Luis Ramos']];
      for (const [i, [username, name]] of users.entries()) {
        const exists = await client.query('SELECT id FROM users WHERE username = $1', [username]);
        if (!exists.rowCount) {
          const hash = await bcrypt.hash(config.seedPasswords[i], 12);
          await client.query('INSERT INTO users (username, password_hash, full_name) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING', [username, hash, name]);
        }
      }
    }
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    throw new Error('No se pudo inicializar PostgreSQL. Revisa conexión, permisos y configuración.');
  } finally { client.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  try {
    const config = readConfig();
    pool = createPool(config.databaseUrl);
    await initialize(pool, config);
    console.log('Base de datos inicializada.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { if (pool) await pool.end(); }
}
