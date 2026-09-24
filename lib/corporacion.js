const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'corporacion.json');

// Datos de la corporación. Se leen en cada uso para que un cambio en
// config/corporacion.json se vea sin reiniciar el servidor.
function datosCorporacion() {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// Campos que aún tienen el texto provisional "[... por definir]"
function camposPendientes() {
    return Object.entries(datosCorporacion())
        .filter(([, valor]) => /por[\s-]definir/i.test(String(valor)))
        .map(([clave]) => clave);
}

const escapar = texto => String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Reemplaza {{clave}} en el HTML por el dato de la corporación (escapado).
// {{anio}} es el año actual.
function renderizarPlantilla(html) {
    const datos = { ...datosCorporacion(), anio: new Date().getFullYear() };
    return html.replace(/\{\{(\w+)\}\}/g, (coincidencia, clave) =>
        clave in datos ? escapar(datos[clave]) : coincidencia);
}

// Middleware: sirve los .html de una carpeta con los datos ya reemplazados
function servirPlantillas(carpeta) {
    return (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const relativo = req.path === '/' ? 'index.html' : req.path.slice(1);
        if (!relativo.endsWith('.html')) return next();

        const archivo = path.join(carpeta, relativo);
        if (!archivo.startsWith(carpeta + path.sep)) return next();

        fs.readFile(archivo, 'utf8', (error, html) => {
            if (error) return next();
            res.type('html').send(renderizarPlantilla(html));
        });
    };
}

// Logo provisional: cuadrado con las iniciales. Sirve también como favicon.
function logoSvg() {
    const { iniciales } = datosCorporacion();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="10" fill="#0a2540"/>
<rect x="8" y="50" width="48" height="4" fill="#c9a227"/>
<text x="32" y="41" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="28" font-weight="700" fill="#ffffff">${escapar(iniciales)}</text>
</svg>`;
}

module.exports = { datosCorporacion, camposPendientes, renderizarPlantilla, servirPlantillas, logoSvg };
