const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 3000;
const upload = multer();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Ruta para manejar el formulario de contacto
app.post('/contact', upload.none(), async (req, res) => {
    const { name, email, message, 'service-type': serviceType } = req.body;

    // Mapear el tipo de servicio a un nombre descriptivo
    let serviceName = serviceType;
    switch (serviceType) {
        case 'sistemas':
            serviceName = 'Ingeniería de Sistemas';
            break;
        case 'ambiental':
            serviceName = 'Ingeniería Ambiental';
            break;
        case 'civil':
            serviceName = 'Ingeniería Civil';
            break;
        case 'mecanica':
            serviceName = 'Ingeniería Mecánica';
            break;
        case 'acreditacion':
            serviceName = 'Procesos de Acreditación en Educación Superior';
            break;
        case 'general':
            serviceName = 'Consulta General';
            break;
        default:
            serviceName = 'No especificado';
    }

    // URL del formulario de Google Forms
    const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSc-WoreKuse_7O8JFicySllBOSxBtk1P5ha35SN8ZJ8uBKtug/formResponse';

    // Datos del formulario
    const formData = new URLSearchParams();
    formData.append('entry.1482843314', name);
    formData.append('entry.581862399', email);
    formData.append('entry.482834791', message);
    formData.append('entry.962321167', serviceName);

    try {
        // Enviar datos a Google Forms
        await axios.post(formUrl, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // Responder al cliente
        res.json({ success: true, message: '¡Gracias por tu interés! Nos pondremos en contacto pronto.' });
    } catch (error) {
        console.error('Error al enviar a Google Forms:', error);
        res.status(500).json({ success: false, message: 'Error al procesar el formulario.' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});