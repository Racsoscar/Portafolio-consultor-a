const contactForm = document.getElementById('contact-form');
const formResponse = document.getElementById('form-response');
let closeTimer;

function showContact(service) {
    clearTimeout(closeTimer);
    document.getElementById('contact-modal').classList.remove('hidden');
    contactForm.reset();
    document.getElementById('service-type').value = service;
    formResponse.classList.add('hidden');
    document.getElementById('name').focus();
}

function closeModal() {
    clearTimeout(closeTimer);
    document.getElementById('contact-modal').classList.add('hidden');
}

function showFormResponse(text, isError) {
    formResponse.textContent = text;
    formResponse.classList.toggle('error', isError);
    formResponse.classList.remove('hidden');
}

contactForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    fetch('/contact', {
        method: 'POST',
        body: new URLSearchParams(new FormData(this))
    })
    .then(response => response.json().then(data => ({ ok: response.ok, data })))
    .then(({ ok, data }) => {
        showFormResponse(data.message, !ok);
        if (ok) {
            contactForm.reset();
            // Dejar ver el mensaje de confirmación antes de cerrar
            closeTimer = setTimeout(closeModal, 3000);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showFormResponse('Error al enviar el mensaje. Inténtalo de nuevo.', true);
    })
    .finally(() => {
        submitButton.disabled = false;
    });
});

// Cerrar modal al presionar Escape o al hacer clic fuera del contenido
window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
});
document.getElementById('contact-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// Scroll to top
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show/hide scroll to top button
window.addEventListener('scroll', function() {
    const button = document.getElementById('scrollToTop');
    if (window.scrollY > 300) {
        button.style.display = 'block';
    } else {
        button.style.display = 'none';
    }
});
