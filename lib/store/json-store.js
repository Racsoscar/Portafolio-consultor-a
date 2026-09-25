const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { TABLAS } = require('./schema');

// Almacenamiento en un archivo JSON local. Solo para desarrollo, cuando no hay
// credenciales de Google Sheets configuradas. Cada tabla es una lista de objetos.
class JsonStore {
    constructor(file) {
        this.file = file;
        this.data = {};
        this.writing = Promise.resolve();
    }

    get name() {
        return `archivo local (${path.relative(process.cwd(), this.file)})`;
    }

    async init() {
        try {
            const guardado = JSON.parse(await fs.readFile(this.file, 'utf8'));
            // Compatibilidad con la versión anterior, que usaba "leads" y "notas"
            this.data = {
                Leads: guardado.Leads || guardado.leads || [],
                Notas: guardado.Notas || guardado.notas || [],
                Usuarios: guardado.Usuarios || [],
                Historial: guardado.Historial || []
            };
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await fs.mkdir(path.dirname(this.file), { recursive: true });
        }
        for (const tab of Object.keys(TABLAS)) this.data[tab] ||= [];
        await this.save();
    }

    save() {
        // Encadenar escrituras para que no se pisen entre sí
        this.writing = this.writing.then(() =>
            fs.writeFile(this.file, JSON.stringify(this.data, null, 2)));
        return this.writing;
    }

    async list(tab) {
        return this.data[tab].map(fila => ({ ...fila }));
    }

    async add(tab, obj) {
        const nuevo = { id: crypto.randomUUID(), ...obj };
        this.data[tab].push(nuevo);
        await this.save();
        return { ...nuevo };
    }

    async update(tab, id, cambios) {
        const fila = this.data[tab].find(f => f.id === id);
        if (!fila) return null;
        Object.assign(fila, cambios);
        await this.save();
        return { ...fila };
    }

    async deleteWhere(criterios) {
        const borradas = {};
        for (const [tab, coincide] of Object.entries(criterios)) {
            const antes = this.data[tab].length;
            this.data[tab] = this.data[tab].filter(f => !coincide(f));
            borradas[tab] = antes - this.data[tab].length;
        }
        await this.save();
        return borradas;
    }
}

module.exports = JsonStore;
