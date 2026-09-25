// Simulador del servidor para la demostración portátil.
// Reproduce en el navegador la API del CRM (server.js) con datos ficticios en memoria:
// nada se guarda ni se envía. Se usa desde demo/shell.html.
(function () {
    const SERVICIOS = {
        sistemas: 'Ingeniería de Sistemas',
        ambiental: 'Ingeniería Ambiental',
        civil: 'Ingeniería Civil',
        mecanica: 'Ingeniería Mecánica',
        acreditacion: 'Acreditación en Educación Superior',
        general: 'Consulta General'
    };
    const ESTADOS = {
        nuevo: 'Nuevo',
        contactado: 'Contactado',
        propuesta: 'Propuesta enviada',
        ganado: 'Ganado',
        perdido: 'Perdido'
    };
    const ROLES = { admin: 'Administrador', consultor: 'Consultor' };
    const SISTEMA = { id: '', nombre: 'Sistema' };

    let secuencia = 0;
    const nuevoId = prefijo => `${prefijo}-${Date.now().toString(36)}-${(++secuencia).toString(36)}`;

    const pad = n => String(n).padStart(2, '0');
    const diaISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const haceDias = (dias, hora = 10) => {
        const d = new Date();
        d.setDate(d.getDate() - dias);
        d.setHours(hora, (dias * 7) % 60, 0, 0);
        return d;
    };
    const enDias = dias => {
        const d = new Date();
        d.setDate(d.getDate() + dias);
        return diaISO(d);
    };

    // ---------- Datos ficticios ----------

    function datosIniciales() {
        const usuarios = [
            { id: 'u-admin', nombre: 'Administrador (demo)', email: 'admin@demo.co', rol: 'admin', servicios: [] },
            { id: 'u-sis', nombre: 'Consultor de Sistemas', email: 'sistemas@demo.co', rol: 'consultor', servicios: ['sistemas'] },
            { id: 'u-amb', nombre: 'Consultora Ambiental', email: 'ambiental@demo.co', rol: 'consultor', servicios: ['ambiental'] },
            { id: 'u-civ', nombre: 'Consultor Civil', email: 'civil@demo.co', rol: 'consultor', servicios: ['civil'] },
            { id: 'u-mec', nombre: 'Consultor de Mecánica y Acreditación', email: 'mecanica@demo.co', rol: 'consultor', servicios: ['mecanica', 'acreditacion'] }
        ].map(u => ({ ...u, activo: true, creado: haceDias(200).toISOString() }));

        const responsablePorServicio = { sistemas: 'u-sis', ambiental: 'u-amb', civil: 'u-civ', mecanica: 'u-mec', acreditacion: 'u-mec' };

        // [nombre, servicio, días atrás, estado, seguimiento (días desde hoy o null), mensaje]
        const base = [
            ['María Fernanda López', 'acreditacion', 2, 'nuevo', null, 'Somos una institución universitaria y necesitamos acompañamiento para la renovación de la acreditación de dos programas.'],
            ['Jorge Castaño', 'civil', 3, 'nuevo', null, 'Requerimos interventoría para la construcción de una bodega de 2.000 m².'],
            ['Laura Restrepo', 'general', 4, 'nuevo', null, 'Quisiera conocer los servicios y tarifas de la firma.'],
            ['Andrés Beltrán', 'sistemas', 6, 'contactado', -2, 'Buscamos automatizar la facturación y el inventario de nuestra empresa.'],
            ['Carolina Ruiz', 'ambiental', 9, 'contactado', 0, 'Necesitamos un estudio de impacto ambiental para un proyecto agroindustrial.'],
            ['Felipe Ortega', 'mecanica', 15, 'propuesta', 3, 'Solicitamos una auditoría de eficiencia energética para nuestra planta.'],
            ['Natalia Gómez', 'acreditacion', 24, 'propuesta', 5, 'Preparación de documento maestro para registro calificado de un programa de posgrado.'],
            ['Ricardo Salazar', 'civil', 33, 'ganado', null, 'Diseño y supervisión de la ampliación de nuestra sede.'],
            ['Diana Moreno', 'sistemas', 41, 'ganado', null, 'Desarrollo de un sistema de gestión documental a la medida.'],
            ['Camilo Herrera', 'ambiental', 55, 'perdido', null, 'Plan de manejo ambiental para una estación de servicio.'],
            ['Paola Jiménez', 'acreditacion', 68, 'ganado', null, 'Autoevaluación institucional con fines de acreditación de alta calidad.'],
            ['Sergio Vargas', 'mecanica', 80, 'perdido', null, 'Mantenimiento preventivo de equipos industriales.'],
            ['Valentina Cárdenas', 'sistemas', 96, 'ganado', null, 'Migración de nuestros sistemas a la nube.'],
            ['Óscar Pineda', 'civil', 118, 'perdido', null, 'Consultoría en urbanismo para un proyecto de vivienda.'],
            ['Juliana Rincón', 'ambiental', 140, 'ganado', null, 'Auditoría de cumplimiento normativo ambiental.'],
            ['Mauricio Duarte', 'acreditacion', 165, 'propuesta', -4, 'Acompañamiento en la visita de pares académicos.']
        ];

        const leads = [];
        const notas = [];
        const historial = [];
        base.forEach(([nombre, servicio, dias, estado, seguimiento, mensaje], i) => {
            const creado = haceDias(dias, 8 + (i % 9)).toISOString();
            const usuario = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.');
            const responsableId = responsablePorServicio[servicio] || '';
            const lead = {
                id: `l-${i + 1}`,
                creado,
                nombre,
                email: `${usuario}@example.com`,
                telefono: `300 000 ${pad(i + 10)}${pad(i + 20)}`,
                servicio,
                mensaje,
                estado,
                proximoSeguimiento: seguimiento === null ? '' : enDias(seguimiento),
                autorizacionDatos: creado,
                politicaVersion: '1.0',
                actualizado: creado,
                responsableId
            };
            leads.push(lead);

            const responsable = usuarios.find(u => u.id === responsableId);
            const evento = (fechaMs, usuarioEv, accion, detalle) => historial.push({
                id: nuevoId('h'), leadId: lead.id, fecha: new Date(fechaMs).toISOString(),
                usuarioId: usuarioEv.id, usuarioNombre: usuarioEv.nombre, accion, detalle
            });
            const t0 = new Date(creado).getTime();
            evento(t0, SISTEMA, 'creado', 'Recibido desde el formulario web');
            if (responsable) evento(t0 + 1000, SISTEMA, 'asignado', `Asignado automáticamente a ${responsable.nombre} (${SERVICIOS[servicio]})`);
            if (estado !== 'nuevo' && responsable) {
                evento(t0 + 86400000, responsable, 'estado', `Estado: Nuevo → ${ESTADOS.contactado}`);
                notas.push({ id: nuevoId('n'), leadId: lead.id, fecha: new Date(t0 + 86400000).toISOString(),
                    texto: 'Primera llamada: se revisó el alcance y se acordó enviar información.', autorId: responsable.id, autorNombre: responsable.nombre });
                if (estado !== 'contactado') {
                    const final = estado === 'propuesta' ? ESTADOS.propuesta : ESTADOS[estado];
                    evento(t0 + 5 * 86400000, responsable, 'estado', `Estado: ${ESTADOS.contactado} → ${final}`);
                }
                lead.actualizado = new Date(t0 + 5 * 86400000).toISOString();
            }
        });

        return { usuarios, leads, notas, historial };
    }

    // ---------- API simulada ----------

    function crearBackend() {
        let db = datosIniciales();

        const publico = u => ({ ...u });
        const puedeVer = (usuario, lead) => usuario.rol === 'admin' || !lead.responsableId || lead.responsableId === usuario.id;
        const registrar = (leadId, usuario, accion, detalle) => db.historial.push({
            id: nuevoId('h'), leadId, fecha: new Date().toISOString(), usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion, detalle
        });
        const ok = data => ({ status: 200, data });
        const error = (status, message) => ({ status, data: { message } });

        function contacto(body) {
            const nombre = String(body.name || '').trim();
            const email = String(body.email || '').trim();
            const telefono = String(body.phone || '').trim();
            const mensaje = String(body.message || '').trim();
            const servicio = SERVICIOS[body['service-type']] ? body['service-type'] : 'general';
            if (!nombre || !mensaje || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return error(400, 'Revise que el nombre, el correo y el mensaje sean válidos.');
            }
            if (telefono.replace(/\D/g, '').length < 7) return error(400, 'Escriba un número de contacto válido (mínimo 7 dígitos).');
            if (body.autorizacion !== 'si') return error(400, 'Para enviar la solicitud debe autorizar el tratamiento de sus datos personales.');

            const candidatos = db.usuarios.filter(u => u.activo && u.servicios.includes(servicio));
            const responsable = candidatos.length === 1 ? candidatos[0] : null;
            const ahora = new Date().toISOString();
            const lead = {
                id: nuevoId('l'), creado: ahora, nombre, email, telefono, servicio, mensaje, estado: 'nuevo',
                proximoSeguimiento: '', autorizacionDatos: ahora, politicaVersion: '1.0', actualizado: ahora,
                responsableId: responsable?.id || ''
            };
            db.leads.push(lead);
            registrar(lead.id, SISTEMA, 'creado', 'Recibido desde el formulario web');
            if (responsable) registrar(lead.id, SISTEMA, 'asignado', `Asignado automáticamente a ${responsable.nombre} (${SERVICIOS[servicio]})`);
            return { status: 200, data: { success: true, message: 'Gracias por su interés. Un consultor se comunicará con usted pronto.' },
                evento: { tipo: 'nuevo-contacto', lead, responsable } };
        }

        function api(method, ruta, body, usuario) {
            const leadVisible = id => {
                const lead = db.leads.find(l => l.id === id);
                return lead && puedeVer(usuario, lead) ? lead : null;
            };
            let m;

            if (method === 'GET' && ruta === '/api/meta') {
                return ok({
                    servicios: SERVICIOS, estados: ESTADOS, roles: ROLES, usuario: publico(usuario),
                    equipo: db.usuarios.map(u => ({ id: u.id, nombre: u.nombre, rol: u.rol, activo: u.activo, servicios: u.servicios })),
                    almacenamiento: 'Demostración (datos ficticios en memoria)', avisosActivos: true
                });
            }
            if (method === 'GET' && ruta === '/api/leads') {
                return ok(db.leads.filter(l => puedeVer(usuario, l)).map(l => ({ ...l })).sort((a, b) => b.creado.localeCompare(a.creado)));
            }
            if (method === 'POST' && ruta === '/api/leads/eliminar') {
                if (usuario.rol !== 'admin') return error(403, 'Solo un administrador puede hacer esto.');
                const borrar = new Set(body.ids || []);
                const antes = db.leads.length;
                db.leads = db.leads.filter(l => !borrar.has(l.id));
                db.notas = db.notas.filter(n => !borrar.has(n.leadId));
                db.historial = db.historial.filter(h => !borrar.has(h.leadId));
                return ok({ eliminados: antes - db.leads.length });
            }
            if ((m = ruta.match(/^\/api\/leads\/([^/]+)\/notas$/)) && method === 'POST') {
                const lead = leadVisible(decodeURIComponent(m[1]));
                if (!lead) return error(404, 'Contacto no encontrado.');
                const texto = String(body.texto || '').trim();
                if (!texto) return error(400, 'La nota está vacía o es muy larga.');
                const nota = { id: nuevoId('n'), leadId: lead.id, fecha: new Date().toISOString(), texto, autorId: usuario.id, autorNombre: usuario.nombre };
                db.notas.push(nota);
                lead.actualizado = nota.fecha;
                return { status: 201, data: nota };
            }
            if ((m = ruta.match(/^\/api\/leads\/([^/]+)$/))) {
                const lead = leadVisible(decodeURIComponent(m[1]));
                if (!lead) return error(404, 'Contacto no encontrado.');
                const porFecha = (a, b) => b.fecha.localeCompare(a.fecha);
                if (method === 'GET') {
                    return ok({ ...lead,
                        notas: db.notas.filter(n => n.leadId === lead.id).sort(porFecha),
                        historial: db.historial.filter(h => h.leadId === lead.id).sort(porFecha) });
                }
                if (method === 'PATCH') {
                    const nombreDe = id => db.usuarios.find(u => u.id === id)?.nombre || 'Sin asignar';
                    const registros = [];
                    const { estado, proximoSeguimiento, responsableId } = body;
                    if (estado !== undefined && estado !== lead.estado) {
                        registros.push(['estado', `Estado: ${ESTADOS[lead.estado]} → ${ESTADOS[estado]}`, () => { lead.estado = estado; }]);
                    }
                    if (proximoSeguimiento !== undefined && proximoSeguimiento !== lead.proximoSeguimiento) {
                        registros.push(['seguimiento', `Próximo seguimiento: ${lead.proximoSeguimiento || '—'} → ${proximoSeguimiento || '—'}`, () => { lead.proximoSeguimiento = proximoSeguimiento; }]);
                    }
                    if (responsableId !== undefined && responsableId !== lead.responsableId) {
                        const toma = responsableId === usuario.id && !lead.responsableId;
                        if (usuario.rol !== 'admin' && !toma) return error(403, 'Solo un administrador puede reasignar contactos.');
                        registros.push(['asignado', `Responsable: ${nombreDe(lead.responsableId)} → ${nombreDe(responsableId)}`, () => { lead.responsableId = responsableId; }]);
                    }
                    for (const [accion, detalle, aplicar] of registros) {
                        aplicar();
                        registrar(lead.id, usuario, accion, detalle);
                    }
                    if (registros.length) lead.actualizado = new Date().toISOString();
                    return ok({ ...lead });
                }
            }
            if (ruta === '/api/cuenta/password' && method === 'POST') {
                return ok({ ok: true });
            }
            if (ruta === '/api/usuarios' || ruta.startsWith('/api/usuarios/')) {
                if (usuario.rol !== 'admin') return error(403, 'Solo un administrador puede hacer esto.');
                if (method === 'GET') return ok(db.usuarios.map(publico));
                if (method === 'POST') {
                    if (!body.nombre || !body.email) return error(400, 'Escriba el nombre y el correo.');
                    if (db.usuarios.some(u => u.email === String(body.email).toLowerCase())) return error(400, 'Ya existe un usuario con ese correo.');
                    if (String(body.password || '').length < 10) return error(400, 'La contraseña debe tener al menos 10 caracteres.');
                    const nuevo = { id: nuevoId('u'), nombre: body.nombre, email: String(body.email).toLowerCase(), rol: body.rol,
                        servicios: body.servicios || [], activo: true, creado: new Date().toISOString() };
                    db.usuarios.push(nuevo);
                    return { status: 201, data: publico(nuevo) };
                }
                if (method === 'PATCH') {
                    const u = db.usuarios.find(x => x.id === decodeURIComponent(ruta.split('/').pop()));
                    if (!u) return error(404, 'Usuario no encontrado.');
                    if (u.id === usuario.id && body.activo === false) return error(400, 'No puede desactivar su propio usuario.');
                    const admins = db.usuarios.filter(x => x.rol === 'admin' && x.activo).length;
                    if (u.rol === 'admin' && admins <= 1 && ((body.rol && body.rol !== 'admin') || body.activo === false)) {
                        return error(400, 'Debe quedar al menos un administrador activo.');
                    }
                    for (const campo of ['nombre', 'email', 'rol', 'servicios', 'activo']) if (body[campo] !== undefined) u[campo] = body[campo];
                    return ok(publico(u));
                }
            }
            return error(404, 'No encontrado.');
        }

        return {
            usuarios: () => db.usuarios,
            reiniciar: () => { db = datosIniciales(); },
            manejar(method, ruta, body, usuarioId) {
                if (ruta === '/contact' && method === 'POST') return contacto(body);
                const usuario = db.usuarios.find(u => u.id === usuarioId && u.activo) || db.usuarios[0];
                return api(method, ruta, body, usuario);
            }
        };
    }

    window.DemoBackend = { crearBackend };
})();
