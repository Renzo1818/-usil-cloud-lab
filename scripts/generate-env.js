import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const secret = () => randomBytes(32).toString('hex');
const password = secret();
const content = `NODE_ENV=production
PORT=8080
POSTGRES_DB=turismo
POSTGRES_USER=turismo
POSTGRES_PASSWORD=${password}
DATABASE_URL=postgresql://turismo:${password}@db:5432/turismo
SESSION_SECRET=${secret()}
COOKIE_SECURE=false
PROXY_SCHEME=http
TRUST_PROXY=172.30.10.2
SEED_ENABLED=true
SEED_USER1_PASSWORD=${secret()}
SEED_USER2_PASSWORD=${secret()}
DOCKERHUB_USERNAME=
APP_VERSION=1.0.0
`;
try {
  writeFileSync('.env', content, { flag: 'wx', mode: 0o600 });
  console.log('.env creado. Consulta sus valores únicamente desde tu terminal privada.');
} catch (error) {
  console.error(error.code === 'EEXIST' ? '.env ya existe: no se modificó.' : 'No se pudo crear .env.');
  process.exitCode = 1;
}
