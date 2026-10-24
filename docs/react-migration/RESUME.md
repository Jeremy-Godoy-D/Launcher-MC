# Punto de reanudación

## Objetivo

Implementar el documento completo `PLAN.md`: React en paralelo, nuevo diseño gaming propio con barra lateral, imágenes de modpacks y vídeos ambientales. Publicación prevista: v0.3.0-beta.1. Referencia: v0.2.0-beta.2.

## Bloque actual

Harness y etapa 0 completados; referencia visual/métricas y recorte de alcance documentados en STAGE0.md/JSON. Rama: `codex/react-migration`; referencia Git inicial: `7671c6f1bdc471d42816241920a262a18aca5a44`.

## Siguiente acción

1. Ejecutar status/check; leer SCOPE.md antes de interpretar paridad.
2. Crear el andamiaje mínimo del prototipo React y su mundo visual Xbox/Epic con identidad propia; aún sin sustituir Vue ni conectar acciones a datos reales.
3. Preparar un clip ambiental real con poster/procedencia y verificar rendimiento/pausa. No confundir la referencia beta.2 con métricas React.
4. Validar marco/Inicio/Biblioteca/Catálogo con fixtures, ambos tamaños y variantes; presentar capturas al usuario.
5. Esperar revisión visual real para cerrar etapa 1; no avanzar a extender toda la UI sin ella.

## Restricciones y hechos que no deben perderse

- No editar ni añadir al commit `ANALISIS_ARQUITECTURA.md`.
- El usuario confirmó «Solo el núcleo propuesto, sin extras»: 26 keep, 11 remove y Microsoft deferred; no migrar IA, Bedrock, P2P, SSH, autor, browser, Big Picture ni audio/temas antiguos. El Minecraft online normal permanece.
- Microsoft sigue pospuesto. Las credenciales de CurseForge siguen únicamente en Cloudflare.
- No ejecutar el instalador sobre la instalación habitual. Probar NSIS en Windows desechable durante la etapa 9.
- La revisión visual de la etapa 1 requiere evidencia del usuario; no se reemplaza con un test verde.
- Los vídeos nuevos todavía no existen en el repositorio; no registrar como incorporados ni como licenciados sin evidencia.
- CLI de DevTools rechazado previamente: no reintentar ni eludir. Usar Playwright Electron autorizado.
- No borrar por otra vía la carpeta temporal cuya limpieza fue rechazada.
- Las cifras de rendimiento del plan son presupuestos, no mediciones de React.
- El harness detecta cambios del plan, evidencias ausentes o alteradas y saltos de etapa; no prueba por sí solo que una función esté correcta.
