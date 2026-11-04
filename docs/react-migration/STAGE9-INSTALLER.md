# Etapa 9 — instalador Windows y artefactos del borrador

[Actions 41778557338](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41778557338) aprobó el candidato `5bfffc8fa23202f44ada32be8dea2b1ff97cd1e3` en Windows desechable. El instalador público de beta.2 se descargó y verificó antes de ejecutarlo. El recorrido instaló beta.2 en una ruta temporal, creó un perfil local, guardó una selección y ejecutó la nueva instalación sobre la misma ruta. React conservó el perfil, la selección, la RAM configurada, la ubicación de datos y el hash del mundo. Los dos accesos directos apuntaron al ejecutable instalado. Después de desinstalar el programa de prueba se instaló el mismo EXE desde cero y apareció el onboarding.

El mismo job aprobó el arranque ASAR con una solicitud de Undici, la compatibilidad del ZIP público beta.3 y la consulta real al proxy de CurseForge. El ASAR y el recurso de licencias instalados coincidieron con sus hashes del build. La prueba corrió sin reintentos y sin usar la instalación habitual.

El ZIP del borrador se descargó con sus archivos `.sha256` y `manifest.json`. Se verificaron el hash descargado del ZIP, los digests de GitHub y la suma del EXE probado en el runner. El manifiesto declara `0.3.0-beta.1`, React y Electron `43.5.0`. La extracción en un directorio de prueba produjo el mismo ASAR y recurso de licencias del instalador.

| Archivo | SHA-256 |
| --- | --- |
| `GrimoLauncher-0.3.0-beta.1-win-x64.exe` | `02c690cd4f52cabe770306737849abdca54db9a82e6bf51af9c05756f1aa7995` |
| `GrimoLauncher-0.3.0-beta.1-win-x64.zip` | `57b7970f31318f217c4739d13d0c320be8f411f79142a7918a2290aec9e72bfc` |
| `resources/app.asar` | `3852997d060b81bf06a32f82a733956878778b3101b277a32fe0b2ba3ab632e7` |
| `resources/THIRD_PARTY_NOTICES.txt` | `bc96f5a49f77eaa208121ff0be67b9211db8dcb05dd131db9f9c464b4160ee9b` |
| Mundo de la prueba | `64a6aa34f32114554d643c48bbaeb736aa6e5406500467a719ddbf7cfba34479` |

El ASAR coincide también con el ejecutable local `4affc8d` que se usó para la auditoría y las mediciones. El archivo de atribuciones conserva los avisos anteriores y añade los textos de licencia para las dependencias emitidas de React y las nuevas versiones de runtime. Los artefactos `stage9-nsis-final-ci` y `stage9-final-draft` conservan el informe y las verificaciones fuera del repositorio.

Esta transición usa el instalador completo. Los archivos del borrador carecen de firma Authenticode y no ofrecen un delta ASAR para versiones anteriores. La comprobación pública de los enlaces se realiza al publicar.
