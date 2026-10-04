# Cuenta y amigos · implementación local pendiente de publicación

La autenticación pertenece a Sites/ChatGPT. Los handlers usan `getChatGPTUser()` y el ID de visitante estable de este Site. No se añaden contraseñas, OAuth, tokens ni proveedores. `/api/account` devuelve únicamente la identidad de la sesión actual, sin correo/nombre; un token de servicio no sustituye esa identidad.

`#amigos` permite crear un alias permanente, activar u ocultar descubrimiento, buscar por alias exacto, enviar/cancelar/aceptar/rechazar solicitudes, retirar amistad y bloquear/desbloquear. El alias se normaliza a minúsculas, tiene 3–24 caracteres ASCII y es único. Un perfil no es necesario para usar la biblioteca. El descubrimiento comienza desactivado; cada usuario decide activarlo. Una amistad aceptada permite consultar los nombres y repositorios de los juegos seguidos por ambos usuarios. No concede acceso al Site. No se muestran correos, IDs internos de otras cuentas, versiones instaladas, portadas personales ni actividad.

La migración 0004 crea cuatro tablas nuevas e índices; no altera ni borra datos previos. Un par canónico admite una sola relación. El solicitante no puede aceptar su propia solicitud; las solicitudes cruzadas siguen pendientes hasta aceptación explícita. Cada transición utiliza una versión y SQL condicional, evitando que un comando antiguo actúe sobre una solicitud nueva. Los reenvíos no duplican relaciones. Bloquear cierra la relación en la misma transacción y evita búsqueda y solicitudes en ambas direcciones. Desbloquear no restaura solicitudes o amistades.

Las búsquedas son exactas, sin directorio, prefijos ni comodines, limitadas a 20/minuto y 100/hora por identidad. Escrituras: 20/minuto y 100/hora. Los contadores persisten en D1. Máximo 100 relaciones pendientes/aceptadas y 100 bloqueos por cuenta. Los writes requieren Origin exacto, JSON y cuerpo de máximo 2 KiB. Las respuestas personales no se cachean.

## Tarea horaria: bloqueo previo a publicar

La implementación anterior de `/api/background` llamaba `refresh()` sin usuario. Ahora toda consulta de usuario está acotada explícitamente; el resumen de sincronización usa `last-sync:<userId>`. El resumen histórico global solo se muestra al propietario configurado explícitamente. Las bibliotecas y portadas conservan su ownership existente.

El token de servicio de Sites se consume en hosting y no proporciona identidad de visitante. El servicio debe tener `BACKGROUND_OWNER_USER_ID`, cuyo valor exacto sea el ID del visitante Sites del propietario. No se deduce de correo, ID de cuenta de Sites, primera fila, primer usuario ni alias. Sin configuración, el endpoint de servicio falla de forma visible con 409; no consulta todas las cuentas. No publicar esta versión completa sin resolverlo, para conservar la tarea existente.

La consulta read-only actual de runtime no tenía variables configuradas (revision 0). El API de Sites y su documentación no proporcionaron un mapeo autoritativo entre propietario de cuenta y visitante del Site. Paso de coordinación necesario:

1. Revisar y, con autorización explícita posterior, servir primero solo el diagnóstico `/api/account` conservando el writer de fondo existente y la audiencia privada actual. Este endpoint todavía no existe en la versión actualmente publicada.
2. En la sesión autenticada del propietario, leer `/api/account` y verificar su `userId` devuelto por hosting. No usar una identidad de servicio o cuenta inferida.
3. Aprobar y configurar únicamente `BACKGROUND_OWNER_USER_ID` con ese valor; no es una contraseña ni un token. La tarea y acceso privado permanecen iguales.
4. Revisar y aprobar la versión completa, aplicar la migración al publicar y confirmar un ciclo de la tarea. No ampliar audiencia sin destinatarios y decisión explícitos. Antes de cualquier cambio a público, sustituir la dependencia de frontera privada por autorización de servicio apropiada.

No se modificaron runtime, audiencia, automatización, Git remoto ni publicación durante esta implementación.

## Entorno local habilitado · 4 oct 2026

Tras autorización directa del usuario se aplicaron los 22 archivos al checkout, preservando sus cambios. La migración 0004 se aplicó después únicamente a la base local de desarrollo, con respaldo SQLite previo y verificación de que todos los registros anteriores permanecieron idénticos. No se creó un alias ni se activó descubrimiento automáticamente.

Se verificó la identidad de la sesión local mediante `/api/account` y se guardó `BACKGROUND_OWNER_USER_ID` en `.env.local`, excluido de Git. Esa identidad pertenece al inicio de sesión simulado de desarrollo; la configuración publicada aún requiere verificar la identidad real del propietario conforme al procedimiento anterior.

El servidor local está en `http://127.0.0.1:5173/`, con Amigos en `#amigos`. El endpoint real de Amigos respondió 200 con perfil vacío y 401 sin sesión. Una ejecución del endpoint de fondo respondió 200, consultó exclusivamente los dos repositorios de esa cuenta, sin errores ni cambios de historial, instalaciones, portadas o fuentes. La migración, el respaldo y los resultados están en `.sites-runtime/local-friends-setup/`. Esto verifica los endpoints en el Worker de desarrollo; no implica QA visual móvil ni validación de dos sesiones reales en hosting.

No se subió ni publicó esta versión; tampoco se modificaron configuración, audiencia o tarea horaria del Site publicado.

## Verificación reproducible

Desde el checkout con sus dependencias existentes:

```
node --experimental-strip-types --test tests/*.test.ts
node tests/friends-api.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next
node scripts/run-framework.mjs build
```

`friends-api.mjs` crea un directorio temporal, SQLite sintético y un bundle de handlers con identidad/D1 simulados. No abre sockets, toca bases reales ni llama a GitHub. Comprueba CSRF/401/formato/tamaño, dos cuentas, privacidad de bibliotecas/portadas, identidad propia, scope de servicio, persistencia al reabrir SQLite y conservación de los datos anteriores. Las pruebas unitarias cubren carreras aceptar/cancelar, aceptar/bloquear y enviar/bloquear; versiones ABA, duplicados y solicitudes cruzadas.

La UI conserva el diseño clásico; navegación móvil ajusta filas y los formularios tienen etiquetas. La QA local de Amigos en escritorio, 320 y 390 px y el Worker compilado se verificaron con dos cuentas ficticias tras la autorización posterior del usuario (véase VALIDATION.md). Las pruebas no sustituyen la validación con dos identidades reales en hosting ni una evaluación auditiva de los sonidos.

## Dónde se guardan los datos

La base D1 (`DB`) guarda fuentes, historial público capturado, versiones instaladas, metadatos de portadas, alias, solicitudes, amistades, bloqueos y límites. Cada biblioteca y registro social privado se consulta por identidad de usuario; una amistad aceptada permite ver únicamente los nombres y repositorios de los juegos seguidos. Las imágenes se guardan en R2 (`BUCKET`). La app recibe la identidad de Sites/ChatGPT y no almacena contraseñas de ChatGPT.

En desarrollo, D1 y R2 persisten bajo `.wrangler/state/`; D1 utiliza SQLite en `v3/d1/` y R2 el almacenamiento local de `v3/r2/`. El entorno publicado usa los recursos Cloudflare vinculados al Site. Son bases separadas: publicar código no copia los registros locales. Las pruebas de dos cuentas usan únicamente `.sites-runtime/friends-qa/state/`, con datos ficticios.

## Radar de cada amigo · 4 oct 2026

En Mis amigos, «Ver radar» abre una lista de juegos con nombre y enlace al repositorio. `GET /api/friends?radar=<publicId>` verifica amistad aceptada y ausencia de bloqueo en una sola consulta SQL junto con las fuentes. Un perfil oculto sigue siendo visible para sus amigos existentes. Solicitudes pendientes, cuentas ajenas, amistad retirada o bloqueada y IDs inválidos reciben 404; sin sesión, 401. La respuesta contiene solo perfil público y juegos, con caché privada/no-store. No consulta GitHub, no expone IDs internos, instalaciones, claves R2 ni actividad.

Los repos individuales usan el nombre elegido por el propietario; las organizaciones expanden los repos ya capturados, con límite por fuente y deduplicación. Los datos se consultan al abrir el panel; «Actualizar amigos» lo cierra y vuelve a comprobar las relaciones. Un bloqueo o retirada realizados en otra sesión se hacen efectivos en la siguiente consulta al servidor, sin mecanismo de notificación en tiempo real. No se requiere otra migración.
