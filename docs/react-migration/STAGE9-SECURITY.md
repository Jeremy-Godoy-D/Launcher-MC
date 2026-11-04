# Etapa 9 — seguridad de dependencias y paquete

La auditoría `pnpm audit --prod --json` registró 36 avisos del workspace. El grafo de bytes de Electron y React identificó siete dependencias afectadas que sí contribuían a la distribución. Se actualizaron Undici, Zod, Intlify, Markdown-it, js-yaml, smol-toml y MSAL Node. Vite también se corrigió para el entorno de desarrollo. Microsoft sigue pospuesto. El proxy de CurseForge continúa siendo la única ruta de ese catálogo.

La revisión posterior del workspace conserva nueve avisos (siete altos, dos moderados) sobre PostCSS, Nano ID, fflate, Immutable, Source Map JS y Vue Server Renderer. El grafo emitido y las entradas de dependencias del ASAR no incluyen las versiones afectadas. El resultado de auditoría del workspace sigue siendo distinto de cero. Se conservan ambos resultados en los artefactos ignorados.

La inspección encontró una clave privada fija del servidor local Yggdrasil en el ASAR. Se sustituyó por claves RSA generadas de forma asíncrona y bajo demanda en cada proceso. Se conserva el algoritmo de firma de texturas del protocolo y la respuesta con la clave pública correspondiente. El caso focal verifica la firma real sobre el perfil local y conserva la ausencia de consultas a Peer.

La reconstrucción pasó `pnpm check`, `pnpm lint` y el grafo de Electron. Se ejecutaron 135 pruebas en 17 archivos sobre i18n, catálogo, Forge, ajustes, cuentas, proxy y actualizador, más la prueba de firma tras el último cambio. Las 12 pruebas del Worker también pasaron. La inspección final local de 63 entradas de texto del ASAR obtuvo cero coincidencias de tokens GitHub, material de clave privada PEM o claves con el formato de CurseForge. El paquete contiene las cinco atribuciones y las tres entradas React previstas.

La revisión se limita a la candidata local. Quedan la identidad del paquete de GitHub, la ejecución real de juego y actualización, la medición final y el cierre de los gates de la etapa 9.

Referencias de los cambios de seguridad de [MSAL Node](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5), [smol-toml](https://github.com/advisories/GHSA-r4xh-jqrq-34v2), [Intlify](https://github.com/advisories/GHSA-83rm-6c8r-g728) y [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
