export function readConfig(env = process.env) {
  const required = name => {
    if (!env[name]) throw new Error(`Falta la variable ${name}.`);
    return env[name];
  };
  const bool = (name, fallback = 'false') => {
    const value = env[name] ?? fallback;
    if (!['true', 'false'].includes(value)) throw new Error(`${name} debe ser true o false.`);
    return value === 'true';
  };
  const databaseUrl = required('DATABASE_URL');
  try {
    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error();
  } catch { throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida.'); }
  const sessionSecret = required('SESSION_SECRET');
  if (Buffer.byteLength(sessionSecret) < 32) throw new Error('SESSION_SECRET requiere al menos 32 bytes.');
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
  const proxy = env.TRUST_PROXY ?? 'false';
  // Solo direcciones/subredes explícitas; nunca confiar en un número arbitrario de saltos.
  const parts = proxy.split(',').map(v => v.trim());
  const { isIP } = process.getBuiltinModule('node:net');
  const valid = value => {
    if (value === 'loopback') return true;
    const [ip, mask, extra] = value.split('/');
    const family = isIP(ip);
    return !extra && family && (mask === undefined || (/^\d+$/.test(mask) && Number(mask) > 0 && Number(mask) <= (family === 4 ? 32 : 128)));
  };
  if (proxy !== 'false' && !parts.every(valid)) throw new Error('TRUST_PROXY requiere false, loopback o IP/CIDR explícitas.');
  const seed = bool('SEED_ENABLED');
  const seedPasswords = seed ? [required('SEED_USER1_PASSWORD'), required('SEED_USER2_PASSWORD')] : [];
  if (seedPasswords.some(p => Buffer.byteLength(p) < 12 || Buffer.byteLength(p) > 72)) {
    throw new Error('Los passwords de seed requieren entre 12 y 72 bytes.');
  }
  return { databaseUrl, sessionSecret, port, secure: bool('COOKIE_SECURE'),
    trustProxy: proxy === 'false' ? false : parts, seed, seedPasswords };
}
