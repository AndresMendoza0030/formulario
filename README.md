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

## Actualización de registros existentes por correo

En la misma invitación se muestran las opciones **Registrarme** (preseleccionada) y **Actualizar mi registro**.

La actualización solicita **solo el correo original** como identificador (la búsqueda ignora mayúsculas y espacios de los extremos). La app envía un código de 8 dígitos al correo; únicamente tras verificarlo se muestran nombre, teléfono, correo, número de CONADEM, tipo y título del trabajo, todos editables. El código vence a los 10 minutos y admite hasta 5 intentos. La sesión de edición dura 30 minutos; no se almacena en el navegador de forma persistente.

El acceso a la sala sigue requiriendo el código de sala y clave de aspirante. Un correo no verificado nunca permite ver ni modificar datos ajenos. Si hay dos registros con el mismo correo en la misma sala, el aspirante debe acudir al administrador para resolver la duplicidad.

### Configuración obligatoria para una D1 existente

Antes de desplegar el Worker actualizado, ejecute **una sola vez**:

```bash
npm run db:migrate-participant-edit
```

Esta migración crea únicamente tablas nuevas de verificación y sesión, sin borrar ni modificar los registros actuales. En una base D1 nueva, ejecutar `schema.sql` es suficiente.

### Configuración de envío de códigos

Se utiliza **Resend** para enviar los mensajes de verificación; necesita un dominio remitente verificado en esa plataforma. Configure estos dos secretos en Cloudflare Workers (nombre del Worker: `formulario`):

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EDIT_FROM_EMAIL
```

El segundo valor es el remitente autorizado, por ejemplo: `Sociedad de Radiología <registros@tu-dominio.com>`.

No ponga la clave de Resend en GitHub ni en `wrangler.jsonc`. Si no se han configurado los secretos, el inicio de actualización muestra un aviso y **no expone ningún dato personal**. El formulario nuevo y el acceso administrativo permanecen disponibles.

Una vez aplicadas la migración y las dos configuraciones, despliegue nuevamente `main` y pruebe con un registro de prueba y un correo de destino real.

## Estructura

```
public/
src/worker.js
schema.sql
migrations/0003_admin_accounts.sql
migrations/0004_work_title.sql
migrations/0005_participant_edit.sql
wrangler.jsonc
package.json
```
