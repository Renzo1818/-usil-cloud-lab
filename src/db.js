import pg from 'pg';
export function createPool(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  pool.on('error', () => console.error('Conexión inactiva a PostgreSQL interrumpida.'));
  return pool;
}
