// Se inyecta en cada página de la demostración (sitio, CRM y política), antes de su propio código.
// Redirige las llamadas al servidor hacia el simulador de la ventana principal (postMessage,
// que funciona también al abrir el archivo directamente desde el disco).
(function () {
    const pendientes = new Map();
    let secuencia = 0;

    window.addEventListener('message', e => {
        const msg = e.data;
        if (!msg || msg.tipo !== 'demo-respuesta' || !pendientes.has(msg.id)) return;
        pendientes.get(msg.id)(msg);
        pendientes.delete(msg.id);
    });

    function cuerpo(body) {
        if (!body) return {};
        if (body instanceof URLSearchParams) return Object.fromEntries(body);
        if (typeof body === 'string') {
            try { return JSON.parse(body); } catch { return Object.fromEntries(new URLSearchParams(body)); }
        }
        return {};
    }

    window.fetch = function (url, opciones = {}) {
        const id = ++secuencia;
        return new Promise(resolve => {
            pendientes.set(id, msg => resolve(new Response(JSON.stringify(msg.data), {
                status: msg.status,
                headers: { 'Content-Type': 'application/json' }
            })));
            window.parent.postMessage({
                tipo: 'demo-api', id,
                method: (opciones.method || 'GET').toUpperCase(),
                ruta: String(url),
                body: cuerpo(opciones.body)
            }, '*');
        });
    };

    // En un documento incrustado, cambiar la URL con history puede fallar: se ignora
    for (const metodo of ['replaceState', 'pushState']) {
        const original = history[metodo].bind(history);
        history[metodo] = (...args) => { try { original(...args); } catch { /* sin efecto en la demo */ } };
    }

    const avisar = texto => window.parent.postMessage({ tipo: 'demo-aviso', texto }, '*');

    // En un documento incrustado, un enlace "#seccion" recargaría la página: se desplaza a mano
    function irAncla(id) {
        const destino = id && document.getElementById(id);
        if (destino) destino.scrollIntoView({ behavior: 'smooth' });
        else if (!id) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.addEventListener('message', e => {
        if (e.data?.tipo === 'demo-ancla') irAncla(e.data.ancla);
    });

    // Enlaces internos, entre páginas y de contacto
    document.addEventListener('click', e => {
        const enlace = e.target.closest('a[href]');
        if (!enlace) return;
        const href = enlace.getAttribute('href');
        if (href.startsWith('#')) {
            e.preventDefault();
            irAncla(decodeURIComponent(href.slice(1)));
        } else if (href === '/politica-de-datos.html') {
            e.preventDefault();
            window.parent.postMessage({ tipo: 'demo-ir', vista: 'politica' }, '*');
        } else if (href === '/' || href.startsWith('/#')) {
            e.preventDefault();
            window.parent.postMessage({ tipo: 'demo-ir', vista: 'sitio', ancla: href.slice(2) }, '*');
        } else if (/^(tel:|mailto:|https:\/\/wa\.me\/)/.test(href)) {
            e.preventDefault();
            avisar('En la demostración los enlaces para llamar, escribir o abrir WhatsApp están desactivados (los datos son ficticios).');
        }
    }, true);

    // CRM: "Salir" vuelve al selector de usuario de la demostración
    document.addEventListener('DOMContentLoaded', () => {
        const salir = document.getElementById('salir');
        if (salir) {
            const copia = salir.cloneNode(true);
            copia.textContent = 'Cambiar de usuario';
            copia.addEventListener('click', () => window.parent.postMessage({ tipo: 'demo-cambiar-usuario' }, '*'));
            salir.replaceWith(copia);
        }
    });
})();
