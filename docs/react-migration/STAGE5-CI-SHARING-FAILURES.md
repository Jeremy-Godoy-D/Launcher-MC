# Seguimiento CI — fallos simulados de publicación de packs

Fuente `b375a9c1df4f215fcd1bc5d02a3fb1865700ccfb`; cambio exclusivo de prueba. Producto empaquetado anterior:46b6230, sin cambios por esta corrección.

CI40874755065 terminó con React839/841 pruebas aprobadas y Vue cancelado por fail-fast. Las dos pruebas de recuperación esperaban un error de publicación que el spy sobre graceful-fs.rename no llegó a provocar en ese runner. No hay evidencia de un fallo de recuperación ejecutada en ese CI: la operación terminó correctamente porque no se inyectó el fallo esperado.

La fixture intercepta ahora el límite real importado fs-extra.move, delegando los demás movimientos al módulo original. Comprueba que se provoca exactamente un fallo al publicar el enlace o la copia privada. En el primer caso también comprueba el movimiento de restauración; conserva las aserciones de archivos locales, compartidos, enlace y respaldo. No se cambia código de producto ni se debilitan comprobaciones.

Validación local desde launcher: `pnpm exec vitest run xmcl-runtime/instance/utils/sharedResourcePacks.test.ts`:11/11,974ms; comando unitario completo de .github/workflows/react-migration.yml:841/841 en88archivos,17,19s. `pnpm check` y `pnpm lint` aprobados sobre el worktree, que incluye trabajo todavía no confirmado de actualizaciones de packs. El harness raíz check y sus9pruebas también pasan. Los tipos locales no se presentan como validación exclusiva del commit; el CI nuevo debe comprobar sus blobs exactos.

Manifiesto ignorado launcher/e2e/artifacts/stage5-sharing-ci-mock-manifest.json, SHA-256 `a57eacc870e998f01c3900fdc7777e7183ce0ebe9c2a9bf471cfe173bfa95149`:blob canónico de la fixture y cuatro logs. No se repite Electron ni se reconstruyen binarios por este cambio exclusivo de prueba.

CI nuevo pendiente después del push. Las actualizaciones de packs siguen en desarrollo sin validar integralmente;5 y6–9 pendientes, Microsoft pospuesto, Vue predeterminado, PR4 borrador y producción/proxy intactos. No certifica descarga Java/juego/NSIS/delta reales ni publicación.
