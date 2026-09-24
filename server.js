const express = require('express');
const path = require('path');
const { SERVICIOS, ESTADOS } = require('./lib/constants');
const { createStore } = require('./lib/store');
const auth = require('./lib/auth');
const { avisarNuevoLead, avisosActivos } = require('./lib/notify');

const app = express();
const PORT = process.env.PORT || 3000;
const store = createStore();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TELEFONO_REGEX = /^[0-9+()\s-]{7,20}$/;

// Envuelve rutas async para que los errores lleguen al manejador de errores
const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);

// Middleware: solo se publica la carpeta public/, nunca el código del servidor ni .env
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Formulario de contacto de la página ----------

app.post('/contact', asyncRoute(async (req, res) => {
    const nombre = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const telefono = String(req.body.phone || '').trim().replace(/\s+/g, ' ');
    const mensaje = String(req.body.message || '').trim();
    const servicio = SERVICIOS[req.body['service-type']] ? req.body['service-type'] : 'general';

    if (!nombre || !mensaje || !EMAIL_REGEX.test(email) || nombre.length > 200 || email.length > 200 || mensaje.length > 5000) {
        return res.status(400).json({ success: false, message: 'Revisa que el nombre, el correo y el mensaje sean válidos.' });
    }
    if (!TELEFONO_REGEX.test(telefono) || telefono.replace(/\D/g, '').length < 7) {
        return res.status(400).json({ success: false, message: 'Escribe un número de contacto válido (mínimo 7 dígitos).' });
    }

    const ahora = new Date().toISOString();
    let lead;
    try {
        lead = await store.addLead({
            creado: ahora,
            nombre,
            email,
            telefono,
            servicio,
            mensaje,
            estado: 'nuevo',
            proximoSeguimiento: '',
            actualizado: ahora
        });
    } catch (error) {
        console.error('Error al guardar el contacto:', error);
        return res.status(502).json({ success: false, message: 'Error al procesar el formulario. Inténtalo de nuevo más tarde.' });
    }

    avisarNuevoLead(lead, SERVICIOS[servicio]);
    res.json({ success: true, message: '¡Gracias por tu interés! Nos pondremos en contacto pronto.' });
}));

// ---------- Panel del CRM ----------

const adminDir = path.join(__dirname, 'admin');

app.use('/admin/assets', express.static(path.join(adminDir, 'assets')));

app.get('/admin/login', (req, res) => {
    if (auth.sesionValida(req)) return res.redirect('/admin');
    res.sendFile(path.join(adminDir, 'login.html'));
});
app.post('/admin/login', auth.login);
app.post('/admin/logout', auth.logout);
app.get('/admin', auth.requireAuthPage, (req, res) => {
    res.sendFile(path.join(adminDir, 'index.html'));
});

// ---------- API del CRM (requiere sesión) ----------

const api = express.Router();
api.use(auth.requireAuthApi);

api.get('/meta', (req, res) => {
    res.json({ servicios: SERVICIOS, estados: ESTADOS, almacenamiento: store.name, avisosActivos });
});

api.get('/leads', asyncRoute(async (req, res) => {
    const leads = await store.listLeads();
    leads.sort((a, b) => b.creado.localeCompare(a.creado));
    res.json(leads);
}));

api.get('/leads/:id', asyncRoute(async (req, res) => {
    const lead = await store.getLead(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Contacto no encontrado.' });
    const notas = await store.listNotas(lead.id);
    notas.sort((a, b) => b.fecha.localeCompare(a.fecha));
    res.json({ ...lead, notas });
}));

api.patch('/leads/:id', asyncRoute(async (req, res) => {
    const cambios = {};
    const { estado, proximoSeguimiento } = req.body || {};

    if (estado !== undefined) {
        if (!ESTADOS[estado]) return res.status(400).json({ message: 'Estado no válido.' });
        cambios.estado = estado;
    }
    if (proximoSeguimiento !== undefined) {
        if (proximoSeguimiento !== '' && !FECHA_REGEX.test(proximoSeguimiento)) {
            return res.status(400).json({ message: 'Fecha de seguimiento no válida.' });
        }
        cambios.proximoSeguimiento = proximoSeguimiento;
    }
    cambios.actualizado = new Date().toISOString();

    const lead = await store.updateLead(req.params.id, cambios);
    if (!lead) return res.status(404).json({ message: 'Contacto no encontrado.' });
    res.json(lead);
}));

api.post('/leads/eliminar', asyncRoute(async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(id => typeof id === 'string' && id)) {
        return res.status(400).json({ message: 'Selecciona al menos un contacto.' });
    }
    const eliminados = await store.deleteLeads(ids);
    res.json({ eliminados });
}));

api.post('/leads/:id/notas', asyncRoute(async (req, res) => {
    const texto = String(req.body?.texto || '').trim();
    if (!texto || texto.length > 5000) return res.status(400).json({ message: 'La nota está vacía o es muy larga.' });

    const lead = await store.getLead(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Contacto no encontrado.' });

    const nota = await store.addNota({ leadId: lead.id, fecha: new Date().toISOString(), texto });
    await store.updateLead(lead.id, { actualizado: nota.fecha });
    res.status(201).json(nota);
}));

app.use('/api', api);

// Manejador de errores
app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: 'Error interno del servidor.' });
});

// ---------- Inicio ----------

store.init()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
            console.log(`CRM en http://localhost:${PORT}/admin — datos en ${store.name}`);
            if (!process.env.ADMIN_PASSWORD) console.warn('Aviso: ADMIN_PASSWORD no está configurada; no se podrá entrar al CRM.');
            if (!avisosActivos) console.warn('Aviso: correo no configurado (SMTP_HOST / NOTIFY_EMAIL); no se enviarán avisos.');
        });
    })
    .catch(error => {
        console.error('No se pudo iniciar el almacenamiento:', error.message);
        process.exit(1);
    });
