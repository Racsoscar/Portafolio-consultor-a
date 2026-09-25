const crypto = require('crypto');
const { sheets, auth } = require('@googleapis/sheets');
const { TABLAS } = require('./schema');

// Las lecturas se guardan unos segundos para no agotar la cuota de la API
// de Google Sheets (60 lecturas por minuto) cuando una pantalla pide varias cosas.
const CACHE_MS = 5000;

function columnLetter(n) {
    return String.fromCharCode('A'.charCodeAt(0) + n - 1);
}

function rangeFor(tab, fromRow = 1, toRow = '') {
    return `${tab}!A${fromRow}:${columnLetter(TABLAS[tab].length)}${toRow}`;
}

function rowToObject(columns, row) {
    return Object.fromEntries(columns.map((col, i) => [col, row[i] ?? '']));
}

function objectToRow(columns, obj) {
    return columns.map(col => obj[col] ?? '');
}

// Almacenamiento en Google Sheets: una pestaña por tabla.
// Los valores se escriben en modo RAW para que el texto enviado desde el
// formulario nunca se interprete como fórmula.
class SheetsStore {
    constructor({ spreadsheetId, keyFile }) {
        this.spreadsheetId = spreadsheetId;
        this.cache = new Map();
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
            fields: 'sheets.properties(title,sheetId)'
        });
        // Id numérico de cada pestaña, necesario para borrar filas
        this.sheetIds = Object.fromEntries(data.sheets.map(s => [s.properties.title, s.properties.sheetId]));
        const faltantes = Object.keys(TABLAS).filter(tab => this.sheetIds[tab] === undefined);

        if (faltantes.length) {
            const { data: creadas } = await this.api.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: { requests: faltantes.map(title => ({ addSheet: { properties: { title } } })) }
            });
            for (const reply of creadas.replies) {
                this.sheetIds[reply.addSheet.properties.title] = reply.addSheet.properties.sheetId;
            }
        }

        await this.api.spreadsheets.values.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data: Object.entries(TABLAS).map(([tab, columns]) => ({ range: rangeFor(tab, 1, 1), values: [columns] }))
            }
        });
    }

    // Filas de la pestaña (sin encabezado), con su posición para poder editarlas
    async readRows(tab) {
        const guardado = this.cache.get(tab);
        if (guardado && Date.now() - guardado.fecha < CACHE_MS) return guardado.filas;

        const { data } = await this.api.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: rangeFor(tab, 2)
        });
        const filas = (data.values || []).map(row => rowToObject(TABLAS[tab], row));
        this.cache.set(tab, { fecha: Date.now(), filas });
        return filas;
    }

    async list(tab) {
        return (await this.readRows(tab)).filter(fila => fila.id).map(fila => ({ ...fila }));
    }

    async add(tab, obj) {
        const nuevo = { id: crypto.randomUUID(), ...obj };
        await this.api.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: rangeFor(tab),
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [objectToRow(TABLAS[tab], nuevo)] }
        });
        this.cache.delete(tab);
        return nuevo;
    }

    async update(tab, id, cambios) {
        // Se lee sin caché justo antes de escribir, por si alguien reordenó la hoja
        this.cache.delete(tab);
        const filas = await this.readRows(tab);
        const index = filas.findIndex(f => f.id === id);
        if (index === -1) return null;

        const actualizado = { ...filas[index], ...cambios };
        const fila = index + 2;
        await this.api.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: rangeFor(tab, fila, fila),
            valueInputOption: 'RAW',
            requestBody: { values: [objectToRow(TABLAS[tab], actualizado)] }
        });
        this.cache.delete(tab);
        return actualizado;
    }

    // Borra, en una sola operación, las filas que cumplan el criterio de cada pestaña.
    // criterios: { Leads: fila => boolean, Notas: ... }. Devuelve cuántas borró por pestaña.
    async deleteWhere(criterios) {
        const requests = [];
        const borradas = {};
        for (const [tab, coincide] of Object.entries(criterios)) {
            this.cache.delete(tab);
            const filas = await this.readRows(tab);
            // Índice 0 = fila 2 de la hoja; de abajo hacia arriba para que no se corran
            const indices = filas.map((f, i) => (coincide(f) ? i + 1 : -1)).filter(i => i !== -1).sort((a, b) => b - a);
            borradas[tab] = indices.length;
            for (const i of indices) {
                requests.push({ deleteDimension: { range: { sheetId: this.sheetIds[tab], dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } });
            }
        }
        if (requests.length) {
            await this.api.spreadsheets.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests } });
        }
        for (const tab of Object.keys(criterios)) this.cache.delete(tab);
        return borradas;
    }
}

module.exports = SheetsStore;
