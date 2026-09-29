# Configuración en Cloudflare

El código del proyecto ya está preparado. Falta únicamente provisionar los recursos dentro de la cuenta de Cloudflare.

## 1. Instalar dependencias

Desde la raíz del repositorio:

```bash
npm install
```

## 2. Autenticarse con Cloudflare

```bash
npx wrangler login
```

## 3. Crear la base D1

```bash
npx wrangler d1 create formulario-radiologia-db
```

Wrangler mostrará un `database_id`.

Abra `wrangler.jsonc` y reemplace:

```text
REEMPLAZAR_CON_DATABASE_ID
```

por el ID real que devolvió Cloudflare.

El binding ya está configurado con el nombre `DB`.

## 4. Crear las tablas en producción

```bash
npm run db:remote
```

Este comando aplica `schema.sql` a la base D1 remota.

## 5. Desplegar aplicación + API

```bash
npm run deploy
```

Wrangler desplegará:

- el Worker de `src/worker.js`
- los archivos estáticos de `public/`
- el binding con la base D1

Al finalizar mostrará la URL `workers.dev` del proyecto.

## 6. Verificación

Abra:

```text
https://<URL-DEL-WORKER>/api/health
```

Debe devolver JSON con:

```json
{
  "ok": true,
  "service": "formulario-radiologia"
}
```

Después abra la URL principal del Worker y cree una sala de prueba.

## Recuperación

No se necesita ningún proceso especial de respaldo desde el navegador. Los registros permanecen en D1 aunque todos cierren la página.

Para regresar a una sala basta con conservar:

- código de sala
- clave de acceso

También es posible volver mediante el enlace compartido.

## Copia administrativa de D1

Si en algún momento se desea una copia externa de la base completa, Wrangler permite exportar D1 a SQL desde la cuenta de Cloudflare.
