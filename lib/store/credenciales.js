// Credenciales de la cuenta de servicio de Google.
// GOOGLE_CREDENTIALS_JSON: el JSON completo, o ese mismo JSON en base64 (útil en Render/Railway).
// Si no existe, se usa GOOGLE_APPLICATION_CREDENTIALS (ruta a un archivo).
function credencialesDesdeVariable(valor = process.env.GOOGLE_CREDENTIALS_JSON) {
    const texto = String(valor || '').trim();
    if (!texto) return null;
    try {
        const json = texto.startsWith('{') ? texto : Buffer.from(texto, 'base64').toString('utf8');
        const credenciales = JSON.parse(json);
        if (!credenciales || typeof credenciales !== 'object') throw new Error('no es un objeto');
        return credenciales;
    } catch {
        // Mensaje genérico a propósito: el detalle del error podría revelar parte del secreto
        throw new Error('GOOGLE_CREDENTIALS_JSON no es un JSON válido ni base64 de un JSON.');
    }
}

module.exports = { credencialesDesdeVariable };
