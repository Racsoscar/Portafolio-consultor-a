// Nombres descriptivos de cada tipo de servicio del formulario
const SERVICIOS = {
    sistemas: 'Ingeniería de Sistemas',
    ambiental: 'Ingeniería Ambiental',
    civil: 'Ingeniería Civil',
    mecanica: 'Ingeniería Mecánica',
    acreditacion: 'Acreditación en Educación Superior',
    general: 'Consulta General'
};

// Etapas del embudo, en orden
const ESTADOS = {
    nuevo: 'Nuevo',
    contactado: 'Contactado',
    propuesta: 'Propuesta enviada',
    ganado: 'Ganado',
    perdido: 'Perdido'
};

module.exports = { SERVICIOS, ESTADOS };
