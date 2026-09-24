const crypto = require('crypto');
const { sheets, auth } = require('@googleapis/sheets');

// Columnas de cada pestaña. El orden define el orden en la hoja.
const LEAD_COLUMNS = ['id', 'creado', 'nombre', 'email', 'servicio', 'mensaje', 'estado', 'proximoSeguimiento', 'actualizado'];
const NOTA_COLUMNS = ['id', 'leadId', 'fecha', 'texto'];

const TABS = {
    Leads: LEAD_COLUMNS,
    Notas: NOTA_COLUMNS
};

function columnLetter(n) {
    return String.fromCharCode('A'.charCodeAt(0) + n - 1);
}

function rangeFor(tab, fromRow = 1, toRow = '') {
    return `${tab}!A${fromRow}:${columnLetter(TABS[tab].length)}${toRow}`;
}

function rowToObject(columns, row) {
    return Object.fromEntries(columns.map((col, i) => [col, row[i] ?? '']));
}

function objectToRow(columns, obj) {
    return columns.map(col => obj[col] ?? '');
}

// Almacenamiento en Google Sheets: una pestaña "Leads" y otra "Notas".
// Los valores se escriben en modo RAW para que el texto enviado desde el
// formulario nunca se interprete como fórmula.
class SheetsStore {
    constructor({ spreadsheetId, keyFile }) {
        this.spreadsheetId = spreadsheetId;
        this.api = sheets({
            version: 'v4',
            auth: new auth.GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
        });
    }

    get name() {
        return `Google Sheets (${this.spreadsheetId})`;
    }

    async init() {
        // Crear las pestañas que falten y escribir los encabezados
        const { data } = await this.api.spreadsheets.get({
            spreadsheetId: this.spreadsheetId,
            fields: 'sheets.properties.title'
        });
        const existentes = new Set(data.sheets.map(s => s.properties.title));
        const faltantes = Object.keys(TABS).filter(tab => !existentes.has(tab));

        if (faltantes.length) {
            await this.api.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: { requests: faltantes.map(title => ({ addSheet: { properties: { title } } })) }
            });
        }

        for (const [tab, columns] of Object.entries(TABS)) {
            await this.api.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: rangeFor(tab, 1, 1),
                valueInputOption: 'RAW',
                requestBody: { values: [columns] }
            });
        }
    }

    async readRows(tab) {
        const { data } = await this.api.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: rangeFor(tab, 2)
        });
        return (data.values || []).map(row => rowToObject(TABS[tab], row));
    }

    async append(tab, obj) {
        await this.api.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: rangeFor(tab),
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [objectToRow(TABS[tab], obj)] }
        });
    }

    async listLeads() {
        return (await this.readRows('Leads')).filter(lead => lead.id);
    }

    async getLead(id) {
        return (await this.listLeads()).find(l => l.id === id) || null;
    }

    async addLead(lead) {
        const nuevo = { id: crypto.randomUUID(), ...lead };
        await this.append('Leads', nuevo);
        return nuevo;
    }

    async updateLead(id, cambios) {
        // Se busca la fila justo antes de escribir, por si alguien reordenó la hoja
        const leads = await this.readRows('Leads');
        const index = leads.findIndex(l => l.id === id);
        if (index === -1) return null;

        const actualizado = { ...leads[index], ...cambios };
        const fila = index + 2;
        await this.api.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: rangeFor('Leads', fila, fila),
            valueInputOption: 'RAW',
            requestBody: { values: [objectToRow(LEAD_COLUMNS, actualizado)] }
        });
        return actualizado;
    }

    async listNotas(leadId) {
        return (await this.readRows('Notas')).filter(n => n.leadId === leadId);
    }

    async addNota(nota) {
        const nueva = { id: crypto.randomUUID(), ...nota };
        await this.append('Notas', nueva);
        return nueva;
    }
}

module.exports = SheetsStore;
