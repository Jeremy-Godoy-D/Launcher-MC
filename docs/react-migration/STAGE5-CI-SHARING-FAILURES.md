# Seguimiento CI — fallos simulados de publicación de packs

Fuente `b375a9c1df4f215fcd1bc5d02a3fb1865700ccfb`; cambio exclusivo de prueba. Producto empaquetado anterior:46b6230, sin cambios por esta corrección.

CI40874755065 terminó con React839/841 pruebas aprobadas y Vue cancelado por fail-fast. Las dos pruebas de recuperación esperaban un error de publicación que el spy sobre graceful-fs.rename no llegó a provocar en ese runner. No hay evidencia de un fallo de recuperación ejecutada en ese CI: la operación terminó correctamente porque no se inyectó el fallo esperado.

La fixture intercepta ahora el límite real importado fs-extra.move, delegando los demás movimientos al módulo original. Comprueba que se provoca exactamente un fallo al publicar el enlace o la copia privada. En el primer caso también comprueba el movimiento de restauración; conserva las aserciones de archivos locales, compartidos, enlace y respaldo. No se cambia código de producto ni se debilitan comprobaciones.

Validación local desde launcher: `pnpm exec vitest run xmcl-runtime/instance/utils/sharedResourcePacks.test.ts`:11/11,974ms; comando unitario completo de .github/workflows/react-migration.yml:841/841 en88archivos,17,19s. `pnpm check` y `pnpm lint` aprobados sobre el worktree, que incluye trabajo todavía no confirmado de actualizaciones de packs. El harness raíz check y sus9pruebas también pasan. Los tipos locales no se presentan como validación exclusiva del commit; el CI nuevo debe comprobar sus blobs exactos.

Manifiesto ignorado launcher/e2e/artifacts/stage5-sharing-ci-mock-manifest.json, SHA-256 `a57eacc870e998f01c3900fdc7777e7183ce0ebe9c2a9bf471cfe173bfa95149`:blob canónico de la fixture y cuatro logs. No se repite Electron ni se reconstruyen binarios por este cambio exclusivo de prueba.

CI nuevo pendiente después del push. Las actualizaciones de packs siguen en desarrollo sin validar integralmente;5 y6–9 pendientes, Microsoft pospuesto, Vue predeterminado, PR4 borrador y producción/proxy intactos. No certifica descarga Java/juego/NSIS/delta reales ni publicación.

## Causa reproducida mediante un alias temporal

Fuente `cd4d06a5c6244b7c18625f0b679e1c4843825384`. CI40877340873 repitió los dos fallos,esta vez Vue y React cancelado. Cambiar el punto de interceptación no bastaba:la fixture comparaba una ruta temporal literal con la ruta física resuelta por el producto.

Se reprodujeron ambos fallos localmente al definir TEMP/TMP para el proceso de prueba mediante una junction temporal. Antes del arreglo:9/11 aprobadas,los mismos2 fallos. Después de resolver realpath sobre mkdtemp en la fixture:12/12 con alias y12/12 sin alias. Se añade una regresión que llama al motor con un alias de carpeta padre y verifica fallo,restauración y bytes originales. Producto sin cambios. Es evidencia de la causa reproducida localmente,no inspección de las variables TEMP del runner original.

Manifiesto ignorado stage5-sharing-ci-alias-manifest.json,SHA-256 `a52a822366610176264ab7633167a4e0710edeafa96fe8758ecb9f8946fbc059`;blob canónico de prueba y4logs. Nuevo CI pendiente. Los resultados anteriores de841 unidades/tipos/lint corresponden al worktree y a la revisión b375a9c, no sustituyen este CI.

La revisión automática rechazó la limpieza de la junction `launcher/e2e/artifacts/sharing-temp-alias`,creada para este experimento y dirigida al TEMP del usuario. No se eliminó ni se reintentará por otra vía. No recorrerla para reunir artefactos ni seguirla en limpiezas. Se conservaron los temporales protegidos anteriores.
