const crypto = require('crypto');

const COOKIE_NAME = 'crm_session';
const SESSION_HOURS = 8;
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

// Si no hay SESSION_SECRET, las sesiones se invalidan al reiniciar el servidor
const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const intentosFallidos = new Map();

function firmar(valor) {
    return crypto.createHmac('sha256', secret).update(valor).digest('hex');
}

function iguales(a, b) {
    const hashA = crypto.createHash('sha256').update(String(a)).digest();
    const hashB = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

function leerCookie(req, nombre) {
    const cookies = req.headers.cookie || '';
    for (const parte of cookies.split(';')) {
        const [clave, ...valor] = parte.trim().split('=');
        if (clave === nombre) return decodeURIComponent(valor.join('='));
    }
    return null;
}

function sesionValida(req) {
    const token = leerCookie(req, COOKIE_NAME);
    if (!token) return false;
    const [expira, firma] = token.split('.');
    return Boolean(firma) && iguales(firma, firmar(expira)) && Number(expira) > Date.now();
}

function opcionesCookie(maxAgeSeg) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeg}${secure}`;
}

function login(req, res) {
    const ip = req.ip;
    const registro = intentosFallidos.get(ip);
    if (registro && registro.count >= MAX_INTENTOS && Date.now() - registro.desde < BLOQUEO_MS) {
        return res.status(429).json({ message: 'Demasiados intentos. Espera 15 minutos.' });
    }

    if (!process.env.ADMIN_PASSWORD) {
        return res.status(503).json({ message: 'El CRM no tiene contraseña configurada (ADMIN_PASSWORD).' });
    }

    if (!iguales(req.body?.password ?? '', process.env.ADMIN_PASSWORD)) {
        const nuevo = registro && Date.now() - registro.desde < BLOQUEO_MS
            ? { count: registro.count + 1, desde: registro.desde }
            : { count: 1, desde: Date.now() };
        intentosFallidos.set(ip, nuevo);
        return res.status(401).json({ message: 'Contraseña incorrecta.' });
    }

    intentosFallidos.delete(ip);
    const expira = String(Date.now() + SESSION_HOURS * 3600 * 1000);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${expira}.${firmar(expira)}; ${opcionesCookie(SESSION_HOURS * 3600)}`);
    res.json({ ok: true });
}

function logout(req, res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${opcionesCookie(0)}`);
    res.json({ ok: true });
}

// Para la API: responde 401 en JSON
function requireAuthApi(req, res, next) {
    if (sesionValida(req)) return next();
    res.status(401).json({ message: 'Sesión expirada. Vuelve a iniciar sesión.' });
}

// Para las páginas del panel: redirige al login
function requireAuthPage(req, res, next) {
    if (sesionValida(req)) return next();
    res.redirect('/admin/login');
}

module.exports = { login, logout, requireAuthApi, requireAuthPage, sesionValida };
