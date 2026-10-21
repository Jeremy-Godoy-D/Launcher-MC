# Ingeniería inversa de SKlauncher

20 de octubre de 2026 · Instalaciones locales de Windows · REA 6.7.0

Se reconstruyó el mapa funcional y técnico de las dos generaciones instaladas: **SKlauncher 4.0.39 con Electron** y **SKlauncher 3.2.18 con Java/JavaFX**. El trabajo permite identificar módulos, contratos internos, datos, servicios y flujos para la siguiente conversación sobre el proyecto.

**El alcance verificado es estático.** Se analizaron paquetes y bytecode sin ejecutar SKlauncher ni Minecraft. No se ha acreditado el funcionamiento de todas las pantallas, servicios o combinaciones de versiones. La cobertura automática de REA tiene límites registrados; este informe no presenta una revisión exhaustiva de cada dependencia ni del código de los servidores remotos.

## Documentos y evidencia

| Documento | Contenido |
| --- | --- |
| [Núcleo Electron](analysis/electron-core.md) | Arquitectura, cuentas, descargas, Java, loaders, contenido, ejecución, archivos y updater |
| [Interfaz](analysis/interfaz.md) | Navegación y flujos reconstruidos desde el renderer distribuido |
| [IPC](analysis/electron-ipc-inventory.json) | Inventario de métodos públicos, canales y eventos |
| [Java clásico](analysis/java-legacy.md) | Bootstrap, JavaFX, perfiles, versiones, procesos y diferencias entre builds |
| [Resultados REA](analysis/rea-summary.json) | IDs, identidad de artefactos, métricas y cobertura de las pasadas de REA |
| [Método REA](analysis/metodo-rea.md) | Operaciones, cobertura, límites y reproducción del análisis |
| [Límites de captura](analysis/rea-runtime.md) | Fuses del ejecutable y compatibilidad de observación dinámica |
| [Inventario local](analysis/inventory.json) | Hashes, archivos contrastados, dominios y esquemas sin valores privados |
| [Fuentes oficiales](analysis/fuentes-oficiales.md) | Documentación del fabricante y de REA, separada de la evidencia local |

Las salidas originales de REA se conservan en `.analysis/`, excluida de Git. Las extracciones anteriores utilizadas se contrastaron con los binarios actuales. Los documentos de núcleo y Java identifican las herramientas complementarias; sus hallazgos no se atribuyen indebidamente a REA.

## 1. Qué está instalado

| Generación | Artefacto | Identidad comprobada |
| --- | --- | --- |
| Electron | `%LOCALAPPDATA%\Programs\sklauncher\sklauncher.exe` | Versión 4.0.39; ejecutable x64 |
| Paquete de Electron | `resources\app.asar` | 48.412.387 bytes; SHA-256 `1166326521155f95d72849d8259d7593978cd4c77ff844b15783ee74ec0d7782` |
| Bootstrap Java | `%APPDATA%\sklauncher\SKlauncher.jar` | 3.2.18; 599 entradas de clases |
| JavaFX, primera copia | `%APPDATA%\.sklauncher\sklauncher-fx.jar` | 3.2.18 build 601; 6.225 entradas de clases |
| JavaFX, segunda copia | `%APPDATA%\.minecraft\sklauncher-fx.jar` | 3.2.18 build 602; 6.226 entradas de clases |

Existen accesos directos para ambas generaciones. No se determinó cuál eligió el usuario en su última partida. Se analizaron ambas para evitar atribuir a una las características internas de la otra.

La documentación pública revisada anuncia versiones posteriores de la beta 4.0. Las funciones anunciadas actualmente se usan como contexto; **no sustituyen la inspección de 4.0.39**.

## 2. Arquitectura de la versión 4.0.39

La interfaz distribuida utiliza componentes Svelte compilados y recursos empaquetados con herramientas de la familia Vite/Rolldown. El proceso Electron main contiene los servicios de archivos, red y procesos; preload publica las operaciones que solicita el renderer. Minecraft se ejecuta después en un proceso Java separado.

| Capa o módulo | Responsabilidad reconstruida |
| --- | --- |
| Renderer | Pantallas, navegación, formularios, catálogos, progreso y consola |
| Preload/IPC | Puente de llamadas, respuestas y notificaciones entre interfaz y main |
| Cuentas | OAuth Microsoft, Xbox/XSTS, derechos Java, perfil, renovación y persistencia |
| Versiones | Catálogo vanilla, versiones locales, herencia y reglas de plataforma |
| Instancias | Directorios, configuración, creación, importación, duplicación y estadísticas |
| Java | Detección, instalación, verificación y selección por instancia |
| Descargas | Cola, paralelismo, reintentos, cancelación, archivos temporales y hashes |
| Loaders/contenido | Fabric, Legacy Fabric, Babric, Quilt, Forge, NeoForge, OptiFine; Modrinth y CurseForge |
| Juego | Preparación, comando, proceso hijo, salida, crash reports y quickplay |
| Servicios del producto | Skins/capas, amigos, presencia, noticias, servidores y preferencias |
| Distribución | Política de versiones, actualización, bandeja y ciclo de cierre/reinicio |

El paquete contiene **7.631 miembros de archivo**. Se verificaron los hashes de los 17 archivos de JavaScript, HTML y manifiesto de la aplicación reutilizados para la inspección. Esto acredita su procedencia; no significa que todos sus caminos se hayan ejecutado.

El inventario manual por AST identifica **196 handlers IPC asíncronos**, 197 llamadas `invoke` que usan 196 canales distintos, dos llamadas síncronas iniciales y 29 suscripciones. Cada solicitud del puente tiene un receptor literal. La API tiene 29 grupos; además se expone el puente genérico de `@electron-toolkit/preload`. Los conteos agregados de REA abarcan otros tipos de operación y dependencias, por lo que no se equiparan directamente con esos 196 handlers.

## 3. Experiencia y flujos principales

La navegación principal contiene Inicio, Descubrir contenido, Servidores, Personalización y Biblioteca. Crear instancia abre un modal; Configuración tiene su propio contenedor. Los detalles de instancia reúnen contenido, mundos, capturas, archivos y consola. La disponibilidad depende del estado de la instancia y de la cuenta.

El camino central de lanzamiento se reconstruyó así:

1. Obtener instancia y cuenta activa; renovar sesión Microsoft cuando corresponde.
2. Revisar mods y resolver el JSON de versión, sus padres y las reglas de plataforma.
3. Completar o reparar cliente, bibliotecas, assets, mappings y recursos auxiliares.
4. Seleccionar e instalar/verificar Java cuando es un runtime gestionado.
5. Preparar nativos y construir classpath, memoria, argumentos JVM y del juego.
6. Crear el proceso Java; observar salida, estado, capturas y crash reports.
7. Al finalizar, limpiar recursos temporales y actualizar estadísticas y quickplay.

La instalación de contenido agrega búsquedas, compatibilidad de loader/versión, dependencias y un manifiesto por instancia. El disco se reconcilia con ese manifiesto para reconocer archivos gestionados, desactivados o externos. La existencia de integraciones no garantiza que todo contenido de terceros pueda descargarse automáticamente.

El acceso Microsoft utiliza navegador y callback local, comprueba derechos de Minecraft Java y guarda tokens cifrados con `safeStorage` en Windows. El renderer recibe una representación de cuenta sin access/refresh tokens. Se observó también una modalidad de cuenta local; su presencia no establece derechos de acceso a servicios externos.

## 4. Datos y dependencias externas

La configuración 4.0 se encuentra bajo `%APPDATA%\.sklauncher`. La raíz del contenido puede seleccionarse por separado. Se distinguen `settings.json`, `accounts.json`, `instances.json`, estado de ventana/updater, manifiestos, caché, versiones, bibliotecas, assets y runtimes. Electron utiliza `bin` para su estado de navegador.

Se conservaron únicamente nombres de campos y tipos. Nombres de usuario, tokens, UUID, rutas de instancias, historial y valores de configuración no se copiaron a los informes. Las claves dinámicas de fechas e identificadores se normalizaron en el inventario.

| Servicio | Dependencia observada |
| --- | --- |
| Microsoft/Xbox/Minecraft Services | Identidad, sesión, licencia, perfil y funciones sociales |
| Mojang | Versiones, assets, bibliotecas y runtimes |
| Modrinth/CurseForge | Contenido, metadatos, actualizaciones y restricciones de distribución |
| Fabric/Quilt/Babric/Forge/NeoForge | Metadatos, perfiles e instaladores |
| Foojay | Selección y descarga de Java alternativo |
| SKmedix | Configuración, noticias, aspecto, recursos auxiliares y política de actualización |
| Xyrios | Servidores y funciones asociadas |
| Discord, mclo.gs y Google Analytics | Presencia, compartir reportes y eventos con controles de consentimiento |

Los dominios se obtuvieron del paquete. No se llamaron esas APIs como parte de la ingeniería inversa ni se validaron sus contratos o disponibilidad actuales.

## 5. Qué cambia en Java 3.2.18

La versión clásica tiene un bootstrap con ventana Swing que prepara configuración, actualización y JavaFX. Carga el launcher grande por reflexión **dentro de su misma JVM**. Minecraft se inicia luego en otro proceso.

El núcleo está organizado en gestores de perfiles, cuentas, versiones, descargas, instalación, modpacks y ejecución. Usa JavaFX para la interfaz y formatos de persistencia diferentes: aparecen `launcher_profiles.json`, `sklauncher.json` y rutas para `accounts.bin` y migración desde JSON.

Hay una peculiaridad comprobada: los manifiestos de ambos JAR grandes declaran `MainFX`, pero esa clase no está en los archivos. El arranque efectivo comprobado en bytecode usa el constructor de `Launcher`; deducir la secuencia solo a partir del manifiesto daría un resultado incorrecto.

Entre builds 601 y 602 cambian tres clases y se agrega `MacOsUtils`. Se verificaron tres SHA-256, manifiestos y 13 clases mediante `javap`. REA aporta además inventario de los tres JAR; ese inventario no equivale a descompilar todos sus métodos.

## 6. Hallazgos que afectan al proyecto futuro

Estos puntos proceden de rutas de código concretas; los informes especializados contienen las referencias.

- **Actualizar es parte del arranque.** El updater puede descargar y reiniciar automáticamente, aplicar una versión mínima y diferir el reinicio mientras hay un juego activo. Una observación con la instalación real podría cambiar el objeto analizado.
- **El escaneo previo puede borrar mods.** Hay reglas por nombres, hashes y firmas. No se probaron sus efectos ni falsos positivos; no debe asumirse que preparar el juego sea una operación que solo lee archivos.
- **Posible token en log local.** El constructor incluye el token en argumentos y otra ruta imprime el comando completo. Es una inferencia fundada en el código, no un token recuperado. El flujo de compartir logs sí tiene redacción; no acredita redacción al escribir el archivo local.
- **La verificación depende del recurso.** Cuando hay hash, se valida. Algunos archivos sin hash solo tienen controles de presencia/tamaño; no todos reciben la misma garantía.
- **El puente del renderer es amplio.** Contiene operaciones de archivos, procesos e IPC genérico. La correspondencia de canales no constituye una auditoría de validación o permisos.
- **La UI tiene condiciones y funciones parciales.** Las pestañas, proveedores y opciones no deben convertirse automáticamente en requisitos equivalentes sin revisar sus handlers y estados. El informe de interfaz identifica esas diferencias.

## 7. Cobertura y cuestiones abiertas

| Pregunta original | Estado al cerrar esta fase |
| --- | --- |
| Identidad y generaciones | Respondida para los archivos instalados; último acceso directo usado desconocido |
| Arquitectura y dependencias | Respondida a nivel de producto; análisis semántico automático parcial |
| Pantallas y navegación | Reconstruidas estáticamente; sin revisión visual en ejecución |
| Comunicación interna | Inventario y correspondencia literal comprobados; contratos dinámicos no probados |
| Datos locales | Estructura y rutas descritas; valores privados excluidos |
| Cuentas | Secuencia estática reconstruida; sin iniciar sesión o validar renovación real |
| Minecraft y Java | Preparación/lanzamiento reconstruidos; sin partida de prueba |
| Contenido e importación | Gestores y rutas reconstruidos; sin probar todos los formatos/proyectos |
| Servicios externos | Referencias y usos observados; servidores y contratos internos no analizados |
| Actualización/distribución | Rutas estáticas descritas; sin instalar actualizaciones |
| Comportamiento real y rendimiento | Pendiente de entorno desechable y observación de ejecución |

REA parseó 3.797 archivos JavaScript en la pasada global; informó un fallo de parseo y límites de memoria de resultados al expandir relaciones de dependencias. Se conservó esa evidencia y se realizó una pasada enfocada en 18 archivos seleccionados, incluidos 15 JavaScript que se parsearon sin fallos. Esta segunda pasada retuvo 100.000 nodos semánticos y también tiene cobertura parcial por los límites del grafo. Cada pasada conserva su propia cobertura; ninguna prueba ejecución.

La vía activa `capture-electron-scenario` de REA 6.7.0 requiere una opción de Inspector deshabilitada en este ejecutable. No se alteraron los fuses. La vía pasiva con CDP podría investigarse en un entorno aislado; no está verificada aquí. Tampoco se desensambló exhaustivamente Chromium, cada biblioteca nativa ni los miles de métodos Java.

El siguiente trabajo solicitado es definir el proyecto propio a partir de este inventario. Este documento conserva la separación entre capacidades observadas, inferencias y pruebas pendientes; todavía no elige stack, calendario ni alcance de implementación.
