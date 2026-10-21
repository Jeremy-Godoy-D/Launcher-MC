# Plan del launcher propio

20 de octubre de 2026. Propuesta basada en la investigación local de SKlauncher y en fuentes primarias de proyectos open source. Esta fase define decisiones y entregables; no se ha iniciado la implementación ni se ha instalado otro launcher.

## Recomendación

**Tomar XMCL como candidato principal para un derivado con identidad e interfaz propias, conservando inicialmente su motor y su stack.** Usar el análisis de SKlauncher como catálogo de comportamientos y referencia para diseñar los flujos. Lo investigado ya sirve para definir requisitos; todavía no constituye una base de código propia, mantenible y comprobada en ejecución.

La decisión de XMCL debe superar primero una prueba breve de compilación, autenticación, instalación y lanzamiento en Windows. La recomendación se apoya en su código publicado y sus capacidades documentadas; no en una prueba local que aún no se hizo.

Supuestos de trabajo: launcher general de Minecraft Java, Windows 10/11 primero, español, varias instancias y una interfaz moderna. No se presupone una comunidad con servidor propio. Si el objetivo cambia a un launcher exclusivo de un servidor, Helios merece reevaluación.

## Bases comparadas

| Base | Tecnología y licencia declaradas | Encaje y coste esperado | Decisión propuesta |
| --- | --- | --- | --- |
| [XMCL](https://github.com/Voxelum/x-minecraft-launcher) | Electron, TypeScript, Vue; MIT | Instancias, instalación, Java, cuentas y contenido. Conserva gran parte del trabajo difícil; exige entender un monorepo amplio y sus servicios. | Candidato principal para un launcher general con presentación propia. |
| [Prism Launcher](https://github.com/PrismLauncher/PrismLauncher) | C++/Qt; GPL-3.0-only para el código del launcher | Alternativa para un derivado nativo. Cambiar a una presentación web requeriría otra integración y aumentaría el trabajo. | Referencia funcional y alternativa si elegimos C++/Qt deliberadamente. |
| [Helios Launcher](https://github.com/dscalzi/HeliosLauncher) | Electron/Node.js; archivo LICENSE.txt MIT | Su propuesta gira alrededor de servidores y configuraciones de mods distribuidas por sus administradores. | Mejor candidato si el producto será para una comunidad/servidor concreto. |
| SKlauncher investigado | Dos generaciones; launcher cerrado según su documentación | Buen inventario de funciones y casos especiales. El código recuperado no trae un proyecto upstream propio, pruebas ni una base abierta de distribución. | Referencia de producto, sin incorporar el código recuperado al nuevo proyecto. |
| Construcción desde cero | A elegir | Habría que repetir autenticación, versiones antiguas, loaders, descargas, reparación y runtimes. | Reservada para un bloqueo comprobado de las bases existentes. |

El coste y encaje son mi evaluación técnica; no son benchmarks de estos proyectos. Las licencias y el estado de una dependencia se revisarán para la revisión exacta que se incorpore. MIT requiere conservar sus avisos; Prism publica condiciones de distribución GPL y una política específica para builds derivados. Los logos, claves de servicios y componentes de terceros se tratarán por separado de la licencia del código.

### Detalle importante de XMCL

El repositorio antiguo [minecraft-launcher-core-node](https://github.com/Voxelum/minecraft-launcher-core-node) está archivado desde el 6 de mayo de 2026. **No empezaremos desde ese repositorio antiguo.** El [README del monorepo principal](https://github.com/Voxelum/x-minecraft-launcher#core-libraries) sitúa allí las librerías `@xmcl/core`, `@xmcl/installer`, `@xmcl/user`, Modrinth y CurseForge, entre otras.

La documentación de contribución contiene versiones y estructura antiguas. Para preparar el entorno mandan los manifiestos y lockfile de la revisión elegida. Los manifiestos consultados declaran Vue 3, TypeScript y Electron; no conviene migrar esa UI a React o Svelte antes de demostrar una necesidad.

## Arquitectura inicial propuesta

Conservar la separación y los gestores que ya utiliza la base. No introducir otro backend, base de datos o capa de plugins para el MVP.

| Parte | Qué reutilizar o mantener | Qué personalizar |
| --- | --- | --- |
| Motor | Resolución de versiones, instalación, descargas, loaders, Java y procesos | Defaults y comportamiento expuesto por nuestro producto |
| Cuentas | Integración Microsoft y almacenamiento existente tras revisarlos | Registro/configuración propios, presentación y mensajes |
| Instancias | Modelo, almacenamiento y operaciones de la base | Biblioteca y flujos de creación/configuración |
| UI | Vue y componentes existentes | Nombre, marca, navegación, jerarquía y diseño propios |
| Contenido | Clientes e instalación existentes | Primera experiencia de mods y filtros compatibles |
| Distribución | Empaquetado de Windows existente | App ID, rutas, editor, feeds y publicación propios |

La aplicación tendrá identidad y directorio de datos distintos de SKlauncher y XMCL. Ninguna prueba debe escribir en las instalaciones o mundos actuales. Se conservarán las funciones internas que el motor necesite; simplificar la navegación no significa borrar paquetes del monorepo sin conocer sus dependencias.

## Primera versión útil

El resultado será una aplicación Windows en español que permita iniciar sesión Microsoft, crear una instancia, instalar Minecraft Vanilla o Fabric, gestionar Java/RAM, añadir mods compatibles y jugar con progreso y consola comprensibles.

Pantallas iniciales: acceso, biblioteca, crear/configurar instancia, contenido de la instancia y ajustes. Se reutilizará la UI disponible hasta tener el recorrido funcional; la personalización visual viene después de comprobar el motor.

Quedan para versiones siguientes: amigos/presencia, skins/capas propias, servidores patrocinados, P2P, IA, marketplace, cuentas propias del launcher y servidor backend. Forge/NeoForge, CurseForge y otros formatos pueden conservarse si ya funcionan en la base, pero no serán requisitos para bloquear la primera demostración. No se eliminarán preventivamente.

## Etapas y condiciones de terminación

| Etapa | Trabajo concreto | Resultado verificable |
| --- | --- | --- |
| 0. Validar la base | Elegir release/commit; leer instrucciones del repo; revisar licencia, scripts de instalación, secretos, servicios y rutas; instalar con lockfile; compilar sin cambios. | Build local reproducible y registro de revisión, entorno y comandos. Si falla, diagnosticar antes de diseñar una reescritura. |
| 1. Probar el recorrido real | Preparar perfil/directorio desechable; validar configuración y acceso Microsoft/Minecraft propios; instalar Java y Vanilla; arrancar y cerrar una partida. | Una instancia nueva llega al menú del juego y otra ejecución reutiliza correctamente su instalación. Sin alterar datos actuales ni conservar tokens en logs. |
| 2. Dar identidad y experiencia propias | Cambiar nombre, App ID, iconos y directorios; adaptar navegación y español; hacer clara la selección de instancia, memoria, Java y estado de juego. | El recorrido acceso → crear → descargar → jugar funciona desde nuestra UI, con rutas de error y cierre comprensibles. |
| 3. Completar el uso con mods | Probar Fabric y mods locales; conectar la experiencia Modrinth existente; compatibilidad de versión/loader, dependencias requeridas, activar/desactivar y errores de descarga. | Una instancia Fabric con mods se instala y juega; incompatibilidades se informan; una descarga interrumpida no se marca como instalación correcta. |
| 4. Proteger datos y comprobar recuperación | Revisar escritura/backup, tokens y redacción de logs; cancelación, falta de disco, hashes incorrectos, rutas con espacios y cambios de versión. Preparar importación por copia de una instancia SKlauncher. | Recuperación comprobada de fallos seleccionados. La importación preserva el original y no transfiere credenciales; solo se considera compatible el formato probado. |
| 5. Empaquetar una beta | Generar paquete Windows con identidad propia; probar instalación y desinstalación; preparar avisos de terceros, configuración y canal de versiones propios. | Beta instalable fuera del entorno de desarrollo. Antes de publicar, validar firma y feeds. Actualización automática solo tras probar el ciclo completo con dos versiones nuestras. |

La importación de SKlauncher está después de demostrar el launcher. Primero se usará una copia de muestra; copiar mods y mundos no demuestra que un perfil, loader o comando personalizado sea equivalente. Se mantendrá una lista de formatos y campos efectivamente soportados.

## Comprobaciones mínimas

Reutilizar los tests de la base relacionados con lo modificado. Añadir pruebas pequeñas donde cambie lógica crítica propia, sin replicar internamente todo XMCL.

- Autenticación: cancelación, sesión expirada, almacenamiento y redacción de logs, sin imprimir secretos.
- Descargas: integridad, reintento/cancelación y estado incompleto; usar fallos reproducibles en un directorio temporal.
- Instancias: separación entre dos instancias y contención de operaciones de archivos dentro de la ruta autorizada.
- Juego: Vanilla y Fabric, Java instalado/ausente, ruta con espacios y cierre/crash.
- Datos: backup y recuperación; importación por copia y conservación del origen.
- Paquete: arranque desde un usuario Windows de prueba, instalación y desinstalación; las actualizaciones se prueban antes de activarlas.

No se fijan fechas de entrega con precisión antes de medir la compilación y el primer lanzamiento. Los hitos definen avance real; superar la etapa 1 permite estimar el trabajo visual y de contenido con evidencia.

## Dependencias y decisiones pendientes

1. **Acceso Microsoft/Minecraft del producto:** verificar el registro y los permisos exigidos para nuestro cliente. Compilar un fork no concede esos accesos ni autoriza a reutilizar credenciales upstream.
2. **Servicios de XMCL:** inventariar qué funciones usan su infraestructura. Configurar o excluir de nuestra experiencia las que requieran una operación propia; no depender de endpoints ajenos por accidente.
3. **Mantenimiento:** mantener una revisión upstream identificable y cambios pequeños. Cada actualización exige comprobar los recorridos afectados.
4. **Publicación:** definir nombre final, iconos, editor, firma, repositorio y canal cuando exista una beta; no hacen falta para iniciar la prueba local.

Si XMCL no supera la prueba técnica, la alternativa preferida dependerá del fallo: evaluar sus librerías actuales para una interfaz más pequeña si el problema está en la aplicación completa; elegir Prism si decidimos asumir C++/Qt. No sustituir automáticamente un problema concreto por otra reescritura completa.

## Fuentes primarias consultadas

- [XMCL: funciones, estructura y bibliotecas actuales](https://github.com/Voxelum/x-minecraft-launcher).
- [Licencia MIT de XMCL](https://github.com/Voxelum/x-minecraft-launcher/blob/master/LICENSE).
- [Manifiesto de Electron](https://github.com/Voxelum/x-minecraft-launcher/blob/master/xmcl-electron-app/package.json) y [manifiesto de interfaz](https://github.com/Voxelum/x-minecraft-launcher/blob/master/xmcl-keystone-ui/package.json).
- [Repositorio anterior archivado](https://github.com/Voxelum/minecraft-launcher-core-node).
- [Prism: licencia y política de derivados](https://github.com/PrismLauncher/PrismLauncher#forkingredistributingcustom-builds-policy), [COPYING](https://github.com/PrismLauncher/PrismLauncher/blob/develop/COPYING.md), [CMake/Qt](https://github.com/PrismLauncher/PrismLauncher/blob/develop/CMakeLists.txt).
- [Helios: funciones y orientación a servidores](https://github.com/dscalzi/HeliosLauncher), [LICENSE.txt](https://github.com/dscalzi/HeliosLauncher/blob/master/LICENSE.txt). Su package.json consultado dice `UNLICENSED`, mientras el archivo de licencia publica MIT; aclarar esa discrepancia si se elige como base.
- [Análisis local de SKlauncher](ANALISIS_SKLAUNCHER.md).

La comparación revisa documentación y manifiestos públicos; no se compiló, ejecutó ni auditó íntegramente ninguna de estas bases. Recomendación final de esta fase: **validar XMCL primero y conservar SKlauncher como referencia de producto**.
