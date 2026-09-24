const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// Almacenamiento en un archivo JSON local. Solo para desarrollo, cuando no hay
// credenciales de Google Sheets configuradas.
class JsonStore {
    constructor(file) {
        this.file = file;
        this.data = { leads: [], notas: [] };
        this.writing = Promise.resolve();
    }

    get name() {
        return `archivo local (${path.relative(process.cwd(), this.file)})`;
    }

    async init() {
        try {
            this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await fs.mkdir(path.dirname(this.file), { recursive: true });
            await this.save();
        }
    }

    save() {
        // Encadenar escrituras para que no se pisen entre sí
        this.writing = this.writing.then(() =>
            fs.writeFile(this.file, JSON.stringify(this.data, null, 2)));
        return this.writing;
    }

    async listLeads() {
        return this.data.leads.map(lead => ({ ...lead }));
    }

    async getLead(id) {
        const lead = this.data.leads.find(l => l.id === id);
        return lead ? { ...lead } : null;
    }

    async addLead(lead) {
        const nuevo = { id: crypto.randomUUID(), ...lead };
        this.data.leads.push(nuevo);
        await this.save();
        return { ...nuevo };
    }

    async updateLead(id, cambios) {
        const lead = this.data.leads.find(l => l.id === id);
        if (!lead) return null;
        Object.assign(lead, cambios);
        await this.save();
        return { ...lead };
    }

    // Elimina varios contactos y sus notas. Devuelve cuántos contactos se eliminaron.
    async deleteLeads(ids) {
        const borrar = new Set(ids);
        const antes = this.data.leads.length;
        this.data.leads = this.data.leads.filter(l => !borrar.has(l.id));
        this.data.notas = this.data.notas.filter(n => !borrar.has(n.leadId));
        await this.save();
        return antes - this.data.leads.length;
    }

    async listNotas(leadId) {
        return this.data.notas.filter(n => n.leadId === leadId).map(n => ({ ...n }));
    }

    async addNota(nota) {
        const nueva = { id: crypto.randomUUID(), ...nota };
        this.data.notas.push(nueva);
        await this.save();
        return { ...nueva };
    }
}

module.exports = JsonStore;
