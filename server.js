const express = require('express');
const path = require('path');
const { SERVICIOS, ESTADOS } = require('./lib/constants');
const { createStore } = require('./lib/store');
const auth = require('./lib/auth');
const usuarios = require('./lib/usuarios');
const { avisarNuevoLead, avisarAsignacion, avisosActivos } = require('./lib/notify');
const { datosCorporacion, camposPendientes, servirPlantillas, logoSvg } = require('./lib/corporacion');

const app = express();
const PORT = process.env.PORT || 3000;
const EN_PRODUCCION = process.env.NODE_ENV === 'production';

// En producción la firma de la sesión necesita un secreto fijo y largo: sin él,
// las sesiones se romperían al reiniciar o serían fáciles de adivinar.
if (EN_PRODUCCION && (process.env.SESSION_SECRET || '').length < 32) {
    console.error('Error de configuración: en producción SESSION_SECRET es obligatoria y debe tener al menos 32 caracteres.');
    console.error('Genere una con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
}
// Ley 1581 de 2012: el sitio no puede abrirse al público mientras la Política de
// Tratamiento de Datos no identifique al responsable. En producción, con el sitio
// abierto (SITIO_PRIVADO distinto de 'si'), no se arranca si quedan campos "por definir".
if (EN_PRODUCCION && !auth.SITIO_PRIVADO) {
    const pendientes = camposPendientes();
    if (pendientes.length) {
        console.error('Error de configuración: el sitio no puede abrirse al público mientras haya datos de la corporación por definir (Ley 1581 de 2012).');
        console.error(`Complete en config/corporacion.json: ${pendientes.join(', ')}. Mientras tanto, mantenga SITIO_PRIVADO=si.`);
        process.exit(1);
    }
}
const store = createStore();
usuarios.configurarUsuarios(store);

// En producción el servidor va detrás de un proxy (Render, Railway, Nginx…).
// Sin esto, req.ip sería la IP del proxy para TODOS los visitantes: el bloqueo
// por intentos de login dejaría de distinguir atacantes y un solo atacante
// podría bloquear el acceso de todos. Con 'trust proxy' se usa la IP real
// (cabecera X-Forwarded-For) y req.secure refleja si la conexión es HTTPS.
// TRUST_PROXY lo ajusta: número de proxies (1), true/false, o texto (p. ej. 'loopback').
function valorTrustProxy() {
    const valor = process.env.TRUST_PROXY;
    if (valor === undefined || valor.trim() === '') return EN_PRODUCCION ? 1 : undefined;
    const texto = valor.trim();
    if (/^\d+$/.test(texto)) return Number(texto);
    if (texto === 'true') return true;
    if (texto === 'false') return false;
    return texto;
}
const trustProxy = valorTrustProxy();
if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
app.disable('x-powered-by');

// ---------- Cabeceras de seguridad (en toda respuesta) ----------
// Content-Security-Policy: el navegador solo carga recursos de los orígenes
// permitidos. Es la red de seguridad ante un XSS y bloquea scripts ajenos.
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: https://images.unsplash.com",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",   // nadie puede incrustar el sitio en un iframe (anti-clickjacking)
    "object-src 'none'"
].join('; ');

app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');        // no adivinar el tipo de archivo
    res.setHeader('X-Frame-Options', 'DENY');                  // respaldo de frame-ancestors en navegadores viejos
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // El CRM y la API nunca deben salir en buscadores; con sitio privado, nada
    if (auth.SITIO_PRIVADO || req.path.startsWith('/admin') || req.path.startsWith('/api')) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    // HSTS: en producción (HTTPS) el navegador exige HTTPS durante un año
    if (EN_PRODUCCION) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Health check para Render/Railway/Nginx: sin sesión y sin redirección a HTTPS
app.get('/healthz', (req, res) => res.json({ ok: true }));

// En producción, todo el tráfico va por HTTPS (req.secure depende de 'trust proxy').
// FORZAR_HTTPS=no la desactiva (si el proxy ya fuerza HTTPS o no envía X-Forwarded-Proto,
// dejarla activa provocaría un bucle de redirecciones).
const FORZAR_HTTPS = process.env.FORZAR_HTTPS ? process.env.FORZAR_HTTPS !== 'no' : EN_PRODUCCION;
function hostPublico(req) {
    try {
        if (process.env.PUBLIC_URL) return new URL(process.env.PUBLIC_URL).host;
    } catch { /* PUBLIC_URL no válida: se usa la cabecera Host */ }
    return req.get('host');
}
if (FORZAR_HTTPS) {
    app.use((req, res, next) => {
        if (req.secure) return next();
        res.redirect(308, `https://${hostPublico(req)}${req.url}`);
    });
}

app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(auth.SITIO_PRIVADO
        ? 'User-agent: *\nDisallow: /\n'
        : 'User-agent: *\nDisallow: /admin\nDisallow: /api\n');
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TELEFONO_REGEX = /^[0-9+()\s-]{7,20}$/;
const SISTEMA = { id: '', nombre: 'Sistema' };
// Asignación automática por servicio: apagada salvo ASIGNACION_AUTOMATICA=si en .env.
// Apagada, los contactos llegan sin asignar y el administrador los asigna a mano.
const ASIGNACION_AUTOMATICA = process.env.ASIGNACION_AUTOMATICA === 'si';

// Envuelve rutas async para que los errores lleguen al manejador de errores
const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);

// Registra una acción en el historial del contacto
function registrar(leadId, usuario, accion, detalle) {
    return store.add('Historial', {
        leadId,
        fecha: new Date().toISOString(),
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        accion,
        detalle
    });
}

// Un consultor solo ve los contactos asignados a él y los que no tienen responsable
const puedeVer = (usuario, lead) =>
    usuario.rol === 'admin' || !lead.responsableId || lead.responsableId === usuario.id;

// Middleware: solo se publica la carpeta public/, nunca el código del servidor ni .env
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));

// Sitio privado: sin sesión del CRM no se entrega nada (ver SITIO_PRIVADO en .env.example)
app.use(auth.requireSitioPrivado);

// Las páginas HTML se sirven con los datos de config/corporacion.json ya reemplazados
const publicDir = path.join(__dirname, 'public');
app.get('/logo.svg', (req, res) => res.type('image/svg+xml').send(logoSvg()));
app.use(servirPlantillas(publicDir));
app.use(express.static(publicDir));

// ---------- Formulario de contacto de la página ----------

// Límite de envíos del formulario por IP: evita que un bot inunde de contactos
// falsos, agote la cuota de Google Sheets o dispare correos sin parar.
const CONTACTO_MAX = 5;                 // envíos permitidos…
const CONTACTO_VENTANA_MS = 10 * 60 * 1000;  // …cada 10 minutos
const enviosContacto = new Map();

function excedeLimiteContacto(ip) {
    const ahora = Date.now();
    const registro = enviosContacto.get(ip);
    if (!registro || ahora - registro.desde > CONTACTO_VENTANA_MS) {
        enviosContacto.set(ip, { count: 1, desde: ahora });
        return false;
    }
    registro.count += 1;
    return registro.count > CONTACTO_MAX;
}

// Limpieza periódica para que el Map no crezca sin límite
setInterval(() => {
    const ahora = Date.now();
    for (const [ip, r] of enviosContacto) if (ahora - r.desde > CONTACTO_VENTANA_MS) enviosContacto.delete(ip);
}, CONTACTO_VENTANA_MS).unref();

app.post('/contact', asyncRoute(async (req, res) => {
    // Honeypot: un campo oculto que una persona nunca llena pero un bot sí.
    // Si viene con texto, fingimos éxito y no guardamos nada.
    if (String(req.body.website || '').trim() !== '') {
        return res.json({ success: true, message: 'Gracias por su interés. Un consultor se comunicará con usted pronto.' });
    }
    if (excedeLimiteContacto(req.ip)) {
        return res.status(429).json({ success: false, message: 'Recibimos varias solicitudes suyas. Espere unos minutos e intente de nuevo.' });
    }

    const nombre = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const telefono = String(req.body.phone || '').trim().replace(/\s+/g, ' ');
    const mensaje = String(req.body.message || '').trim();
    const servicio = SERVICIOS[req.body['service-type']] ? req.body['service-type'] : 'general';

    if (!nombre || !mensaje || !EMAIL_REGEX.test(email) || nombre.length > 200 || email.length > 200 || mensaje.length > 5000) {
        return res.status(400).json({ success: false, message: 'Revise que el nombre, el correo y el mensaje sean válidos.' });
    }
    if (!TELEFONO_REGEX.test(telefono) || telefono.replace(/\D/g, '').length < 7) {
        return res.status(400).json({ success: false, message: 'Escriba un número de contacto válido (mínimo 7 dígitos).' });
    }
    // Ley 1581 de 2012: sin autorización expresa no se pueden tratar los datos
    if (req.body.autorizacion !== 'si') {
        return res.status(400).json({ success: false, message: 'Para enviar la solicitud debe autorizar el tratamiento de sus datos personales.' });
    }

    const ahora = new Date().toISOString();
    let lead;
    let responsable = null;
    try {
        if (ASIGNACION_AUTOMATICA) responsable = await usuarios.responsablePorServicio(servicio);
        lead = await store.add('Leads', {
            creado: ahora,
            nombre,
            email,
            telefono,
            servicio,
            mensaje,
            estado: 'nuevo',
            proximoSeguimiento: '',
            // Prueba de la autorización: fecha y versión de la política aceptada
            autorizacionDatos: ahora,
            politicaVersion: datosCorporacion().politicaDatosVersion,
            actualizado: ahora,
            responsableId: responsable?.id || ''
        });
    } catch (error) {
        console.error('Error al guardar el contacto:', error);
        return res.status(502).json({ success: false, message: 'Error al procesar la solicitud. Inténtelo de nuevo más tarde.' });
    }

    try {
        await registrar(lead.id, SISTEMA, 'creado', 'Recibido desde el formulario web');
        if (responsable) {
            await registrar(lead.id, SISTEMA, 'asignado', `Asignado automáticamente a ${responsable.nombre} (${SERVICIOS[servicio]})`);
        }
    } catch (error) {
        console.error('No se pudo registrar el historial del contacto nuevo:', error.message);
    }

    avisarNuevoLead(lead, SERVICIOS[servicio], responsable);
    res.json({ success: true, message: 'Gracias por su interés. Un consultor se comunicará con usted pronto.' });
}));

// ---------- Panel del CRM ----------

const adminDir = path.join(__dirname, 'admin');

app.use('/admin/assets', express.static(path.join(adminDir, 'assets')));

const paginaAdmin = archivo => (req, res, next) => {
    req.url = `/${archivo}`;
    servirPlantillas(adminDir)(req, res, next);
};

app.get('/admin/login', asyncRoute(async (req, res, next) => {
    if (await auth.usuarioDeSesion(req)) return res.redirect(auth.rutaSegura(req.query.next) || '/admin');
    paginaAdmin('login.html')(req, res, next);
}));
app.post('/admin/login', auth.login);
app.post('/admin/logout', auth.logout);
app.get('/admin', auth.requireAuthPage, paginaAdmin('index.html'));

// ---------- API del CRM (requiere sesión) ----------

const api = express.Router();
api.use(auth.requireAuthApi);

api.get('/meta', asyncRoute(async (req, res) => {
    const equipo = (await usuarios.obtenerUsuarios()).map(u => ({
        id: u.id, nombre: u.nombre, rol: u.rol, activo: u.activo, servicios: u.servicios
    }));
    res.json({
        servicios: SERVICIOS,
        estados: ESTADOS,
        roles: usuarios.ROLES,
        usuario: usuarios.publico(req.usuario),
        equipo,
        almacenamiento: store.name,
        avisosActivos,
        asignacionAutomatica: ASIGNACION_AUTOMATICA
    });
}));

// Contacto visible para el usuario, o responde 404
async function leadVisible(req, res) {
    const lead = (await store.list('Leads')).find(l => l.id === req.params.id);
    if (!lead || !puedeVer(req.usuario, lead)) {
        res.status(404).json({ message: 'Contacto no encontrado.' });
        return null;
    }
    return lead;
}

api.get('/leads', asyncRoute(async (req, res) => {
    const leads = (await store.list('Leads')).filter(l => puedeVer(req.usuario, l));
    leads.sort((a, b) => b.creado.localeCompare(a.creado));
    res.json(leads);
}));

api.get('/leads/:id', asyncRoute(async (req, res) => {
    const lead = await leadVisible(req, res);
    if (!lead) return;
    const porFecha = (a, b) => b.fecha.localeCompare(a.fecha);
    const notas = (await store.list('Notas')).filter(n => n.leadId === lead.id).sort(porFecha);
    const historial = (await store.list('Historial')).filter(h => h.leadId === lead.id).sort(porFecha);
    res.json({ ...lead, notas, historial });
}));

api.patch('/leads/:id', asyncRoute(async (req, res) => {
    const lead = await leadVisible(req, res);
    if (!lead) return;

    const { estado, proximoSeguimiento, responsableId } = req.body || {};
    const cambios = {};
    const registros = [];
    const equipo = await usuarios.obtenerUsuarios();
    const nombreDe = id => equipo.find(u => u.id === id)?.nombre || 'Sin asignar';

    if (estado !== undefined && estado !== lead.estado) {
        if (!ESTADOS[estado]) return res.status(400).json({ message: 'Estado no válido.' });
        cambios.estado = estado;
        registros.push(['estado', `Estado: ${ESTADOS[lead.estado] || lead.estado} → ${ESTADOS[estado]}`]);
    }
    if (proximoSeguimiento !== undefined && proximoSeguimiento !== lead.proximoSeguimiento) {
        if (proximoSeguimiento !== '' && !FECHA_REGEX.test(proximoSeguimiento)) {
            return res.status(400).json({ message: 'Fecha de seguimiento no válida.' });
        }
        cambios.proximoSeguimiento = proximoSeguimiento;
        registros.push(['seguimiento', `Próximo seguimiento: ${lead.proximoSeguimiento || '—'} → ${proximoSeguimiento || '—'}`]);
    }
    if (responsableId !== undefined && responsableId !== lead.responsableId) {
        const esAdmin = req.usuario.rol === 'admin';
        // Un consultor solo puede tomar para sí un contacto sin responsable
        const tomaSinAsignar = responsableId === req.usuario.id && !lead.responsableId;
        if (!esAdmin && !tomaSinAsignar) {
            return res.status(403).json({ message: 'Solo un administrador puede reasignar contactos.' });
        }
        if (responsableId && !equipo.some(u => u.id === responsableId && u.activo)) {
            return res.status(400).json({ message: 'El responsable no existe o está inactivo.' });
        }
        cambios.responsableId = responsableId;
        registros.push(['asignado', `Responsable: ${nombreDe(lead.responsableId)} → ${nombreDe(responsableId)}`]);
    }

    if (!registros.length) return res.json(lead);

    cambios.actualizado = new Date().toISOString();
    const actualizado = await store.update('Leads', lead.id, cambios);
    if (!actualizado) return res.status(404).json({ message: 'Contacto no encontrado.' });
    for (const [accion, detalle] of registros) await registrar(lead.id, req.usuario, accion, detalle);

    // Avisar al consultor cuando otra persona le asigna el contacto
    if (cambios.responsableId && cambios.responsableId !== req.usuario.id) {
        const nuevo = equipo.find(u => u.id === cambios.responsableId);
        avisarAsignacion(actualizado, SERVICIOS[actualizado.servicio] || actualizado.servicio, nuevo, req.usuario);
    }
    res.json(actualizado);
}));

api.post('/leads/eliminar', auth.requireAdmin, asyncRoute(async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(id => typeof id === 'string' && id)) {
        return res.status(400).json({ message: 'Seleccione al menos un contacto.' });
    }
    // Se borran también sus notas e historial (derecho de supresión, Ley 1581)
    const borrar = new Set(ids);
    const borradas = await store.deleteWhere({
        Leads: l => borrar.has(l.id),
        Notas: n => borrar.has(n.leadId),
        Historial: h => borrar.has(h.leadId)
    });
    console.log(`${req.usuario.email} eliminó ${borradas.Leads} contacto(s).`);
    res.json({ eliminados: borradas.Leads });
}));

api.post('/leads/:id/notas', asyncRoute(async (req, res) => {
    const texto = String(req.body?.texto || '').trim();
    if (!texto || texto.length > 5000) return res.status(400).json({ message: 'La nota está vacía o es muy larga.' });

    const lead = await leadVisible(req, res);
    if (!lead) return;

    const nota = await store.add('Notas', {
        leadId: lead.id,
        fecha: new Date().toISOString(),
        texto,
        autorId: req.usuario.id,
        autorNombre: req.usuario.nombre
    });
    await store.update('Leads', lead.id, { actualizado: nota.fecha });
    res.status(201).json(nota);
}));

// ---------- Cuenta propia ----------

api.post('/cuenta/password', asyncRoute(async (req, res) => {
    const { actual, nueva } = req.body || {};
    if (!(await usuarios.verificarPassword(actual ?? '', req.usuario.passwordHash))) {
        return res.status(400).json({ message: 'La contraseña actual no es correcta.' });
    }
    const error = usuarios.validarPassword(nueva);
    if (error) return res.status(400).json({ message: error });

    const actualizado = await usuarios.actualizarUsuario(req.usuario.id, { password: nueva });
    // La sesión anterior deja de valer al cambiar la contraseña: se emite una nueva
    auth.emitirSesion(res, actualizado);
    res.json({ ok: true });
}));

// ---------- Usuarios (solo administradores) ----------

function datosUsuario(body, { parcial }) {
    const datos = {};
    const errores = [];
    if (body.nombre !== undefined || !parcial) {
        datos.nombre = String(body.nombre || '').trim();
        if (!datos.nombre || datos.nombre.length > 120) errores.push('Escriba el nombre.');
    }
    if (body.email !== undefined || !parcial) {
        datos.email = String(body.email || '').trim().toLowerCase();
        if (!EMAIL_REGEX.test(datos.email) || datos.email.length > 200) errores.push('Escriba un correo válido.');
    }
    if (body.rol !== undefined || !parcial) {
        datos.rol = body.rol;
        if (!usuarios.ROLES[datos.rol]) errores.push('Rol no válido.');
    }
    if (body.servicios !== undefined) {
        datos.servicios = Array.isArray(body.servicios) ? body.servicios.filter(s => SERVICIOS[s]) : [];
    }
    if (body.activo !== undefined) datos.activo = Boolean(body.activo);
    if (body.password !== undefined && body.password !== '' || !parcial) {
        const error = usuarios.validarPassword(body.password);
        if (error) errores.push(error);
        else datos.password = body.password;
    }
    return { datos, error: errores[0] };
}

api.get('/usuarios', auth.requireAdmin, asyncRoute(async (req, res) => {
    res.json((await usuarios.obtenerUsuarios()).map(usuarios.publico));
}));

api.post('/usuarios', auth.requireAdmin, asyncRoute(async (req, res) => {
    const { datos, error } = datosUsuario(req.body || {}, { parcial: false });
    if (error) return res.status(400).json({ message: error });
    if ((await usuarios.obtenerUsuarios()).some(u => u.email === datos.email)) {
        return res.status(400).json({ message: 'Ya existe un usuario con ese correo.' });
    }
    const usuario = await usuarios.crearUsuario(datos);
    console.log(`${req.usuario.email} creó el usuario ${usuario.email} (${usuario.rol}).`);
    res.status(201).json(usuarios.publico(usuario));
}));

api.patch('/usuarios/:id', auth.requireAdmin, asyncRoute(async (req, res) => {
    const equipo = await usuarios.obtenerUsuarios();
    const usuario = equipo.find(u => u.id === req.params.id);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado.' });

    const { datos, error } = datosUsuario(req.body || {}, { parcial: true });
    if (error) return res.status(400).json({ message: error });
    if (datos.email && datos.email !== usuario.email && equipo.some(u => u.email === datos.email)) {
        return res.status(400).json({ message: 'Ya existe un usuario con ese correo.' });
    }

    // Siempre debe quedar al menos un administrador activo
    const dejaDeSerAdmin = usuario.rol === 'admin' && usuario.activo &&
        ((datos.rol && datos.rol !== 'admin') || datos.activo === false);
    const adminsActivos = equipo.filter(u => u.rol === 'admin' && u.activo).length;
    if (dejaDeSerAdmin && adminsActivos <= 1) {
        return res.status(400).json({ message: 'Debe quedar al menos un administrador activo.' });
    }
    if (usuario.id === req.usuario.id && datos.activo === false) {
        return res.status(400).json({ message: 'No puede desactivar su propio usuario.' });
    }

    const actualizado = await usuarios.actualizarUsuario(usuario.id, datos);
    console.log(`${req.usuario.email} modificó el usuario ${actualizado.email}.`);
    res.json(usuarios.publico(actualizado));
}));

app.use('/api', api);

// Manejador de errores
app.use((error, req, res, next) => {
    const status = error.status || error.statusCode;
    if (status >= 400 && status < 500) {
        const mensajes = { 400: 'Solicitud no válida.', 413: 'La solicitud es demasiado grande.' };
        return res.status(status).json({ success: false, message: mensajes[status] || 'No se pudo procesar la solicitud.' });
    }
    console.error(error);
    res.status(500).json({ message: 'Error interno del servidor.' });
});

// ---------- Inicio ----------

store.init()
    .then(() => usuarios.crearAdministradorInicial())
    .then(() => {
        const server = app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
            console.log(`CRM en http://localhost:${PORT}/admin — datos en ${store.name}`);
            if (auth.SITIO_PRIVADO) console.log('Sitio privado: solo entra quien tenga cuenta en el CRM.');
            if (!avisosActivos) console.warn('Aviso: correo no configurado (SMTP_HOST / NOTIFY_EMAIL); no se enviarán avisos.');
        });

        // Cierre ordenado: deja de aceptar conexiones y termina las que están en curso
        const cerrar = senal => {
            console.log(`${senal} recibida: cerrando el servidor…`);
            server.close(() => process.exit(0));
            setTimeout(() => process.exit(0), 10000).unref();
        };
        process.on('SIGTERM', () => cerrar('SIGTERM'));
        process.on('SIGINT', () => cerrar('SIGINT'));
    })
    .catch(error => {
        console.error('No se pudo iniciar el almacenamiento:', error.message);
        process.exit(1);
    });
