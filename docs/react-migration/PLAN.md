# Migración completa a React y rediseño integral de Launcher MC

Documento de implementación aprobado por el usuario el 2026-10-23, con su corrección posterior: **solo núcleo Minecraft Java, sin extras heredados de XMCL**. `SCOPE.md` fija el recorte y tiene prioridad ante una contradicción. La comprobación de paridad se aplica a las funciones conservadas, nunca a reintroducir extras retirados.

## 1. Objetivo, decisiones y alcance

Reconstruir la interfaz con React y TypeScript, con identidad gaming propia inspirada en la organización y calidad visual de Xbox y Epic. Facilitar continuar una partida, administrar instancias y descubrir contenido. Rediseñar distribución, navegación, componentes, estados, textos, accesibilidad y las ventanas necesarias del núcleo.

### 1.1. Decisiones confirmadas

| Aspecto | Decisión |
| --- | --- |
| Estrategia | React en paralelo; sustituir Vue al completar el núcleo conservado. |
| Publicación | Windows 10/11 x64 y GitHub Releases. |
| Navegación | Barra lateral persistente. |
| Inicio | Continuar y jugar; primero la última instancia válida. |
| Dirección visual | Gaming inmersivo con identidad propia; referencias Xbox/Epic. |
| Material y fondo | Fondo ambiental en toda la ventana y glassmorphism, corrección del usuario del 2026-10-24. Conservar obsidiana/cobre, legibilidad y coste limitado. |
| Apariencia | Claro, oscuro y seguir Windows, variantes fijas. |
| Retiradas visuales | Editor de temas, burbujas, CSS personalizado y selector arbitrario de fondos antiguos. |
| Nuevos fondos | Modpacks: sus propios recursos desde metadatos. Vanilla/sin instancias/fallback: material real buscado en internet, preferentemente con shaders, no generado por IA. |
| Carrusel | Cambiar fondo y destacada; detenerse al interactuar. |
| Microsoft | Pospuesto; conservar datos/contratos sin configurar credenciales nuevas. |
| Seguridad | Condición de aceptación de cada etapa. |
| Producto | Núcleo Java de SCOPE.md; sin IA, Bedrock, P2P, SSH, publicación, navegador de launchers ni Big Picture. |
| Versión objetivo | v0.3.0-beta.1; referencia inicial v0.2.0-beta.2. |

### 1.2. Base real y paridad

Referencia Git inicial: `7671c6f1bdc471d42816241920a262a18aca5a44`. El renderer contiene 325 archivos Vue y 270 archivos TypeScript en composables, incluidas pruebas. Cuatro entradas HTML antiguas: main, logger, browser y migration. Migrar main/logger/migration; retirar browser según SCOPE.md.

Conservar crear/importar/editar/duplicar/agrupar/ordenar/exportar/eliminar instancias; versiones y loaders Java; lanzamiento, reparación y procesos; mods/packs/shaders/mundos; CurseForge/Modrinth públicos; perfiles locales y datos de cuentas; Java/RAM/argumentos/resolución; tareas/consola/errores/actualizador; teclado/accesibilidad/onboarding y controles de ventana. Exportar modpacks locales permanece; publicar proyectos en servicios externos se retira.

El inventario debe recorrer rutas, menús, diálogos, atajos, composables, arranque de servicios y puentes. Un módulo histórico no se convierte en función de esta entrega por existir en el código. Los datos retirados se conservan inertes. Mantener LICENSE/NOTICE.

## 2. Arquitectura técnica de destino

### 2.1. Capas

1. React: pantallas, componentes, navegación, formularios y accesibilidad.
2. Cliente de renderer: llamadas tipadas, sincronización de estados, eventos y suscripciones.
3. Preload Electron: puente limitado hacia main.
4. Electron/runtime: ventanas, archivos, procesos, descargas y Minecraft.
5. Paquetes de dominio/proveedores: instalación, instancias, cuentas y catálogos.

El runtime no importa React. Retirar extras de presentación y desconectarlos del bootstrap distribuido, preservando utilidades compartidas del núcleo.

### 2.2. Paquetes

- `launcher/xmcl-react-ui`: nueva UI.
- `launcher/packages/renderer-client`: cliente independiente del framework.
- `launcher/xmcl-keystone-ui`: referencia temporal durante la transición.

Organización React:

```text
src/
  app/                  Arranque, proveedores, rutas, errores globales
  windows/              main, logger, migration
  components/
    ui/                 Controles accesibles
    layout/             Barra lateral, barra de ventana, contenedores
    feedback/           Errores, progreso, notificaciones, vacíos
  features/
    home/ library/ instance/ catalog/ accounts/ settings/
    onboarding/ tasks/ console/
  hooks/                Integraciones React compartidas
  presentation/         Imágenes, vídeos, carrusel
  i18n/                 Traducciones
  styles/               Tokens, variantes, estilos globales
  assets/               Recursos empaquetados
```

Componentes/hooks/pruebas de una función permanecen juntos. Compartir componentes solo cuando tengan consumidores reales.

### 2.3. Tecnologías

| Necesidad | Solución |
| --- | --- |
| UI | React 19 estable, React DOM, TypeScript. |
| Compilación | Vite compatible con el proyecto y plugin oficial React. |
| Navegación | React Router, Data Router e historial hash. |
| Controles | Radix Primitives y diseño propio. |
| Estilos | Variables CSS, CSS Modules y UnoCSS para distribución. |
| Datos remotos | TanStack Query. |
| Runtime reactivo | Cliente externo con useSyncExternalStore. |
| Listas | TanStack Virtual React. |
| Iconos | Lucide; AnimateIcons seleccionado. |
| Movimiento | CSS sencillo; Motion para iconos y transiciones que lo necesiten. |
| Traducciones | Núcleo Intlify sin Vue y proveedor React pequeño. |
| Formularios | Estado React y validadores/esquemas Zod existentes. |
| Pruebas | Vitest, React Testing Library, Playwright Electron, Axe. |

Fijar versiones y compatibilidad en lockfile. Limitar cambios de JSX/Vite/lint a los paquetes e integraciones necesarios; no cambiar políticas globales ajenas. Renderer local de Electron, sin añadir un servidor web de producto.

Referencias: https://react.dev/learn/build-a-react-app-from-scratch ; https://reactrouter.com/api/data-routers/createHashRouter

### 2.4. Cliente de servicios

Extraer proxy/reutilización, llamadas tipadas, normalización de errores, listeners y tareas. Conservar contratos ServiceKey, ServiceChannel, SharedState, TaskMonitor y los objetos de preload. Los nombres de acciones de diagnóstico local pueden conservarse; no arrastrar telemetría hacia servicios heredados de XMCL.

Hooks previstos:

```ts
useService(serviceKey)
useSharedState(stateDescriptor)
useServiceEvent(serviceKey, event, handler)
useTasks()
useWindowActivity()
```

- Los componentes no importan ipcRenderer.
- Conservar null, opcionales y estructuras admitidas por cada contrato; no usar serialización JSON indiscriminada que cambie su significado.
- Privilegios mediante operaciones concretas del puente/servicios.
- Lanzar/instalar/eliminar/exportar requieren acción del usuario, nunca render o montaje.
- No registrar credenciales ni cuerpos sensibles.

### 2.5. Estados compartidos

Completar antes de pantallas complejas. Registro por ventana e identidad de estado; datos de transporte privados, snapshot de solo lectura, revisión, carga/validación/error, referencias de consumidores y limpieza.

```ts
type StateSnapshot<T> = {
  status: 'loading' | 'ready' | 'error'
  data: Readonly<T> | undefined
  error: Error | undefined
  validating: boolean
  revision: number
}
interface ExternalStore<T> {
  getSnapshot(): StateSnapshot<T>
  subscribe(listener: () => void): () => void
}
```

Condiciones:

1. getSnapshot mantiene referencia mientras no cambie el estado.
2. Una mutación produce snapshot nuevo sin modificar anteriores; Readonly del tipo no sustituye esta garantía real.
3. Aplicar cada mutación una sola vez, incluso con varios consumidores.
4. Conservar métodos heredados y adaptaciones actuales de instancias/cuentas.
5. Respetar orden de eventos.
6. No perder eventos durante carga/suscripción inicial.
7. Si hace falta corregir la cola del preload, hacerlo compatible con el renderer Vue de transición.
8. Cancelar resultados obsoletos al cambiar instancia/cerrar consumidor.
9. Retirar listeners y liberar referencias explícitamente.
10. Strict Mode no duplica recursos ni efectos.

Dividir suscripciones por dominio/selectores; la consola se procesa aparte. Referencia: https://react.dev/reference/react/useSyncExternalStore

### 2.6. Tareas, consola y consultas

Tareas: protocolo existente, evento de activación y polling mientras hay actividad. Un controlador por ventana; 250 ms iniciales; sin consultas solapadas; parar al quedar inactivo y consultar estado final. Conservar cancelar/limpiar terminadas.

Consola: eventos por lotes, historial virtualizado, filtros/búsqueda/copiar/exportar. Limitar la vista no trunca logs guardados. Suspender autoscroll al revisar mensajes y ofrecer Volver al final.

Consultas: claves por proveedor/proyecto/filtros/página/versión/loader; cancelar búsquedas obsoletas; conservar resultados del proveedor sano; deduplicar. No reintentar autenticación/validación. Respetar Retry-After; máximo dos reintentos transitorios. Caché solo de metadatos públicos. Query no duplica la fuente de verdad del runtime.

### 2.7. Rutas

| Ruta | Destino |
| --- | --- |
| / | Inicio |
| /me | Biblioteca |
| /store | Catálogo |
| /store/modrinth/:id | Ficha sobre resultados |
| /store/curseforge/:id | Ficha sobre resultados |
| /instance | Resumen |
| /instance/mods | Mods |
| /instance/resourcepacks | Packs |
| /instance/shaderpacks | Shaders |
| /instance/save | Mundos |
| /instance/base-setting | Ajustes de instancia |
| /accounts | Cuentas |
| /setting | Ajustes globales |

Conservar parámetros, fragmentos y eventos de navegación actuales. Redirigir rutas antiguas de contenido bajo /instance. Las rutas de extras retirados redirigen a Biblioteca o informan indisponibilidad sin activarlos. Rutas desconocidas ofrecen recuperación. Una instancia inexistente no se sustituye silenciosamente para ejecutar acciones sensibles. Mantener atrás/adelante, filtros y scroll del catálogo. Enlaces externos se abren mediante la política de main.

### 2.8. Traducciones

Los 29 YAML existentes son la fuente inicial. Mantener claves/parámetros/contenido mediante @intlify/core-base sin runtime Vue. Precompilar mensajes en representación compatible con CSP, sin unsafe-eval. Mantener fallback, plurales, mensajes enlazados, listas, fechas/números, carga diferida, sincronización entre ventanas y RTL. Textos nuevos en español/inglés, fallback para los demás. Comparar mensajes representativos entre implementaciones. No mostrar cadenas de extras retirados solo para conservar sus claves.

Referencia: https://raw.githubusercontent.com/intlify/vue-i18n/v11.4.0/packages/core-base/package.json

## 3. Nuevo diseño y pantallas

### 3.1. Identidad

Paisajes de Minecraft, superficies de obsidiana y acento cálido de cobre. Los paisajes expresan el juego; los controles mantienen jerarquía legible.

Corrección del usuario durante la revisión del prototipo: extender el paisaje a toda la ventana y aplicar glassmorphism. El fondo de Inicio sigue a la destacada; en otras pantallas sigue a la instancia seleccionada. Usar sus propios medios de pack o el ambiente Vanilla con shaders según el resolvedor. Cristal en marco, tarjetas y superficies elevadas mediante tintes, borde suave y blur estático limitado; controles interiores sin otro blur. Mantener velo de contraste, variantes clara/oscura, fallback opaco y modo rendimiento sin blur. No añadir un segundo decoder ni reactivar burbujas/editor de temas.

| Token | Oscuro | Claro |
| --- | --- | --- |
| Fondo | #0E1117 | #F3F5F8 |
| Superficie | #171E29 | #FFFFFF |
| Elevada | #202A38 | #E8EDF3 |
| Texto principal | #F3F6FC | #17202B |
| Secundario | #B5C0D0 | #465569 |
| Acento | #F3B86A | #9A5615 |
| Principal | Cobre, texto oscuro | Cobre oscuro, texto blanco |
| Información | Cian | Azul oscuro |

Éxito/aviso/error usan colores semánticos contrastados. Ningún token se acepta sin comprobar sus combinaciones reales.

- Segoe UI Variable, Segoe UI, sans serif.
- Texto 14 px, metadatos 12–13 px, secciones 24 px, destacado 28–40 px adaptable.
- Espaciado 4/8/12/16/24/32 px; radio tarjeta 14 px, controles 10 px.
- Controles 36–40 px; Jugar al menos 44 px.
- Foco visible 2 px separado del contorno; cifras tabulares para versiones/RAM/progreso.
- Texto importante con degradado/superficie estable, no sobre una zona impredecible de imagen.
- Movimiento no desplaza controles durante interacción.

### 3.2. Marco

Barra de ventana 40 px: arrastre explícito, atrás/adelante, sección, tareas/notificaciones y controles. Botones/campos excluidos del arrastre. Mantener minimizar/maximizar/restaurar/cerrar y doble clic previsto.

Barra lateral 224 px desde ancho 1024; compacta 72 px por debajo. Marca arriba; Inicio/Biblioteca/Catálogo; acceso a instancia seleccionada; Cuenta/Ajustes al pie. Compacta con iconos etiquetados, tooltips y selector de cuenta disponible.

Contenido: resto de ventana, padding 24 px estándar y 16 px mínimo; scroll vertical por pantalla. Scroll interno solo para listas/consola que lo necesiten. Ningún control existe únicamente al hover.

Actividad: contador de tareas y panel fijable inferior, notificaciones con acciones, errores persistentes en área afectada. Consola/tareas no tapan acciones principales.

### 3.3. Inicio

Tarjeta inicial: última instancia seleccionada válida, después más recientemente jugada; sin instancias, estado inicial. Paisaje/vídeo, portada/icono real, nombre, Minecraft/loader/estado, Jugar, Administrar, anterior/siguiente/pausa, posición discreta. Debajo recientes y tareas.

- Nunca lanzar al abrir.
- Carrusel solo de instancias existentes, sin duplicados; orden última seleccionada y últimas jugadas.
- Destacada es presentación independiente de selección persistida; rotar no guarda selección.
- Jugar/Administrar seleccionan explícitamente y capturan la identidad para la acción.
- Una rotación/edición/borrado no cambia el destino de un clic ya iniciado.
- Al borrar destacada reconstruir lista y elegir siguiente válida.
- Una instancia: tarjeta fija y posibles ambientes genéricos alternos.
- Cero instancias: paisajes Minecraft y Crear/Importar.

Estados Jugar: Listo/Jugar; instalación requerida/Instalar y jugar según coordinador; Instalando/progreso y cancelar permitido; Iniciando/ocupado; En ejecución/proceso; Bloqueado/causa y corregir; Error/resumen y diagnóstico.

### 3.4. Biblioteca

Título/cantidad, búsqueda, filtro loader, orden, cuadrícula/lista y Añadir. Tres columnas a 1200×720, dos a 800×400 con lateral compacto; más según espacio. Lista para comparar versiones/estados. Tarjetas con portada, icono, nombre, versión/loader, estado, Jugar y menú.

Conservar duplicar/editar/exportar/actualizar/abrir carpeta/eliminar. Menú contextual y botón coherentes. Tarjeta abre instancia; Jugar no propaga apertura. Explicar si eliminar borra archivos o solo retira la instancia según servicio. Conservar agrupaciones/orden. Búsqueda vacía ofrece limpiar filtros; biblioteca vacía Crear/Importar. Virtualizar conjuntos grandes conservando teclado.

### 3.5. Instancia

Cabecera persistente con imagen/icono, nombre/edición prevista, versión/loader, estado, Jugar y menú. Secciones Resumen/Mods/Packs/Shaders/Mundos/Ajustes/Consola. En mínimo compactar imagen, conservar Jugar y permitir desplazamiento de pestañas accesible.

Resumen: runtime, última partida/tiempo si existen, instalación, carpetas/diagnóstico y acciones del núcleo bajo demanda.

Contenido: búsqueda/filtros, activar, versión/origen, selección múltiple existente, instalar/actualizar/retirar/información. Dependencias/incompatibilidades usan diagnósticos existentes. No presentar éxito optimista antes de confirmación.

Mundos: nombre/imagen/datos; importar/exportar/duplicar/eliminar con confirmación; conservar datapacks y operaciones locales del núcleo.

Ajustes: General, Java/RAM, argumentos/ejecución, ventana/resolución, red/servidor normal y opciones del núcleo. Diferenciar herencia global y valor por instancia, incluido null como marcador de restablecimiento donde corresponda.

Consola: logs/filtros/búsqueda/diagnóstico, abrir independiente, estado de proceso, seguir al final sin impedir revisar historial.

### 3.6. Catálogo

Búsqueda, selección visible CurseForge/Modrinth, tipo, compatibilidad versión/loader, filtros en panel. Cuatro columnas estándar, dos mínimo. Fallo de proveedor no elimina resultados del otro. Resultado: imagen/título/autor/resumen/compatibilidad/datos disponibles.

Ficha en hoja sobre resultados: ruta compartible, filtros/scroll conservados, devolver foco al cerrar, información/galería/versiones/destino. Progreso/errores visibles, distinguir instalado/actualización/incompatible. No instalar al abrir. Publicación/vinculación/autor y fuentes extra se retiran según SCOPE.md.

### 3.7. Cuentas, ajustes y onboarding

Cuentas: selector lateral y /accounts; activa identificada; crear/seleccionar/editar/eliminar locales; conservar datos. Microsoft pospuesto con estado/mensaje honesto, sin configuración nueva.

Ajustes: General; Apariencia/rendimiento; Juego/Java; Red/descargas; Actualizaciones/Acerca de. Búsqueda, categorías en columna si cabe/selector arriba en mínimo; etiquetas/descripciones/errores asociados. Persistir por servicios actuales. Apariencia solo variantes fijas/escala/vídeo/rotación/rendimiento; sin editor antiguo.

Onboarding: Bienvenida/ubicación → Perfil local → Crear/importar/biblioteca. Una etapa a la vez, validación de rutas/permisos vía servicios, conservar campos ante error, no lanzar al terminar.

### 3.8. Diálogos y ventanas

Título/explicación, contenido desplazable y acciones fuera del scroll. Principal/cancelar diferenciadas, foco inicial/confinado/devuelto, Escape cuando seguro, alto máximo relativo a ventana.

Migrar main (app/onboarding), logger (procesos/historial/acciones), migration (origen/destino/progreso/error/final). Conservar nombres HTML/contratos. Validar tamaños reales de auxiliares; 800×400 solo es mínimo de principal. Browser/mando/Big Picture/IA/social/autor no se portan. Ayuda local/errores/notificaciones y operaciones del núcleo sí.

## 4. Fondos, vídeos, iconos y recursos

### 4.1. Resolución de presentación

Resolvedor independiente de componentes. Entrada: identidad/edición/versión/upstream/ID de proyecto, icono local, metadatos propios del pack y manifiesto de ambientes Vanilla autorizados. Buscar en internet solo los ambientes Vanilla; para packs usar los recursos que ellos mismos proporcionan. Corrección final del usuario registrada en SCOPE.md.

```ts
type InstancePresentation = {
  instancePath: string
  title: string
  iconUrl?: string
  coverUrl: string
  ambientId: string
  posterUrl: string
  videoAssetId?: string
  source: 'project' | 'vanilla' | 'fallback'
  attribution?: string
}
```

Prioridad de imagen: destacada propia del proyecto → galería propia → Vanilla compatible → fallback empaquetado. Identificar pack por upstream/ID, no por nombre editable. Usar icono local como identidad aunque su resolución no sirva a pantalla completa. Si hay vídeo propio autorizado, utilizarlo; si no, portada propia junto a vídeo ambiental Vanilla identificado como genérico. No presentar un ambiente genérico como gameplay del pack. Catálogo conserva normalmente sus galerías.

### 4.2. Vídeos iniciales

Overworld/Nether/End, cada uno con clip en bucle, poster, miniatura, dimensiones/duración, autoría/procedencia/licencia y hash.

- Máximo 1280×720, 24 fps, 12–20 segundos, MP4 H.264 sin pista de audio.
- Máximo 5 MiB/clip y 15 MiB totales de vídeo inicial.
- Material real de Minecraft Vanilla obtenido de internet, preferentemente paisajes con shaders ya renderizados, con distribución autorizada verificada/documentada antes de empaquetar. No crear ilustraciones IA ni sintetizar vídeo a partir de ellas. No instalar shaders en instancias por elegir un fondo ni ejecutarlos dentro del launcher.
- Los clips no existen en la referencia: buscar/verificar/conseguir/optimizar forma parte del trabajo. No marcar este requisito como terminado usando un poster en su lugar.

### 4.3. Reproducción y coste

Un solo vídeo activo. Vídeos empaquetados, nunca URLs arbitrarias remotas. Poster primero; vídeo cuando pantalla/ventana estén activas. Si falla carga/play/decodificación mantener poster. Liberar fuente anterior. Precargar solo poster siguiente. No decodificar dos vídeos para fundir: transición mediante imágenes/opacidad. Difuminado suave preparado en recursos cuando posible; sin filtros animados/WebGL/blur de pantalla completa por frame. Biblioteca/catálogo/ajustes estáticos; vídeo solo Inicio y cabecera de instancia visible.

Pausar vídeo y timers por pérdida de foco, minimizar/ocultar, juego abierto, región invisible, rendimiento, movimiento reducido o pausa manual. Mostrar poster y mantener operaciones.

### 4.4. Carrusel

- Intervalo 30 s; fondo/portada/título/acciones cambian juntos.
- Pausar al hover, foco dentro, diálogos o acciones pendientes.
- Navegación manual detiene automatismo hasta reactivación explícita.
- Reanudar reinicia intervalo; no acumular ticks ni saltar inmediatamente.
- Anterior/siguiente/pausa accesibles; no mover foco ni anunciar cada tick con aria-live.
- Movimiento reducido: poster y carrusel detenido desde el inicio.
- Jugar usa identidad capturada por acción, no una referencia mutable por timer.

Referencia: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html

### 4.5. Caché

Exclusiva de presentación, máximo 50 MiB y expulsión LRU. Fallback empaquetado offline. Validar protocolo/origen/tamaño/MIME mediante clientes/orígenes permitidos. Solo imágenes públicas, sin cuentas/credenciales. Fallo de cuota no bloquea Inicio. Limpiar caché no borra mods/instancias/mundos/datos generales.

### 4.6. Iconos y movimiento

Lucide único lenguaje, 20/24 px, trazo coherente. Decorativos aria-hidden; botones de icono con nombre accesible; iconos no sustituyen texto de estado.

Animados iniciales: Jugar, descargas, notificaciones, actualizar, ajustes, confirmaciones. Copiar solo componentes necesarios de AnimateIcons, revisar imports y conservar licencias. Una versión Motion. Disparar por hover/foco/clic/cambio real. Desactivar decoración en rendimiento/reduced-motion. Bucles solo por actividad real y ventana visible. Controles 150–220 ms, paneles 180–240 ms; sin rebotes/cámara ni retrasar acciones.

Referencias: https://animateicons.in/icons/docs ; https://raw.githubusercontent.com/Avijit07x/animateicons/main/THIRD_PARTY_NOTICES.md

### 4.7. Recursos

| Recurso | Aplicación |
| --- | --- |
| https://animateicons.in/icons/lucide | Animados seleccionados. |
| https://lucide.dev/guide/react/ | Iconos estáticos. |
| https://www.radix-ui.com/primitives | Controles/diálogos/menús accesibles. |
| https://motion.dev/docs/react-use-reduced-motion | Movimiento y preferencias. |
| https://ui.shadcn.com/ | Referencia de composición. |
| https://reactbits.dev/ | Referencia de interacciones; inicialmente no copiar código. |
| https://www.radix-ui.com/colors | Escalas/estados de color. |
| https://www.realtimecolors.com/ | Evaluación de paleta. |
| https://easings.net/ | Curvas de transición. |

Consultar recursos no implica instalar bibliotecas enteras. React Bits usa MIT + Commons Clause; revisar licencia específica antes de incorporar código. UI/UX Pro Max ya está instalada en proyecto/perfil; usar con Impeccable subordinadas a decisiones del usuario, sin imponer emerald/glass/dock genéricos.

## 5. Seguridad, datos y ejecución por etapas

### 5.1. Datos

Conservar identidad de app, ubicación de datos, origen/partición renderer de producción, cuentas/instancias/mundos, ajustes globales/por instancia, selección, agrupaciones/orden y archivos antiguos de apariencia/extras. Mantener esos datos inertes: sin aplicar CSS/colores ni iniciar servicios retirados.

Preferencias nuevas versionadas:

```ts
type ReactUiPreferencesV1 = {
  version: 1
  appearance: 'system' | 'dark' | 'light'
  performanceMode: boolean
  backgroundVideoEnabled: boolean
  carouselEnabled: boolean
  libraryView: 'grid' | 'list'
}
```

Iniciales: conservar claro/oscuro/sistema si existe válido, si no sistema; conservar rendimiento; vídeos/carrusel habilitados sujetos a reglas y reduced-motion; biblioteca grid. Migración idempotente con validación/recuperación localizada. Mantener claves funcionales salvo necesidad, sin vaciar localStorage ni reutilizar formatos incompatibles. Audio antiguo retirado según SCOPE; conservar sus archivos sin cargarlos. Nuevos vídeos sin audio.

### 5.2. Seguridad

- Mantener contextIsolation; Node deshabilitado en UI y sandbox donde corresponda.
- Validar emisor/argumentos privilegiados; operaciones específicas, no nuevo IPC genérico para componentes.
- DOMPurify conserva saneamiento HTML/SVG. Un componente revisado para HTML externo; resto texto.
- Protocolos/apertura externos explícitos. Impedir navegación externa en ventanas privilegiadas.
- Scripts/fuentes empaquetados; CSP ajustada a orígenes/protocolos reales. Producción funciona sin unsafe-eval.
- No registrar cuerpos de cuentas/claves/parámetros sensibles.
- La auxiliar OptiFine de referencia desactiva aislamiento/sandbox: corregir, conservar parser DOM en preload aislado, solo mensajes necesarios y validar resultados en main.
- Desconectar servicios/red/telemetría de extras, no solo ocultar botones.
- Verificar protección en ejecutable, además de tipos/configuración.

Referencia: https://www.electronjs.org/docs/latest/tutorial/security

### 5.3. CurseForge/actualizaciones

Conservar Worker/cliente compartido, secreto solo Cloudflare, allowlists/límites/caché/fallo cerrado y plan gratuito. Ninguna API key en UI ni llamadas autenticadas directas nuevas.

Actualizador: ReleaseFile.url público; apiUrl interno autenticado. Descarga manual abre público. Notas/progreso/error/acciones accesibles a 800×400. Conservar integridad. EXE/ZIP completos; excluir ASAR públicos elegibles por clientes antiguos. No reemplazar assets de versiones publicadas.

### 5.4. Etapas

Cada cierre requiere código revisable, tipos/lint pertinentes, pruebas y evidencia real. Resolver fallos antes de aceptar.

| Etapa | Entregable y salida |
| --- | --- |
| 0 | Inventario de rutas/acciones/diálogos/servicios/almacenamiento/test IDs, clasificación keep/remove/deferred y referencia visual/rendimiento beta.2. |
| 1 | Prototipo React marco/Inicio/Biblioteca/Catálogo con fixtures, claro/oscuro/ambos tamaños y un clip optimizado real. Revisión visual del usuario antes de extender. |
| 2 | Infraestructura, entradas/selector/compilación/empaquetado independiente; habitual sigue Vue. |
| 3 | Cliente/stores/tareas/eventos/i18n/preferencias; concurrencia/limpieza/Strict Mode. |
| 4 | Onboarding/local/Inicio/carrusel/Biblioteca/crear/importar/lanzar vía servicios. |
| 5 | Resumen/contenido/mundos/ajustes/consola/operaciones núcleo; aislamiento entre instancias. |
| 6 | Catálogos públicos, filtros/fichas/instalar/actualizar/errores. |
| 7 | Ajustes/actualizador/tareas/notificaciones/ayuda local/ventanas necesarias. |
| 8 | React predeterminado, retirar Vue y extras del grafo distribuido, actualizar todos los consumidores build/pruebas. |
| 9 | Windows desechable, instalación/actualización, validación/hashes/borrador y publicación al cumplir criterios. |

La etapa 1 puede crear el andamiaje mínimo necesario para su prototipo; no equivale a completar la etapa 2 ni habilita cambiar el renderer público. No saltarse la revisión visual.

### 5.5. Compilación paralela

LAUNCHER_RENDERER=vue|react; Vue por defecto hasta sustitución. Salidas separadas; distribuir solo seleccionado. Dev Vue 3000, React 3001 y main correspondiente; tras sustitución React vuelve a puerto habitual. Un main por checkout y perfiles de prueba propios; no modificar perfil habitual.

Actualizar Electron build/resolución/scripts/CI/testids y consumidor DeskGap; conservar compilabilidad sin afirmar pruebas físicas no ejecutadas. Retirar browser solo al desconectar sus referencias coherentemente.

### 5.6. Continuidad

Cuatro registros: matriz de paridad, diseño/tokens/capturas aceptadas, decisiones técnicas y validación con comandos/commit/ejecutable/perfiles/resultados. Un componente no está terminado sin servicios y recorrido probado. El harness almacena el documento y su alcance vigente, orden/gates/evidencias y siguiente acción; no puede certificar por sí solo funcionalidad, seguridad o aceptación visual.

## 6. Validación, publicación y terminado

### 6.1. Cliente/datos

Probar snapshot inicial/mutaciones/evento durante carga/múltiples consumidores/herencia/instancia y cuenta sin obsolescencia/Strict Mode/cancelación de cambio rápido/revalidación/finalización de listeners/errores/null/opcionales/preferencias dañadas/migración repetida/selección guardada/plurales/polling sin solapar. Añadir arranque con datos de extras sin habilitarlos ni borrarlos.

### 6.2. Recorridos Electron

| Área | Casos |
| --- | --- |
| Arranque | Nuevo/existente, sin pantalla vacía ni excepciones sin manejar. |
| Onboarding | Completar/retroceder/persistir campos/recuperar error. |
| Biblioteca | Crear/importar/buscar/filtrar/editar/duplicar/exportar/eliminar. |
| Lanzamiento | Instalar/iniciar/proceso/diagnóstico/bloqueo/recuperación. |
| Contenido | Instalar/activar/desactivar/actualizar/retirar según tipo. |
| Mundos | Importar/exportar y hashes de archivos de referencia. |
| Catálogo | Ambos proveedores/scroll/historial/compatibilidad/instalación/fallos. |
| Cuentas | Local/selección persistida/conservación de datos. |
| Ajustes | Persistencia/herencia/cambio de instancia. |
| Actualización | Descubrimiento autenticado/enlace público/notas/errores. |
| Ventanas | Main/logger/migration con sus dimensiones reales. |
| Accesibilidad | Teclado/foco/lector/contraste/reduced-motion. |
| Medios | Vídeo real/fallback/rotación/pausa/liberación. |
| Recorte XMCL | Sin UI/arranque/red/procesos/listeners de extras; datos conservados. |

Usar herramientas/fixtures autorizadas. CLI DevTools fue rechazado previamente por revisión automática: no reintentar/eludir. Alternativa permitida: fixtures Playwright Electron sobre paquete real.

### 6.3. Visual

Cada área en 1200×720 y 800×400, claro/oscuro. Estados vacío/carga/datos/error/deshabilitado/pendiente/texto y nombres largos/offline/diálogo/panel. Cero cortes/solapamientos/scroll horizontal accidental; acciones alcanzables; menús/tooltips en ventana; footer accesible; foco y retorno; recortes de imágenes correctos; sin flashes blancos; contraste AA sobre fondos reales. Incomplete de Axe requiere revisión humana. Capturas deterministas congelan poster; vídeo/decoder se verifica aparte.

### 6.4. Carrusel

Probar cero/una/varias instancias, última válida, tick a 30 s elegibles, hover/foco/diálogo/acción pendiente/manual/reanudar, cero escrituras de selección por tick, cero autoplay de juego, identidad capturada por clic, borrar durante rotación, fallos imagen/vídeo/red/cuota, único decoder, sin audio, volver foco sin ticks acumulados, reduced-motion inicial/cambio en vivo.

### 6.5. Rendimiento

Ventanas de 60 s sobre mismo Windows referencia: poster, vídeo, rotación, biblioteca extensa, mods extensos, consola con eventos, minimizado, juego abierto, rendimiento.

- Vídeo máximo 24 fps.
- CPU media renderer <8 % en Inicio con vídeo en referencia.
- Poster: memoria renderer sin regresión >20 % frente a beta.2 con mismo perfil.
- Arranque mediano sin regresión >10 %, cinco arranques equivalentes.
- Sin crecimiento sostenido de memoria/listeners/suscripciones tras recorridos repetidos.
- Pausas reales: vídeo deja de avanzar.
- Navegación/scroll responden durante descargas.
- Medir GPU y conjunto de procesos, no trasladar coste fuera de renderer para aparentar mejora.

Son presupuestos pendientes, no resultados React demostrados. Si no se cumplen, optimizar antes de publicar.

### 6.6. CI/pruebas previas

Tipos/lint runtime/Electron/cliente/React; mantener dominio/Worker. Pruebas React/adaptadores. Conservar test IDs con significado vigente, extender generador TSX y documentar retirados aprobados. No alterar suites canónicas protegidas para fingir compatibilidad; propias para migración. PowerShell propaga cada fallo. Release usa ejecutable empaquetado y candidata final pasa sin fallos ni aprobación basada solo en reintentos.

### 6.7. Instalador aislado

Runner Windows desechable, directorios/datos temporales. Instalar beta.2, crear local/instancia/mundo, registrar hashes, detectar/descargar/verificar candidata, cerrar, instalar nueva sobre esa instalación, arrancar React, comprobar cuentas/ajustes/selección/instancias/hashes/accesos/ejecutable. Probar limpio y ZIP; adicional conservación desde beta.3. Dos ZIP con perfil compartido no equivalen a validar NSIS. No usar instalación habitual.

### 6.8. Publicación

Mantener producto/appId/directorios. EXE/ZIP/checksums/manifiesto. v0.3.0-beta.1 en borrador; assets del commit probado, descargas públicas sin autenticación, instalador binario no JSON, grafo distribuido sin Vue/Vuetify/Vue Router ni arranque de extras. Publicar después de aceptación y pruebas. Mantener beta.2 recuperable; correcciones con versión superior, sin sobrescribir assets.

### 6.9. Terminado

- Toda función keep de SCOPE/PARITY migrada y probada; remove no reintroducida; deferred explícita.
- Main/logger/migration React; browser retirado con referencias desconectadas.
- Solo nuevo renderer distribuido; rutas y datos anteriores compatibles.
- Temas/extras antiguos no se ejecutan/aplican ni se borran.
- Medios/carrusel cumplen identidad/accesibilidad/coste y licencias.
- CurseForge proxy y actualizador/integridad/enlaces funcionan.
- Pruebas funcionales/visuales/seguridad/instalación con evidencia.
- Sin fallos abiertos en recorridos de aceptación.
- Documentación permite reproducir el commit publicado.

Pendientes al aprobar este documento: implementación React, clips/dependencias y todas sus validaciones. Riesgos a comprobar: vídeo real, material/procedencia/licencia y avisos Windows mientras no haya firma Authenticode. Microsoft sigue pospuesto.
