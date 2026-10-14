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

## Completar títulos de registros anteriores

Los aspirantes que enviaron su formulario antes de que se solicitara el título pueden entrar con el enlace/código y clave de su hoja, y seleccionar **«Agregar título a mi registro anterior»**.

Se pide el correo y número de CONADEM originales, además del título nuevo (entre 3 y 200 caracteres). El sistema identifica un único registro de esa hoja y **solo actualiza `work_title` si estaba vacío**. Si hay registros duplicados con los mismos datos o el título ya está completado, el registro se deja intacto y se indica contactar a la administración. No se expone el listado de aspirantes ni se crea un registro nuevo.

No hay ninguna migración adicional: se utiliza `participants.work_title`, introducida por `0004_work_title.sql`. En una D1 existente, ejecutar `npm run db:migrate-work-title` una única vez antes de desplegar si aún no se ha aplicado.

**Nota de seguridad:** el correo y CONADEM no demuestran propiedad del buzón: son una comprobación básica junto con la clave de acceso a la hoja. Esto no equivale a iniciar sesión con un código enviado al correo. La aplicación no puede reconocer de forma fiable a los aspirantes anteriores solo por dispositivo porque no guardaba identificadores individuales.

## Estructura

```
public/
src/worker.js
schema.sql
migrations/0003_admin_accounts.sql
migrations/0004_work_title.sql
wrangler.jsonc
package.json
```
