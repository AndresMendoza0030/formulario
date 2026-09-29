# Hoja de registro para incorporación a la Sociedad de Radiología

Aplicación web estática para registrar aspirantes dentro de una sala privada compartida.

## Campos de registro

- Nombre completo
- Teléfono
- Correo electrónico
- Nro. de CONADEM
- Tipo de trabajo:
  - A - Trabajo de investigación
  - B - Monografía
  - C - Caso interesante

## Funcionamiento

- Se crea una hoja privada con enlace y clave de 8 dígitos.
- Los aspirantes autorizados pueden ingresar, completar sus datos y ver el listado común.
- La información se sincroniza entre los navegadores participantes.
- Cada navegador conserva localmente una copia de los registros que ha recibido.
- El listado puede exportarse a CSV o imprimirse/guardarse como PDF.

## Privacidad

Este MVP no usa una base de datos propia. Utiliza Trystero/WebRTC para conectar los navegadores participantes. La clave compartida funciona como secreto de acceso a la sala.

Si todos los navegadores que conservan una copia dejan de participar y entra un dispositivo nuevo, ese dispositivo no puede recuperar registros que nunca recibió.

## Archivos

- `index.html`
- `styles.css`
- `app.js`

No requiere proceso de compilación.
