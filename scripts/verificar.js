// Revisa la configuración: contraseña del CRM, Google Sheets y correo.
// Uso: npm run verificar
const fs = require('fs');
const { createStore } = require('../lib/store');
const { verificarCorreo } = require('../lib/notify');
const { camposPendientes } = require('../lib/corporacion');

let errores = 0;
const ok = texto => console.log(`  OK     ${texto}`);
const aviso = texto => console.log(`  AVISO  ${texto}`);
const error = texto => { errores++; console.log(`  ERROR  ${texto}`); };

(async () => {
    console.log('\nAcceso al CRM');
    process.env.SESSION_SECRET ? ok('SESSION_SECRET configurada') : aviso('Falta SESSION_SECRET: las sesiones se cerrarán al reiniciar');

    console.log('\nDatos de la corporación (config/corporacion.json)');
    const pendientes = camposPendientes();
    pendientes.length
        ? aviso(`Campos por definir: ${pendientes.join(', ')}`)
        : ok('Todos los datos están completos');

    console.log('\nAlmacenamiento');
    const { GOOGLE_SHEET_ID, GOOGLE_APPLICATION_CREDENTIALS } = process.env;
    if (GOOGLE_SHEET_ID && !fs.existsSync(GOOGLE_APPLICATION_CREDENTIALS || '')) {
        error(`No existe el archivo de credenciales: ${GOOGLE_APPLICATION_CREDENTIALS || '(GOOGLE_APPLICATION_CREDENTIALS vacío)'}`);
    } else {
        if (GOOGLE_SHEET_ID) {
            const { client_email } = JSON.parse(fs.readFileSync(GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
            ok(`Cuenta de servicio: ${client_email}`);
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

    console.log('\nAviso por correo');
    try {
        (await verificarCorreo())
            ? ok(`SMTP conectado; los avisos llegarán a ${process.env.NOTIFY_EMAIL}`)
            : aviso('Correo no configurado (SMTP_HOST / NOTIFY_EMAIL): no se enviarán avisos');
    } catch (e) {
        error(`SMTP rechazó la conexión: ${e.message}`);
    }

    console.log(errores ? `\n${errores} problema(s) por resolver.\n` : '\nTodo listo.\n');
    process.exitCode = errores ? 1 : 0;
})();
