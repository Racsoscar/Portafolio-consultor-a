const nodemailer = require('nodemailer');

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL, PUBLIC_URL } = process.env;

const transporter = SMTP_HOST && NOTIFY_EMAIL
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
    })
    : null;

const avisosActivos = Boolean(transporter);

// Envía un correo al administrador cuando llega un lead nuevo.
// Nunca lanza error: un fallo de correo no debe perder el lead.
async function avisarNuevoLead(lead, servicioNombre) {
    if (!transporter) return;

    const enlace = `${PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3000)}/admin#lead=${lead.id}`;
    try {
        await transporter.sendMail({
            from: SMTP_USER || NOTIFY_EMAIL,
            to: NOTIFY_EMAIL,
            replyTo: lead.email,
            subject: `Nuevo contacto: ${lead.nombre} (${servicioNombre})`,
            text: [
                `Llegó un nuevo contacto desde la página web.`,
                ``,
                `Nombre: ${lead.nombre}`,
                `Correo: ${lead.email}`,
                `Servicio: ${servicioNombre}`,
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

// Comprueba la conexión y las credenciales SMTP sin enviar nada
async function verificarCorreo() {
    if (!transporter) return false;
    await transporter.verify();
    return true;
}

module.exports = { avisarNuevoLead, avisosActivos, verificarCorreo };
