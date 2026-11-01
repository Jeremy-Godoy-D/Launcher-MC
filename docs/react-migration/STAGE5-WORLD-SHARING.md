# Etapa 5 — compartir mundos y conectar/desconectar carpetas

K11 sigue pendiente. `0323c097322f2ea76bb8a221e5187043f10df398` asegura shareSave/linkSharedSave/unlinkSharedSave e isSaveLinked con autoridad Java, raíz compartida fija, mutex global y locks de instancia ordenados. Se reutilizan revisión/aplicación y sesiones mediante helpers privados que ya sostienen el lock, sin llamadas reentrantes al wrapper público.

Compartir un mundo conserva la copia independiente en el depósito y el original exacto en backup; nunca reemplaza un nombre ocupado. Compartir un enlace propio retira solamente ese enlace. No se permite mover un mundo individual desde una carpeta que ya apunta entera al depósito. Conectar una carpeta revisa todos sus mundos antes de copiar, reserva nombres de colisión de forma determinista, verifica los originales con guardas finales y retiene la carpeta original completa, incluidas notas y enlaces propios, en .backups/world-sharing-UUID/saves. Carpetas sin level.dat/enlaces ajenos se rechazan. Hay límite de1000 entradas/nombres; una operación fallida puede conservar copias anteriores completas en el depósito.

Desconectar conserva el depósito y guarda el enlace anterior antes de crear una carpeta local vacía, como el contrato legacy. Ante fallo de publicación se restaura el original cuando el destino sigue libre; una entrada competidora se conserva y el original queda en backup. No hay borrado recursivo de mundos. La protección puede crear session.lock donde falte; no modifica level.dat. Copias más originales respaldados consumen espacio adicional. Las instancias nuevas sin saves y las preferencias de creación siguen funcionando.

## Corrección observada en el paquete real

Vue0323c09 falló al renombrar saves con EPERM: nueve recorridos pasaron, uno falló y dos no corrieron. El primer grupo se solapó parcialmente con un build DeskGap por no comprobar que write_stdin seguía devolviendo una sesión; no se usa como cierre. Una reproducción focal secuencial confirmó el mismo EPERM. El informe Native acotado a libuv mostró vigilancia activa de saves/level.dat; no se capturó el informe completo ni variables de entorno.

`29887ef2eb43a58b5ca9ed1e9d4dea770c9f5fef` cierra y recrea el observador propio alrededor del reemplazo y revalida su estado. La reproducción pasó1/1,9,6s y el grupo Vue12/12,36,4s. `3f0b98d7ca422966f5e4d40410d789c254770b84` serializa el inicio de nuevos observadores con la mutación y libera listeners si la inicialización deja de ser válida. La regresión ahora activa y verifica explícitamente la vigilancia antes y después de conectar/desconectar en ambos hosts. Se conservaron los locks y las aserciones; no se aumentó timeout.

## Evidencia final

- **82 pruebas focales/6 archivos,5,28s**, cuatro workers; once nuevas desde el bloque anterior. Incluyen colisiones reservadas, backups exactos, datos ajenos, sesiones fallidas, una escritura que cambia después de copiar, rollback con destino libre/ocupado y ciclo de vida del observador. No suite unitaria completa nueva.
- Runtime/DeskGap tipos aprobados; lint cero errores y el mismo aviso previo de queryModUpdates. E2E conserva exactamente56 diagnósticos base, sin nuevos. Ninguna dependencia/configuración global nueva.
- Paquete final3f0b98d: **Vue11/11,37,7s**, specs63/85; **React10/10,32,2s**, spec85, y creación avanzada **1/1,5,3s**, spec14. Un worker/cero reintentos. Sesiones externas de la fixture Java NIO reales; no Minecraft. El fallo de enlace de spec14 es inyectado y su reintento forma parte de la prueba. React0323c09 había pasado10+1 antes de reforzar el watcher: repeticiones identificadas, no escenarios adicionales.
- Dist restaurado a Vue con el mismo código y paquete reconstruido comprobado por spec03 **1/1,6,9s**; se conservan identidades de cada artefacto probado y paquetes separados. DeskGap producción compila, sin recorrido funcional propio. Las validaciones finales fueron secuenciales, con builds fuera de Native.
- Nueve pruebas del harness e integridad al cerrar. No UI nueva ni certificación AA; la creación conserva sus capturas/aserciones previas. Hay avisos GPU state invalid al cerrar y Buffer deprecated en algunos grupos, no consola global limpia. No DevTools/CDP ni interceptación de spawn.

Comandos desde launcher: Vitest con los seis selectors afectados y --maxWorkers=4; checks Runtime/DeskGap y pnpm lint; E2E tsc comparado contra base; LAUNCHER_RENDERER=vue|react pnpm --prefix xmcl-electron-app build; Playwright con el EXE del paquete, localees-ES, --workers=1 --retries=0 --max-failures=1, spec14 con su grep de preferencias; NODE_ENV=production pnpm --prefix deskgap-app build. Harness desde raíz.

Manifest ignorado launcher/e2e/artifacts/stage5-world-sharing-manifest.json, SHA-256 `e3b81e020ac9e85a6b15c8055bff736e4a31be195ed902c7d16b88e792d2b6c1`: 3 fuentes Git canónicas y 161 artefactos propios. Logs/capturas/trazas/informes de vigilancia/identidades incluidos; caches del perfil Native y reparse points excluidos, conservando main.log de los fallos. PR/check posteriores excluidos.

CI41343639177/2fa2c94 terminó success: **241React+1Strict+21Vue**, dos opt-in omitidos. Confirma importación/exportación anterior; este bloque requiere CI nuevo tras push. El intento paralelo de logs gh encontró caché ZIP inválida; se leyó Vue por API de job, sin borrar cachés/temporales.

## Próximo bloque

K11: destino/staging y sidecars de installDatapackFromMarket, lectores/watchers legacy de saves/datapacks y aceptación integral/noNIO. Reusar #legacySaveContext y protocolo revisado; no descargar directo al mundo antes de validar. Revisar también la preservación de mundos al borrar en InstanceService. No rehacer transferencias/identidades/consola ni ampliar a funciones de hosting/P2P/SSH retiradas; auditoría IPC/extras global en8. Los mercados públicos se conectan en6.

K12/K21 pass;5 activa,6–9 pendientes. Todas las herramientas locales/chunks conservadas. Microsoft pospuesto, PR4 borrador, producción beta.2/proxy intactos; DOMPurify WIP y ANALISIS_ARQUITECTURA.md excluidos. Juego real, seguridad/AA manual integral, rendimiento final e instalador/delta aislados antes de producción.
