<div align="center">

<img src="launcher/xmcl-electron-app/icons/launchermc.png" alt="Grimo Launcher" width="96" height="96" />

# Grimo Launcher

**Launcher de escritorio para Minecraft: Java Edition en Windows 10/11 (x64)**  
Instancias aisladas · Java automático · Perfiles locales · Actualizaciones desde GitHub

[![Release](https://img.shields.io/badge/version-v0.2.0--beta.2-39d9a1?style=flat-square&logo=github)](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0ea5e9?style=flat-square&logo=windows)](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-d4943a?style=flat-square)](LICENSE)

[**Descargar `.exe`**](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/tag/v0.2.0-beta.2) · [**Notas de versión**](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases) · [**Reportar un problema**](https://github.com/Jeremy-Godoy-D/Launcher-MC/issues) · [**Licencia y Avisos**](NOTICE)

</div>

---

## Vista general

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Diseño Grimo en React</h3>
      <p>Paisajes de Minecraft, cristal, barra lateral y biblioteca de instancias. Incluye temas claro, oscuro y sistema, movimiento reducido y modo rendimiento. La descarga beta.2 corresponde al diseño Aurora anterior.</p>
    </td>
    <td width="50%" valign="top">
      <h3>⚡ Instancias y Modloaders</h3>
      <p>Creación y aislamiento por carpeta para <b>Vanilla</b>, <b>Fabric</b>, <b>Forge</b> y <b>NeoForge</b>. Detección e instalación automática del runtime de <b>Java (JRE 8/17/21)</b> según la versión de Minecraft.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🔐 Perfiles locales</h3>
      <p>Crea y alterna entre varios perfiles locales. Microsoft queda pospuesto y se conservan los datos de las cuentas existentes.</p>
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
      <h3>🛠️ Diagnóstico local</h3>
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
│   ├── xmcl-react-ui/               # Interfaz React, ventanas principal, consola y migración
│   ├── packages/renderer-client/    # Cliente de servicios, estados compartidos y tareas
│   ├── xmcl-keystone-ui/            # Referencia histórica de la interfaz Vue
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

# 5. Compilar instalador y paquete portable
pnpm build:renderer
pnpm build:all
```

React es el renderer predeterminado de desarrollo en `http://localhost:3000` y de los paquetes en `launcher/xmcl-electron-app/build/output/`. El seguimiento y los criterios de aceptación están en [el plan de migración](docs/react-migration/PLAN.md).

### Variables de entorno opcionales

| Variable | Propósito | Comportamiento si se omite |
| :--- | :--- | :--- |
| `MICROSOFT_CLIENT_ID` | Client ID de Azure App Registration para login con Microsoft. | El modo local/offline funciona al 100%; el login Microsoft muestra aviso informativo. |
| `CURSEFORGE_PROXY_URL` | Origen HTTPS público del Worker de CurseForge. La API key vive en Cloudflare. | Modrinth e importación local siguen disponibles; CurseForge muestra un error recuperable. |
| `LAUNCHER_UPDATE_TOKEN` | Fine-Grained PAT (`Contents: Read-only`) si el repo GitHub es privado. | Consulta la API pública de GitHub Releases (`Jeremy-Godoy-D/Launcher-MC`). |

---

## Flujo de publicación de versiones

1. Actualiza el campo `"version"` en [`launcher/package.json`](launcher/package.json) y [`launcher/xmcl-electron-app/package.json`](launcher/xmcl-electron-app/package.json).
2. Ejecuta el [workflow de borrador](.github/workflows/release.yml) sobre el commit de la candidata. Comprueba el instalador, ZIP, sumas SHA-256 y la migración en un Windows desechable.
3. Revisa la evidencia del borrador y los criterios de aceptación del plan antes de publicar. Valida los mismos archivos del borrador con `validate_only`.
4. La primera entrega React usa el instalador completo. Los usuarios pueden descubrirla desde **Ajustes → Actualizaciones** y conservar los datos al instalar sobre el programa anterior.

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
