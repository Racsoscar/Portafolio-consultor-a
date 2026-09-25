const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const ROLES = {
    admin: 'Administrador',
    consultor: 'Consultor'
};

const MIN_PASSWORD = 10;
const CACHE_MS = 15000;

let store;
let cache = null;

function configurarUsuarios(storeCrm) {
    store = storeCrm;
}

// ---------- Contraseñas ----------

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verificarPassword(password, guardado) {
    const [tipo, saltHex, hashHex] = String(guardado || '').split('$');
    // Si el usuario no existe se compara igual contra un hash falso, para que
    // el tiempo de respuesta no revele qué correos están registrados
    const salt = tipo === 'scrypt' ? Buffer.from(saltHex, 'hex') : Buffer.alloc(16);
    const esperado = tipo === 'scrypt' ? Buffer.from(hashHex || '', 'hex') : Buffer.alloc(64);
    const calculado = await scrypt(String(password), salt, 64);
    return tipo === 'scrypt' && esperado.length === 64 && crypto.timingSafeEqual(calculado, esperado);
}

function validarPassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
        return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
    }
    if (password.length > 200) return 'La contraseña es demasiado larga.';
    return null;
}

// ---------- Lectura ----------

function normalizar(usuario) {
    return {
        ...usuario,
        email: String(usuario.email).toLowerCase(),
        servicios: usuario.servicios ? String(usuario.servicios).split(',').filter(Boolean) : [],
        activo: usuario.activo !== 'no'
    };
}

async function obtenerUsuarios() {
    if (cache && Date.now() - cache.fecha < CACHE_MS) return cache.usuarios;
    const usuarios = (await store.list('Usuarios')).map(normalizar);
    cache = { fecha: Date.now(), usuarios };
    return usuarios;
}

function invalidarCache() {
    cache = null;
}

// Datos que se pueden enviar al navegador (sin la contraseña)
function publico(usuario) {
    const { passwordHash, ...resto } = usuario;
    return resto;
}

// ---------- Escritura ----------

function aFila(cambios) {
    const fila = { ...cambios };
    if (Array.isArray(fila.servicios)) fila.servicios = fila.servicios.join(',');
    if (typeof fila.activo === 'boolean') fila.activo = fila.activo ? 'si' : 'no';
    return fila;
}

async function crearUsuario({ nombre, email, rol, servicios = [], password }) {
    const ahora = new Date().toISOString();
    const usuario = await store.add('Usuarios', aFila({
        nombre,
        email: email.toLowerCase(),
        rol,
        servicios,
        passwordHash: await hashPassword(password),
        activo: true,
        creado: ahora,
        actualizado: ahora
    }));
    invalidarCache();
    return normalizar(usuario);
}

async function actualizarUsuario(id, cambios) {
    const fila = aFila({ ...cambios, actualizado: new Date().toISOString() });
    if (cambios.password) {
        fila.passwordHash = await hashPassword(cambios.password);
        delete fila.password;
    }
    const usuario = await store.update('Usuarios', id, fila);
    invalidarCache();
    return usuario && normalizar(usuario);
}

// Si todavía no hay usuarios, crea el primer administrador con ADMIN_EMAIL y
// ADMIN_PASSWORD de .env. Así la instalación existente sigue funcionando.
async function crearAdministradorInicial() {
    const usuarios = await obtenerUsuarios();
    if (usuarios.length) return null;

    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.warn('Aviso: no hay usuarios. Define ADMIN_EMAIL y ADMIN_PASSWORD en .env para crear el administrador inicial.');
        return null;
    }
    const usuario = await crearUsuario({
        nombre: ADMIN_NOMBRE || 'Administrador',
        email: ADMIN_EMAIL,
        rol: 'admin',
        password: ADMIN_PASSWORD
    });
    console.log(`Administrador inicial creado: ${usuario.email}`);
    return usuario;
}

// Consultor al que se asigna automáticamente un contacto nuevo: solo si hay
// exactamente un consultor activo que atiende ese servicio.
async function responsablePorServicio(servicio) {
    const candidatos = (await obtenerUsuarios()).filter(u => u.activo && u.servicios.includes(servicio));
    return candidatos.length === 1 ? candidatos[0] : null;
}

module.exports = {
    ROLES,
    configurarUsuarios,
    verificarPassword,
    validarPassword,
    obtenerUsuarios,
    publico,
    crearUsuario,
    actualizarUsuario,
    crearAdministradorInicial,
    responsablePorServicio
};
