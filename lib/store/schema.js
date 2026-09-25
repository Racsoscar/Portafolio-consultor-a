// Columnas de cada pestaña de Google Sheets. El orden define el orden en la hoja.
// IMPORTANTE: las columnas nuevas se agregan SIEMPRE al final; si se insertan en
// medio, las filas que ya existen quedarían desalineadas.
const TABLAS = {
    Leads: ['id', 'creado', 'nombre', 'email', 'telefono', 'servicio', 'mensaje', 'estado', 'proximoSeguimiento',
        'autorizacionDatos', 'politicaVersion', 'actualizado', 'responsableId'],
    Notas: ['id', 'leadId', 'fecha', 'texto', 'autorId', 'autorNombre'],
    Usuarios: ['id', 'nombre', 'email', 'rol', 'servicios', 'passwordHash', 'activo', 'creado', 'actualizado'],
    Historial: ['id', 'leadId', 'fecha', 'usuarioId', 'usuarioNombre', 'accion', 'detalle']
};

module.exports = { TABLAS };
