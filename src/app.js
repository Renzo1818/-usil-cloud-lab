import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const destinations = [
  { name: 'Machu Picchu', region: 'Cusco · Sierra', style: 'andes', icon: '◭', text: 'Terrazas de piedra y montañas que guardan la memoria de los incas.' },
  { name: 'Lago Titicaca', region: 'Puno · Sierra', style: 'lago', icon: '≈', text: 'Un horizonte de agua y tradiciones vivas en el altiplano peruano.' },
  { name: 'Líneas de Nasca', region: 'Ica · Costa', style: 'desierto', icon: '✳', text: 'Trazos ancestrales que convierten el desierto en un paisaje de preguntas.' },
  { name: 'Arequipa', region: 'Arequipa · Sierra', style: 'ciudad', icon: '⌂', text: 'Arquitectura de sillar, sabores propios y volcanes en el horizonte.' },
  { name: 'Paracas', region: 'Ica · Costa', style: 'mar', icon: '∿', text: 'El encuentro del desierto con el Pacífico: acantilados, playas y vida marina.' },
  { name: 'Iquitos', region: 'Loreto · Selva', style: 'selva', icon: '❋', text: 'Una puerta a los ríos, los bosques y la diversidad de la Amazonía.' }
];
export async function createApp(config, pool) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  let reportedProxy = false;
  app.use((req, _res, next) => {
    if (config.secure && config.trustProxy === false && !reportedProxy && req.headers['x-forwarded-proto'] === 'https') {
      console.info(`Entrada HTTPS observada desde ${req.socket.remoteAddress}. Verifica esta dirección del proxy antes de configurar TRUST_PROXY.`);
      reportedProxy = true;
    }
    next();
  });
  app.set('view engine', 'ejs');
  app.set('views', fileURLToPath(new URL('./views', import.meta.url)));
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': config.secure ? [] : null } } }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.use('/assets', express.static(fileURLToPath(new URL('./public', import.meta.url)), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '4kb', parameterLimit: 10 }));
  const Store = connectPgSimple(session);
  app.use(session({
    name: 'peru.sid', secret: config.sessionSecret,
    store: new Store({ pool, tableName: 'session', createTableIfMissing: false,
      errorLog: () => console.error('Error del almacén de sesiones.') }),
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.secure, maxAge: 30 * 60 * 1000 }
  }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    req.session.csrf ??= randomBytes(32).toString('hex');
    res.locals.csrf = req.session.csrf;
    next();
  });
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const supplied = req.body?._csrf;
    const expected = req.session.csrf;
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return res.status(403).send('Solicitud no válida. Recarga el formulario e inténtalo nuevamente.');
    }
    next();
  });
  const dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.' });
  app.get('/', (req, res) => res.redirect(req.session.userId ? '/welcome' : '/login'));
  app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/welcome');
    res.render('login', { error: null });
  });
  app.post('/login', loginLimit, async (req, res) => {
    const { username, password } = req.body;
    const fail = () => res.status(401).render('login', { error: 'Usuario o contraseña incorrectos' });
    if (typeof username !== 'string' || typeof password !== 'string' ||
      username.trim().length < 1 || username.length > 64 || password.length < 1 || Buffer.byteLength(password) > 72) return fail();
    const result = await pool.query('SELECT id, password_hash FROM users WHERE username = $1', [username.trim()]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user?.password_hash ?? dummyHash);
    if (!valid || !user) return fail();
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.csrf = randomBytes(32).toString('hex');
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.redirect('/welcome');
  });
  app.get('/welcome', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const result = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.session.userId]);
    if (!result.rowCount) return req.session.destroy(() => res.redirect('/login'));
    res.render('welcome', { name: result.rows[0].full_name, destinations });
  });
  app.post('/logout', (req, res, next) => {
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('peru.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: config.secure });
      res.redirect('/login');
    });
  });
  app.use((_req, res) => res.status(404).send('Página no encontrada.'));
  app.use((error, _req, res, _next) => {
    const badInput = error.status === 400 || error.status === 413;
    if (!badInput) console.error('No se pudo completar una solicitud.');
    res.status(badInput ? error.status : 503).send(badInput ? 'Formulario no válido.' : 'Servicio temporalmente no disponible. Inténtalo nuevamente.');
  });
  return app;
}
