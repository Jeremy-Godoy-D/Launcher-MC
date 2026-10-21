# Investigación de SKlauncher

Fecha: 20 de octubre de 2026. Objetivo: entender la aplicación instalada mediante REA y evidencia estática antes de definir el proyecto propio.

## Preguntas de investigación

| Área | Evidencia necesaria | Estado final de esta fase |
| --- | --- | --- |
| Identidad y generaciones | Versión, manifiestos, SHA-256, accesos directos | Comprobadas: Electron 4.0.39 y Java 3.2.18 builds 601/602 |
| Arquitectura y dependencias | Inventario ASAR/JAR, main, preload, renderer | Mapa estático documentado; cobertura automática parcial |
| Pantallas y navegación | Rutas y componentes distribuidos | Reconstruidas en interfaz.md; sin comprobación visual |
| Comunicación interna | API expuesta por preload y manejadores IPC | Inventario de 196 canales invoke y sus receptores |
| Datos locales | Esquemas y rutas, sin valores personales | Guardados tipos y claves normalizadas en inventory.json |
| Cuentas | Proveedores, ciclo de sesión y persistencia, sin credenciales | Reconstrucción estática; sin iniciar sesión |
| Minecraft | Manifest, descargas, integridad, Java, argumentos y proceso | Reconstrucción estática; sin partida de prueba |
| Contenido | Loaders, mods, modpacks, importación, actualizaciones | Gestores y flujos descritos; no todos los formatos probados |
| Servicios externos | Dominios y contratos observados en código | Referencias/uso estático; contratos de servidores desconocidos |
| Distribución y actualización | Electron updater y bootstrap Java | Rutas estáticas documentadas; no se instalaron updates |
| Ejecución real | Pantallas, tráfico, inicio del juego | No realizada; vía activa REA incompatible con los fuses actuales; vía pasiva no verificada |

## Método y conservación

REA 6.7.0 mediante CLI local. No hay servidor REA conectado a esta sesión. El diagnóstico informa registro MCP ausente y motores nativos no configurados; el análisis estático JavaScript/ASAR no requiere esos motores.

Las copias de código, salidas grandes y evidencia sin resumir se conservan fuera de Git en `.analysis/` o en las extracciones existentes verificadas. Los informes contienen descripciones y referencias, no una redistribución del programa. Se distinguen evidencia REA, inspección complementaria con shell/JDK, documentación del fabricante e inferencias.

No se editan instalaciones, mundos, perfiles ni cuentas. Los archivos privados se examinan únicamente para describir sus esquemas. No se guardan valores de cuentas, tokens, identificadores personales ni registros completos. El plan de implementación queda para la siguiente etapa solicitada por el usuario.
