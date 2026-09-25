# Portafolio de Consultoría Especializada

Portafolio web para Consultoría Especializada, con un CRM para gestionar a las personas que escriben desde el formulario de contacto. Los contactos se guardan en Google Sheets.

## Instalación y ejecución

### Requisitos
- [Node.js](https://nodejs.org/) 22.9 o superior

### Pasos
1. Clona o descarga el proyecto.
2. Instala las dependencias: `npm install`
3. Copia `.env.example` como `.env` y completa al menos `ADMIN_PASSWORD`.
4. Ejecuta el servidor: `npm start`
5. Abre http://localhost:3000 para ver la página y http://localhost:3000/admin para el CRM.

Si no configuras Google Sheets, en desarrollo los contactos se guardan en `data/crm.json`. Así se puede probar todo sin credenciales. En producción (`NODE_ENV=production`), Google Sheets es obligatorio.

## Datos de la corporación
El nombre, las iniciales del logo, la razón social, el NIT, la dirección, el teléfono y los correos están en `config/corporacion.json`. El sitio, la Política de Tratamiento de Datos y el CRM los toman de ahí: al editar el archivo, el cambio se ve al recargar la página, sin reiniciar el servidor. `npm run verificar` avisa qué campos siguen "por definir".

El formulario exige la autorización de tratamiento de datos (Ley 1581 de 2012). Cada contacto guarda la fecha de la autorización y la versión de la política aceptada (`politicaDatosVersion`). Si cambias la política, sube ese número.

## Estructura
- `public/`: sitio estático (HTML, CSS, JS e imágenes). Es lo único que el servidor publica.
- `admin/`: panel del CRM (login, tablero y contactos). Solo se accede con sesión.
- `server.js`: servidor Express. Recibe el formulario en `POST /contact` y expone la API del CRM en `/api`.
- `lib/`: autenticación, avisos por correo y almacenamiento (Google Sheets o archivo local).

## CRM
- **Tablero:** totales, contactos del mes, contactos sin atender, tasa de conversión, seguimientos vencidos y gráficas por mes, servicio y etapa.
- **Contactos:** lista con búsqueda y filtros por estado y servicio.
- **Ficha de cada contacto:** cambiar el estado (Nuevo → Contactado → Propuesta enviada → Ganado/Perdido), programar el próximo seguimiento y registrar notas.
- **Aviso por correo** cada vez que llega un contacto nuevo (opcional).

### Usuarios y roles
Cada persona entra con su correo y su contraseña. Los usuarios se guardan en la pestaña **Usuarios** de la hoja, con las contraseñas cifradas (scrypt).
- **Administrador:** ve todos los contactos, los asigna o reasigna, los elimina y gestiona los usuarios (pestaña *Usuarios* del CRM).
- **Consultor:** ve solo los contactos asignados a él y los que están sin asignar; puede asignarse un contacto sin responsable, cambiar su estado y seguimiento, y agregar notas.

Cada usuario indica qué servicios atiende. Si un servicio lo atiende **un solo** usuario activo, los contactos nuevos de ese servicio se le asignan automáticamente y el correo de aviso le llega también a él.

Todo cambio de estado, seguimiento o responsable queda en la pestaña **Historial** con quién lo hizo y cuándo, y se ve en la sección *Actividad* de la ficha. Las notas guardan su autor.

El primer administrador se crea solo al iniciar el servidor, cuando todavía no hay usuarios, con `ADMIN_EMAIL`, `ADMIN_NOMBRE` y `ADMIN_PASSWORD` de `.env`. Después, esas variables ya no se usan: los cambios se hacen desde el CRM.

## Conectar Google Sheets
1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/) y habilita la **Google Sheets API**.
2. En *IAM y administración → Cuentas de servicio*, crea una cuenta de servicio. Luego, en *Claves → Agregar clave → JSON*, descarga la clave.
3. Guarda la clave como `credenciales/google-service-account.json`. Esa carpeta está en `.gitignore`: nunca la subas a GitHub.
4. Crea una hoja de cálculo en Google Sheets y **compártela como Editor** con el correo de la cuenta de servicio (termina en `iam.gserviceaccount.com`).
5. En `.env`, pon en `GOOGLE_SHEET_ID` el ID de la hoja (la parte de la URL entre `/d/` y `/edit`).
6. Reinicia el servidor. Se crearán solas las pestañas **Leads** y **Notas** con sus encabezados.

No renombres las pestañas ni cambies el orden de las columnas. Sí puedes ordenar o filtrar las filas en Google Sheets.

## Aviso por correo (opcional)
Completa las variables `SMTP_*` y `NOTIFY_EMAIL` en `.env`. Con Gmail:
- `SMTP_HOST=smtp.gmail.com` y `SMTP_PORT=465`
- `SMTP_USER`: tu correo de Gmail
- `SMTP_PASS`: una [contraseña de aplicación](https://myaccount.google.com/apppasswords) (requiere la verificación en dos pasos). No uses tu contraseña normal.

## Demostración portátil
`npm run demo` genera `dist/demo-consultoria.html`: un solo archivo con el sitio, el CRM y la política de datos que se abre con doble clic, sin servidor ni internet. Usa el mismo código de la aplicación, pero con un simulador de la API (`demo/mock-api.js`) y **datos ficticios** en memoria: no se conecta a Google Sheets, no envía correos y no guarda nada. Sirve para mostrar el avance a personas que no tienen acceso al CRM real.

Vuelva a generarlo después de cambiar el sitio, el CRM o `config/corporacion.json`.

## Verificar la configuración
`npm run verificar` revisa la contraseña del CRM, la conexión con Google Sheets (y crea las pestañas si faltan) y el acceso al servidor de correo, sin enviar nada.

## Publicar en producción
- Usa HTTPS y define `NODE_ENV=production`, para que la cookie de sesión sea segura y se exija Google Sheets.
- Define `SESSION_SECRET` con un texto aleatorio largo y `PUBLIC_URL` con la dirección del sitio.
