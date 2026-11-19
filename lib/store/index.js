const path = require('path');
const JsonStore = require('./json-store');
const SheetsStore = require('./sheets-store');
const { credencialesDesdeVariable } = require('./credenciales');

// Usa Google Sheets si está configurado; si no, un archivo local para desarrollo
function createStore() {
    const { GOOGLE_SHEET_ID, GOOGLE_APPLICATION_CREDENTIALS } = process.env;
    const enProduccion = process.env.NODE_ENV === 'production';

    let credentials = null;
    try {
        credentials = credencialesDesdeVariable();
    } catch (error) {
        console.error(`Error de configuración: ${error.message}`);
        process.exit(1);
    }

    if (GOOGLE_SHEET_ID && (credentials || GOOGLE_APPLICATION_CREDENTIALS)) {
        return new SheetsStore({
            spreadsheetId: GOOGLE_SHEET_ID,
            ...(credentials ? { credentials } : { keyFile: GOOGLE_APPLICATION_CREDENTIALS })
        });
    }

    if (enProduccion) {
        console.error('Error de configuración: en producción faltan GOOGLE_SHEET_ID y las credenciales de Google ' +
            '(GOOGLE_CREDENTIALS_JSON o GOOGLE_APPLICATION_CREDENTIALS).');
        process.exit(1);
    }
    return new JsonStore(path.join(__dirname, '..', '..', 'data', 'crm.json'));
}

module.exports = { createStore };
