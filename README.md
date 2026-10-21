# Launcher MC

**Launcher MC** es un launcher de **Minecraft: Java Edition** para **Windows 10/11 (x64)** íntegramente en español, diseñado para gestionar instancias aisladas, perfiles locales/offline y cuentas de Microsoft, instalación automática de Java y descarga de mods/modpacks desde Modrinth y CurseForge.

Mantenido por **Jeremy Godoy ([@Jeremy-Godoy-D](https://github.com/Jeremy-Godoy-D))**.

---

## Características principales

- **Interfaz 100% en español:** Navegación enfocada en **Biblioteca**, **Explorar contenido**, **Cuentas** y **Ajustes**, con panel de instancia para **Contenido**, **Configuración** y **Consola**.
- **Cuentas de juego:**
  - Creación, selección y eliminación individual de **múltiples perfiles locales/offline** (`AUTHORITY_DEV`).
  - Soporte para inicio de sesión con **cuenta oficial de Microsoft** (configurable mediante `MICROSOFT_CLIENT_ID`).
- **Gestión de instancias y Modloaders:**
  - Soporte para **Vanilla**, **Fabric**, **Forge** y **NeoForge**.
  - Detección e instalación automática del runtime de **Java** adecuado para cada versión de Minecraft.
  - Ajuste por instancia y global de memoria RAM, argumentos JVM y resolución de ventana.
- **Catálogo de Mods y Modpacks:**
  - Integración directa con **Modrinth** y soporte para **CurseForge** (configurable mediante `CURSEFORGE_API_KEY`), además de importación local de archivos `.jar`, `.zip` y `.mrpack`.
- **Instalador `.exe` y Actualizaciones Automáticas o Manuales:**
  - Distribuido como instalador **`.exe` (NSIS)** y paquete portable **`.zip`** para Windows x64.
  - Actualizador integrado conectado a **GitHub Releases (`Jeremy-Godoy-D/Launcher-MC`)**: permite actualizar desde dentro de la misma aplicación de forma **automática** (al iniciar) o **manual** (desde **Ajustes → Actualizaciones**), aplicando parches incrementales verificados por SHA-256 (`app.asar.gz`) o descargando el nuevo instalador `.exe`.

---

## Instalación en Windows (x64)

Desde la sección [**Releases**](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases) del repositorio puedes descargar:

1. **Instalador ejecutable (Recomendado):** `LauncherMC-<versión>-win-x64.exe`
   - Ejecuta el archivo `.exe`, acepta la licencia, elige el directorio de instalación y se crearán los accesos directos en el Escritorio y el Menú Inicio.
2. **Versión portable:** `LauncherMC-<versión>-win-x64.zip`
   - Extrae el archivo `.zip` en cualquier carpeta y abre `Launcher MC.exe`.

---

## Cómo publicar una nueva actualización automática

El repositorio cuenta con el flujo de integración y despliegue continuo [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Incrementa el número de versión en `launcher/package.json` y `launcher/xmcl-electron-app/package.json` (por ejemplo, de `0.1.0-beta.1` a `0.1.1`).
2. Haz commit y `git push origin main` (o sube un tag `git tag v0.1.1 && git push origin v0.1.1`).
3. **GitHub Actions** compilará automáticamente el launcher, generará el instalador `.exe`, el `.zip` portable y el paquete incremental `app-<versión>-win.asar.gz` (+ `.sha256`), y publicará el **GitHub Release**.
4. Los usuarios con **Launcher MC** instalado detectarán la nueva versión desde la aplicación (automáticamente al abrirla o pulsando **Buscar actualizaciones** en **Ajustes**) y podrán instalarla y reiniciar con un clic.

> **Nota para repositorio privado:** Si mantienes el repositorio en modo privado, los clientes pueden autenticar las consultas al feed de releases definiendo un Fine-Grained Personal Access Token de solo lectura (`Contents: Read-only`) en `LAUNCHER_UPDATE_TOKEN` al compilar o guardándolo en `%APPDATA%\LauncherMC\update-token.txt`.

---

## Desarrollo local y compilación

Requisitos: **Node.js >= 22.16.0** y **pnpm 11.10.0**.

```powershell
cd launcher
pnpm install
pnpm check
pnpm lint
pnpm build:renderer
pnpm build:all
```

Los artefactos finales se generan en `launcher/xmcl-electron-app/build/output/`:
- `LauncherMC-<versión>-win-x64.exe` (Instalador Windows x64)
- `LauncherMC-<versión>-win-x64.zip` (Portable Windows x64)
- `app-<versión>-win.asar.gz` y `app-<versión>-win.asar.sha256` (Actualización in-app)

---

## Licencia y Atribución Upstream

- **Launcher MC** se distribuye bajo la **Licencia MIT** — `Copyright (c) 2026 Jeremy Godoy (@Jeremy-Godoy-D)`. Consulta el archivo [LICENSE](LICENSE).
- Este proyecto está basado en [X Minecraft Launcher (XMCL)](https://github.com/Voxelum/x-minecraft-launcher) (`commit 1b4c9859ce0fc9d43b7da0cc9290b3507bc4e66a`), distribuido originalmente bajo la **Licencia MIT** por `ci010 (cijhn@hotmail.com) / Voxelum`. Su licencia original íntegra se preserva en [launcher/LICENSE-XMCL.txt](launcher/LICENSE-XMCL.txt) y los detalles de procedencia en [launcher/UPSTREAM.md](launcher/UPSTREAM.md).
- Los avisos y licencias de todas las bibliotecas de terceros incluidas se encuentran en [launcher/THIRD_PARTY_NOTICES.txt](launcher/THIRD_PARTY_NOTICES.txt).
- **Aviso legal:** *No es un producto oficial de Minecraft. No está aprobado ni asociado con Mojang Synergies AB ni con Microsoft Corporation.*
