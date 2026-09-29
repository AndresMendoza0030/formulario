# Hoja de registro para incorporación a la Sociedad de Radiología

Aplicación con almacenamiento persistente en Cloudflare D1 y API en Cloudflare Workers.

## Roles de acceso

Cada hoja tiene dos claves distintas:

- **Clave de aspirantes:** permite ingresar y enviar el formulario. No permite consultar el listado completo.
- **Clave administrativa:** permite ver teléfonos, correos, CONADEM, exportar CSV e imprimir/PDF.

La separación también se aplica en el backend: una sesión de aspirante recibe HTTP 403 si intenta consultar el listado completo.

## Campos

- Nombre completo
- Teléfono
- Correo electrónico
- Nro. de CONADEM
- Tipo de trabajo:
  - A - Trabajo de investigación
  - B - Monografía
  - C - Caso interesante

## Seguridad

- Los PIN se almacenan como PBKDF2-SHA256 con 100,000 iteraciones y salt.
- Los tokens de sesión se almacenan como SHA-256.
- Las sesiones expiran a las 24 horas.
- El listado completo solo puede consultarse con una sesión de rol `admin`.
- Las consultas a D1 utilizan parámetros.

## Migración desde la versión anterior

Si la base D1 ya fue creada con el esquema anterior, ejecute una sola vez:

```bash
npm run db:migrate-roles
```

La migración agrega:

- `rooms.admin_pin_salt`
- `rooms.admin_pin_hash`
- `room_sessions.role`

Las salas creadas antes de esta migración no tienen una clave administrativa histórica. Las nuevas salas creadas después de migrar sí generan ambas claves correctamente.

## Estructura

```
public/
src/worker.js
schema.sql
migrations/0002_access_roles.sql
wrangler.jsonc
package.json
```
