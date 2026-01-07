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
    const formData = new FormData(this);

    fetch('/contact', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('form-response').textContent = data.message;
        document.getElementById('form-response').classList.remove('hidden');
        closeModal();
    })
    .catch(error => {
        console.error('Error:', error);
        document.getElementById('form-response').textContent = 'Error al enviar el mensaje. Inténtalo de nuevo.';
        document.getElementById('form-response').classList.remove('hidden');
    });
});

// Cerrar modal al presionar Escape
window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
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
