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
- La información se sincroniza entre los navegadores participantes mediante WebRTC.
- El listado puede exportarse a CSV o imprimirse/guardarse como PDF.

## Respaldo y recuperación

La aplicación evita depender de una base de datos central mediante tres capas:

1. **Copia local cifrada automática:** cada navegador que participa conserva una copia AES-GCM de los registros que ha recibido.
2. **Respaldo cifrado descargable:** cualquier participante puede descargar un archivo `.srbackup` y restaurarlo posteriormente con la clave de la sala.
3. **Aviso al navegador custodio:** el navegador que crea o restaura la sala recibe una advertencia del navegador si intenta cerrar con cambios que todavía no han sido incluidos en un archivo de respaldo descargado.

La clave de 8 dígitos no se conserva de forma persistente en `localStorage`; solamente vive durante la sesión de la pestaña. Al volver a abrir la sala se solicita nuevamente para poder descifrar la copia local.

### Limitación importante

No existe un servidor central que conserve respuestas. Si se pierden **todos** los navegadores participantes y también todos los archivos `.srbackup`, no hay un tercero del que recuperar los datos. El respaldo descargable existe precisamente para cubrir ese escenario.

## Privacidad

Las copias locales y los archivos `.srbackup` se cifran en el navegador mediante AES-GCM, con una clave derivada de la clave de la sala usando PBKDF2-SHA256.

La clave de sala de 8 dígitos prioriza facilidad de uso y no debe considerarse equivalente a una contraseña de alta entropía para información extremadamente sensible.

## Archivos

- `index.html`
- `styles.css`
- `app.js`
- `favicon.svg`

No requiere proceso de compilación.
