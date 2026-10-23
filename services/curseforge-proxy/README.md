# CurseForge para Launcher MC

Worker público de lectura para Minecraft (`gameId=432`). La API key permanece en Cloudflare; el launcher contiene únicamente una URL pública. Las respuestas REST conservan su formato para reutilizar `CurseforgeV1Client`.

## Activación

1. Crear una cuenta Cloudflare Free. Confirmar que la clave nueva fue emitida para el uso de CurseForge por un launcher de terceros. Revocar la clave compartida anteriormente.
2. Desde esta carpeta ejecutar `npm ci`, `npm test` y `npx wrangler login`.
3. Ejecutar `npx wrangler deploy`. Sin secreto, el Worker responde 503 y no llama a CurseForge.
4. Ejecutar `npx wrangler secret put CURSEFORGE_API_KEY` y escribir la clave nueva en el prompt privado. No pegarla en chats, archivos versionados ni comandos con argumentos.
5. Probar `https://<worker>.<cuenta>.workers.dev/v1/mods/search?gameId=432&pageSize=1&classId=6` y confirmar HTTP 200. Categorías por sí solas no confirman permisos de búsqueda.
6. Configurar la variable de repositorio de GitHub **CURSEFORGE_PROXY_URL** con ese origen HTTPS. El workflow de release la compila como configuración pública. Para desarrollo, definir la misma variable en `launcher/xmcl-electron-app/.env` y reconstruir main.
7. Eliminar los antiguos secretos CurseForge usados por workflows de compilación del instalador. La app ya no los lee.

El workflow manual `Deploy CurseForge proxy` necesita un `CLOUDFLARE_API_TOKEN` restringido a editar Workers en la cuenta y `CLOUDFLARE_ACCOUNT_ID`. La clave de CurseForge se conserva en el Worker y no se transfiere al job del launcher.

## Controles

- Origen upstream fijo, rutas GET/POST cerradas, consultas validadas y paginación máxima de 50; no es un proxy de URLs arbitrarias.
- Bulk: hasta 1.000 identificadores positivos y cuerpo de 32 KiB; respuestas de hasta 4 MiB; timeout de 10 segundos.
- No se reenvían credenciales del cliente ni errores sin filtrar. No hay registro propio de URLs, cuerpos o secretos.
- 60 solicitudes/minuto por IP y 300 fallos de caché/minuto compartidos por ubicación de Cloudflare. Son límites aproximados, no cuotas globales estrictas.
- Caché GET: 60 segundos para búsqueda y 300 para otras lecturas. POST no se cachea.
- CORS permite lectura pública y no es autenticación. La URL puede usarse fuera del launcher: vigilar tráfico y errores en el dashboard.
- Para detenerlo, cambiar `ENABLED` a `false` y desplegar. La ausencia del secreto o de los limitadores falla cerrada.
- Usar Workers Free y mantener su límite diario. Al agotarse la cuota el launcher muestra un error recuperable. El código no cambia el plan ni activa facturación.

## Validación local

`npm test` cubre rutas, filtros, cuerpos, configuración ausente, límites, caché, credenciales, errores upstream, preflight y respuestas grandes. `npx wrangler deploy --dry-run` valida el bundle y los bindings sin publicar.

No activar CurseForge en una versión pública hasta comprobar el Worker desplegado con una clave renovada.

Los **API Tokens de autor** corresponden a la API de subidas y no autorizan este catálogo REST. Para un launcher de terceros, seguir la [solicitud enlazada en la documentación oficial](https://docs.curseforge.com/rest-api/#getting-started). Cambiar la credencial exclusivamente en el secreto de Cloudflare.
