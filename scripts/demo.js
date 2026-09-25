// Genera la demostración portátil: un solo archivo HTML con el sitio web, el CRM
// y la política de datos, que funciona sin servidor y con datos ficticios.
// Uso: npm run demo  →  dist/demo-consultoria.html
const fs = require('fs');
const path = require('path');
const { renderizarPlantilla, logoSvg, datosCorporacion } = require('../lib/corporacion');

const RAIZ = path.join(__dirname, '..');
const leer = archivo => fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
const SALIDA = path.join(RAIZ, 'dist', 'demo-consultoria.html');
const FONT_AWESOME = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2';

// Reemplazo literal (sin interpretar $& ni $' del texto de reemplazo)
const reemplazar = (texto, buscar, nuevo) => {
    if (!texto.includes(buscar)) throw new Error(`No se encontró en la plantilla: ${buscar}`);
    return texto.split(buscar).join(nuevo);
};
const scriptEnLinea = codigo => `<script>${codigo.replace(/<\/script/gi, '<\\/script')}</script>`;
const dataUri = (tipo, buffer) => `data:${tipo};base64,${Buffer.from(buffer).toString('base64')}`;

async function descargar(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} al descargar ${url}`);
    return Buffer.from(await res.arrayBuffer());
}

// Íconos incrustados para que la demo funcione sin internet. Si no hay conexión
// al generarla, se deja el enlace a la CDN.
async function fontAwesomeEnLinea() {
    try {
        let css = (await descargar(`${FONT_AWESOME}/css/all.min.css`)).toString('utf8');
        for (const fuente of ['fa-solid-900', 'fa-regular-400', 'fa-brands-400']) {
            const woff2 = await descargar(`${FONT_AWESOME}/webfonts/${fuente}.woff2`);
            css = css.split(`../webfonts/${fuente}.woff2`).join(dataUri('font/woff2', woff2));
        }
        // Sin las variantes .ttf: los navegadores usan la .woff2 incrustada
        css = css.replace(/,\s*url\(\.\.\/webfonts\/[^)]+\.ttf\) format\("truetype"\)/g, '');
        return `<style>${css}</style>`;
    } catch (error) {
        console.warn(`Aviso: no se pudieron incrustar los íconos (${error.message}); se usará la CDN.`);
        return null;
    }
}

const iniciales = nombre => nombre.split(/\s+/).filter(p => /^\p{Lu}/u.test(p)).slice(0, 2).map(p => p[0]).join('');

(async () => {
    const corporacion = datosCorporacion();
    const logo = dataUri('image/svg+xml', logoSvg());
    const puente = scriptEnLinea(leer('demo/puente.js'));
    const estilosSitio = `<style>${leer('public/styles.css')}</style>`;
    const iconos = await fontAwesomeEnLinea();

    // ---------- Página web ----------
    let sitio = renderizarPlantilla(leer('public/index.html'));
    sitio = reemplazar(sitio, '<link rel="stylesheet" href="styles.css">', estilosSitio + `<style>
        .avatar-iniciales { display: grid; place-items: center; font-family: var(--font-serif); font-size: 2.2rem; font-weight: 700;
            color: var(--navy); background: var(--bg-alt); position: relative; }
        .avatar-iniciales::after { content: 'Foto pendiente'; position: absolute; bottom: -1.4rem; font-family: var(--font-sans);
            font-size: 0.7rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
    </style>`);
    if (iconos) sitio = reemplazar(sitio, `<link rel="stylesheet" href="${FONT_AWESOME}/css/all.min.css">`, iconos);
    sitio = sitio.split('/logo.svg').join(logo);
    const foto = fs.readFileSync(path.join(RAIZ, 'public/Imagenes/Paula_Veloza.png'));
    sitio = sitio.split('src="Imagenes/Paula_Veloza.png"').join(`src="${dataUri('image/png', foto)}"`);
    // Las fotos de banco de imágenes no son de los consultores: en la demo se muestran sus iniciales
    sitio = sitio.replace(/<img src="https:\/\/images\.unsplash\.com[^"]*" alt="([^"]+)"[^>]*>/g,
        (_, alt) => `<div class="consultor-foto avatar-iniciales" role="img" aria-label="${alt}: foto pendiente">${iniciales(alt)}</div>`);
    sitio = reemplazar(sitio, '<script src="script.js"></script>', puente + scriptEnLinea(leer('public/script.js')));

    // ---------- Política de datos ----------
    let politica = renderizarPlantilla(leer('public/politica-de-datos.html'));
    politica = reemplazar(politica, '<link rel="stylesheet" href="styles.css">', estilosSitio);
    politica = politica.split('/logo.svg').join(logo);
    politica = reemplazar(politica, '</head>', `${puente}</head>`);

    // ---------- CRM ----------
    let crm = renderizarPlantilla(leer('admin/index.html'));
    crm = reemplazar(crm, '<link rel="stylesheet" href="/admin/assets/admin.css">', `<style>${leer('admin/assets/admin.css')}</style>`);
    crm = reemplazar(crm, '<script src="/admin/assets/admin.js"></script>', puente + scriptEnLinea(leer('admin/assets/admin.js')));

    // ---------- Ventana principal ----------
    const fecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    const paginas = JSON.stringify({ sitio, crm, politica }).replace(/</g, '\\u003c');
    let html = leer('demo/shell.html');
    html = html.split('{{NOMBRE}}').join(corporacion.nombre.replace(/[<>&"]/g, ''));
    html = html.split('{{LOGO}}').join(logo);
    html = html.split('{{FECHA}}').join(fecha);
    html = reemplazar(html, '{{PAGINAS_JSON}}', paginas);
    html = reemplazar(html, '<script>{{MOCK_JS}}</script>', scriptEnLinea(leer('demo/mock-api.js')));

    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    fs.writeFileSync(SALIDA, html);
    console.log(`Demostración generada: ${path.relative(RAIZ, SALIDA)} (${(fs.statSync(SALIDA).size / 1024).toFixed(0)} KB)`);
})().catch(error => {
    console.error('No se pudo generar la demostración:', error.message);
    process.exit(1);
});
