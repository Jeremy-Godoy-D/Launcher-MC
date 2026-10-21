# Launcher MC — Procedencia, requisitos y configuración

## 1. Procedencia y licencia de la base

**Launcher MC** es un derivado independiente basado en el monorepo principal de [X Minecraft Launcher (XMCL)](https://github.com/Voxelum/x-minecraft-launcher):

- **Revisión upstream fijada:** `1b4c9859ce0fc9d43b7da0cc9290b3507bc4e66a`
- **Licencia de la base:** MIT (`LICENSE-XMCL.txt` / `LICENSE`)
- **Avisos de terceros:** `THIRD_PARTY_NOTICES.txt`
- **Verificación de árbol original:** `../analysis/xmcl-upstream-files.sha1`

Este producto no es oficial de Minecraft ni está afiliado o aprobado por Mojang, Microsoft o los mantenedores de XMCL.

## 2. Identidad y aislamiento de datos

- **Nombre del producto:** `Launcher MC`
- **Identificador técnico (`appId`):** `local.launchermc.desktop`
- **Esquema de protocolo:** `launchermc://`
- **Directorio de datos en producción:** `%APPDATA%\LauncherMC`
- **Directorio de datos en desarrollo/pruebas:** aislado mediante `XMCL_E2E_APP_DATA` y `XMCL_E2E_GAME_DATA` (o `%TEMP%\LauncherMC-development` en desarrollo), sin leer ni escribir en instalaciones existentes de SKlauncher, XMCL ni `.minecraft`.

## 3. Servicios deshabilitados y privacidad

- **Infraestructura de XMCL bloqueada:** todas las solicitudes a `xmcl.app`, `*.xmcl.app` y `xmcl-core-api.azurewebsites.net` se rechazan localmente (`productPolicy.ts`).
- **Actualizaciones desde GitHub Releases (`Jeremy-Godoy-D/Launcher-MC`):** `ElectronUpdater` consulta exclusivamente el repositorio oficial del proyecto en GitHub Releases para permitir actualizaciones automáticas o manuales dentro de la aplicación (mediante paquete incremental `app.asar.gz` verificado por SHA-256) o descarga del instalador `.exe`, sin contactar feeds de XMCL.
- **Telemetría desactivada:** `pluginTelemetry` está desconectado del proceso principal y `disableTelemetry = true` por defecto.
- **Funciones fuera de alcance desactivadas:** P2P/multijugador integrado, agente IA, amigos/presencia de Xbox, noticias de XMCL, catálogo FTB, blueprints e importación de otros launchers están excluidos de esta versión.
- **Protección de credenciales:** las credenciales utilizan exclusivamente `safeStorage` del sistema operativo (`ElectronSecretStorage.ts`) sin fallback en texto plano, y los logs aplican redacción automática de tokens y claves (`redactLogMessage.ts`).

## 4. Configuración de servicios externos propios

Launcher MC no incluye ni reutiliza credenciales privadas de XMCL. Para habilitar el inicio de sesión con Microsoft, el catálogo de CurseForge y la lectura de releases privados en compilaciones propias, define en `xmcl-electron-app/.env` (basado en `.env.example`):

- `MICROSOFT_CLIENT_ID`: identificador de aplicación pública Azure AD / Xbox Live propia del proyecto con permisos aprobados para Minecraft Services.
- `CURSEFORGE_API_KEY`: clave de API propia de CurseForge Core API (inyectada únicamente desde el proceso principal hacia `api.curseforge.com`).
- `LAUNCHER_GITHUB_REPO`: repositorio de GitHub para actualizaciones (por defecto `Jeremy-Godoy-D/Launcher-MC`).
- `LAUNCHER_UPDATE_TOKEN`: token de lectura opcional (o archivo `%APPDATA%\LauncherMC\update-token.txt`) cuando el repositorio de releases es privado.
