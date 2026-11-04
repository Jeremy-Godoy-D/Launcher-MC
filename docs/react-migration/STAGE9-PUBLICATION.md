# Publicación de Grimo Launcher v0.3.0-beta.1

[PR 4](https://github.com/Jeremy-Godoy-D/Launcher-MC/pull/4) quedó integrado en `main` con el merge `0dd571ffeba85346577ef5a77f117c648b4bc003`. El release [v0.3.0-beta.1](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/tag/v0.3.0-beta.1) se publicó como prerelease el 2026-11-04 a las 05:52:23 UTC. El tag apunta al commit empaquetado y probado `5bfffc8fa23202f44ada32be8dea2b1ff97cd1e3`. El CI integral aprobado corresponde a `08b074de2722a0d673495645a035cb2300ee89dd`, que conserva el mismo producto.

Se comprobó sin autenticación que el feed público de actualizaciones ofrece la beta nueva. Las URLs de navegador del EXE y el ZIP responden `206 application/octet-stream` a una lectura parcial. Las firmas de formato fueron `MZ` y `PK`, respectivamente. Los sidecars públicos coincidieron con los digests de GitHub y con los archivos aprobados en [STAGE9-INSTALLER.md](STAGE9-INSTALLER.md). El registro local `stage9-public-release.json` tiene SHA-256 `cdcc773a6eacf5b572a2f2f8c18402297848e5526c645751fb2a91bf9d2c8646`.

La transición usa el instalador completo y conserva los datos. [Beta.2](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/tag/v0.2.0-beta.2) sigue disponible para recuperación. El proxy de CurseForge pasó la prueba del release. Microsoft sigue pospuesto. Los binarios carecen de firma Authenticode.
