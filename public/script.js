const contactForm = document.getElementById('contact-form');
const formResponse = document.getElementById('form-response');

// ---------- Menú en móvil ----------

const navToggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('menu');

function cerrarMenu() {
    menu.classList.remove('abierto');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Abrir menú');
}

navToggle.addEventListener('click', () => {
    const abierto = menu.classList.toggle('abierto');
    navToggle.setAttribute('aria-expanded', String(abierto));
    navToggle.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
});
menu.addEventListener('click', e => {
    if (e.target.closest('a')) cerrarMenu();
});
window.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarMenu();
});

// ---------- Botones de servicio: preseleccionan el servicio en el formulario ----------

for (const enlace of document.querySelectorAll('[data-servicio]')) {
    enlace.addEventListener('click', () => {
        document.getElementById('service-type').value = enlace.dataset.servicio;
        // Enfocar el primer campo cuando termine el desplazamiento
        setTimeout(() => document.getElementById('name').focus({ preventScroll: true }), 500);
    });
}

// ---------- Formulario de contacto ----------

function mostrarRespuesta(texto, esError) {
    formResponse.textContent = texto;
    formResponse.classList.toggle('error', esError);
    formResponse.hidden = false;
}

function validar() {
    let primerInvalido = null;
    for (const campo of contactForm.querySelectorAll('input, select, textarea')) {
        const valido = campo.checkValidity();
        const marcador = campo.type === 'checkbox' ? campo.closest('.autorizacion') : campo;
        marcador.classList.toggle('invalido', !valido);
        if (!valido && !primerInvalido) primerInvalido = campo;
    }
    if (primerInvalido) {
        primerInvalido.focus();
        const autorizacion = document.getElementById('autorizacion');
        mostrarRespuesta(primerInvalido === autorizacion
            ? 'Para enviar la solicitud debe autorizar el tratamiento de sus datos personales.'
            : 'Revise los campos marcados: todos son obligatorios.', true);
        return false;
    }
    return true;
}

contactForm.addEventListener('input', e => {
    const marcador = e.target.type === 'checkbox' ? e.target.closest('.autorizacion') : e.target;
    if (e.target.checkValidity()) marcador.classList.remove('invalido');
});

contactForm.addEventListener('submit', function (e) {
    e.preventDefault();
    formResponse.hidden = true;
    if (!validar()) return;

    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    fetch('/contact', {
        method: 'POST',
        body: new URLSearchParams(new FormData(this))
    })
    .then(response => response.json().then(data => ({ ok: response.ok, data })))
    .then(({ ok, data }) => {
        mostrarRespuesta(data.message, !ok);
        if (ok) contactForm.reset();
    })
    .catch(error => {
        console.error('Error:', error);
        mostrarRespuesta('Error al enviar la solicitud. Inténtelo de nuevo.', true);
    })
    .finally(() => {
        submitButton.disabled = false;
    });
});

// ---------- Volver arriba ----------

const scrollButton = document.getElementById('scrollToTop');
scrollButton.addEventListener('click', () => window.scrollTo({ top: 0 }));
window.addEventListener('scroll', () => {
    scrollButton.hidden = window.scrollY < 600;
}, { passive: true });
