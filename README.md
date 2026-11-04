<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="launcher/branding/copper/wordmark-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="launcher/branding/copper/wordmark-light.png">
    <img src="launcher/branding/copper/wordmark-light.png" alt="Grimo Launcher" width="340">
  </picture>

  <p>Launcher de escritorio para Minecraft: Java Edition en Windows 10 y 11 (x64).</p>

  <p>
    <a href="https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v0.3.0-beta.1/GrimoLauncher-0.3.0-beta.1-win-x64.exe"><strong>Descargar instalador</strong></a>
    · <a href="https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v0.3.0-beta.1/GrimoLauncher-0.3.0-beta.1-win-x64.zip">Descargar ZIP portable</a>
    · <a href="https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/tag/v0.3.0-beta.1">Notas de v0.3.0-beta.1</a>
  </p>
</div>

# Grimo Launcher

Crea y organiza instancias independientes de Minecraft Java. Cada instancia tiene su propia carpeta para mundos, mods y configuración. Grimo detecta el Java que necesita cada instancia o modpack y puede descargarlo e instalarlo en el almacenamiento del launcher.

- **Instancias.** Vanilla, Fabric, Forge, NeoForge, Quilt, OptiFine y LabyMod. OptiFine requiere seleccionar BMCLAPI en **Ajustes → Red y descargas**.
- **Contenido.** Busca e instala modpacks, mods, paquetes de recursos y shaders desde Modrinth y CurseForge. También puedes importar contenido local.
- **Mundos y diagnóstico.** Administra mundos, datapacks, regiones y chunks. Consulta la consola de cada instancia y configura Java, memoria y argumentos de lanzamiento.
- **Interfaz.** Biblioteca y catálogo en React, temas claro y oscuro, movimiento reducido y modo rendimiento.

La versión pública está en beta y admite perfiles locales. El inicio de sesión con Microsoft queda pospuesto.

## Instalar o actualizar

El **instalador `.exe`** configura el programa y sus accesos directos. Para usar el **ZIP portable**, extrae la carpeta completa y abre `Grimo Launcher.exe` desde allí.

### Actualizar desde Launcher MC v0.2.0-beta.2

1. Abre **Ajustes → Acerca de → Ver actualización → Descargar instalador (.exe)**. El navegador debe descargar `GrimoLauncher-0.3.0-beta.1-win-x64.exe`. Si el botón de una versión anterior abre una página de texto, usa el enlace directo de arriba.
2. Cierra Minecraft. En **Ajustes → General → Ubicación del almacenamiento**, localiza tu carpeta de datos y haz una copia. Esta carpeta contiene tus instancias y los mundos compartidos. Incluye en la copia cualquier instancia guardada en otra ubicación y `%APPDATA%\LauncherMC` para respaldar también tus perfiles y ajustes.
3. Cierra Minecraft y Launcher MC. Ejecuta el instalador y conserva la misma carpeta del programa. Si usas el ZIP, extrae la nueva versión en una carpeta de programa y conserva tu ubicación de almacenamiento.
4. Abre Grimo Launcher. Revisa tus instancias en **Biblioteca** y entra en **Mundos** para comprobar las partidas locales y compartidas.

Esta transición usa el instalador completo. La prueba en Windows conservó la instancia seleccionada, el mundo, el perfil local, la memoria configurada y la ubicación de datos. [Evidencia de la actualización desde beta.2](docs/react-migration/STAGE9-INSTALLER.md).

### Verificar la descarga

Windows puede mostrar un aviso de editor desconocido porque esta beta carece de firma Authenticode. Puedes comparar el SHA-256 del instalador con el valor publicado en GitHub. Desde la carpeta donde guardaste el archivo, ejecuta en PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\GrimoLauncher-0.3.0-beta.1-win-x64.exe
```

[SHA-256 del instalador](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v0.3.0-beta.1/GrimoLauncher-0.3.0-beta.1-win-x64.exe.sha256) · [SHA-256 del ZIP](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v0.3.0-beta.1/GrimoLauncher-0.3.0-beta.1-win-x64.zip.sha256) · [Versiones anteriores](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases)

## Arquitectura

| Área | Responsabilidad |
| --- | --- |
| [Interfaz React](launcher/xmcl-react-ui) | Vistas del launcher, consola y asistentes. React, TypeScript y Vite. |
| [Cliente del renderer](launcher/packages/renderer-client) | Consumo de servicios, estados y tareas. |
| [Proceso principal de Electron](launcher/xmcl-electron-app) | Ventanas, puente IPC, actualizador y empaquetado de Windows. |
| [Runtime](launcher/xmcl-runtime) y [contratos](launcher/xmcl-runtime-api) | Instancias, Java, cuentas, instalación y lanzamiento de Minecraft. |
| [Proxy de CurseForge](services/curseforge-proxy/README.md) | Worker de Cloudflare que guarda la clave de CurseForge y restringe las peticiones. |

La interfaz Vue anterior sigue en el repositorio como referencia de compatibilidad. [Alcance funcional de Grimo](docs/react-migration/PARITY.md) · [Validación de la versión](docs/react-migration/STAGE9-VALIDATION.md).

## Desarrollo

Usa Node.js **22.16 o posterior** y **pnpm 11.10.0**. Ejecuta estos comandos desde `launcher/`.

```powershell
pnpm install --frozen-lockfile
pnpm dev:renderer
```

En una segunda terminal, también desde `launcher/`, ejecuta `pnpm dev:main`. El servidor de Vite escucha en `http://localhost:3000`.

| Tarea | Comando |
| --- | --- |
| Comprobar tipos y lint | `pnpm check` y `pnpm lint` |
| Ejecutar pruebas unitarias | `pnpm exec vitest run` |
| Ejecutar pruebas de Electron | `pnpm test:e2e:ci` |
| Compilar los paquetes de Windows | `pnpm build:renderer` y `pnpm build:all` |

[Guía de contribución](launcher/CONTRIBUTING.md) · [Flujo de publicación](.github/workflows/release.yml) · [Reportar un problema](https://github.com/Jeremy-Godoy-D/Launcher-MC/issues)

## Licencia y créditos

Grimo Launcher se distribuye bajo la licencia MIT. Lo mantiene Jeremy Godoy y parte de [X Minecraft Launcher](https://github.com/Voxelum/x-minecraft-launcher). Consulta la [licencia](LICENSE), los [avisos](NOTICE) y las [licencias de terceros](launcher/THIRD_PARTY_NOTICES.txt).

Minecraft es una marca de Mojang. Grimo Launcher es un proyecto independiente, sin afiliación con Mojang ni Microsoft.
