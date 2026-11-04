# Etapa 9 — validación antes de publicación

[CI 41778674557](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41778674557) aprobó `08b074de2722a0d673495645a035cb2300ee89dd`. Pasaron 1.526 unitarias de 157 archivos, 11 pruebas de los harnesses, tipos y lint del producto, builds y grafos de Electron/DeskGap. El ejecutable empaquetado aprobó 316 casos sin reintentos. Dos recorridos de pack con red pública son optativos y tienen evidencia de ambas fuentes en etapa 5. La prueba separada del cliente React en Strict Mode también pasó. Los diagnósticos TypeScript de las fixtures E2E son los mismos 56 de referencia.

El borrador se empaquetó desde `5bfffc8` y la diferencia hasta `08b074d` contiene la corrección de la fixture del actualizador y documentación. No cambia el código del producto. La prueba 100 pasó tanto en el CI integral como sobre el ZIP descargado. Se revisaron capturas reales de Inicio a 1200×720 y del panel de tareas a 800×400, con las acciones alcanzables. La cobertura visual y de accesibilidad por área se conserva en los informes de etapas anteriores.

- [Juego, catálogos y actualizador](STAGE9-LIVE.md). Minecraft 1.21.1 abrió en Vanilla, Fabric, Forge, NeoForge, Quilt, OptiFine y LabyMod. El Java 21 necesario se instaló en los perfiles de prueba. Se comprobaron catálogos reales, descarga verificada y el helper de actualización con archivos ASAR reales en una carpeta aislada.
- [Instalador y artefactos](STAGE9-INSTALLER.md). NSIS limpio y sobre beta.2, ZIP beta.3 y ZIP candidato, perfil, ajustes, selección, mundo, accesos y hashes. El EXE del borrador coincide con el probado en Actions.
- [Rendimiento](STAGE9-PERFORMANCE.md). Presupuestos cumplidos en Windows de referencia y pausa de 60 segundos con el juego abierto. Las mediciones corresponden al ASAR del borrador.
- [Seguridad](STAGE9-SECURITY.md). Parches de dependencias emitidas, firmas locales con clave generada y revisión del mismo ASAR. Las atribuciones adicionales se comprobaron en los artefactos finales.

Todos los criterios de paridad conservados y de retirada están aprobados. Microsoft queda pospuesto. La aplicación y las instalaciones de prueba mantuvieron perfiles aislados. Este informe acepta las condiciones anteriores a la publicación. La disponibilidad pública, el tag y sus enlaces se verifican después de publicar.
