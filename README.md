# Recomp Radar

App privada en español para Allan. TypeScript, React/Vinext, Cloudflare Workers, D1 y R2, publicada con Sites. Diseño original inspirado en Windows y Frutiger Aero; gráficos e iconos SVG sin recursos de terceros.

## Comportamiento real

- Añade repositorios públicos por URL u owner/repo, u organizaciones por nombre/URL.
- Biblioteca por juego con navegación a releases y actividad separada. Pikmin se presenta como Project Nectar para el repositorio seguido existente; no se añade ninguna fuente automáticamente.
- Novedades abre en Releases. Resúmenes breves en español revisados para las 24 publicaciones actuales de Pikmin y Conker; una huella del texto invalida el resumen si cambian las notas. Las publicaciones nuevas o modificadas conservan extractos originales y su enlace, sin traducción automática ni servicios externos.
- Archivos descargables separados por Windows, macOS, Linux y Android; mods/archivos ambiguos quedan aparte. Se valida el enlace publicado contra repositorio, etiqueta y nombre, reutilizando la caché GitHub sin peticiones adicionales al abrir.
- Comparación acumulada desde la versión instalada o una release elegida: reúne las publicaciones posteriores capturadas, de la más antigua a la más reciente, sin alterar la marca instalada. Cada juego muestra la última consulta de releases y si su actualización está pendiente.
- D1 guarda fuentes, prioridad, historial, leído y la versión instalada por usuario/juego entre dispositivos de la misma cuenta de ChatGPT.
- Marcar, cambiar o quitar la versión instalada es explícito. Aviso discreto de nueva versión enlazado al detalle de la release con explicación, fecha y fuente.
- Si se conoce la release instalada, se exige una publicación posterior; si ambas etiquetas son semver, además debe ser una versión superior. Tags arbitrarios se ordenan por fecha, nunca alfabéticamente. Una etiqueta manual semver puede compararse sin fecha conocida; otras etiquetas manuales quedan pendientes hasta tener una release conocida. Una edición de la misma release o un commit/PR no genera este aviso.
- Las instalaciones estables comparan releases estables. Las preliminares se ven por separado y generan aviso solo cuando se marca una preliminar instalada.
- Portada propia por juego: subida manual de JPG/PNG, o el botón «Buscar portada» en cada juego de la biblioteca y en su ficha. La búsqueda usa el nombre del juego (el de la biblioteca, por ejemplo Pikmin para Project Nectar) y ofrece varias imágenes de Wikipedia y Wikimedia Commons (imagen de la página o del archivo), la vista previa social del repositorio seguido, las imágenes de su README y, si hay coincidencia, la cabecera y la cápsula de Steam. No usa claves de API. La opción elegida se vuelve a localizar en el servidor (el cliente no envía una URL), se descarga, se valida con MIME y firma raster y, si supera 2 MiB o 4096 px, se redimensiona y se convierte a JPG. Se guarda en R2 privado con metadatos en D1 por usuario y juego, igual que una subida manual. Solo se contactan dominios de esa lista (Wikipedia/Wikimedia, GitHub y sus CDN de imágenes, y la CDN de Steam); un redirect hacia otro host se rechaza. SVG y otros formatos se rechazan. GET de portada y la búsqueda exigen la identidad del visitante y un juego seguido.
- Releases, commits y PR tienen estados separados. Las revisiones de notas, archivos y estados vuelven a quedar sin leer.
- Clasificación determinista por texto fuente: rendimiento, compatibilidad, instalación y jugabilidad. No usa IA ni afirma mejoras que no haya verificado. Siempre muestra evidencia, fecha y enlace original.
- Consulta al abrir, volver a una pestaña y cada 30 minutos si está abierta. Refresco manual. Nunca solicita push.
- API GitHub pública sin token ni secretos. Caché 30 minutos (5 minutos para refresco manual), ETag y backoff 403/429 con Retry-After y rate-limit-reset. Cuota real visible. Una pausa de GitHub muestra un único aviso en la zona horaria del navegador y se reintenta al vencer, mientras la pestaña siga abierta. Las releases de todos los repositorios seleccionados se consultan antes de commits y PR; una sola petición restante sigue siendo utilizable. Se pueden recuperar capturas previas de caché durante una pausa, sin declararlas recién verificadas.

## Límites

Máximo 12 fuentes y 6 repositorios por ciclo. Al añadir una fuente se consulta solo esa fuente. Los ciclos generales eligen los repositorios con el intento más antiguo (incluidos los que fallaron), para que todos roten; a igual antigüedad, repositorios individuales primero y prioridad dentro de cada grupo. Una organización usa los 6 repos activos, públicos, no forks y no archivados con push más reciente de la primera página (100). Captura por repositorio: 20 releases, 30 commits de rama por defecto, 30 PR actualizadas; no es una auditoría completa ni permite recuperar todo cambio de períodos largos. Feed de hasta 500 registros; para la biblioteca se consultan además hasta 20 releases guardadas por juego, independientes de ese límite de actividad. La primera captura trae historial y muestra fecha original. No verifica FPS, compilaciones, ROMs ni instalación.

La cuota pública normalmente es 60 peticiones/hora por IP y puede compartirse con otras aplicaciones. Un fallo conserva el historial y los resultados de otros tipos ya capturados: releases, commits y PR se guardan por separado. La interfaz agrupa las solicitudes simultáneas y reintenta automáticamente si hay otro ciclo en curso. El bloqueo se renueva durante la consulta y expira a los 45 segundos si el proceso deja de renovarlo. Los eventos se escriben en lotes por tipo y las capturas idénticas no reescriben eventos. La cobertura parcial y los errores se muestran. Sin tareas del servidor activadas y verificadas no hay seguimiento garantizado con app cerrada, email o push.

## Desarrollo

Node 22.13+.

```sh
npm install
npm run db:generate
npm run dev
```

D1 local: aplicar SQL generado con Wrangler (`--local`, config de la compilación). Sites aplica las migraciones al publicar. La migración 0003 añade índices para actividad y releases; no elimina datos. No crear tablas desde solicitudes. El starter provee identidad simulada en local; producción usa la autenticación y acceso propietario de Sites.

```sh
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

Conservar integración `sites()` y `.openai/hosting.json`. Nunca guardar credenciales en el proyecto. `/api/background` confía en la frontera owner-private de Sites; antes de cambiar audiencia añadir autorización de servicio independiente. Toda operación de `/api/radar` autoriza identidad del visitante. Las consultas GitHub son solo lectura. Código completo en el repositorio privado [AllanCrazyProgrammer/recomp-radar](https://github.com/AllanCrazyProgrammer/recomp-radar).

## Fuentes oficiales

- https://docs.github.com/en/rest/releases/releases
- https://docs.github.com/en/rest/commits/commits
- https://docs.github.com/en/rest/pulls/pulls
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- https://github.com/Zelda64Recomp/Zelda64Recomp
- https://github.com/HarbourMasters
- https://www.mediawiki.org/wiki/API:Pageimages
- https://www.mediawiki.org/wiki/API:Imageinfo
- https://store.steampowered.com/api/storesearch

## Publicación y verificación

Site existente: https://recomp-radar-allan.allanreyy.chatgpt.site, propietario-privado, ID appgprj_6ac17a4e00d48191b241e9e167e5a20b. Conservar audiencia y la tarea horaria existente; no crear otra. Se observó un ciclo de fondo persistido el 4 de octubre de 2026 a las 00:13:52.273 UTC, sin errores. Sites expone la definición habilitada, pero no historial de ejecución con estado succeeded; la atribución al programador se basa en el writer y el intervalo horario.

El aviso de versión es in-app, sin email, push ni avisos de dot. Los límites de cuota/cobertura siguen aplicando. Carga completa a GitHub confirmada el 4 de octubre de 2026: 146 archivos verificados por SHA y modo contra la fuente publicada; se excluyó únicamente la caché generada tsconfig.tsbuildinfo. No modificar credenciales GitHub.

Las pruebas API con dos usuarios se ejecutan solo en el Worker local compilado, usando cabeceras que simulan identidad de Sites. `tests/seed-library.sql` contiene datos ficticios y nunca es una migración ni debe aplicarse en producción. Ver `tests/library-api.mjs` (36 comprobaciones) y `tests/library-persistence.mjs` (preparar, reiniciar servidor, verificar). La vista local autenticada usa la identidad ficticia local_seedy. Las portadas de fixtures son imágenes generadas de prueba, no portadas oficiales. Consulta VALIDATION.md para resultados y límites.

## Tema visual clásico

La app usa una apariencia de escritorio de los años 90: fondo verde azulado, barra azul marino, superficies grises, bordes biselados, controles cuadrados e iconos SVG pixelados. `app/retro.css` se carga después de los estilos de distribución; la navegación, el orden de las secciones, las columnas de la biblioteca y los puntos de adaptación móvil conservan su implementación.

La tipografía de títulos y controles es Pixelify Sans, alojada con la app (sin consultas externas al abrir), obtenida del repositorio oficial de Google Fonts: https://github.com/google/fonts/tree/main/ofl/pixelifysans. Su licencia OFL acompaña al archivo en `public/fonts/pixelify-sans-OFL.txt`. Los textos largos usan Tahoma/Segoe UI para mantener legibilidad.

`app/comfort.css` amplía títulos, notas y controles y adapta el texto a móvil. Los cursores nativos pixelados (flecha, mano y selección de texto) están en `public/cursors`. Las grabaciones locales en `public/sounds` son breves y de volumen bajo: clic clásico de ratón (pulsar y soltar) y dos variantes reales de teclado mecánico. Las cuatro voces de escritura permiten escuchar el final de cada tecla mientras se teclea rápido. Las fuentes CC0 y las adaptaciones están documentadas en `public/sounds/LICENSE.md`. El botón Sonido permite silenciarlos y guarda la preferencia en el navegador; no se reproduce audio al cargar la página.

## Pestañas de instalación y actualización

Cada release tiene Versión, Instalación y Actualizar encima del resumen, también en el detalle individual. Cualquier repositorio seguido obtiene instrucciones de su propio README y hasta dos guías Markdown/texto enlazadas dentro del mismo repo y referencia. La consulta autenticada `/api/project-guide` valida la fuente seguida y la release capturada; no permite elegir URLs o referencias arbitrarias. Primero busca la etiqueta de esa release y, si falta, usa la rama actual con una advertencia explícita. Extrae requisitos, instalación y actualización; conserva comandos y enlaces como texto de consulta, sin ejecutarlos ni renderizar HTML remoto. Los extractos conservan el idioma original. Si no existen pasos de actualización documentados, muestra las notas de la release y lo indica, sin inventar un procedimiento.

La documentación se consulta al abrir Instalación/Actualizar, nunca durante la sincronización habitual. Caché persistente compartida de 24 horas (incluyendo README ausente), deduplicación de consultas simultáneas y ETag; las peticiones respetan la pausa global de GitHub y conservan guías capturadas cuando hay un fallo. Como enriquecimiento, las guías revisadas en español de `lib/project-guides.ts` siguen disponibles exclusivamente para Open Nectar 0.9.2 y Conker V0.1.5; cualquier otro repo o etiqueta usa la carga automática. No es necesario añadir código para seguir un nuevo proyecto.

Los tabs permiten flechas, Home y End, con relaciones ARIA y panel etiquetado. Cada tarjeta mantiene su pestaña y sistema de forma independiente. En móvil las pestañas pasan a otra fila cuando no caben, conservando las tres opciones.

## Cuenta y amigos (local, pendiente de publicación)

Inicio de sesión Sites/ChatGPT, alias y solicitudes privadas en `#amigos`. Descubrimiento opt-in por alias exacto; las amistades aceptadas permiten ver los nombres y repositorios de los juegos seguidos mediante «Ver radar». Versiones instaladas y portadas personales permanecen privadas; la amistad no da acceso al Site. [Diseño, pruebas y bloqueo de configuración previo a publicar](docs/FRIENDS.md).
