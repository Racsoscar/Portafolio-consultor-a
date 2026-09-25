const express = require('express');
const path = require('path');
const { SERVICIOS, ESTADOS } = require('./lib/constants');
const { createStore } = require('./lib/store');
const auth = require('./lib/auth');
const usuarios = require('./lib/usuarios');
const { avisarNuevoLead, avisosActivos } = require('./lib/notify');
const { datosCorporacion, servirPlantillas, logoSvg } = require('./lib/corporacion');

const app = express();
const PORT = process.env.PORT || 3000;
const store = createStore();
usuarios.configurarUsuarios(store);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TELEFONO_REGEX = /^[0-9+()\s-]{7,20}$/;
const SISTEMA = { id: '', nombre: 'Sistema' };

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

// Las páginas HTML se sirven con los datos de config/corporacion.json ya reemplazados
const publicDir = path.join(__dirname, 'public');
app.get('/logo.svg', (req, res) => res.type('image/svg+xml').send(logoSvg()));
app.use(servirPlantillas(publicDir));
app.use(express.static(publicDir));

// ---------- Formulario de contacto de la página ----------

app.post('/contact', asyncRoute(async (req, res) => {
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
        responsable = await usuarios.responsablePorServicio(servicio);
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
    if (await auth.usuarioDeSesion(req)) return res.redirect('/admin');
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
        avisosActivos
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
    console.error(error);
    res.status(500).json({ message: 'Error interno del servidor.' });
});

// ---------- Inicio ----------

store.init()
    .then(() => usuarios.crearAdministradorInicial())
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
            console.log(`CRM en http://localhost:${PORT}/admin — datos en ${store.name}`);
            if (!avisosActivos) console.warn('Aviso: correo no configurado (SMTP_HOST / NOTIFY_EMAIL); no se enviarán avisos.');
        });
    })
    .catch(error => {
        console.error('No se pudo iniciar el almacenamiento:', error.message);
        process.exit(1);
    });
