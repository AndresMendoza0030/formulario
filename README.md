# Hoja de registro para incorporación a la Sociedad de Radiología

Versión tradicional con almacenamiento persistente en **Cloudflare D1** y API en **Cloudflare Workers**.

## Qué cambió

La versión P2P fue retirada. Ahora:

- Las salas se crean en el servidor.
- Cada sala tiene un código corto de 12 caracteres y una clave de 8 dígitos.
- El PIN se guarda en D1 como una derivación PBKDF2-SHA256 (100,000 iteraciones) con salt, nunca en texto plano.
- Al ingresar correctamente se emite una sesión temporal de 24 horas.
- Los participantes se guardan permanentemente en D1.
- Cerrar el navegador, apagar el equipo o desconectarse no elimina la información.
- Si se pierde el enlace, la hoja puede abrirse desde la página principal usando **código de sala + clave**.
- El listado se actualiza automáticamente cada 10 segundos mientras la página está visible.
- Se mantiene exportación CSV e impresión/PDF.

## Campos

- Nombre completo
- Teléfono
- Correo electrónico
- Nro. de CONADEM
- Tipo de trabajo:
  - A - Trabajo de investigación
  - B - Monografía
  - C - Caso interesante

## Arquitectura

```
Navegador
   │
   ├── archivos estáticos → Cloudflare Worker Assets
   │
   └── /api/* → Cloudflare Worker
                    │
                    └── D1 (DB)
```

El frontend y la API se sirven desde el mismo Worker, por lo que no es necesario configurar CORS ni mantener dos dominios.

## Estructura

```
public/
  index.html
  app.js
  styles.css
  favicon.svg
  _headers

src/
  worker.js

schema.sql
wrangler.jsonc
package.json
CLOUDFLARE_SETUP.md
```

## Desarrollo local

Después de configurar el ID de D1 en `wrangler.jsonc`:

```bash
npm install
npm run db:local
npm run dev
```

## Producción

Consulte `CLOUDFLARE_SETUP.md`.

## Seguridad

- Las consultas usan prepared statements y parámetros.
- El PIN no se guarda en texto plano.
- Después de validar el PIN se utiliza un token de sesión aleatorio almacenado únicamente durante la sesión del navegador.
- Los tokens guardados en D1 se almacenan como SHA-256.
- Las sesiones vencen a las 24 horas.
- Los encabezados del frontend incluyen CSP, bloqueo de iframes, política de referer y restricciones de permisos.

## Nota

La aplicación ya no depende de GitHub Pages para producción. Cloudflare Workers sirve tanto los archivos estáticos como la API.
