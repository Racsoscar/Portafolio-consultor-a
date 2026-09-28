// Nombres descriptivos de cada tipo de servicio del formulario
// La clave es la que se guarda en la hoja: no se debe cambiar una vez hay datos.
// "acreditacion" abarca educación media y superior (se conserva la clave original).
const SERVICIOS = {
    sistemas: 'Ingeniería de Sistemas',
    ambiental: 'Ingeniería Ambiental',
    civil: 'Ingeniería Civil',
    mecanica: 'Ingeniería Mecánica',
    psicologia: 'Psicología',
    derecho: 'Derecho',
    diseno_modas: 'Diseño de Modas',
    acreditacion: 'Educación y Acreditación',
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
