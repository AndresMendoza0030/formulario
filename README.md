# Sala privada de registro

MVP de una hoja colaborativa para grupos pequeños.

## Qué hace

- Crea una sala con URL aleatoria y clave de 8 dígitos.
- Cada integrante puede agregar su información.
- Los registros se sincronizan en tiempo real entre navegadores conectados.
- Cada navegador conserva localmente una copia de los registros que ha recibido.
- Exporta el listado a CSV.
- Permite imprimir o guardar como PDF.

## Privacidad

Este MVP no usa una base de datos propia. Usa Trystero/WebRTC para conectar navegadores y enviar los datos directamente entre participantes. La clave compartida se usa como secreto de la sala.

Importante: no es una solución para información altamente sensible ni sustituye un sistema con autenticación formal. Si todos los navegadores que conservan una copia dejan de participar y entra un dispositivo nuevo, ese dispositivo no puede recuperar registros que nunca recibió.

## Publicar en GitHub Pages

El sitio es 100% estático. Basta con publicar estos archivos desde la raíz de un repositorio usando GitHub Pages.

Archivos:

- `index.html`
- `styles.css`
- `app.js`

No requiere proceso de compilación.
