<div align="center">

<img src="launcher/xmcl-electron-app/icons/launchermc.png" alt="Launcher MC" width="96" height="96" />

# Launcher MC

**Launcher de escritorio para Minecraft: Java Edition en Windows 10/11 (x64)**  
Sistema de diseño «Aurora Glass» · Instancias aisladas · Perfiles locales y Microsoft · Actualizador delta integrado

[![Release](https://img.shields.io/badge/version-v0.2.0--beta.2-39d9a1?style=flat-square&logo=github)](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0ea5e9?style=flat-square&logo=windows)](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-2.7%20%2B%20Vuetify-3b9b78?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-d4943a?style=flat-square)](LICENSE)

[**Descargar `.exe`**](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/tag/v0.2.0-beta.2) · [**Notas de versión**](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases) · [**Reportar un problema**](https://github.com/Jeremy-Godoy-D/Launcher-MC/issues) · [**Licencia y Avisos**](NOTICE)

</div>

---

## Vista general

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🫧 Diseño «Aurora Glass»</h3>
      <p>Cristal esmeralda, centro de lanzamiento, dock inferior y biblioteca de instancias. Fondo de burbujas con movimiento reducido y modo rendimiento; distribución adaptada desde 800×400.</p>
    </td>
    <td width="50%" valign="top">
      <h3>⚡ Instancias y Modloaders</h3>
      <p>Creación y aislamiento por carpeta para <b>Vanilla</b>, <b>Fabric</b>, <b>Forge</b> y <b>NeoForge</b>. Detección e instalación automática del runtime de <b>Java (JRE 8/17/21)</b> según la versión de Minecraft.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🔐 Perfiles Offline y Microsoft</h3>
      <p>Soporte simultáneo para múltiples perfiles locales/offline (con cambio rápido y borrado individual) y autenticación oficial con cuentas de <b>Microsoft / Xbox Live</b>.</p>
    </td>
    <td width="50%" valign="top">
      <h3>📦 Modrinth, CurseForge y Archivos Locales</h3>
      <p>Explorador integrado para buscar e instalar mods, modpacks, shaders y resource packs desde <b>Modrinth</b> y <b>CurseForge</b>, además de importación directa de archivos <code>.jar</code>, <code>.zip</code> y <code>.mrpack</code>.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🔄 Actualizaciones Automáticas o Manuales</h3>
      <p>Conectado a <b>GitHub Releases</b>: comprueba nuevas versiones al iniciar o bajo demanda. Esta transición desde beta.3 usa el instalador completo o ZIP; la nueva versión incorpora verificación SHA-256 para futuras actualizaciones delta.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🛠️ Diagnóstico y Telemetría</h3>
      <p>Consola en tiempo real por instancia con filtrado de advertencias y errores, exportación de informes y control fino de memoria RAM, argumentos JVM y resolución de pantalla.</p>
    </td>
  </tr>
</table>

---

## Descarga e instalación

<table>
  <thead>
    <tr>
      <th>Formato</th>
      <th>Archivo</th>
      <th>Descripción</th>
      <th>Actualización in-app</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>Instalador NSIS (Recomendado)</b></td>
      <td><code>LauncherMC-0.2.0-beta.2-win-x64.exe</code></td>
      <td>Asistente de instalación con selección de ruta y accesos directos en Escritorio y Menú Inicio.</td>
      <td>Descarga manual del instalador en esta versión</td>
    </tr>
    <tr>
      <td><b>Archivo Portable</b></td>
      <td><code>LauncherMC-0.2.0-beta.2-win-x64.zip</code></td>
      <td>Carpeta descomprimible sin instalación en el registro del sistema.</td>
      <td>Reemplazo completo de la carpeta de programa</td>
    </tr>
  </tbody>
</table>

---

## Arquitectura del proyecto

```
Launcher MC/
├── .github/workflows/
│   └── release.yml                  # CI/CD: empaquetado Windows x64 + publicación en GitHub Releases
├── launcher/
│   ├── xmcl-electron-app/           # Proceso principal de Electron, ventana nativa, updater y NSIS
│   │   ├── main/
│   │   │   ├── ElectronLauncherApp.ts
│   │   │   └── utils/updater.ts     # Cliente de actualizaciones vía GitHub Releases + SHA-256
│   │   └── build/
│   │       └── electron-builder.config.ts
│   ├── xmcl-keystone-ui/            # Frontend Vue + Vuetify con sistema de diseño Liquid Glass
│   │   └── src/
│   │       ├── assets/common.css    # Tokens CSS, superficies .lg-surface / .lg-inset y tipografía
│   │       └── views/               # Biblioteca, Navegación, Cuentas, Cabecera de Instancia, Ajustes
│   ├── xmcl-runtime/                # Servicios de instancias, Java, cuentas, Modrinth/CurseForge
│   └── xmcl-runtime-api/            # Contratos IPC tipados entre Main y Renderer
├── LICENSE                          # Licencia MIT (SPDX)
└── NOTICE                           # Atribuciones upstream (XMCL) y avisos de marcas
```

---

## Desarrollo y compilación local

### Requisitos previos
- **Sistema operativo:** Windows 10 u 11 (x64)
- **Node.js:** `>= 22.16.0`
- **pnpm:** `11.10.0`

### Comandos principales

```powershell
cd launcher

# 1. Instalar dependencias del monorepo
pnpm install

# 2. Verificar tipos TypeScript y linter
pnpm check
pnpm lint

# 3. Ejecutar pruebas unitarias
pnpm test

# 4. Iniciar en modo desarrollo (hot-reload)
pnpm dev

# 5. Compilar aplicación completa (.exe + .zip + .asar.gz)
pnpm build:renderer
pnpm build:all
```

Los artefactos generados se ubican en `launcher/xmcl-electron-app/build/output/`.

### Variables de entorno opcionales

| Variable | Propósito | Comportamiento si se omite |
| :--- | :--- | :--- |
| `MICROSOFT_CLIENT_ID` | Client ID de Azure App Registration para login con Microsoft. | El modo local/offline funciona al 100%; el login Microsoft muestra aviso informativo. |
| `CURSEFORGE_PROXY_URL` | Origen HTTPS público del Worker de CurseForge. La API key vive en Cloudflare. | Modrinth e importación local siguen disponibles; CurseForge muestra un error recuperable. |
| `LAUNCHER_UPDATE_TOKEN` | Fine-Grained PAT (`Contents: Read-only`) si el repo GitHub es privado. | Consulta la API pública de GitHub Releases (`Jeremy-Godoy-D/Launcher-MC`). |

---

## Flujo de publicación de versiones

1. Actualiza el campo `"version"` en [`launcher/package.json`](launcher/package.json) y [`launcher/xmcl-electron-app/package.json`](launcher/xmcl-electron-app/package.json).
2. Confirma los cambios y sube un tag semántico (`git tag v0.1.0-beta.2 && git push origin main --tags`).
3. El workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) compila el instalador `.exe`, el paquete `.zip` y el binario diferencial `.asar.gz` junto con su suma `.sha256`, adjuntándolos automáticamente al Release de GitHub.
4. Los usuarios con **Launcher MC** reciben la actualización al iniciar la app (modo automático) o desde **Ajustes → Actualizaciones** (modo manual).

---

## Licencia y créditos

Distribuido bajo la licencia **MIT**. Consulta [`LICENSE`](LICENSE) y [`NOTICE`](NOTICE) para el texto completo.

- **Autoría y mantenimiento:** [Jeremy Godoy (@Jeremy-Godoy-D)](https://github.com/Jeremy-Godoy-D)
- **Base tecnológica (Upstream):** Derivado de [X Minecraft Launcher (XMCL)](https://github.com/Voxelum/x-minecraft-launcher) (`Copyright (c) 2017-2026 ci010 and X Minecraft Launcher contributors`), cuya licencia original se conserva íntegra en [`launcher/LICENSE-XMCL.txt`](launcher/LICENSE-XMCL.txt) junto con el inventario de dependencias en [`launcher/THIRD_PARTY_NOTICES.txt`](launcher/THIRD_PARTY_NOTICES.txt).
- **Aviso de marca:** *Minecraft* es una marca registrada de Mojang Synergies AB / Microsoft Corporation. Este proyecto es independiente y no está afiliado ni aprobado por Mojang ni Microsoft.

## Aurora Glass — v0.2.0-beta.2

El rediseño incorpora centro de lanzamiento, dock, navegación de instancia explícita, fichas de catálogo en hojas, filtros bajo demanda, onboarding de tres etapas y preferencias locales de rendimiento.

CurseForge usa el proxy de [services/curseforge-proxy](services/curseforge-proxy/README.md); no incluir una API key en la compilación. El Worker está activo y se comprobó una instalación real de AppleSkin. Consulta [la validación y sus límites](launcher/IMPLEMENTACION_AURORA.md). Microsoft se pospone en esta versión; el modo local está disponible.

Para actualizar desde beta.3, cierra el launcher y ejecuta el instalador completo en la misma ubicación, o reemplaza la carpeta del programa con el ZIP nuevo. Conserva la carpeta de datos y mundos. Esta entrega omite los assets ASAR para evitar que el actualizador antiguo aplique una descarga sin la verificación nueva. Los binarios no tienen firma Authenticode.

La beta.2 corrige la descarga manual con tokens de GitHub: el botón abre el instalador público, y las notas largas mantienen los botones visibles.
