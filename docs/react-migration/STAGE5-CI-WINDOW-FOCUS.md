# Seguimiento del CI — foco y presentación

Fuente de la fixture `217a623e4a7de127c31b16e208ee76867c9ba6b6`; producto React sin cambios respecto a PACK-INFORMATION-GROUPS/c3f317a.

CI40827795644 sobre ad24521/b7ec02c terminó: Vue aprobado y React119/120 aprobados. El único fallo fue12-launch, tanto en intento inicial como en retry: Reanudar presentación estaba en el DOM y la acción de ratón quedó esperando visibilidad/habilitación/estabilidad30s después de cambiar la instancia destacada.46, que reproduce la carrera de packs/arranque, pasó. Se conservaron el log y ambas trazas del artefacto de GitHub. No atribuir la causa exacta al foco como hecho: no se registraba el foco Native antes de ese punto.

La fixture ahora restaura ventana si está minimizada y verifica foco de BrowserWindow, webContents y documento antes de la interacción. Comprueba que el botón esté enfocado, habilitado y totalmente visible, lo activa con Enter y comprueba el cambio de acción a Pausar presentación. No fuerza clics ni desactiva pausas/validaciones. Se conservan las aserciones de partida en ejecución, pausa de vídeo, salida y reproducción posterior.01-prototype conserva el clic de ratón sobre ese mismo control.

Recorrido focal12-launch empaquetado:1 aprobado,10,2s, sobre el EXE React de c3f317a. E2Etsc mantiene exactamente los mismos56 diagnósticos al normalizar posiciones de línea, sin nuevos. No se repiten824 unitarias/tipos de producto por un cambio exclusivo de fixture. Hace falta un nuevo CI completo; este resultado local no certifica Windows hospedado.

Comando desde launcher: Playwright12-launch con grep del escenario launch checks profile and physical directory, EXE React, es-ES y output stage5-pack-info-groups-ci-focus; pnpm --dir e2e exec tsc --noEmit. Consulta gh run view40827795644 --log-failed y descarga de su artefacto react-migration-evidence, guardado solo en artefactos ignorados.

Manifiesto ignorado launcher/e2e/artifacts/stage5-pack-ci-focus-manifest.json, SHA-256 `f92ef3e6382d19dbe66ea91bc9ba775bad38742f1e6350d0a03be70af1937be5`:blob Git canónico de la fixture y14 archivos de evidencia, incluidas ambas trazas fallidas de CI.

K08/K09/gates5 pendientes. Verificar CI nuevo y continuar compartidos/actualizaciones de packs, shaders, mundos, ajustes, consola y6–9. Producción/proxy intactos, Microsoft pospuesto, Vue predeterminado, PR4 borrador. No DevTools/CDP, ANALISIS ni limpiezas denegadas.
