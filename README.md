# Portafolio de Consultoría Especializada

Portafolio web para Consultoría Especializada. El formulario de contacto envía los datos de las personas interesadas a un Google Form, donde quedan registrados.

## Instalación y ejecución

### Requisitos
- [Node.js](https://nodejs.org/) 18 o superior

### Pasos
1. Clona o descarga el proyecto.
2. Instala las dependencias: `npm install`
3. Ejecuta el servidor: `npm start`
4. Abre http://localhost:3000 en tu navegador.

El puerto se puede cambiar con la variable de entorno `PORT`.

## Estructura
- `public/`: sitio estático (HTML, CSS, JS e imágenes). Es lo único que el servidor publica.
- `server.js`: servidor Express que sirve `public/` y recibe el formulario en `POST /contact`.

## Formulario de contacto
`server.js` valida los datos (nombre, correo, mensaje y tipo de servicio) y los reenvía a Google Forms. Las respuestas se consultan en la pestaña **Respuestas** del formulario o en la hoja de cálculo vinculada.

Si cambias de formulario, actualiza `FORM_URL` y los identificadores `entry.XXXX` en `server.js`.
