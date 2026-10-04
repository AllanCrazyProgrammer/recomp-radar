# Verificación de Recomp Radar · biblioteca · 4 octubre 2026

## Mejora verificada en local

- 25 pruebas de dominio: las 8 anteriores y 17 nuevas de semver, fechas, tags arbitrarios, preliminares, ausencia de versión/release, comparación pendiente, ediciones sin falso aviso, exclusión de commits/PR, biblioteca Pikmin y validación JPG/PNG.
- 36 comprobaciones HTTP contra el Worker compilado con D1/R2 locales: marcar/cambiar/quitar instalada, manual conocida/desconocida, rechazo de commits y juegos no seguidos, JPG/PNG, bytes persistidos, MIME falso/SVG/archivo grande rechazados, origen 403, acceso 401, sustitución/borrado y aislamiento de dos usuarios.
- Marca instalada y bytes de portada conservados tras detener y reiniciar el Worker local; readback verificado y marcas de esos fixtures retiradas.
- Migraciones aditivas 0001 y 0002. Antes/después: 2 fuentes, 349 eventos, 1 lectura conservados exactamente. Agregan installations, game_covers y events.release_tag; no modifican ni eliminan los datos previos.
- UI real con repositorio público Nectar: 18 releases capturadas con fecha fuente. Marcar 0.9.1 produjo el badge discreto a 0.9.2; abrirlo no cambió instalada; marcar 0.9.2 quitó el badge. Atrás funciona. Marca y portada sobreviven a recarga, quitar marca/portada funciona.
- QA en 390×844, 320×780 y escritorio 1280×900. Document/main 390 y 320 px respectivamente; sin overflow horizontal. Portada privada decodificada a 400 px de ancho. Sin errores de consola de navegador. Apertura muestra caché de inmediato y consulta GitHub en segundo plano; las respuestas antiguas no pisan snapshots de operaciones más recientes.
- Capturas de QA: /tmp/recomp-radar-library-card-mobile.jpg, /tmp/recomp-radar-library-mobile.jpg y /tmp/recomp-radar-library-desktop.jpg. Corresponden a la cuenta local ficticia, no a instalación o portada declarada por Allan.
- Pruebas locales no siembran datos de usuario en producción. No se instalaron juegos, pidieron push ni enviaron avisos externos. La tarea existente no se altera.

## Límites de la mejora

La tarjeta es por repositorio; no fusiona automáticamente varios repos de un juego. Estables comparan estables; preliminares generan aviso si la instalada se marcó preliminar. Tags no semver requieren fecha conocida; una marca manual desconocida muestra comparación pendiente. Las fechas de edición/detección no hacen una versión nueva. Versiones fuera de la ventana de 20 releases guardadas pueden faltar; existe entrada manual. Portadas solo JPG/PNG, 2 MiB, 4096 px por lado, sin SVG/GIF/WebP. El endpoint privado usa identidad de visitante y R2 sin URL pública.

La validación de portada y marca con usuario se hizo en local. La publicación se confirma mediante la versión y respuesta de despliegue nativas; un resultado de despliegue no equivale a haber subido una portada de Allan en producción. Conservar su acceso privado y datos.

## Evidencia de fondo del 4 de octubre

GET /api/background a las 00:18:04 UTC mostró background-last-run y last-sync iguales a 2026-10-04T00:13:52.273Z, sin errores, 0 añadidas/0 cambiadas y repositorio Pikmin consultado. El registro anterior era 23:13:04.435Z. Solo el writer de fondo escribe background-last-run; el refresco de la interfaz no lo escribe. Es consistente con una ejecución horaria, unos 68 segundos antes del horario nominal; la API de Sites no expone historial ni estado succeeded del programador. No se ejecutó POST durante estas comprobaciones.

---

# Verificación de Recomp Radar · 3 octubre 2026

## Resultado local

- Compilación Worker de producción exitosa: `/`, `/api/radar`, `/api/background`.
- TypeScript `tsc --noEmit` exitoso.
- 8 tests de dominio exitosos: entradas GitHub, URLs inválidas, estados release/commit/PR, impacto desconocido, huellas de revisión, leído/deduplicación, backoff 403/429 y exclusión de artefactos automáticos del contexto.
- Migración D1 local aplicada correctamente (5 tablas y un índice).
- 13 comprobaciones de API real: acceso 401, origen 403, entrada y duplicado 400, inexistente público 404, leído guardado y persistente, deduplicación, organización de 6 repos, prioridad y aviso de cobertura parcial.
- API pública devolvió 349 eventos de prueba: 47 releases, 152 commits, 150 PR. Zelda64Recomp inicialmente devolvió 67 (7/30/30). Las consultas repetidas devolvieron 0 añadidos y 0 editados.
- Navegador: escritorio, 390×844 y 320×780. Documento y app de 320px en viewport320; sin desbordamiento horizontal. Consola sin errores.
- Flujo UI: estado vacío, inicio de sesión local simulado, error de URL, seguimiento real, filtros de tipo/juego, filtro sin coincidencias y marcado leído tras recarga.
- Datos de prueba permanecen solo en D1 local; no se han sembrado fuentes ni noticias en producción.

## Publicación y acceso

El Site privado se registró una sola vez:

- ID: `appgprj_6ac17a4e00d48191b241e9e167e5a20b`
- URL reservada: `https://recomp-radar-allan.allanreyy.chatgpt.site`

Publicación privada confirmada con estado succeeded. Tras la autorización específica del usuario, se renovó únicamente la credencial efímera de fuente del mismo Site, mantenida en memoria. Push y versión publicada verificadas. URL servida con HTTP 200 mediante acceso de servicio existente. El navegador anónimo muestra la puerta privada y el inicio de sesión lleva a auth.openai.com; no se completó una sesión de Allan porque el navegador no está autenticado, ni se ingresaron credenciales. La API personal devuelve HTTP 401 con acceso de servicio sin identidad de visitante, respetando separación de permisos.

Actualización del 4 de octubre de 2026, 04:57:50 UTC: repositorio privado [AllanCrazyProgrammer/recomp-radar](https://github.com/AllanCrazyProgrammer/recomp-radar) creado desde la sesión existente de Chrome. Código cargado mediante el conector GitHub autorizado, commit 1bec8f6f7c0f8d36783c19fa0bee23cf5f2c75c0, árbol 82104fc7dafb99b4e699cb893420919ac5e150db: 146 archivos con SHA y modo idénticos a la fuente publicada 8bb947a9c2e2fb3872f5fef16e159d35e1ba2095; se excluyó solo tsconfig.tsbuildinfo generado. Lectura posterior confirmó main en ese commit y visibilidad privada. Después se actualizó únicamente la documentación del repositorio para reflejar este resultado. No se usaron contraseñas, renovaron credenciales GitHub ni crearon tokens persistentes. No se tocaron los otros checkouts, el Site ni Library v3.

## App cerrada

Sites creó una tarea propia vinculada, enabled, ID Automation_ccff6f9a1a9c819180c36a803b28ec39: cada hora desde el 3 de octubre de 2026 a las 23:15 UTC. get_site confirmó su vínculo y horario. El writer privado POST /api/background y GET de lectura se probaron desde hosting mediante el acceso de servicio existente y el mismo timestamp persistió en D1. La ruta de comprobación privada obtuvo 7 releases reales Zelda64Recomp desde GitHub; dos consultas devolvieron el mismo cacheCheckedAt y cuota 46/60, mostrando persistencia y caché. El writer no tenía fuentes de usuario todavía: no se sembraron fuentes de Allan. La preparación y la tarea guardada están verificadas; En esa primera entrega todavía no se había observado un ciclo del programador; la evidencia posterior está documentada arriba. La QA con identidad de Allan en el navegador de pruebas no se completó. No prometer cada evento instantáneamente, email, push ni avisos de dot. El prompt pide actualización silenciosa y respeta cuota/cobertura.

## Límites de cobertura

12 fuentes, 6 repos/ciclo; primero repos individuales y prioridad dentro de grupos. Organizaciones: los 6 repos públicos no archivados ni forks con push reciente de la primera página de 100. Por repo: 20 releases, 30 commits de rama por defecto, 30 PR por actualización; feed500. No garantiza historia completa ni cada cambio de períodos largos. Caché30min; manual5min. GitHub público normalmente60req/h/IP, cuota y reinicio reales visibles.

El contexto es determinista por texto, evidencia y enlace; no hay IA generativa ni medición de FPS, compatibilidad o instalación. Fechas fuente separadas de captura/edición; primera captura es historial.
