const crypto = require('crypto');
const { obtenerUsuarios, verificarPassword } = require('./usuarios');

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

// Huella de la contraseña: si la contraseña cambia, las sesiones anteriores dejan de valer
const huella = usuario => firmar(`pw:${usuario.passwordHash}`).slice(0, 16);

function leerCookie(req, nombre) {
    const cookies = req.headers.cookie || '';
    for (const parte of cookies.split(';')) {
        const [clave, ...valor] = parte.trim().split('=');
        if (clave === nombre) return decodeURIComponent(valor.join('='));
    }
    return null;
}

// Devuelve el usuario de la sesión, o null si no hay sesión válida
async function usuarioDeSesion(req) {
    const token = leerCookie(req, COOKIE_NAME);
    if (!token) return null;
    const [userId, expira, marca, firma] = token.split('.');
    if (!firma || !iguales(firma, firmar(`${userId}.${expira}.${marca}`)) || Number(expira) < Date.now()) return null;

    const usuario = (await obtenerUsuarios()).find(u => u.id === userId);
    if (!usuario || !usuario.activo || !iguales(marca, huella(usuario))) return null;
    return usuario;
}

function opcionesCookie(maxAgeSeg) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeg}${secure}`;
}

async function login(req, res, next) {
    try {
        const ip = req.ip;
        const registro = intentosFallidos.get(ip);
        if (registro && registro.count >= MAX_INTENTOS && Date.now() - registro.desde < BLOQUEO_MS) {
            return res.status(429).json({ message: 'Demasiados intentos. Espere 15 minutos.' });
        }

        const email = String(req.body?.email || '').trim().toLowerCase();
        const usuario = (await obtenerUsuarios()).find(u => u.email === email && u.activo);
        const valida = await verificarPassword(req.body?.password ?? '', usuario?.passwordHash);

        if (!usuario || !valida) {
            const nuevo = registro && Date.now() - registro.desde < BLOQUEO_MS
                ? { count: registro.count + 1, desde: registro.desde }
                : { count: 1, desde: Date.now() };
            intentosFallidos.set(ip, nuevo);
            return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
        }

        intentosFallidos.delete(ip);
        emitirSesion(res, usuario);
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
}

// Deja la cookie de sesión del usuario en la respuesta
function emitirSesion(res, usuario) {
    const expira = String(Date.now() + SESSION_HOURS * 3600 * 1000);
    const datos = `${usuario.id}.${expira}.${huella(usuario)}`;
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${datos}.${firmar(datos)}; ${opcionesCookie(SESSION_HOURS * 3600)}`);
}

function logout(req, res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${opcionesCookie(0)}`);
    res.json({ ok: true });
}

// Para la API: responde 401 en JSON. Deja el usuario en req.usuario.
async function requireAuthApi(req, res, next) {
    try {
        req.usuario = await usuarioDeSesion(req);
        if (req.usuario) return next();
        res.status(401).json({ message: 'Sesión expirada. Vuelva a iniciar sesión.' });
    } catch (error) {
        next(error);
    }
}

// Para las páginas del panel: redirige al login
async function requireAuthPage(req, res, next) {
    try {
        if (await usuarioDeSesion(req)) return next();
        res.redirect('/admin/login');
    } catch (error) {
        next(error);
    }
}

function requireAdmin(req, res, next) {
    if (req.usuario?.rol === 'admin') return next();
    res.status(403).json({ message: 'Solo un administrador puede hacer esto.' });
}

module.exports = { login, logout, emitirSesion, requireAuthApi, requireAuthPage, requireAdmin, usuarioDeSesion };
