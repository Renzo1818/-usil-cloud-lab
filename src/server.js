import { readConfig } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';
let pool;
try {
  const config = readConfig();
  pool = createPool(config.databaseUrl);
  const app = await createApp(config, pool);
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`Descubre el Perú escucha en el puerto ${config.port}.`));
  server.on('error', async () => { console.error('No se pudo abrir el puerto de la aplicación.'); await pool.end(); process.exitCode = 1; });
  const shutdown = () => {
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => { await pool.end(); clearTimeout(timeout); process.exit(0); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error.message);
  if (pool) await pool.end();
  process.exitCode = 1;
}
