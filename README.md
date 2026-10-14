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
- consultar teléfono, correo, CONADEM, tipo y título del trabajo
- exportar CSV
- imprimir/PDF
- copiar la invitación para aspirantes
- cambiar la clave de aspirantes

### Aspirante
El aspirante no necesita cuenta.

Usa:

- enlace o código de sala
- clave de aspirante

El formulario solicita tipo de trabajo (investigación, monografía o caso interesante) y título del trabajo (de 3 a 200 caracteres), además de los datos de identificación.

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

## Migración para el título del trabajo

**Importante para una D1 existente:** antes de desplegar esta versión del Worker, ejecute **una sola vez**:

```bash
npm run db:migrate-work-title
```

La migración agrega `participants.work_title` sin borrar datos. Los registros anteriores conservan el título vacío y se muestran como «—» en el panel; los nuevos registros requieren título. El título aparece en el listado administrativo, CSV e impresión/PDF.

Para una base de datos creada desde cero, `schema.sql` ya incluye la columna y no debe volver a ejecutar esta migración.

El logotipo y el botón «Inicio» del encabezado llevan a la portada. El botón «Administración» abre el panel si existe una sesión activa o el acceso administrativo en caso contrario.

## Registro y actualización: páginas independientes

Las invitaciones incluyen dos enlaces separados:

- **Registrarme:** `/registro.html?room=CODIGO`
- **Actualizar mi registro:** `/actualizar.html?room=CODIGO`

El enlace antiguo con `/#room=CODIGO` sigue funcionando y redirige a la página de registro, desde la que se puede abrir la ruta de actualización.

En ambas rutas se requiere la clave de aspirante de la sala. Para actualizar se solicitan únicamente el **correo electrónico y Nro. de CONADEM originales**. La búsqueda ignora mayúsculas/minúsculas y espacios al inicio o final de ambos valores. Si encuentra exactamente un registro, carga los seis campos originales (nombre, teléfono, correo, CONADEM, tipo y título del trabajo) y permite modificarlos. El título puede estar vacío en registros antiguos. Los cambios se guardan en el mismo registro, sin inscribir al aspirante de nuevo.

No se envía ningún código ni se necesita configurar un proveedor de correo o hacer migraciones nuevas. Las consultas utilizan la tabla `participants` existente. Si dos registros de una sala comparten el mismo correo y CONADEM, se solicita ayuda al administrador.

**Advertencia:** la clave de la sala es compartida, y el correo y CONADEM pueden ser conocidos por terceros. Este acceso es sencillo, pero no equivale a una autenticación individual. Quien conozca esos datos y tenga la clave de sala podría consultar o modificar el registro correspondiente.

## Estructura

```
public/registro.html
public/registro.js
public/actualizar.html
public/actualizar.js
public/participant-common.js
src/worker.js
schema.sql
migrations/0003_admin_accounts.sql
migrations/0004_work_title.sql
wrangler.jsonc
package.json
```
