const crypto = require('crypto');
const { obtenerUsuarios, verificarPassword } = require('./usuarios');

const COOKIE_NAME = 'crm_session';
const SESSION_HOURS = 8;
const MAX_INTENTOS = 5;
const MAX_INTENTOS_CORREO = 20;   // más alto que por IP: si no, cualquiera podría bloquear a un administrador a voluntad
const BLOQUEO_MS = 15 * 60 * 1000;
const MAX_ENTRADAS = 10000;       // tope de cada Map de intentos

// Si no hay SESSION_SECRET, las sesiones se invalidan al reiniciar el servidor
const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// Intentos fallidos de login, por IP y por correo (IP: 5 fallos, correo: 20 fallos → bloqueo de 15 min)
const intentosFallidos = new Map();
const intentosPorCorreo = new Map();

// Limpieza periódica para que los Map no crezcan sin límite
setInterval(() => {
    const ahora = Date.now();
    for (const mapa of [intentosFallidos, intentosPorCorreo]) {
        for (const [clave, r] of mapa) if (ahora - r.desde >= BLOQUEO_MS) mapa.delete(clave);
    }
}, 5 * 60 * 1000).unref();

const bloqueado = (registro, maximo) => registro && registro.count >= maximo && Date.now() - registro.desde < BLOQUEO_MS;

function sumarFallo(mapa, clave) {
    const registro = mapa.get(clave);
    // Si el Map está lleno, se descarta la entrada más antigua
    if (!registro && mapa.size >= MAX_ENTRADAS) mapa.delete(mapa.keys().next().value);
    mapa.set(clave, registro && Date.now() - registro.desde < BLOQUEO_MS
        ? { count: registro.count + 1, desde: registro.desde }
        : { count: 1, desde: Date.now() });
}

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
        if (clave === nombre) {
            try {
                return decodeURIComponent(valor.join('='));
            } catch {
                return null;   // cookie malformada: se trata como si no hubiera sesión
            }
        }
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
        const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
        if (bloqueado(intentosFallidos.get(ip), MAX_INTENTOS) || bloqueado(intentosPorCorreo.get(email), MAX_INTENTOS_CORREO)) {
            return res.status(429).json({ message: 'Demasiados intentos. Espere 15 minutos.' });
        }

        const usuario = (await obtenerUsuarios()).find(u => u.email === email && u.activo);
        const valida = await verificarPassword(req.body?.password ?? '', usuario?.passwordHash);

        if (!usuario || !valida) {
            sumarFallo(intentosFallidos, ip);
            sumarFallo(intentosPorCorreo, email);
            return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
        }

        intentosFallidos.delete(ip);
        intentosPorCorreo.delete(email);
        emitirSesion(res, usuario);
        // La ruta a la que volver la decide el servidor: solo si es local y segura
        res.json({ ok: true, next: rutaSegura(req.body?.next) || '/admin' });
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

// Ruta local segura para redirigir tras el login: empieza por '/', no por '//', sin '\\' ni caracteres de control
function rutaSegura(valor) {
    if (typeof valor !== 'string' || valor.length > 2000) return null;
    if (!valor.startsWith('/') || valor.startsWith('//')) return null;
    if (/[\x00-\x1f\x7f\\]/.test(valor)) return null;   // sin control ni '\\' en ninguna posición
    return valor;
}

// Sitio privado (SITIO_PRIVADO=si): todo el sitio exige sesión del CRM, salvo lo imprescindible
const SITIO_PRIVADO = process.env.SITIO_PRIVADO === 'si';
const EXENTAS = new Set(['GET /healthz', 'GET /robots.txt', 'GET /admin/login', 'POST /admin/login', 'POST /admin/logout']);

async function requireSitioPrivado(req, res, next) {
    try {
        if (!SITIO_PRIVADO) return next();
        const metodo = req.method === 'HEAD' ? 'GET' : req.method;   // HEAD se trata como GET
        if (EXENTAS.has(`${metodo} ${req.path}`) || req.path.startsWith('/admin/assets/')) return next();
        if (await usuarioDeSesion(req)) return next();
        if (metodo === 'GET' && !req.path.startsWith('/api') && req.accepts(['html', 'json']) === 'html') {
            return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
        }
        res.status(401).json({ success: false, message: 'Debe iniciar sesión para acceder a este sitio.' });
    } catch (error) {
        next(error);
    }
}

function requireAdmin(req, res, next) {
    if (req.usuario?.rol === 'admin') return next();
    res.status(403).json({ message: 'Solo un administrador puede hacer esto.' });
}

module.exports = { SITIO_PRIVADO, rutaSegura, requireSitioPrivado, login, logout, emitirSesion, requireAuthApi, requireAuthPage, requireAdmin, usuarioDeSesion };
