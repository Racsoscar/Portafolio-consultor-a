const nodemailer = require('nodemailer');

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL, PUBLIC_URL } = process.env;

// NOTIFY_EMAIL admite varios correos separados por comas
const RECEPTORES = String(NOTIFY_EMAIL || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

const transporter = SMTP_HOST && RECEPTORES.length
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
    })
    : null;

const avisosActivos = Boolean(transporter);

// Envía un correo a los receptores de NOTIFY_EMAIL (y al consultor responsable,
// si lo hay) cuando llega un lead nuevo.
// Nunca lanza error: un fallo de correo no debe perder el lead.
async function avisarNuevoLead(lead, servicioNombre, responsable = null) {
    if (!transporter) return;

    const destinatarios = [...new Set([...RECEPTORES, responsable?.email?.toLowerCase()].filter(Boolean))];
    const enlace = `${PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3000)}/admin#lead=${lead.id}`;
    try {
        await transporter.sendMail({
            from: SMTP_USER || RECEPTORES[0],
            to: destinatarios,
            replyTo: lead.email,
            subject: `Nuevo contacto: ${lead.nombre} (${servicioNombre})`,
            text: [
                `Llegó un nuevo contacto desde la página web.`,
                ``,
                `Nombre: ${lead.nombre}`,
                `Correo: ${lead.email}`,
                `Teléfono: ${lead.telefono || '—'}`,
                `Servicio: ${servicioNombre}`,
                `Responsable: ${responsable ? responsable.nombre : 'Sin asignar'}`,
                ``,
                `Mensaje:`,
                lead.mensaje,
                ``,
                `Ver en el CRM: ${enlace}`
            ].join('\n')
        });
    } catch (error) {
        console.error('No se pudo enviar el aviso por correo:', error.message);
    }
}

// Avisa al consultor que se le asignó un contacto. Nunca lanza error.
async function avisarAsignacion(lead, servicioNombre, responsable, asignadoPor) {
    if (!transporter || !responsable?.email) return;

    const enlace = `${PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3000)}/admin#lead=${lead.id}`;
    try {
        await transporter.sendMail({
            from: SMTP_USER || RECEPTORES[0],
            to: responsable.email,
            replyTo: lead.email,
            subject: `Se le asignó un contacto: ${lead.nombre} (${servicioNombre})`,
            text: [
                `Hola, ${responsable.nombre}:`,
                ``,
                `${asignadoPor.nombre} le asignó un contacto en el CRM.`,
                ``,
                `Nombre: ${lead.nombre}`,
                `Correo: ${lead.email}`,
                `Teléfono: ${lead.telefono || '—'}`,
                `Servicio: ${servicioNombre}`,
                ``,
                `Mensaje:`,
                lead.mensaje,
                ``,
                `Ver en el CRM: ${enlace}`
            ].join('\n')
        });
    } catch (error) {
        console.error('No se pudo enviar el aviso de asignación:', error.message);
    }
}

// Comprueba la conexión y las credenciales SMTP sin enviar nada
async function verificarCorreo() {
    if (!transporter) return false;
    await transporter.verify();
    return true;
}

module.exports = { avisarNuevoLead, avisarAsignacion, avisosActivos, verificarCorreo, RECEPTORES };
