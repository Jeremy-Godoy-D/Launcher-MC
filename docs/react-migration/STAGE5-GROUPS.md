# Etapa 5 parcial — grupos de contenido

Implementación `ca72062`, aplicación `63209cf`, pruebas finales `59193b7` (2026-10-27). Esta entrega no cierra la etapa 5 ni K08. PLAN/SCOPE y la aprobación visual se conservan.

Los mods pueden agruparse, filtrarse, asignarse, renombrarse y desagruparse en React. Disolver un grupo no elimina archivos. Se conservan atributos desconocidos y colores antiguos no editados. La edición mantiene el borrador ante error, permite recargar y mantiene el foco visible al redimensionar. El índice de miembros se calcula una vez por snapshot.

Main valida instancia Java registrada, dominio, nombres, formato/tamaño y archivos regulares. Escribe temporalmente con fsync y publica después de comprobar el contenido revisado; errores no producen éxito optimista. Las operaciones se serializan en el servicio. No se afirma CAS atómico entre procesos externos ni resistencia certificada a cortes de energía.

La migración Vue/React importa únicamente la ruta seleccionada y borra su entrada antigua solo tras confirmar persistencia y comprobar que no cambió. Un archivo nativo existente —incluso vacío— prevalece; el legado queda intacto como copia inerte. La instalación nativa reutiliza esta escritura sin crear watchers sin consumidores.

## Validación

- Regresión final: **78 React + 1 StrictMode + 3 Vue = 82 escenarios distintos**. Vue recompilado desde su consumidor modificado; dist/default devueltos a Vue.
- **608 unitarias / 66 archivos**, incluidas 11 nuevas; raíz `pnpm check` y `pnpm lint` aprobados en59193b7. Tipos E2E globales conservan56 diagnósticos anteriores; helper y specs31/32/33 sin diagnósticos nuevos. Detector de fuentes:0.
- Capturas conservadas por test:140 PNG;99 auditorías Axe,0 violaciones y170 verificaciones incompletas. No equivale a certificación manual AA. Revisadas visualmente las vistas superior oscura1200 y acciones claras800; escenarios cubren ambos temas y1200×720/800×400.
- CRUD/migración por ruta; nativo vacío prevalece; borrador conservado ante conflicto/fallo; cambioA→B con operación pendiente; JSON roto y rutas no registradas; compatibilidad Vue real. Nueve pruebas del harness aprobadas.
- La primera pasada completa obtuvo77/78 y encontró un defecto real de foco al reducir ventana, corregido63209cf. Una repetición intermedia detectó que la captura superior intencionada del test dejaba el mismo botón enfocado fuera de vista:59193b7 vuelve explícitamente a acciones después de esa captura, conservando la aserción original de resize. La pasada final completa aprueba.

`STAGE5-GROUPS.json` identifica blobs Git, comandos, paquetes al capturar, artefactos locales ignorados y límites. Las rutas de binarios se reutilizan al compilar y sus hashes describen esta captura. Las capturas nuevas están en carpetas propias por ejecución; no se usan PNG compartidos mutables como evidencia histórica.

## Pendiente

Instalación/retiro local, información, dependencias/incompatibilidades/actualización, packs/shaders, mundos, ajustes y consola. Las reglas compartidas de grupos antiguas no se consideran portadas por este bloque. Etapas6–9 intactas; Microsoft pospuesto. Juego/Java reales, instalador/delta, retirada del runtime y auditoría final de seguridad no certificados. Sin publicación ni cambio del renderer predeterminado.
