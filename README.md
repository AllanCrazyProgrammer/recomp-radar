# Recomp Radar

App privada en español para Allan. TypeScript, React/Vinext, Cloudflare Workers, D1 y R2, publicada con Sites. Diseño original inspirado en Windows y Frutiger Aero; gráficos e iconos SVG sin recursos de terceros.

## Comportamiento real

- Añade repositorios públicos por URL u owner/repo, u organizaciones por nombre/URL.
- Biblioteca por juego con navegación a releases y actividad separada. Pikmin se presenta como Project Nectar para el repositorio seguido existente; no se añade ninguna fuente automáticamente.
- D1 guarda fuentes, prioridad, historial, leído y la versión instalada por usuario/juego entre dispositivos de la misma cuenta de ChatGPT.
- Marcar, cambiar o quitar la versión instalada es explícito. Aviso discreto de nueva versión enlazado al detalle de la release con explicación, fecha y fuente.
- Si se conoce la release instalada, se exige una publicación posterior; si ambas etiquetas son semver, además debe ser una versión superior. Tags arbitrarios se ordenan por fecha, nunca alfabéticamente. Una etiqueta manual semver puede compararse sin fecha conocida; otras etiquetas manuales quedan pendientes hasta tener una release conocida. Una edición de la misma release o un commit/PR no genera este aviso.
- Las instalaciones estables comparan releases estables. Las preliminares se ven por separado y generan aviso solo cuando se marca una preliminar instalada.
- Portada propia desde el dispositivo: JPG/PNG de hasta 2 MiB y 4096 × 4096 px. Cambio y borrado. Archivos en R2 privado; metadatos por usuario/juego en D1. MIME y firma raster validados, SVG rechazado. GET de portada exige la identidad del propietario del archivo. No hay búsqueda ni descarga de portadas externas.
- Releases, commits y PR tienen estados separados. Las revisiones de notas, archivos y estados vuelven a quedar sin leer.
- Clasificación determinista por texto fuente: rendimiento, compatibilidad, instalación y jugabilidad. No usa IA ni afirma mejoras que no haya verificado. Siempre muestra evidencia, fecha y enlace original.
- Consulta al abrir, volver a una pestaña y cada 30 minutos si está abierta. Refresco manual. Nunca solicita push.
- API GitHub pública sin token ni secretos. Caché 30 minutos (5 minutos para refresco manual), ETag y backoff 403/429 con Retry-After y rate-limit-reset. Cuota real visible.

## Límites

Máximo 12 fuentes y 6 repositorios por ciclo. Repositorios individuales primero; prioridad dentro de cada grupo. Una organización usa los 6 repos activos, públicos, no forks y no archivados con push más reciente de la primera página (100). Captura por repositorio: 20 releases, 30 commits de rama por defecto, 30 PR actualizadas; no es una auditoría completa ni permite recuperar todo cambio de períodos largos. Feed de hasta 500 registros; para la biblioteca se consultan además hasta 20 releases guardadas por juego, independientes de ese límite de actividad. La primera captura trae historial y muestra fecha original. No verifica FPS, compilaciones, ROMs ni instalación.

La cuota pública normalmente es 60 peticiones/hora por IP y puede compartirse con otras aplicaciones. Un fallo conserva el historial. La cobertura parcial y los errores se muestran. Sin tareas del servidor activadas y verificadas no hay seguimiento garantizado con app cerrada, email o push.

## Desarrollo

Node 22.13+.

```sh
npm install
npm run db:generate
npm run dev
```

D1 local: aplicar SQL generado con Wrangler (`--local`, config de la compilación). Sites aplica las migraciones al publicar. No crear tablas desde solicitudes. El starter provee identidad simulada en local; producción usa la autenticación y acceso propietario de Sites.

```sh
node --experimental-strip-types --test tests/domain.test.ts tests/library.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Conservar integración `sites()` y `.openai/hosting.json`. Nunca guardar credenciales en el proyecto. `/api/background` confía en la frontera owner-private de Sites; antes de cambiar audiencia añadir autorización de servicio independiente. Toda operación de `/api/radar` autoriza identidad del visitante. Las consultas GitHub son solo lectura. El repo GitHub del usuario está pendiente si la conexión no permite crear repositorios.

## Fuentes oficiales

- https://docs.github.com/en/rest/releases/releases
- https://docs.github.com/en/rest/commits/commits
- https://docs.github.com/en/rest/pulls/pulls
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- https://github.com/Zelda64Recomp/Zelda64Recomp
- https://github.com/HarbourMasters

## Publicación y verificación

Site existente: https://recomp-radar-allan.allanreyy.chatgpt.site, propietario-privado, ID appgprj_6ac17a4e00d48191b241e9e167e5a20b. Conservar audiencia y la tarea horaria existente; no crear otra. Se observó un ciclo de fondo persistido el 4 de octubre de 2026 a las 00:13:52.273 UTC, sin errores. Sites expone la definición habilitada, pero no historial de ejecución con estado succeeded; la atribución al programador se basa en el writer y el intervalo horario.

El aviso de versión es in-app, sin email, push ni avisos de dot. Los límites de cuota/cobertura siguen aplicando. El repo GitHub privado del usuario permanece pendiente por la limitación de creación/autenticación ya documentada. No modificar credenciales GitHub.

Las pruebas API con dos usuarios se ejecutan solo en el Worker local compilado, usando cabeceras que simulan identidad de Sites. `tests/seed-library.sql` contiene datos ficticios y nunca es una migración ni debe aplicarse en producción. Ver `tests/library-api.mjs` (36 comprobaciones) y `tests/library-persistence.mjs` (preparar, reiniciar servidor, verificar). La vista local autenticada usa la identidad ficticia local_seedy. Las portadas de fixtures son imágenes generadas de prueba, no portadas oficiales. Consulta VALIDATION.md para resultados y límites.
