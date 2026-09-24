const path = require('path');
const JsonStore = require('./json-store');
const SheetsStore = require('./sheets-store');

// Usa Google Sheets si está configurado; si no, un archivo local para desarrollo
function createStore() {
    const { GOOGLE_SHEET_ID, GOOGLE_APPLICATION_CREDENTIALS } = process.env;

    if (GOOGLE_SHEET_ID && GOOGLE_APPLICATION_CREDENTIALS) {
        return new SheetsStore({ spreadsheetId: GOOGLE_SHEET_ID, keyFile: GOOGLE_APPLICATION_CREDENTIALS });
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Faltan GOOGLE_SHEET_ID y GOOGLE_APPLICATION_CREDENTIALS en producción.');
    }
    return new JsonStore(path.join(__dirname, '..', '..', 'data', 'crm.json'));
}

module.exports = { createStore };
