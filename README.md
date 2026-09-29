# Hoja de registro para incorporación a la Sociedad de Radiología

Aplicación con Cloudflare Workers + D1.

## Modelo de acceso

### Administrador
El administrador usa una cuenta real con:

- nombre
- correo electrónico
- contraseña

La sesión administrativa se conserva mediante una cookie HttpOnly durante 30 días. Puede cerrar el navegador y volver después, o iniciar sesión desde otro dispositivo.

Cada hoja creada queda asociada a la cuenta administrativa mediante `owner_user_id`.

Desde el panel puede:

- ver todas sus hojas
- crear nuevas hojas
- ver los participantes de cada hoja
- consultar teléfono, correo y CONADEM
- exportar CSV
- imprimir/PDF
- copiar la invitación para aspirantes
- cambiar la clave de aspirantes

### Aspirante
El aspirante no necesita cuenta.

Usa:

- enlace o código de sala
- clave de aspirante

Puede enviar el formulario, pero no existe ningún endpoint que le permita descargar el listado completo.

## Seguridad

- Contraseñas administrativas: PBKDF2-SHA256, 100,000 iteraciones y salt individual.
- Sesiones administrativas: token aleatorio; solo su SHA-256 se almacena en D1.
- La cookie administrativa es HttpOnly, SameSite=Strict y Secure en HTTPS.
- Sesión administrativa: 30 días.
- Sesión de aspirante: 24 horas.
- Las consultas a D1 usan parámetros.
- El listado administrativo exige que la hoja pertenezca al usuario autenticado.

## Migración de la base existente

Si la D1 ya existe, ejecute una sola vez:

```bash
npm run db:migrate-admin-accounts
```

Esto crea:

- `admin_users`
- `admin_sessions`

y agrega a `rooms`:

- `owner_user_id`
- `title`
- `participant_pin`

Las hojas nuevas quedarán asociadas automáticamente a la cuenta administrativa que las crea.

Las hojas antiguas permanecen en D1, pero no aparecen automáticamente en el panel porque fueron creadas antes de existir propietarios administrativos.

## Estructura

```
public/
src/worker.js
schema.sql
migrations/0003_admin_accounts.sql
wrangler.jsonc
package.json
```
