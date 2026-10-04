# Verificación del tema clásico · 4 octubre 2026

- Referencia visual: imagen aportada por el usuario (escritorio Windows clásico). Fondo #008080, barra #000080, paneles #c0c0c0, bordes claros/oscuros y tipografía pixelada comprobados en el navegador. Tema completo en biblioteca, novedades, juego, comparación, detalle de release, descargas, formularios, estados vacíos/errores y ayuda.
- Distribución preservada: components/radar.tsx, components/release-tools.tsx, hooks/use-radar.ts, app/globals.css y lib/radar.ts idénticos por SHA-256 a la fuente publicada anterior 3210339733dd58d6f72d22e7887cdb58dea36c7f. La capa CSS nueva modifica presentación; mantiene grids, navegación, orden de secciones y puntos de adaptación.
- TypeScript aprobado tras los cambios de iconos. La fuente Pixelify Sans y su licencia OFL están incluidas en public/fonts; no depende de un servidor de fuentes externo.
- QA con biblioteca local real: navegación entre biblioteca/novedades/juego, comparación V0.1.3→V0.1.5, filtro de descarga Windows, búsqueda sin coincidencias, diálogo y rechazo de una URL ajena a GitHub. No se añadieron fuentes ni se cambiaron instalaciones/portadas en las pruebas.
- Escritorio 1280 px, móvil 390 px y 320 px: documento del mismo ancho que viewport. En 320 px todas las pestañas llegan como máximo al borde de su contenedor (302 px), sin recorte. Detalle de release y comparación a 390 px sin desbordamiento. Diálogo móvil de 320 px cabe en el viewport. Consola de navegador sin errores ni advertencias.
- Evidencia en outputs/retro-library-desktop.png, retro-feed-desktop.png, retro-comparison-desktop.png, retro-library-mobile.png y retro-dialog-mobile.png.

---

# Verificación de las cinco mejoras · 4 octubre 2026

- 57 pruebas de dominio/sincronización/extracción aprobadas; TypeScript y ESLint aprobados. Los nuevos casos cubren plataformas, URLs ajenas, archivos incompletos, tags escapados, comparación acumulada, tags V mayúscula, otra fuente con misma etiqueta e invalidación de resúmenes al editar notas.
- 24 resúmenes en español revisados a partir de notas públicas capturadas, protegidos por huella del cuerpo. Los nuevos textos o ediciones muestran extractos originales hasta su revisión; no hay traducción automática.
- QA con biblioteca real local: Releases seleccionado al abrir; filtro Android en Nectar 0.9.2 muestra solo APK; Conker V0.1.3 → V0.1.5 incluye V0.1.4 y V0.1.5 manteniendo instalada V0.1.5. Portadas visibles cargan correctamente.
- Estado por juego usa checked_at de la caché de releases; se distingue de la última sincronización general. Descargas provienen de la caché existente, sin llamadas GitHub adicionales.
- Comparación móvil a 390 px: documento 390 px, sin desbordamiento horizontal. Evidencia: outputs/all-improvements-comparison.png.
- Comparación limitada a las 20 releases capturadas por juego; no se presenta como historial completo. No se modificaron las instalaciones ni portadas de producción al probar.
- Publicación privada confirmada con estado succeeded a las 2026-10-04T06:13:40Z; fuente 3210339733dd58d6f72d22e7887cdb58dea36c7f, despliegue appgdep_6ac1ee8b4d5081918bd8255a781c8309. URL: https://recomp-radar-allan.allanreyy.chatgpt.site. Compilación de producción aprobada.

---

# Recuperación tras cuota agotada de GitHub

- Diagnóstico de producción: `github-rate` registró remaining=0, limit=60 y reset=1791092242; Conker tenía last_sync=null. El aviso anterior repetía el mismo bloqueo por tipo y usaba UTC.
- Se agregó respuesta estructurada rateLimited/retryAt. La cola espera hasta el reinicio real, sin limitarlo al reintento corto de un bloqueo entre procesos. La UI muestra una sola pausa y hora del navegador.
- Las releases se consultan para todos los repositorios seleccionados antes de commits/PR. Una petición restante ya no se desperdicia con el umbral anterior de tres.
- Las capturas antiguas en caché pueden persistirse durante una pausa; no se modifica su checked_at ni se marca completa la consulta. Los intentos bloqueados enteramente por cuota no alteran la rotación.
- 47 pruebas aprobadas, incluidas cuota cero sin solicitudes HTTP, captura con la última petición disponible, recuperación tras reset, Retry-After como fecha HTTP, caché antigua y prioridad de releases.

---

# Optimización de sincronización · verificación local

- `npm test`: 40 pruebas aprobadas. Se agregaron 10 pruebas de sincronización sobre SQLite con las migraciones reales y 5 de la cola del navegador.
- Fallos parciales: una consulta de commits fallida conserva las releases y permite guardar PR. La fecha de captura original y las revisiones de lectura se conservan; una edición vuelve a quedar sin leer.
- Cobertura: ciclos sucesivos recorren más de seis repositorios, también si una fuente falla. La consulta de una fuente recién añadida se limita a esa fuente y valida que pertenezca al usuario.
- Exclusión: un bloqueo vigente responde `busy` sin duplicar errores. Los bloqueos numéricos anteriores se respetan hasta expirar. El bloqueo nuevo tiene propietario, se renueva durante el ciclo y su liberación no borra un bloqueo ajeno.
- Escrituras: una captura sintética de seis repositorios guarda 480 eventos en 18 lotes de eventos. Repetirla sin cambios realiza cero escrituras de eventos. No se trata de una medición de latencia de producción.
- Interfaz: solicitudes de apertura/visibilidad se agrupan; una fuente nueva permanece en cola y tiene prioridad sobre una consulta general en espera. Los reintentos tienen espera creciente de 3 a 10 segundos y se cancelan al desmontar la vista.
- Navegador contra el Worker compilado, D1/R2 aislados en `/tmp/recomp-radar-sync-qa/state`: se añadió un repositorio ficticio mientras había un bloqueo de 25 segundos. Apareció un solo aviso de espera y se cargó su release automáticamente al expirar el bloqueo, sin volver a pulsar Refrescar. Consola sin errores ni advertencias. Evidencia local: `outputs/sync-automatic-retry.png`.
- `tests/library-api.mjs`: 36 comprobaciones HTTP aprobadas sobre el Worker compilado con identidad ficticia; versiones, portadas, rechazo de entradas y aislamiento entre usuarios siguen funcionando.
- `npm run lint`, TypeScript y compilación aprobados. Las portadas privadas mantienen un `img` autenticado directo, con excepción de lint documentada para evitar un proxy de imágenes.
- Migración 0003: dos índices aditivos para consultas por repositorio/fecha y por repositorio/tipo/fecha. Aplicada en la base aislada de pruebas. Pendiente aplicar al publicar en producción.
- No se publicaron cambios ni se modificaron datos o tareas de producción. Se conserva la frontera privada de Sites para la ruta de fondo.

---

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

## Sonidos, fuentes y cursores · 4 octubre 2026

TypeScript sin errores. En navegador local con Pikmin y Conker se verificaron los dos WAV listos (readyState 4), sin MediaError: un clic llegó al final de 75 ms y escribir speedrun hizo avanzar el audio de teclas de 42 ms. El buscador siguió filtrando correctamente. Silenciar pausó ambos audios y el botón siguió desactivado tras recargar; reactivarlo funcionó. La consola no mostró errores ni avisos.

Fuentes calculadas: título de release 26 px, notas 15 px y pestañas 18 px. CSS seleccionó los tres cursores CUR locales con sus puntos activos. En 320×780 y 390×844, ancho del documento igual al viewport y todas las pestañas dentro de la pantalla, sin recorte interno. Captura de escritorio: outputs/retro-sound-large-type.png. La comprobación de audio se hizo con reproducción DOM, sin evaluación auditiva manual.

## Grabaciones reales de clic y teclado · 4 octubre 2026

Se reemplazaron los tonos sintetizados por grabaciones CC0 de 1j01 (ratón) y bigmonmulgrew (teclado mecánico medio/fuerte). Fuentes, licencia y edición en public/sounds/LICENSE.md. Tres WAV mono a 44.1 kHz, 16 bits; duraciones de 95, 132 y 138 ms; tamaño total 32,296 bytes. Se recortó el silencio inicial de las teclas para responder al escribir.

TypeScript pasó. En el navegador local, las cinco voces estuvieron listas sin MediaError. El clic llegó al final; escribir speedrun activó las cuatro voces rotativas y dejó el resultado correcto. Tras silenciar y recargar, escribir conker dejó las cinco voces pausadas en tiempo cero y el botón desactivado. Reactivación comprobada; consola sin errores ni avisos. La reproducción se comprobó con el estado DOM, sin evaluación auditiva manual.

## Guías por proyecto · 4 octubre 2026

TypeScript pasó. Se comprobó la selección del repositorio exacto sin distinguir mayúsculas; repositorios desconocidos y nombres parecidos no reciben guías ajenas; las rutas fuente rechazan repos inválidos y codifican etiquetas con barras.

En navegador con la biblioteca real local: instalación Pikmin en Windows, actualización Android sin desinstalar y actualización Linux mediante launcher; instalación y actualización Conker macOS con su ruta de datos. Las opciones se mantienen al cambiar pestaña. El detalle de V0.1.5 mostró su guía macOS y pasos con numeración decimal. Flecha derecha cambió Instalación a Actualizar y Home volvió a Versión. En 0.9.1 se mostraron el alcance de la guía 0.9.2 y enlaces separados al README de ambas etiquetas. Consola sin errores ni avisos.

QA a 320×780 y 390×844: documento igual al viewport; todas las pestañas visibles dentro del panel después de corregir su ajuste a varias filas. Capturas: outputs/release-tabs-pikmin.png, outputs/release-tabs-conker.png y outputs/release-tabs-mobile.png. Se verificaron instrucciones y navegación, no se instalaron ni actualizaron juegos.

## Guías automáticas para cualquier repositorio · 4 oct 2026

68 pruebas pasaron, incluyendo 11 casos nuevos de extracción por repositorio, exclusión de instrucciones de desarrollo, comandos Markdown, guías enlazadas limitadas al mismo repo/ref, documentación ausente, caché de 24 horas, peticiones simultáneas deduplicadas, ETag y pausa compartida con conservación de datos anteriores. TypeScript y compilación de producción pasaron.

Se descargaron la release pública v1.2.2 y el README de esa etiqueta de Zelda64Recomp/Zelda64Recomp para validar un tercer proyecto real. Una base local aislada y dos usuarios ficticios verificaron 12 aserciones del endpoint: autenticación, fuente seguida, release capturada del mismo repo, rechazo de commits, etiqueta correcta, extracción de requisitos/Plug and Play y respuesta idéntica desde caché. No se cambiaron los datos de la biblioteca real ni se publicaron los datos de prueba.

En navegador, Instalación mostró requisitos e instrucciones del README de Zelda, y Actualizar extrajo las indicaciones sobre conservación de partidas de las notas originales de esa release. Flecha derecha cambió entre pestañas. En 390×844 y 320×780 el documento midió exactamente el ancho del viewport, sin desbordamiento. Consola sin errores ni advertencias. Evidencia: outputs/universal-guide-zelda-update.png. Los extractos automáticos conservan el idioma original; cuando no hay instrucciones explícitas, se muestran las notas y documentación disponibles, sin inventar pasos. No se instaló ni actualizó ningún juego.

## Autenticación y amigos en local · 4 oct 2026

Se aplicó el paquete de 22 archivos autorizado directamente, con hashes antes/después verificados y respaldo; 174 archivos de código ajenos al paquete conservaron su contenido. Pasaron 79 pruebas unitarias, 65 aserciones de handlers con bindings sintéticos, TypeScript, ESLint, diff check y compilación de producción. No se hizo push ni publicación.

Con autorización posterior se aplicó la migración 0004 a la base local: cuatro tablas sociales nuevas, integridad SQLite correcta y hashes de todos los registros previos idénticos dentro de la transacción. Estado previo: 139 eventos, 2 fuentes, 2 instalaciones y 2 portadas. Respaldo y trazas en `.sites-runtime/local-friends-setup/`.

La identidad de la sesión local se verificó mediante el endpoint `/api/account`; `.env.local` contiene únicamente la configuración local de la cuenta de fondo y está ignorado por Git. En el servidor real de desarrollo, `/api/account` confirmó configuración, `/api/friends` devolvió 200 con perfil vacío y 401 sin sesión, y `/api/background` ejecutó una consulta de fondo con respuesta 200, ambos repositorios de esa cuenta, 0 añadidos, 0 cambios y 0 errores. Fuentes, instalaciones y portadas se conservaron. No se creó un perfil ni se activó descubrimiento. La identidad real y el runtime del Site publicado no se configuraron; QA visual de Amigos sigue pendiente.

## QA de Amigos con dos cuentas ficticias · 4 oct 2026

Con autorización directa para las pruebas, se ejecutó el Worker compilado en loopback con D1/R2 aislados en `.sites-runtime/friends-qa/state/`. Dos proxies locales de prueba asignaron identidades sintéticas distintas; no se copiaron datos ni credenciales reales. La prueba no configura autenticación ni permisos de hosting.

Pasaron de nuevo 79 pruebas unitarias y 65 aserciones de handlers. Otras 19 aserciones HTTP contra el Worker real comprobaron 401, caché privada, rechazo de origen ajeno, persistencia de amistad, ausencia de identificadores internos/correos del otro usuario y separación de fuentes/versiones instaladas, incluso entre amigos.

En navegador se verificaron creación de alias oculto por defecto, búsqueda exacta tras consentimiento, envío/recepción/aceptación, persistencia al recargar, eliminación, rechazo, cancelación, bloqueo en ambos sentidos y desbloqueo sin restaurar amistad. Se comprobó búsqueda móvil. En 1280, 390 y 320 px, el documento midió exactamente el ancho del viewport. Consola sin errores ni avisos. Evidencia: `outputs/friends-desktop.png` y `outputs/friends-mobile.png`; resultados en `.sites-runtime/friends-qa/`.

Los hashes de eventos, instalaciones, portadas, lecturas, caché y las cuatro tablas sociales de la base habitual permanecieron idénticos. La base habitual tuvo actividad independiente de sincronización durante la prueba: cambiaron hashes de fuentes, ajustes y metadatos internos; las fuentes registran sincronización a las 18:42:33 UTC. Las pruebas usaron exclusivamente la base aislada. No se hizo push ni publicación; la validación con dos identidades reales del hosting continúa pendiente.

## Juegos en el radar de amigos · 4 oct 2026

Pasaron 82 pruebas unitarias y 83 aserciones de handlers, TypeScript, ESLint y compilación de producción. Los casos nuevos verifican acceso solo después de aceptación, amigos ocultos, radar vacío, bloqueo en ambos sentidos, retirada, desbloqueo sin restauración, terceros, IDs inválidos, fuentes de organización, deduplicación y rechazo de URLs almacenadas inseguras.

En el Worker compilado con base sintética aislada, el radar devolvió 404 antes de aceptar y para un tercero; tras aceptar devolvió únicamente el juego de la cuenta amiga, campos públicos y caché privada. Tras bloquear volvió a 404. En navegador se comprobó «Ver radar»/«Ocultar radar», el juego de otra cuenta y la desaparición del panel al bloquear. Escritorio y 390/320 px, sin desbordamiento ni errores/avisos de consola. Capturas: `outputs/friend-radar-desktop.png` y `outputs/friend-radar-mobile.png`. No se modificaron datos reales por las pruebas, no hubo push ni publicación y no se validó todavía hosting con identidades reales.
