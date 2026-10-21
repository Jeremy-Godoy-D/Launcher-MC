# Launcher MC: plan de implementación

## 1. Resultado y alcance acordado

Crear un launcher general de Minecraft Java para **Windows 10/11 x64**, en español, con identidad propia y basado en XMCL.

La primera beta incluirá:

- Cuentas **Microsoft y locales**.
- Instancias independientes con **Vanilla, Fabric, Forge y NeoForge**.
- Instalación automática de Java y configuración de memoria, resolución y argumentos.
- Mods individuales y modpacks de **Modrinth y CurseForge**, además de archivos locales.
- Biblioteca, progreso de instalaciones, consola y mensajes de error comprensibles.
- Interfaz de XMCL adaptada con marca propia.

**No habrá importación de SKlauncher:** comenzarás con instalaciones nuevas. Amigos, P2P, IA, cuentas propias, backend y skins/capas propias quedan fuera de esta versión.

## 2. Base técnica y decisiones fijadas

**Base:** monorepo principal de [XMCL](https://github.com/Voxelum/x-minecraft-launcher), revisión `1b4c9859ce0fc9d43b7da0cc9290b3507bc4e66a`. Conservar Electron, TypeScript, Vue y sus componentes existentes. El manifiesto consultado fija pnpm `11.10.0`; se utilizará Node `24.20.0` y el lockfile upstream. [Manifiesto de la revisión](https://github.com/Voxelum/x-minecraft-launcher/blob/1b4c9859ce0fc9d43b7da0cc9290b3507bc4e66a/package.json).

- Incorporar el código bajo `launcher/`, preservando los informes actuales y la procedencia upstream.
- Trabajar en una rama `codex/launcher-mc`; mantener identificados el commit original y nuestras modificaciones.
- Nombre provisional: **Launcher MC**. Identificador técnico: `local.launchermc.desktop`.
- Datos propios bajo `%APPDATA%\LauncherMC`; desarrollo y pruebas usarán una raíz temporal separada.
- Conservar los modelos, servicios, persistencia y comunicación interna de XMCL. No añadir otro backend, base de datos ni sistema de plugins.
- Usar SKlauncher como referencia funcional, sin incorporar su código recuperado.
- Mantener los avisos MIT y los avisos de terceros. Las claves, feeds, identidad y servicios del producto deberán ser propios.

**Interfaces y datos:** no crear una API pública nueva. La interfaz reutilizará los servicios tipados de cuentas, instancias, instalaciones, contenido y ejecución. Cualquier extensión necesaria se hará en esos contratos existentes, manteniendo secretos y operaciones privilegiadas fuera del renderer.

## 3. Implementación por hitos

### Hito 1 — Base reproducible y aislamiento

- Incorporar la revisión fijada y leer sus instrucciones antes de modificarla.
- Revisar scripts de instalación, configuración de servicios y dependencias nativas; instalar con `pnpm install --frozen-lockfile`.
- Comprobar compilación sin cambios para establecer una referencia.
- Antes del primer arranque, separar identidad, directorios y estado de pruebas; desactivar actualizaciones hacia feeds upstream.
- Inventariar las conexiones a infraestructura de XMCL y deshabilitar las funciones excluidas que dependan de ella.
- Preparar la configuración propia de Microsoft/Minecraft y CurseForge. No reutilizar credenciales upstream.

**Terminado cuando:** compila de forma reproducible y arranca en un perfil de prueba sin modificar SKlauncher, XMCL ni sus datos.

### Hito 2 — Cuentas y primera partida

- Mantener el flujo Microsoft existente, con cancelación, renovación y errores.
- Permitir crear, seleccionar y eliminar perfiles locales; indicar claramente su modalidad sin prometer acceso a servicios que exijan autenticación Microsoft.
- Guardar credenciales mediante el almacenamiento protegido del sistema utilizado por la base; redactarlas en logs y errores.
- Crear una instancia Vanilla, instalar los recursos y Java necesarios, iniciar Minecraft, cerrar el juego y volver a lanzarlo.

**Terminado cuando:** el recorrido completo funciona con ambos tipos de cuenta donde corresponde y la segunda ejecución reutiliza correctamente los archivos instalados.

### Hito 3 — Instancias y cuatro loaders

- Ofrecer Vanilla, Fabric, Forge y NeoForge con selección de versiones compatibles.
- Reutilizar los instaladores upstream; añadir solamente los ajustes que las pruebas demuestren necesarios.
- Incorporar crear, configurar, duplicar y eliminar instancias, con confirmación antes de borrar sus archivos.
- Mostrar estados de instalación, descarga, ejecución y error; impedir lanzar una instalación incompleta.
- Permitir cancelar y reintentar trabajos sin marcarlos falsamente como terminados.

**Terminado cuando:** cada loader llega al menú del juego en una instancia nueva y dos instancias pueden mantener configuraciones distintas.

### Hito 4 — Mods y modpacks

- Adaptar los catálogos existentes de Modrinth y CurseForge: búsqueda, detalles, versiones, compatibilidad y destino.
- Instalar mods y dependencias requeridas; permitir activar, desactivar y eliminar contenido.
- Instalar modpacks de ambos proveedores en instancias nuevas.
- Respetar restricciones de descarga: mostrar el procedimiento manual cuando un proveedor lo requiera, sin sustituirlo por descargas no autorizadas.
- Informar incompatibilidades y cambios antes de aplicarlos. No borrar automáticamente archivos del usuario para resolver conflictos.

**Terminado cuando:** funciona un modpack de cada proveedor y una instancia con mods individuales; las descargas restringidas o fallidas muestran una salida clara.

### Hito 5 — Experiencia e identidad propias

- Adaptar Vue y los componentes existentes, conservando el motor.
- Navegación principal: **Biblioteca, Explorar contenido y Ajustes**.
- Acceso separado y un detalle de instancia con **Contenido, Configuración y Consola**.
- Priorizar instancia seleccionada, versión/loader, cuenta activa y acción de jugar.
- Español predeterminado, tema oscuro inicial y controles accesibles mediante teclado.
- Mantener las dimensiones soportadas por XMCL: mínimo `800×400` y ventana inicial `1200×720`.
- Ocultar de la experiencia las funciones excluidas; conservar internamente paquetes necesarios para el motor.

**Terminado cuando:** todos los recorridos anteriores pueden completarse desde la interfaz adaptada, incluidos sus errores y cancelaciones.

### Hito 6 — Beta distribuible

- Generar **`0.1.0-beta.1` como ZIP portable para Windows x64**.
- Comprobar arranque fuera del entorno de desarrollo y conservación de datos al sustituir los archivos de la aplicación.
- Incluir avisos de terceros y documentación de requisitos y limitaciones.
- Mantener actualizaciones automáticas desactivadas; la primera beta se actualizará manualmente.
- La publicación pública y la firma del producto serán una etapa posterior.

**Terminado cuando:** el paquete funciona en un perfil Windows limpio sin herramientas de desarrollo.

## 4. Pruebas y aceptación

Reutilizar los tests de XMCL y añadir pruebas pequeñas para la lógica propia modificada.

| Área | Comprobación obligatoria |
|---|---|
| Cuentas | Microsoft correcto/cancelado/expirado, perfil local y cambio de cuenta |
| Juego | Vanilla, Fabric, Forge y NeoForge; Java ausente y Java ya instalado |
| Contenido | Mod individual, dependencias, modpack de cada proveedor y descarga restringida |
| Recuperación | Corte de red, cancelación, hash incorrecto, falta de espacio y reintento |
| Aislamiento | Dos instancias independientes, rutas con espacios y ningún cambio en instalaciones actuales |
| Privacidad | Tokens y claves ausentes de logs, errores y datos enviados al renderer |
| Interfaz | Recorridos completos, teclado y tamaños mínimo/predeterminado |
| Distribución | ZIP portable ejecutado desde un usuario Windows de prueba |

Fijar versiones y archivos de las pruebas de integración para poder repetirlas. Diferenciar pruebas deterministas de las que necesitan cuentas o servicios reales.

Ejecutar `pnpm check`, `pnpm lint`, las pruebas relacionadas y la compilación final. Validar también en la aplicación real de desarrollo siguiendo las instrucciones upstream; conservar resultados y capturas locales sin datos personales.

**La beta no se considerará terminada si Microsoft, CurseForge, algún loader o alguno de los dos formatos de modpack sigue sin comprobarse.**

## 5. Supuestos, dependencias y límites

- El nombre provisional será Launcher MC hasta definir la marca final.
- No se importarán cuentas, instancias, mods ni mundos de SKlauncher.
- El desarrollo permanecerá fijado a la revisión elegida; un fallo de compilación se diagnosticará antes de actualizar dependencias o cambiar de base.
- El acceso propio a Microsoft/Minecraft y CurseForge es una dependencia externa: deberá verificarse al principio y registrarse como bloqueo si no está disponible.
- No se prometerá compatibilidad con todas las versiones históricas de Minecraft; se mostrarán combinaciones admitidas por los catálogos y se documentarán las efectivamente probadas.
- No se publicará ni se habilitarán actualizaciones automáticas durante la preparación de la beta.

Este plan no ejecuta cambios ni valida todavía la compilación. Los principales riesgos pendientes son los accesos a servicios externos, la compatibilidad de los instaladores y las dependencias de infraestructura upstream.
