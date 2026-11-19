// Revisa la configuración: contraseña del CRM, Google Sheets y correo.
// Uso: npm run verificar
const fs = require('fs');
const { createStore } = require('../lib/store');
const { verificarCorreo, RECEPTORES } = require('../lib/notify');
const { camposPendientes } = require('../lib/corporacion');
const { credencialesDesdeVariable } = require('../lib/store/credenciales');

let errores = 0;
const ok = texto => console.log(`  OK     ${texto}`);
const aviso = texto => console.log(`  AVISO  ${texto}`);
const error = texto => { errores++; console.log(`  ERROR  ${texto}`); };

(async () => {
    console.log('\nAcceso al CRM');
    const enProduccion = process.env.NODE_ENV === 'production';
    const secreto = process.env.SESSION_SECRET || '';
    if (secreto.length >= 32) ok('SESSION_SECRET configurada');
    else if (enProduccion) error('SESSION_SECRET falta o tiene menos de 32 caracteres (obligatoria en producción)');
    else aviso(secreto ? 'SESSION_SECRET tiene menos de 32 caracteres' : 'Falta SESSION_SECRET: las sesiones se cerrarán al reiniciar');
    console.log(`  ${process.env.SITIO_PRIVADO === 'si' ? 'OK     Sitio privado (SITIO_PRIVADO=si): solo entra quien tenga cuenta del CRM' : 'AVISO  Sitio abierto al público (SITIO_PRIVADO distinto de "si")'}`);

    console.log('\nDatos de la corporación (config/corporacion.json)');
    const pendientes = camposPendientes();
    if (!pendientes.length) ok('Todos los datos están completos');
    else if (enProduccion && process.env.SITIO_PRIVADO !== 'si') error(`Campos por definir: ${pendientes.join(', ')}. En producción el sitio no puede abrirse al público hasta completarlos (Ley 1581 de 2012)`);
    else aviso(`Campos por definir: ${pendientes.join(', ')}. Complételos antes de abrir el sitio al público`);

    console.log('\nAlmacenamiento');
    const { GOOGLE_SHEET_ID, GOOGLE_APPLICATION_CREDENTIALS } = process.env;
    let credencialesVar = null;
    let errorCredenciales = null;
    try {
        credencialesVar = credencialesDesdeVariable();
    } catch (e) {
        errorCredenciales = e.message;
    }
    if (errorCredenciales) {
        error(errorCredenciales);
    } else if (GOOGLE_SHEET_ID && !credencialesVar && !fs.existsSync(GOOGLE_APPLICATION_CREDENTIALS || '')) {
        error(`Faltan las credenciales de Google: define GOOGLE_CREDENTIALS_JSON o un GOOGLE_APPLICATION_CREDENTIALS que exista (${GOOGLE_APPLICATION_CREDENTIALS || 'vacío'})`);
    } else {
        if (GOOGLE_SHEET_ID) {
            const { client_email } = credencialesVar || JSON.parse(fs.readFileSync(GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
            ok(`Cuenta de servicio: ${client_email}${credencialesVar ? ' (desde GOOGLE_CREDENTIALS_JSON)' : ''}`);
        }
        try {
            const store = createStore();
            await store.init();
            const leads = await store.list('Leads');
            ok(`${store.name}: conectado, ${leads.length} contacto(s)`);
            if (!GOOGLE_SHEET_ID) aviso('Google Sheets no está configurado: se usa el archivo local de desarrollo');

            const equipo = (await store.list('Usuarios')).filter(u => u.activo !== 'no');
            const admins = equipo.filter(u => u.rol === 'admin').length;
            if (equipo.length) {
                ok(`Usuarios activos: ${equipo.length} (${admins} administrador(es))`);
                if (!admins) error('No hay ningún administrador activo');
            } else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
                aviso(`Aún no hay usuarios: al iniciar el servidor se creará el administrador ${process.env.ADMIN_EMAIL}`);
            } else {
                error('No hay usuarios: define ADMIN_EMAIL y ADMIN_PASSWORD en .env para crear el primer administrador');
            }
        } catch (e) {
            const detalle = e.response?.data?.error?.message || e.message;
            error(`No se pudo conectar: ${detalle}`);
            if (/permission|caller does not have/i.test(detalle)) {
                aviso('Comparte la hoja como Editor con el correo de la cuenta de servicio');
            }
            if (/has not been used|disabled/i.test(detalle)) {
                aviso('Habilita la Google Sheets API en el proyecto de Google Cloud');
            }
        }
    }

    console.log('\nAsignación de contactos');
    ok(process.env.ASIGNACION_AUTOMATICA === 'si'
        ? 'Automática por servicio (ASIGNACION_AUTOMATICA=si)'
        : 'Manual: los contactos nuevos llegan sin asignar');

    console.log('\nAviso por correo');
    try {
        (await verificarCorreo())
            ? ok(`SMTP conectado; los avisos llegarán a ${RECEPTORES.join(', ')}`)
            : aviso('Correo no configurado (SMTP_HOST / NOTIFY_EMAIL): no se enviarán avisos');
    } catch (e) {
        error(`SMTP rechazó la conexión: ${e.message}`);
    }

    console.log(errores ? `\n${errores} problema(s) por resolver.\n` : '\nTodo listo.\n');
    process.exitCode = errores ? 1 : 0;
})();
