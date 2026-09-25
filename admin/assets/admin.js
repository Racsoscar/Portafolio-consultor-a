const $ = (selector, root = document) => root.querySelector(selector);

// Crea elementos del DOM. El texto siempre entra como texto, nunca como HTML.
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'style') el.style.cssText = value;
        else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
        if (child == null || child === false) continue;
        el.append(child instanceof Node ? child : String(child));
    }
    return el;
}

let meta = { servicios: {}, estados: {}, roles: {}, equipo: [], usuario: null };
let leads = [];
let usuarios = [];
let leadAbierto = null;

// ---------- Utilidades ----------

async function api(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    if (res.status === 401) {
        location.href = '/admin/login' + location.hash;
        throw new Error('Sesión expirada');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Error inesperado');
    return data;
}

let toastTimer;
function toast(texto, esError = false) {
    const el = $('#toast');
    el.textContent = texto;
    el.classList.toggle('toast-error', esError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

const pad = n => String(n).padStart(2, '0');
const fechaLocalISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoyISO = () => fechaLocalISO(new Date());
const claveMes = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function sumarDias(iso, dias) {
    const [y, m, d] = iso.split('-').map(Number);
    return fechaLocalISO(new Date(y, m - 1, d + dias));
}

const fmtDia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDiaHora = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'short' });
const fmtMesLargo = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

// 'YYYY-MM-DD' se interpreta como fecha local (no UTC)
function fechaDeDia(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// Número para wa.me: solo dígitos y con indicativo. Si es un celular
// colombiano de 10 dígitos sin indicativo, se antepone el 57.
function whatsapp(telefono) {
    const digitos = telefono.replace(/\D/g, '');
    return digitos.length === 10 && digitos.startsWith('3') ? `57${digitos}` : digitos;
}

const nombreServicio = clave => meta.servicios[clave] || clave || 'Sin servicio';
const nombreEstado = clave => meta.estados[clave] || clave;
const estaAbierto = lead => lead.estado !== 'ganado' && lead.estado !== 'perdido';
const esAdmin = () => meta.usuario?.rol === 'admin';
const nombreUsuario = id => id
    ? (meta.equipo.find(u => u.id === id)?.nombre || 'Usuario eliminado')
    : 'Sin asignar';

function badgeEstado(estado) {
    return h('span', { class: `badge badge-${estado}` }, nombreEstado(estado));
}

function badgeSeguimiento(lead) {
    if (!lead.proximoSeguimiento || !estaAbierto(lead)) return h('span', { class: 'fecha-badge' }, '—');
    const hoy = hoyISO();
    const fecha = lead.proximoSeguimiento;
    if (fecha < hoy) return h('span', { class: 'fecha-badge fecha-vencida' }, `Vencido · ${fmtDia.format(fechaDeDia(fecha))}`);
    if (fecha === hoy) return h('span', { class: 'fecha-badge fecha-hoy' }, 'Hoy');
    return h('span', { class: 'fecha-badge' }, fmtDia.format(fechaDeDia(fecha)));
}

// ---------- Tooltip de las gráficas ----------

const tooltip = $('#tooltip');

function conTooltip(el, texto) {
    el.tabIndex = 0;
    el.setAttribute('aria-label', texto);
    const mostrar = (x, y) => {
        tooltip.textContent = texto;
        tooltip.hidden = false;
        const { width, height } = tooltip.getBoundingClientRect();
        tooltip.style.left = `${Math.min(x + 12, window.innerWidth - width - 8)}px`;
        tooltip.style.top = `${Math.max(y - height - 12, 8)}px`;
    };
    el.addEventListener('mousemove', e => mostrar(e.clientX, e.clientY));
    el.addEventListener('focus', () => {
        const r = el.getBoundingClientRect();
        mostrar(r.left + r.width / 2, r.top);
    });
    el.addEventListener('mouseleave', () => { tooltip.hidden = true; });
    el.addEventListener('blur', () => { tooltip.hidden = true; });
    return el;
}

function barras(contenedor, items, total) {
    contenedor.replaceChildren();
    const max = Math.max(...items.map(i => i.valor), 1);
    if (!total) {
        contenedor.append(h('p', { class: 'empty' }, 'Aún no hay contactos.'));
        return;
    }
    for (const item of items) {
        const porcentaje = Math.round((item.valor / total) * 100);
        contenedor.append(conTooltip(
            h('div', { class: 'bar-row' },
                h('span', { class: 'bar-label' }, item.etiqueta),
                h('span', { class: 'bar-track' },
                    h('span', { class: 'bar', style: `width: ${(item.valor / max) * 85}%` }),
                    h('span', { class: 'bar-value' }, item.valor))),
            `${item.etiqueta}: ${item.valor} (${porcentaje}%)`
        ));
    }
}

function columnasPorMes(contenedor) {
    const ahora = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
        const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
        meses.push({ clave: claveMes(fecha), fecha, valor: 0 });
    }
    for (const lead of leads) {
        const mes = meses.find(m => m.clave === claveMes(new Date(lead.creado)));
        if (mes) mes.valor++;
    }

    const max = Math.max(...meses.map(m => m.valor), 1);
    contenedor.replaceChildren(...meses.map(m => conTooltip(
        h('div', { class: 'col' },
            h('span', { class: 'col-value' }, m.valor),
            h('span', { class: 'col-bar', style: `height: ${(m.valor / max) * 80}%` })),
        `${fmtMesLargo.format(m.fecha)}: ${m.valor} contacto${m.valor === 1 ? '' : 's'}`
    )));

    const etiquetas = h('div', { class: 'col-labels', 'aria-hidden': 'true' },
        meses.map(m => h('span', {}, fmtMes.format(m.fecha).replace('.', ''))));
    contenedor.nextElementSibling?.classList.contains('col-labels')
        ? contenedor.nextElementSibling.replaceWith(etiquetas)
        : contenedor.after(etiquetas);
}

// ---------- Tablero ----------

function tile(etiqueta, valor, detalle) {
    return h('div', { class: 'tile' },
        h('div', { class: 'tile-label' }, etiqueta),
        h('div', { class: 'tile-value' }, valor),
        h('div', { class: 'tile-detail' }, detalle));
}

function renderTablero() {
    const ahora = new Date();
    const mesActual = claveMes(ahora);
    const mesAnterior = claveMes(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1));
    const delMes = leads.filter(l => claveMes(new Date(l.creado)) === mesActual).length;
    const delMesAnterior = leads.filter(l => claveMes(new Date(l.creado)) === mesAnterior).length;
    const diferencia = delMes - delMesAnterior;

    const ganados = leads.filter(l => l.estado === 'ganado').length;
    const cerrados = ganados + leads.filter(l => l.estado === 'perdido').length;
    const sinAtender = leads.filter(l => l.estado === 'nuevo').length;

    const hoy = hoyISO();
    const vencidos = leads.filter(l => estaAbierto(l) && l.proximoSeguimiento && l.proximoSeguimiento < hoy).length;

    const deltaTexto = diferencia === 0
        ? 'Igual que el mes anterior'
        : h('span', { class: diferencia > 0 ? 'delta-up' : 'delta-down' },
            `${diferencia > 0 ? '▲ +' : '▼ '}${diferencia} vs. mes anterior`);

    $('#tiles').replaceChildren(
        tile('Contactos totales', leads.length, `${leads.filter(estaAbierto).length} en curso`),
        tile('Contactos este mes', delMes, deltaTexto),
        tile('Sin atender', sinAtender, 'En estado "Nuevo"'),
        tile('Tasa de conversión', cerrados ? `${Math.round((ganados / cerrados) * 100)}%` : '—',
            cerrados ? `${ganados} ganados de ${cerrados} cerrados` : 'Aún no hay contactos cerrados'),
        tile('Seguimientos vencidos', vencidos, vencidos ? h('span', { class: 'delta-down' }, 'Requieren atención') : 'Todo al día')
    );

    // Seguimientos: vencidos y próximos 7 días
    const limite = sumarDias(hoy, 7);
    const pendientes = leads
        .filter(l => estaAbierto(l) && l.proximoSeguimiento && l.proximoSeguimiento <= limite)
        .sort((a, b) => a.proximoSeguimiento.localeCompare(b.proximoSeguimiento));
    $('#seguimientos').replaceChildren(...(pendientes.length
        ? pendientes.map(lead => h('li', {},
            h('button', { class: 'seguimiento', onclick: () => abrirLead(lead.id) },
                h('span', {},
                    h('span', { class: 'seguimiento-nombre' }, lead.nombre), ' ',
                    h('span', { class: 'seguimiento-servicio' }, `· ${nombreServicio(lead.servicio)} · ${nombreEstado(lead.estado)}`)),
                badgeSeguimiento(lead))))
        : [h('li', { class: 'empty' }, 'No hay seguimientos pendientes esta semana.')]));

    columnasPorMes($('#chart-meses'));

    barras($('#chart-servicios'),
        Object.entries(meta.servicios)
            .map(([clave, etiqueta]) => ({ etiqueta, valor: leads.filter(l => l.servicio === clave).length }))
            .sort((a, b) => b.valor - a.valor),
        leads.length);

    barras($('#chart-estados'),
        Object.entries(meta.estados)
            .map(([clave, etiqueta]) => ({ etiqueta, valor: leads.filter(l => l.estado === clave).length })),
        leads.length);
}

// ---------- Lista de contactos ----------

// Contactos seleccionados para eliminar
const seleccion = new Set();
let visibles = [];

function actualizarSeleccion() {
    const total = seleccion.size;
    $('#barra-seleccion').hidden = total === 0;
    $('#seleccion-texto').textContent = `${total} contacto${total === 1 ? '' : 's'} seleccionado${total === 1 ? '' : 's'}`;

    const todos = $('#seleccionar-todos');
    const marcados = visibles.filter(l => seleccion.has(l.id)).length;
    todos.checked = visibles.length > 0 && marcados === visibles.length;
    todos.indeterminate = marcados > 0 && marcados < visibles.length;

    for (const fila of document.querySelectorAll('#tabla-leads tr')) {
        const marcado = seleccion.has(fila.dataset.id);
        fila.classList.toggle('seleccionada', marcado);
        fila.querySelector('input[type=checkbox]').checked = marcado;
    }
}

function renderTabla() {
    const texto = $('#filtro-texto').value.trim().toLowerCase();
    const estado = $('#filtro-estado').value;
    const servicio = $('#filtro-servicio').value;
    const responsable = $('#filtro-responsable').value;
    const coincideResponsable = l =>
        !responsable ||
        (responsable === '__sin' ? !l.responsableId : l.responsableId === (responsable === '__mio' ? meta.usuario.id : responsable));

    visibles = leads.filter(l =>
        (!estado || l.estado === estado) &&
        (!servicio || l.servicio === servicio) &&
        coincideResponsable(l) &&
        (!texto || `${l.nombre} ${l.email} ${l.telefono || ''} ${l.mensaje}`.toLowerCase().includes(texto)));

    // Solo se puede eliminar lo que está a la vista: al filtrar se descarta el resto
    const idsVisibles = new Set(visibles.map(l => l.id));
    for (const id of seleccion) if (!idsVisibles.has(id)) seleccion.delete(id);

    $('#tabla-leads').replaceChildren(...visibles.map(lead => {
        const abrir = () => abrirLead(lead.id);
        const casilla = h('input', {
            type: 'checkbox',
            'aria-label': `Seleccionar a ${lead.nombre}`,
            onclick: e => e.stopPropagation(),
            onchange: e => {
                e.target.checked ? seleccion.add(lead.id) : seleccion.delete(lead.id);
                actualizarSeleccion();
            }
        });
        return h('tr', { 'data-id': lead.id, tabindex: 0, onclick: abrir, onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) abrir(); } },
            h('td', { class: 'td-check', onclick: e => { e.stopPropagation(); if (e.target !== casilla) casilla.click(); } }, casilla),
            h('td', { class: 'td-fecha' }, fmtDia.format(new Date(lead.creado))),
            h('td', {}, lead.nombre,
                h('span', { class: 'td-email' }, lead.email),
                lead.telefono && h('span', { class: 'td-email' }, lead.telefono)),
            h('td', {}, nombreServicio(lead.servicio)),
            h('td', { class: lead.responsableId ? '' : 'sin-asignar' }, nombreUsuario(lead.responsableId)),
            h('td', {}, badgeEstado(lead.estado)),
            h('td', {}, badgeSeguimiento(lead)));
    }));
    $('#tabla-vacia').hidden = visibles.length > 0;
    actualizarSeleccion();
}

function seleccionarTodos(marcar) {
    for (const lead of visibles) marcar ? seleccion.add(lead.id) : seleccion.delete(lead.id);
    actualizarSeleccion();
}

async function eliminarSeleccionados() {
    const elegidos = leads.filter(l => seleccion.has(l.id));
    if (!elegidos.length) return;

    // Confirmación: muestra hasta 5 nombres
    const dialogo = $('#confirmar-eliminar');
    $('#confirmar-titulo').textContent = elegidos.length === 1
        ? '¿Eliminar este contacto?'
        : `¿Eliminar ${elegidos.length} contactos?`;
    $('#confirmar-lista').replaceChildren(
        ...elegidos.slice(0, 5).map(l => h('li', {}, `${l.nombre} (${l.email})`)),
        ...(elegidos.length > 5 ? [h('li', {}, `y ${elegidos.length - 5} más`)] : []));
    dialogo.returnValue = '';
    dialogo.showModal();
    await new Promise(resolve => dialogo.addEventListener('close', resolve, { once: true }));
    if (dialogo.returnValue !== 'eliminar') return;

    const boton = $('#seleccion-eliminar');
    boton.disabled = true;
    try {
        const ids = elegidos.map(l => l.id);
        const { eliminados } = await api('/api/leads/eliminar', { method: 'POST', body: JSON.stringify({ ids }) });
        const borrados = new Set(ids);
        leads = leads.filter(l => !borrados.has(l.id));
        seleccion.clear();
        if (leadAbierto && borrados.has(leadAbierto)) cerrarLead();
        renderTodo();
        toast(`${eliminados} contacto${eliminados === 1 ? '' : 's'} eliminado${eliminados === 1 ? '' : 's'}`);
    } catch (error) {
        toast(error.message, true);
    } finally {
        boton.disabled = false;
    }
}

// ---------- Ficha del contacto ----------

function mostrarDrawer(visible) {
    $('#drawer').hidden = !visible;
    $('#drawer-fondo').hidden = !visible;
}

function cerrarLead() {
    leadAbierto = null;
    mostrarDrawer(false);
    history.replaceState(null, '', location.pathname);
}

async function abrirLead(id) {
    leadAbierto = id;
    history.replaceState(null, '', `#lead=${id}`);
    const contenido = $('#drawer-contenido');
    contenido.replaceChildren(h('p', { class: 'muted' }, 'Cargando…'));
    mostrarDrawer(true);
    $('#drawer-cerrar').focus();

    let lead;
    try {
        lead = await api(`/api/leads/${encodeURIComponent(id)}`);
    } catch (error) {
        contenido.replaceChildren(h('p', { class: 'form-error' }, error.message));
        return;
    }
    if (leadAbierto !== id) return;
    renderFicha(lead);
}

// Guarda cambios del contacto y vuelve a pintar la ficha con el historial actualizado
async function guardarLead(id, cambios) {
    const actualizado = await api(`/api/leads/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(cambios)
    });
    Object.assign(leads.find(l => l.id === id) || {}, actualizado);
    renderTodo();
    if (leadAbierto === id) renderFicha(await api(`/api/leads/${encodeURIComponent(id)}`));
    toast('Cambios guardados');
}

function renderFicha(lead) {
    const selectEstado = h('select', { id: 'ficha-estado' },
        Object.entries(meta.estados).map(([clave, etiqueta]) =>
            h('option', { value: clave, selected: clave === lead.estado }, etiqueta)));
    const inputFecha = h('input', { type: 'date', id: 'ficha-seguimiento', value: lead.proximoSeguimiento || '' });

    // Responsable: el administrador elige de la lista; el consultor puede tomar un contacto sin asignar
    const opcionesResponsable = meta.equipo.filter(u => u.activo || u.id === lead.responsableId);
    const selectResponsable = esAdmin() && h('select', { id: 'ficha-responsable' },
        h('option', { value: '' }, 'Sin asignar'),
        opcionesResponsable.map(u => h('option', { value: u.id, selected: u.id === lead.responsableId },
            `${u.nombre}${u.activo ? '' : ' (inactivo)'}`)));

    const formEstado = h('form', { class: 'ficha-form', onsubmit: async e => {
        e.preventDefault();
        const boton = formEstado.querySelector('button[type=submit]');
        boton.disabled = true;
        try {
            const cambios = { estado: selectEstado.value, proximoSeguimiento: inputFecha.value };
            if (selectResponsable) cambios.responsableId = selectResponsable.value;
            await guardarLead(lead.id, cambios);
        } catch (error) {
            toast(error.message, true);
            boton.disabled = false;
        }
    } },
        h('div', {}, h('label', { for: 'ficha-estado' }, 'Estado'), selectEstado),
        h('div', {}, h('label', { for: 'ficha-seguimiento' }, 'Próximo seguimiento'), inputFecha),
        selectResponsable && h('div', { class: 'campo-ancho' }, h('label', { for: 'ficha-responsable' }, 'Responsable'), selectResponsable),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar cambios'));

    let responsableTexto = nombreUsuario(lead.responsableId);
    if (!esAdmin() && !lead.responsableId) {
        responsableTexto = [
            'Sin asignar ',
            h('button', { type: 'button', class: 'btn btn-secundario btn-mini', onclick: async e => {
                e.target.disabled = true;
                try {
                    await guardarLead(lead.id, { responsableId: meta.usuario.id });
                } catch (error) {
                    toast(error.message, true);
                    e.target.disabled = false;
                }
            } }, 'Asignármelo')
        ];
    }

    const textoNota = h('textarea', { id: 'nota-texto', rows: 3, required: true, maxlength: 5000, placeholder: 'Ej.: Llamé, pidió propuesta para el lunes.' });
    const listaNotas = h('ul', { class: 'notas' });
    const pintarNotas = notas => listaNotas.replaceChildren(...(notas.length
        ? notas.map(n => h('li', {},
            h('div', { class: 'nota-fecha' }, `${fmtDiaHora.format(new Date(n.fecha))}${n.autorNombre ? ` · ${n.autorNombre}` : ''}`),
            h('p', { class: 'nota-texto' }, n.texto)))
        : [h('li', { class: 'empty', style: 'border: none' }, 'Sin notas todavía.')]));
    pintarNotas(lead.notas);

    const formNota = h('form', { class: 'nota-form', onsubmit: async e => {
        e.preventDefault();
        const boton = formNota.querySelector('button');
        boton.disabled = true;
        try {
            const nota = await api(`/api/leads/${encodeURIComponent(lead.id)}/notas`, {
                method: 'POST',
                body: JSON.stringify({ texto: textoNota.value })
            });
            lead.notas.unshift(nota);
            pintarNotas(lead.notas);
            textoNota.value = '';
            toast('Nota agregada');
        } catch (error) {
            toast(error.message, true);
        } finally {
            boton.disabled = false;
        }
    } },
        h('label', { for: 'nota-texto' }, 'Nueva nota'),
        textoNota,
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Agregar nota'));

    $('#drawer-contenido').replaceChildren(
        h('h2', { id: 'drawer-titulo' }, lead.nombre),
        h('dl', { class: 'ficha-datos' },
            h('dt', {}, 'Correo'), h('dd', {}, h('a', { href: `mailto:${lead.email}` }, lead.email)),
            h('dt', {}, 'Teléfono'), h('dd', {}, lead.telefono
                ? [h('a', { href: `tel:${lead.telefono.replace(/[^\d+]/g, '')}` }, lead.telefono),
                    ' · ',
                    h('a', { href: `https://wa.me/${whatsapp(lead.telefono)}`, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp')]
                : 'No registrado'),
            h('dt', {}, 'Servicio'), h('dd', {}, nombreServicio(lead.servicio)),
            h('dt', {}, 'Recibido'), h('dd', {}, fmtDiaHora.format(new Date(lead.creado))),
            h('dt', {}, 'Datos personales'), h('dd', {}, lead.autorizacionDatos
                ? `Autorizó el ${fmtDiaHora.format(new Date(lead.autorizacionDatos))} (política v${lead.politicaVersion || '?'})`
                : 'Sin registro de autorización'),
            h('dt', {}, 'Estado'), h('dd', {}, badgeEstado(lead.estado)),
            h('dt', {}, 'Responsable'), h('dd', {}, responsableTexto)),
        h('h3', {}, 'Mensaje'),
        h('p', { class: 'mensaje' }, lead.mensaje),
        h('h3', {}, 'Seguimiento'),
        formEstado,
        h('h3', {}, 'Notas'),
        formNota,
        listaNotas,
        h('h3', {}, 'Actividad'),
        h('ul', { class: 'actividad' }, ...(lead.historial?.length
            ? lead.historial.map(a => h('li', {},
                h('div', { class: 'nota-fecha' }, `${fmtDiaHora.format(new Date(a.fecha))} · ${a.usuarioNombre || 'Sistema'}`),
                h('div', {}, a.detalle)))
            : [h('li', { class: 'empty' }, 'Sin actividad registrada.')])));
}

// ---------- Usuarios (solo administradores) ----------

function generarPassword() {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const valores = crypto.getRandomValues(new Uint32Array(14));
    return Array.from(valores, v => caracteres[v % caracteres.length]).join('');
}

async function cargarUsuarios() {
    try {
        usuarios = await api('/api/usuarios');
        renderUsuarios();
    } catch (error) {
        toast(error.message, true);
    }
}

function renderUsuarios() {
    $('#tabla-usuarios').replaceChildren(...usuarios.map(u => {
        const abrir = () => abrirUsuario(u);
        return h('tr', { tabindex: 0, onclick: abrir, onkeydown: e => { if (e.key === 'Enter') abrir(); } },
            h('td', {}, u.nombre, u.id === meta.usuario.id ? ' (usted)' : '', h('span', { class: 'td-email' }, u.email)),
            h('td', {}, meta.roles[u.rol] || u.rol),
            h('td', {}, u.servicios.length ? u.servicios.map(nombreServicio).join(', ') : '—'),
            h('td', {}, h('span', { class: `badge ${u.activo ? 'badge-ganado' : 'badge-perdido'}` }, u.activo ? 'Activo' : 'Inactivo')));
    }));
}

// Formulario de usuario en el panel lateral: crear (sin usuario) o editar
function abrirUsuario(usuario = null) {
    leadAbierto = null;
    const nuevo = !usuario;
    const campo = (id, etiqueta, input) => h('div', { class: 'campo-form' }, h('label', { for: id }, etiqueta), input);

    const nombre = h('input', { id: 'u-nombre', value: usuario?.nombre || '', required: true, maxlength: 120 });
    const email = h('input', { id: 'u-email', type: 'email', value: usuario?.email || '', required: true, maxlength: 200 });
    const rol = h('select', { id: 'u-rol' }, Object.entries(meta.roles).map(([clave, etiqueta]) =>
        h('option', { value: clave, selected: clave === (usuario?.rol || 'consultor') }, etiqueta)));
    const servicios = Object.entries(meta.servicios).map(([clave, etiqueta]) =>
        h('label', { class: 'check' },
            h('input', { type: 'checkbox', value: clave, checked: usuario?.servicios.includes(clave) }), ` ${etiqueta}`));
    const activo = h('input', { type: 'checkbox', id: 'u-activo', checked: usuario ? usuario.activo : true });
    const password = h('input', { id: 'u-password', type: 'text', autocomplete: 'off', minlength: 10, required: nuevo,
        placeholder: nuevo ? 'Mínimo 10 caracteres' : 'Déjela vacía para no cambiarla' });

    const form = h('form', { class: 'form-usuario', onsubmit: async e => {
        e.preventDefault();
        const boton = form.querySelector('button[type=submit]');
        boton.disabled = true;
        const datos = {
            nombre: nombre.value,
            email: email.value,
            rol: rol.value,
            servicios: servicios.map(s => s.querySelector('input')).filter(i => i.checked).map(i => i.value)
        };
        if (!nuevo) datos.activo = activo.checked;
        if (password.value) datos.password = password.value;
        try {
            await api(nuevo ? '/api/usuarios' : `/api/usuarios/${encodeURIComponent(usuario.id)}`, {
                method: nuevo ? 'POST' : 'PATCH',
                body: JSON.stringify(datos)
            });
            meta = await api('/api/meta');
            await cargarUsuarios();
            renderTodo();
            mostrarDrawer(false);
            toast(nuevo
                ? `Usuario creado. Comparta la contraseña con ${datos.nombre} y pídale que la cambie al entrar.`
                : 'Usuario actualizado');
        } catch (error) {
            toast(error.message, true);
            boton.disabled = false;
        }
    } },
        campo('u-nombre', 'Nombre', nombre),
        campo('u-email', 'Correo (con este correo inicia sesión)', email),
        campo('u-rol', 'Rol', rol),
        h('fieldset', { class: 'servicios-usuario' },
            h('legend', {}, 'Servicios que atiende'),
            h('p', { class: 'ayuda' }, 'Si un servicio lo atiende un solo usuario activo, los contactos nuevos de ese servicio se le asignan automáticamente.'),
            servicios),
        !nuevo && h('label', { class: 'check' }, activo, ' Usuario activo (puede iniciar sesión)'),
        campo('u-password', nuevo ? 'Contraseña temporal' : 'Nueva contraseña (opcional)',
            h('div', { class: 'con-boton' }, password,
                h('button', { type: 'button', class: 'btn btn-secundario', onclick: () => { password.value = generarPassword(); } }, 'Generar'))),
        h('button', { type: 'submit', class: 'btn btn-primary' }, nuevo ? 'Crear usuario' : 'Guardar cambios'));

    $('#drawer-contenido').replaceChildren(
        h('h2', { id: 'drawer-titulo' }, nuevo ? 'Nuevo usuario' : usuario.nombre),
        form);
    mostrarDrawer(true);
    nombre.focus();
}

// ---------- Navegación y carga ----------

function mostrarVista(vista) {
    for (const tab of document.querySelectorAll('.tab')) {
        tab.setAttribute('aria-selected', String(tab.dataset.view === vista));
    }
    $('#view-tablero').hidden = vista !== 'tablero';
    $('#view-contactos').hidden = vista !== 'contactos';
    $('#view-usuarios').hidden = vista !== 'usuarios';
    if (vista === 'usuarios') cargarUsuarios();
}

function renderTodo() {
    renderTablero();
    renderTabla();
}

async function cargar() {
    const boton = $('#recargar');
    boton.disabled = true;
    try {
        leads = await api('/api/leads');
        renderTodo();
        $('#estado-carga').hidden = true;
    } catch (error) {
        $('#estado-carga').textContent = `No se pudieron cargar los contactos: ${error.message}`;
        $('#estado-carga').hidden = false;
    } finally {
        boton.disabled = false;
    }
}

async function iniciar() {
    try {
        meta = await api('/api/meta');
    } catch (error) {
        $('#estado-carga').textContent = `No se pudo iniciar el CRM: ${error.message}`;
        return;
    }

    for (const [clave, etiqueta] of Object.entries(meta.estados)) $('#filtro-estado').append(h('option', { value: clave }, etiqueta));
    for (const [clave, etiqueta] of Object.entries(meta.servicios)) $('#filtro-servicio').append(h('option', { value: clave }, etiqueta));

    // Interfaz según el rol
    $('#usuario-actual').textContent = `${meta.usuario.nombre} · ${meta.roles[meta.usuario.rol] || meta.usuario.rol}`;
    document.body.classList.toggle('rol-admin', esAdmin());
    document.body.classList.toggle('rol-consultor', !esAdmin());
    for (const el of document.querySelectorAll('.solo-admin')) el.hidden = !esAdmin();
    const filtroResponsable = $('#filtro-responsable');
    if (esAdmin()) {
        filtroResponsable.append(h('option', { value: '__sin' }, 'Sin asignar'),
            ...meta.equipo.map(u => h('option', { value: u.id }, u.nombre)));
    } else {
        filtroResponsable.append(h('option', { value: '__mio' }, 'Asignados a mí'), h('option', { value: '__sin' }, 'Sin asignar'));
    }

    mostrarVista('tablero');
    await cargar();

    const match = location.hash.match(/^#lead=(.+)$/);
    if (match) abrirLead(decodeURIComponent(match[1]));
}

for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => mostrarVista(tab.dataset.view));
}
for (const id of ['#filtro-texto', '#filtro-estado', '#filtro-servicio', '#filtro-responsable']) {
    $(id).addEventListener('input', renderTabla);
}
$('#recargar').addEventListener('click', cargar);
$('#seleccionar-todos').addEventListener('change', e => seleccionarTodos(e.target.checked));
$('#seleccion-limpiar').addEventListener('click', () => { seleccion.clear(); actualizarSeleccion(); });
$('#seleccion-eliminar').addEventListener('click', eliminarSeleccionados);
$('#nuevo-usuario').addEventListener('click', () => abrirUsuario());

// Cambiar la contraseña propia
const dialogoPassword = $('#dialogo-password');
$('#mi-password').addEventListener('click', () => {
    $('#form-password').reset();
    $('#password-error').hidden = true;
    dialogoPassword.showModal();
});
$('#password-cancelar').addEventListener('click', () => dialogoPassword.close());
$('#form-password').addEventListener('submit', async e => {
    e.preventDefault();
    const error = $('#password-error');
    const nueva = $('#password-nueva').value;
    if (nueva !== $('#password-confirmar').value) {
        error.textContent = 'La confirmación no coincide con la nueva contraseña.';
        error.hidden = false;
        return;
    }
    try {
        await api('/api/cuenta/password', { method: 'POST', body: JSON.stringify({ actual: $('#password-actual').value, nueva }) });
        dialogoPassword.close();
        toast('Contraseña actualizada');
    } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
    }
});
$('#salir').addEventListener('click', async () => {
    await fetch('/admin/logout', { method: 'POST' });
    location.href = '/admin/login';
});
$('#drawer-cerrar').addEventListener('click', cerrarLead);
$('#drawer-fondo').addEventListener('click', cerrarLead);
window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#drawer').hidden) cerrarLead();
});

iniciar();
