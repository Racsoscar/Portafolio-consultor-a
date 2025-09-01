function showContact(service) {
    document.getElementById('contact-modal').classList.remove('hidden');
    document.getElementById('service-type').value = service;
    document.getElementById('form-response').classList.add('hidden');
    document.getElementById('contact-form').reset();
}

function closeModal() {
    document.getElementById('contact-modal').classList.add('hidden');
}

document.getElementById('contact-form').addEventListener('submit', function(e) {
    e.preventDefault();
    // Simulación de envío
    document.getElementById('form-response').textContent = '¡Gracias por tu interés! Nos pondremos en contacto pronto.';
    document.getElementById('form-response').classList.remove('hidden');
    setTimeout(closeModal, 2000);
});

// Cerrar modal al presionar Escape
window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
});
