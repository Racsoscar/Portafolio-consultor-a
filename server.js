const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// URL del formulario de Google Forms
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSc-WoreKuse_7O8JFicySllBOSxBtk1P5ha35SN8ZJ8uBKtug/formResponse';

// Nombres descriptivos de cada tipo de servicio
const SERVICE_NAMES = {
    sistemas: 'Ingeniería de Sistemas',
    ambiental: 'Ingeniería Ambiental',
    civil: 'Ingeniería Civil',
    mecanica: 'Ingeniería Mecánica',
    acreditacion: 'Procesos de Acreditación en Educación Superior',
    general: 'Consulta General'
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Middleware: solo se publica la carpeta public/, nunca el código del servidor ni .env
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ruta para manejar el formulario de contacto
app.post('/contact', async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const message = String(req.body.message || '').trim();
    const serviceName = SERVICE_NAMES[req.body['service-type']] || 'No especificado';

    if (!name || !message || !EMAIL_REGEX.test(email) || name.length > 200 || message.length > 5000) {
        return res.status(400).json({ success: false, message: 'Revisa que el nombre, el correo y el mensaje sean válidos.' });
    }

    // Datos del formulario
    const formData = new URLSearchParams();
    formData.append('entry.1482843314', name);
    formData.append('entry.581862399', email);
    formData.append('entry.482834791', message);
    formData.append('entry.962321167', serviceName);

    try {
        // Enviar datos a Google Forms
        const response = await fetch(FORM_URL, { method: 'POST', body: formData });
        if (!response.ok) {
            throw new Error(`Google Forms respondió con estado ${response.status}`);
        }

        res.json({ success: true, message: '¡Gracias por tu interés! Nos pondremos en contacto pronto.' });
    } catch (error) {
        console.error('Error al enviar a Google Forms:', error);
        res.status(502).json({ success: false, message: 'Error al procesar el formulario. Inténtalo de nuevo más tarde.' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
