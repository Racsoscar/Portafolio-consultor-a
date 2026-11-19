document.getElementById('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const error = document.getElementById('login-error');
    const button = this.querySelector('button');
    button.disabled = true;
    error.hidden = true;
    try {
        const res = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: this.email.value, password: this.password.value,
                next: new URLSearchParams(location.search).get('next') || '' })
        });
        if (res.ok) {
            // La ruta de destino la valida el servidor (nunca se usa `next` directamente)
            const data = await res.json().catch(() => ({}));
            location.href = (typeof data.next === 'string' ? data.next : '/admin') + location.hash;
            return;
        }
        const data = await res.json().catch(() => ({}));
        error.textContent = data.message || 'No se pudo iniciar sesión.';
    } catch {
        error.textContent = 'No se pudo conectar con el servidor.';
    }
    error.hidden = false;
    button.disabled = false;
});
