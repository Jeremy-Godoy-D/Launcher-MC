# Continuidad de la migración a React

Antes de trabajar en Launcher MC, leer en este orden:

1. `docs/react-migration/PLAN.md`: documento aprobado por el usuario; fuente principal del rediseño.
2. `docs/react-migration/SCOPE.md`: corrección del usuario: solo núcleo Minecraft Java; prevalece sobre la conservación indiscriminada de extras del plan inicial.
3. `docs/react-migration/state.json` y `docs/react-migration/RESUME.md`: etapa activa, evidencias y siguiente tarea.
4. `docs/react-migration/PARITY.md`: funciones conservadas, retiradas y pospuestas.
5. `launcher/AGENTS.md`: reglas de implementación y validación existentes.

Ejecutar desde la raíz `node launcher/scripts/react-migration.mjs status` al retomar y `node launcher/scripts/react-migration.mjs check` antes de cerrar una etapa. El harness comprueba integridad y evidencias; no sustituye ejecutar pruebas ni revisar la interfaz.

El usuario autorizó implementar el plan completo, incluyendo los cambios acotados de workspace/build necesarios para React. Avanzar por etapas; no ampliar las excepciones a otros cambios globales. La revisión visual del usuario al cerrar la etapa 1 precede a extender el diseño a todas las funciones. No inventar esa aprobación.

Los planes anteriores de la raíz son contexto histórico. No reemplazar el plan React por Aurora ni reintroducir burbujas, editor de temas o CSS personalizado. Medios: los modpacks usan sus propios recursos vía metadatos; buscar en internet únicamente Vanilla/fallback, sin imágenes IA. El usuario corrigió la interpretación de usar Vanilla para todos los packs: no repetirla. Fuente/licencia, pausa y coste limitado.

Corrección visual del usuario 2026-10-24: el paisaje también es fondo de toda la ventana, con glassmorphism en marco/paneles. Conservar contraste, fallback opaco y modo rendimiento sin blur; no confundirlo con volver al motor Aurora de temas/burbujas. Revisión humana final pendiente tras estos cambios.

Mantener Microsoft pospuesto y las credenciales fuera del renderer. Conservar datos del usuario, el proxy y las garantías del actualizador. No tocar `ANALISIS_ARQUITECTURA.md`, archivo preexistente del usuario.

La conexión del CLI de DevTools al launcher fue rechazada por la revisión automática en esta conversación. No reintentar ni eludir esa acción: utilizar las fixtures autorizadas de Playwright Electron y el ejecutable empaquetado. No reintentar la limpieza denegada de `launcher-update-6nFkM2`.

Al terminar cada bloque: actualizar el estado con hechos, evidencia y siguiente acción. No marcar una etapa completa con criterios pendientes. Los logs y capturas permanecen en artefactos ignorados; conservar un informe resumido versionado que identifique commit, comandos y límites de la validación. Ningún secreto en los documentos.
