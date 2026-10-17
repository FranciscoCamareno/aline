# aline — núcleo local

Sistema personal de mapas mentales y notas conectadas. Esta es la **primera entrega**: el núcleo
local descrito en [docs/Diseno-tecnico-sistema.md](docs/Diseno-tecnico-sistema.md). Es una PWA
con React, TypeScript estricto y Vite, con lienzo Excalidraw, notas Markdown y guardado
automático en IndexedDB (Dexie). No necesita cuenta ni servidor; Google Drive y la carpeta
local son opcionales.

> El nombre visible es **aline**. Los identificadores internos siguen siendo `mindnote` (base
> `mindnote-vault`, formato del almacén) para no romper datos existentes. Los enlaces internos
> se escriben como `aline://` desde el 16/10/2026; los anteriores `mindnote://` se siguen leyendo.

**Diseño visual:** [docs/DESIGN.md](docs/DESIGN.md). Los recursos de marca (logotipo, iconos,
stickers, notas adhesivas) están en [brand/](brand/); los tokens de color viven en
`src/app/styles.css`.

**Documentación de uso:** [guía de uso](docs/guia-de-uso.md) ([English](docs/user-guide.md)),
[operación, copias y recuperación](docs/operacion.md) ([English](docs/operations.md)),
[rendimiento medido](docs/rendimiento.md) y [matriz de pruebas en el iPad](docs/pruebas-ipad.md).

## Requisitos

- Node.js 22.18 o superior (probado con Node 24.21). Los scripts de `scripts/*.ts` se ejecutan
  directamente con Node, sin compilar.
- pnpm 12.11.2, fijado en `packageManager`. Hay dos formas de usarlo:
  - `corepack enable` (una vez; en Windows puede requerir una consola de administrador) y
    después `pnpm …`.
  - Sin instalar nada global: sustituir `pnpm` por `npx pnpm@12.11.2` en los comandos.

## Puesta en marcha

```bash
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:5173
```

`pnpm dev` y `pnpm build` copian antes las fuentes de Excalidraw a `public/fonts` para que se
sirvan desde el mismo origen y no desde un CDN (diseño §13).

## Comandos

| Comando                                 | Qué hace                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm dev`                              | Servidor de desarrollo de Vite                                                              |
| `pnpm build`                            | Typecheck y compilación de producción en `dist/` (incluye el Service Worker)                |
| `pnpm preview`                          | Sirve `dist/` en http://localhost:4173                                                      |
| `pnpm typecheck`                        | `tsc -b` en modo estricto                                                                   |
| `pnpm lint`                             | ESLint, incluidas las reglas de dependencias entre módulos del diseño §4                    |
| `pnpm format` / `pnpm format:check`     | Prettier                                                                                    |
| `pnpm test`                             | Pruebas unitarias (Vitest con IndexedDB en memoria)                                         |
| `pnpm test:e2e`                         | Recorridos en Chromium con Playwright sobre la compilación de producción                    |
| `pnpm verify`                           | typecheck + lint + test + build                                                             |
| `pnpm test:fase0`                       | Pruebas de viabilidad del motor (fase 0) sobre el banco `spikes/fase0/`                     |
| `pnpm spike:fase0 --host`               | Sirve el banco en http://<IP>:4174 para las pruebas manuales en el iPad                     |
| `pnpm schemas`                          | Regenera los JSON Schema del formato en `docs/formato/schemas/v1`                           |
| `pnpm test:rendimiento`                 | Banco de rendimiento (CA-12, CA-31) en Chromium; resultados en `docs/rendimiento.md`        |
| `pnpm licenses` / `pnpm licenses:check` | Inventario de licencias en `docs/licencias.md`; `check` falla ante una licencia no admitida |

Antes de la primera ejecución de `pnpm test:e2e` hay que instalar el navegador:
`pnpm exec playwright install chromium`.

Los iconos de la PWA (`public/aline-icon-*.png`, `favicon*`, `apple-touch-icon.png`) se copian
tal cual desde `brand/`; si cambian allí, hay que volver a copiarlos.

## Qué incluye

- **Primera apertura:** crea un almacén local (UUID) y muestra un lienzo vacío de inmediato.
- **Lienzos Excalidraw:** guardado automático con espera de 500 ms y máximo de 2 s, guardado
  al soltar el puntero, al ocultar la página y antes de cambiar de documento. Desplazamiento,
  zoom y selección no generan revisiones. Las imágenes se guardan aparte como blobs
  direccionados por SHA-256 y se rehidratan al abrir.
- **Notas Markdown:** CodeMirror 6, vista previa saneada (unified + remark + rehype-sanitize,
  sin HTML crudo ni carga de imágenes remotas), frontmatter con `schema_version`, `id`, `title`
  y `tags`. Los enlaces `aline://document/<UUID>` (y los anteriores `mindnote://`) abren el documento dentro de la app.
- **Crear, abrir y renombrar** notas y lienzos desde la biblioteca o desde el título de la
  cabecera. Renombrar conserva el UUID y crea una revisión nueva; en notas vuelve a serializar
  el frontmatter y conserva el cuerpo.
- **Revisiones inmutables:** cada guardado inserta, en una sola transacción IndexedDB, los
  blobs, la revisión (`parentIds`), las cabezas del documento, la entrada de historial y una
  operación en la cola `outbox`. Si otra pestaña avanzó la cabeza, el cambio se conserva como
  rama y el documento queda marcado como «Conflicto»; nunca se sobrescribe.
- **Estados visibles:** «Cambios pendientes», «Guardado en este dispositivo», «Sin espacio» y
  «Error al guardar». Nunca se muestra «Sincronizado» por una escritura local.
- **PWA:** manifiesto, iconos, Service Worker de Workbox con precache del núcleo y actualización
  solo cuando el usuario la acepta.
- **Idiomas:** español e inglés.
- **Barra de herramientas propia** (DESIGN.md §7): objetos ilustrados en una bandeja, formas
  agrupadas con menú, panel secundario (marco, láser, imagen, Mermaid), nota adhesiva (N) y
  stickers de la marca (B), que se colocan con clic o arrastrándolos al lienzo y conservan su
  color en el tema oscuro. Los demás atajos de teclado son los del motor.
- **Calendario** (DESIGN.md §8): sección propia en la biblioteca, vistas de mes y semana,
  eventos de todo el día, con hora o de varios días con los colores de las notas adhesivas, y
  varios calendarios que se muestran u ocultan. Cada calendario es un documento del almacén.
- **Documentos** (beta): sección de la barra lateral (junto a «Notas», antes «Biblioteca», y
  «Calendario») con su menú «Nuevo», buscador, «Todos/Recientes» y carpetas propias. Dos tipos:
  **documento con formato** (Tiptap: títulos, negrita, cursiva, subrayado, tachado, listas, citas
  y alineación; `kind: 'doc'`, JSON) y **documento Markdown** (Milkdown; `kind: 'mddoc'`, mismo
  formato que una nota, con copia legible y búsqueda). Vista «Continuo» u «Hoja» (A4).
- **Plantillas del lienzo** (DESIGN.md §9): guardar una selección (también con imágenes y
  stickers) e insertarla con un clic o arrastrándola. Sustituyen a la biblioteca de Excalidraw.
- **Biblioteca y cabecera** (DESIGN.md §6): «Nuevo» con desplegable (lienzo, nota, carpeta,
  importar), lienzos y notas que se arrastran dentro y fuera de las carpetas, buscador de títulos, pestañas «Todos» y «Recientes», acciones de cada fila en «⋯» y,
  abajo, solo Perfil: su menú abre Configuración (almacenamiento, temas, idioma, archivo y papelera). Carpetas y documentos se arrastran dentro y fuera de las carpetas y arriba o abajo (orden manual, también con «Subir»/«Bajar»), y se pueden archivar. La cabecera deja a la vista Historial, Enlaces y
  Exportar; Buscar y Estado y diagnóstico están en «⋯».
- **Documentos con formato:** pestañas (como en Google Docs) con sus capítulos, barra de herramientas compacta, burbuja al seleccionar texto para comentar o enlazar, zoom de la hoja, vista «Hoja» partida en páginas A4 y comentarios con respuestas (resolver, reabrir, eliminar). Imágenes del equipo (también en los documentos Markdown) y exportación a Word (.docx) y PDF.
- **Fuentes:** 24 fuentes de Google Fonts (OFL), servidas desde el propio origen y descargadas solo al usarse, en el selector de fuentes del lienzo (con un parche de Excalidraw) y en la barra de los documentos con formato, junto con el tamaño (A− / A+).
- **Tema y esquemas de color:** 8 esquemas en 4 pares (Papel/Noche, Blanco/Negro, Bruma/Marea,
  Salvia/Bosque). En Perfil → Temas se elige uno claro y uno oscuro; el interruptor de la
  cabecera alterna entre ellos y «Seguir al sistema» usa el que toque (preferencias de este
  navegador). El lienzo pinta el fondo del esquema sin guardarlo. Fuente Nunito servida desde el
  propio origen.
- **Modo Zen del lienzo** (menú contextual o Alt+Z): oculta también la barra lateral y la
  cabecera; las herramientas del lienzo siguen a la vista.
- **Al abrir** se vuelve al último documento abierto en este dispositivo.
- **Compatibilidad de versiones:** una revisión, un frontmatter, un sidecar o una escena con una
  versión posterior a la soportada (o con contenido inválido) se abre en **solo lectura** con
  aviso; nada se guarda encima.
- **Estado y diagnóstico** (botón ⓘ): almacén, dispositivo, persistencia concedida, uso y cuota
  del navegador, aviso de cuota alta, **exportación de emergencia** (todo el contenido en un JSON)
  y registro de diagnóstico local, rotado por tamaño, sin texto de las notas y exportable.
- **Almacén inaccesible (FA-01b):** si el navegador no deja abrir IndexedDB, se avisa sin borrar
  nada y se ofrece reintentar o trabajar en un almacén temporal en memoria.
- **Actualizaciones seguras:** antes de activar una versión nueva se guardan los cambios
  pendientes y se pausa el worker; si algo no se puede guardar, no se actualiza.
- **Hash en un worker** para contenidos de más de 16 KB.
- **Formato abierto documentado** en [docs/formato-almacen.md](docs/formato-almacen.md) con
  JSON Schema v1, e inventario de licencias en [docs/licencias.md](docs/licencias.md).
- **Varios almacenes** por navegador (Estado y diagnóstico → Almacenes): crear, cambiar y
  restaurar sin tocar el almacén abierto.
- **Copia completa ZIP** en el formato abierto (documentos, historial, papelera y controles) con
  `backup-manifest.json` (SHA-256 de cada archivo). La **restauración** valida manifiesto, hashes,
  rutas y límites de descompresión, crea un almacén nuevo y comprueba que el contenido coincide
  byte a byte antes de ofrecer abrirlo. También restaura la exportación de emergencia JSON.
- **Papelera** recuperable y **borrado definitivo** explícito, con confirmación, que registra un
  control `VersionPrune` y solo libera blobs que ya nadie usa.
- **Historial** de cada documento (botón 🕘): lista sin cargar cuerpos, vista previa de notas y
  lienzos y restauración que conserva la versión reemplazada.
- **Conflictos:** aviso en el documento y panel para conservar una versión, conservar ambas
  (copia en un documento nuevo) o combinar notas a mano con las diferencias a la vista. Ninguna
  opción borra versiones.
- **Aviso entre pestañas:** si otra pestaña cambia el documento abierto, se ofrece recargarlo.
- **Borrador del trazo en curso:** mientras el lápiz o el ratón siguen apoyados no se crean
  revisiones; se guarda un borrador cada segundo y se recupera si la aplicación se cerró a mitad.
- **Carpetas y etiquetas:** árbol de carpetas (sin ciclos y sin borrado en cascada; lo que apunta
  a una carpeta retirada aparece en «Recuperación»), «Recientes» y filtro por etiqueta. Las
  etiquetas no distinguen mayúsculas y viajan en el frontmatter.
- **Enlaces:** vincular un elemento del lienzo a una nota, a otro lienzo o a una web (botón
  «Vincular» con un elemento seleccionado; se puede crear la nota en el momento). En notas, `[[`
  sugiere destinos por título e inserta un enlace por UUID, o crea la nota. Renombrar no rompe
  enlaces. Los `[[Título]]` importados se resuelven solo si el título es único.
- **Backlinks y enlaces rotos** en «Detalles y enlaces» (botón 🔗), junto con carpeta y etiquetas.
  Desde un backlink o un resultado se abre el documento y se centra el elemento o el texto.
- **Conectores sueltos (RN-07):** al borrar un nodo, su flecha se conserva y se señala; un botón
  la selecciona.
- **Búsqueda** de texto completo (botón 🔍 o Ctrl+Mayús+F) en títulos, etiquetas, notas y texto
  de los lienzos, sin distinguir mayúsculas ni acentos, por prefijo y con tolerancia a errores.
  El índice MiniSearch vive en un worker y se reconstruye desde el contenido.
- **Carpeta local** (Estado y diagnóstico → «Dónde se guarda»; Chrome o Edge en el ordenador): el
  almacén sigue en el navegador y la carpeta recibe el formato abierto, con objetos primero y
  revisión al final, sin sobrescribir nunca. Se sincroniza al abrir, al volver a la pestaña,
  unos segundos después de cada cambio y cada minuto. El estado se muestra en la barra superior
  (📁). Los permisos se revalidan al reiniciar («Reconectar carpeta»). Si la carpeta contiene
  otro almacén, no se mezclan: se ofrece abrirlo aquí como almacén aparte, que es como se usa
  desde un segundo equipo.
- **Sincronización** entre equipos a través de la carpeta: precedencia por `parentIds` (no por
  relojes), objetos verificados por SHA-256, conflictos conservados como varias cabezas, órdenes
  de borrado definitivo que no se deshacen, reintentos con espera y `Retry-After`, y exclusión
  entre pestañas con Web Locks.
- **Ediciones externas:** las copias `readable/<documento>/<versión>.md` se pueden editar con
  cualquier editor; se importan como versiones `external` y, si la aplicación también editó la
  nota, ambas quedan en conflicto.
- Si el documento abierto cambia en otro sitio y no tiene cambios sin guardar, se recarga solo;
  si los tiene, se avisa y no se pisa nada.
- **Google Drive** (Estado y diagnóstico → «Dónde se guarda» → «Conectar Google Drive…»):
  - primero hay que elegir **sin cifrar** (aviso RN-12: Google puede leer el contenido) o
    **cifrado de extremo a extremo** (aviso: sin la contraseña ni el código de recuperación, la
    copia de Drive no se recupera). Con cifrado se crea una contraseña y se muestra un código de
    recuperación que hay que confirmar como guardado. Hasta elegir no se hace ninguna petición a
    Google; después se carga la librería de Google y «Continuar con Google» abre su ventana;
  - permiso `drive.file` (solo los archivos que crea la aplicación). El token vive en memoria:
    al recargar aparece «Necesita autorización» y se renueva con un clic, sin tocar lo local;
  - crea la carpeta «Aline - <almacén>» con el mismo formato abierto que la carpeta local. Cada
    archivo lleva `appProperties` (almacén, revisión, hash…) y se busca por ellas, nunca por ruta;
  - si la cuenta ya tiene este almacén, se enlaza; si tiene otros, se ofrece abrir uno aquí como
    almacén aparte o crear una carpeta para este; nunca se mezclan;
  - la barra superior muestra «☁️ Sincronizado · hh:mm» solo tras un ciclo completo sin nada
    pendiente;
  - un almacén usa un solo destino externo: la carpeta o Drive.
- **Cifrado de la copia en Drive** (opcional; diseño §13.1, formato §7):
  - AES-256-GCM con Web Crypto. Una clave por almacén, protegida con la contraseña (PBKDF2, 600 000
    iteraciones) y con el código de recuperación;
  - cada equipo la pide una vez y la guarda como clave no extraíble;
  - en Drive solo quedan sin cifrar `vault.json`, `encryption.json` y el README; los objetos se
    nombran con HMAC, no con su hash;
  - el equipo y la carpeta local siguen sin cifrar;
  - en «Cifrado y contraseña» se puede cambiar la contraseña, generar otro código o cambiar de
    modo. Al cambiar de modo se crea una carpeta nueva y se sube todo; los demás equipos se
    trasladan solos y la carpeta anterior se puede mover a la papelera.
- **Exportar el lienzo** (botón «Exportar…» o menú del lienzo; RF-33, RF-45):
  - PNG y SVG con fondo opcional, escala 1×–3× y opción de solo la selección;
  - PDF A4 encajado o paginado (raster insertado con jsPDF, como decide el diseño);
  - `.excalidraw` autocontenido, con la lista de lo que no viaja;
  - si el raster no cabe en memoria (límite de Safari, 16,7 Mpx), se propone una escala menor o
    la selección; nunca se recorta en silencio.
- **Importar** (biblioteca → «Importar y exportar»; RF-34, RF-35):
  - `.excalidraw` validado, sin contenido web incrustado ni imágenes remotas;
  - notas Markdown sueltas o carpetas con subcarpetas;
  - cada importación crea documentos nuevos y termina con un informe de lo no importado y por qué.
- **Exportar Markdown:** cada nota con su frontmatter («Exportar .md»), o una carpeta o todo el
  almacén en un ZIP con la estructura de carpetas.
- **Uso táctil (iPad):**
  - objetivos de 44 px y campos de 16 px (sin zoom al enfocar en iOS);
  - biblioteca superpuesta en vertical que se cierra al abrir un documento, al tocar fuera o al
    deslizarla;
  - zonas seguras de la PWA instalada.
- **Accesibilidad:**
  - foco visible en todo lo navegable con el teclado;
  - contraste WCAG AA comprobado en los temas claro y oscuro;
  - traducciones es/en completas, con una prueba que lo exige.
- **Integración continua** en `.github/workflows/ci.yml` (formato, licencias, verify y E2E).
- Borrador de cabeceras de seguridad para Cloudflare Pages en `public/_headers`. La CSP completa
  va en modo informe (`Report-Only`) y **no es la definitiva**; solo es obligatoria una CSP
  mínima contra la incrustación en marcos (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).

## Estructura

```text
src/
  app/                 arranque, composición, estado de UI (Zustand), i18n, guardado automático
  domain/              revisiones, documentos, frontmatter, etiquetas, sidecar (sin React/Dexie)
  application/         VaultService: CreateDocument, SaveNote, SaveCanvas, RenameDocument
  ports/               VaultRepository, RemoteStore, SyncEngine, RemoteAuth, LocalFolderStore, CanvasAdapter
  features/canvas/     vista del lienzo
  features/notes/      editor, vista previa
  features/library/    biblioteca y títulos renombrables
  features/history/    historial, vista previa de versiones y resolución de conflictos
  features/status/     estado del almacén, exportación de emergencia y diagnóstico
  features/knowledge/  vincular elementos, detalles y backlinks, paleta de búsqueda
  adapters/excalidraw/ serialización de escenas y assets
  adapters/indexeddb/  esquema Dexie, transacciones, registro de almacenes, persistencia y cuota
  adapters/zip/        ZIP con fflate, rutas seguras y límites de descompresión
  adapters/filesystem/ carpeta local (File System Access)
  adapters/drive/      Google Identity Services (token) y Drive API v3
  workers/             hash SHA-256, ZIP y búsqueda (MiniSearch)
  locales/es, locales/en
tests/unit, tests/e2e, tests/fase0
spikes/fase0          banco de viabilidad del motor (fuera del producto)
```

ESLint impide que `domain`, `application` y `ports` importen React, Dexie, Excalidraw o
adaptadores, y que la interfaz llame directamente a Drive o a la carpeta.

## Verificación

Última ejecución: 13/10/2026, Windows 11, Node 24.21.

- `pnpm verify`: typecheck, lint, 109 pruebas unitarias y compilación, todo correcto.
- `pnpm test:e2e:all`: 39 recorridos en **Chromium** y los mismos 39 en **Microsoft Edge**.
  - De cuatro ejecuciones completas, una tuvo un fallo intermitente (una comprobación de texto)
    que no se volvió a reproducir en las otras tres; no se identificó qué prueba fue.
  - Los recorridos nuevos de la fase 5, junto con los de Drive, se repitieron 4 veces en los dos
    navegadores, sin fallos.
- La fase 5 incluye:
  - exportar a PNG, SVG, PDF y `.excalidraw` con todos los elementos. Se comprueba:
    - el PNG decodificado tiene el tamaño anunciado;
    - el SVG es XML válido y contiene el texto;
    - el PDF es válido, con una página al encajar;
    - el `.excalidraw` contiene la forma y el texto;
    - exportar no conecta con ningún otro origen (CA-13, CA-30, CA-19);
  - importar un `.excalidraw` con contenido web incrustado: se lista y no se importa (CA-18);
  - importar una carpeta de Markdown con subcarpetas y un archivo no admitido, exportar la nota y
    exportar todo el almacén en un ZIP con la misma estructura (RF-35);
  - uso solo con teclado con el foco visible;
  - pantalla táctil estrecha emulada: botones de 44 px, editor de 16 px y biblioteca que se
    cierra al abrir, al tocar fuera y al deslizar.
- La fase 4 incluye:
  - conectar una carpeta, sincronizar, abrir su almacén desde otro almacén («segundo equipo») y
    ver los cambios en ambos sentidos (RF-36, CA-33);
  - editar una copia legible fuera de la aplicación y verla importada como «Cambio externo»
    (CA-28);
  - Drive, sin cifrar y cifrado, contra una simulación de Google (detalle en las pruebas del
    protocolo).
- **Rendimiento** (`pnpm test:rendimiento`, i5-1155G7; detalle en
  [docs/rendimiento.md](docs/rendimiento.md)):
  - abrir un lienzo de 1 000 elementos: 114–166 ms;
  - arrastrar: p95 17 ms entre fotogramas;
  - abrir con 100 versiones: 62–67 ms;
  - búsqueda: 1,5–7 ms por consulta.
- Pruebas del protocolo, con el mismo motor contra dos destinos:
  - carpeta en memoria con la API de File System Access (`tests/unit/sync.test.ts`);
  - simulación de Drive API v3 (`tests/unit/fakeDrive.ts`: `files.list` con `q` y paginación,
    subidas multipart/reanudables/media y feed de cambios), en `tests/unit/drive.test.ts`.
- Casos que cubren esas pruebas:
  - tres dispositivos que convergen;
  - ediciones concurrentes sin red que se conservan y se resuelven en todos (CA-14);
  - respuesta perdida sin duplicados;
  - objetos ausentes o alterados que no se activan hasta completarse;
  - destino de otro almacén que no se mezcla;
  - borrado definitivo que no resucita;
  - ediciones externas;
  - reintentos con espera y `Retry-After`;
  - solo con Drive: clasificación de errores (401, 403 por límite, cuota o permiso, 404, 429,
    5xx, sin red), cursor inválido que reconcilia todo, ciclos sin cambios que solo consultan el
    feed, y subida reanudable por encima de 5 MB.
  - solo con Drive cifrado (`tests/unit/drive.test.ts`):
    - clave abierta solo con la contraseña o el código;
    - cambio de contraseña sin volver a subir nada;
    - dos equipos que convergen sin nada legible en Drive;
    - archivos alterados o intercambiados que se rechazan;
    - nunca se escribe sin cifrar en una carpeta cifrada ni al revés;
    - cambio de modo con traslado del otro equipo.
- Fases anteriores: los recorridos de las fases 1 a 3 (Chromium y Edge), la búsqueda con 2 000
  notas y 500 lienzos, y las 8 pruebas de viabilidad de la fase 0. Con 2 500 documentos, el
  lienzo aparece en 3,2 s en Chromium ejecutando la prueba sola. Con Chromium y Edge a la vez
  sube a 10–14 s en Chromium (2,2–2,9 s en Edge): es contención de la máquina, no un resultado
  de rendimiento.

**No verificado** (no se ha ejecutado):

- Rechazo de palma, presión y rendimiento en el iPad: el propietario confirma que el Apple Pencil
  funciona, pero faltan los datos detallados del protocolo de la fase 0 (§4 y §6 del informe).
- Corte eléctrico o cierre del proceso del navegador completo (RNF-04): se ha probado el cierre
  de la pestaña sin eventos de salida, no un fallo del sistema.
- Cuota del navegador agotada en un navegador real: se ha probado con un fallo simulado en IndexedDB,
  no llenando el disco.
- Tamaño máximo de copia ZIP que soporta el iPad (diseño §12.2): no se ha medido.
- Instalación como PWA en el escritorio o en la pantalla de inicio del iPad.
- Toda la fase 5 en el iPad: lápiz, gestos, teclado en pantalla, exportaciones con el límite de
  memoria de Safari e importación desde la app Archivos. La matriz para hacerlo está en
  [docs/pruebas-ipad.md](docs/pruebas-ipad.md). La emulación táctil de Chromium no lo sustituye.
- Que los PDF, PNG y SVG exportados se abran en visores externos (Acrobat, Vista previa…): se
  comprobó su estructura y que el navegador los decodifica.
- El flujo de actualización de la PWA con una versión nueva publicada (requiere un despliegue).
- El resultado del CI en GitHub: el repositorio es privado y no se ha consultado desde aquí.
- La carpeta con el selector nativo de Windows y con una carpeta real del disco: las pruebas usan
  el sistema de archivos privado del navegador (OPFS), que tiene la misma API pero no pasa por
  el diálogo ni por los permisos de una carpeta del usuario.
- Dos ordenadores reales sincronizando con una misma carpeta (p. ej. en una unidad de red).
- **Google Drive real.** Nada de lo siguiente se ha probado:
  - la ventana de Google ni el consentimiento;
  - el token real ni su caducidad a la hora;
  - la Drive API real (consultas `appProperties`, feed de cambios, subidas reanudables);
  - las cuotas;
  - la CSP con Google;
  - el cambio de cuenta.

  Las pruebas usan una simulación hecha a partir de la documentación de la API. La comprobación
  real la tiene que hacer el propietario con su cuenta (pasos en `docs/Plan-de-fases.md`, fase 4).

- Drive en Safari/iPad: ventanas emergentes de Google y almacenamiento.
- Cifrado:
  - tiempo de PBKDF2 (600 000 iteraciones) en el iPad;
  - que Safari conserve en IndexedDB la clave no extraíble;
  - el cambio de modo con un almacén grande y Drive real.
  - Hubo una auditoría defensiva automatizada el 13/10/2026 (informe fuera del repositorio);
    sus correcciones están descritas en el diseño §13.1 y en `tests/unit/seguridad.test.ts`.
    No es una revisión criptográfica especializada.

## Funciones pendientes

Los contratos ya están definidos en `src/ports/` y los adaptadores pendientes devuelven el
error `not-implemented` en vez de simular un éxito.
El orden de trabajo hasta la beta está en [docs/Plan-de-fases.md](docs/Plan-de-fases.md).

| Área                                                                                                                                                                                                                                                                                                                                                                                   | Estado                                                                                                                                                                                                                       | Dónde                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Google Drive: comprobación con la cuenta real                                                                                                                                                                                                                                                                                                                                          | Implementado y probado contra una simulación de la API. Falta la prueba con Google real y pasar la CSP a obligatoria (4.8)                                                                                                   | `adapters/drive/`, `public/_headers`    |
| Google Picker (abrir archivos ajenos a la aplicación)                                                                                                                                                                                                                                                                                                                                  | No implementado; no hace falta para sincronizar (`drive.file` ve lo que crea la aplicación)                                                                                                                                  | —                                       |
| Poda selectiva de versiones y espacio que ocupan (RF-46)                                                                                                                                                                                                                                                                                                                               | Historial, papelera y borrado definitivo de documentos hechos; falta eliminar versiones concretas o antiguas y mostrar su espacio                                                                                            | `features/history/`                     |
| Enlaces `[[Título]]` escritos a mano en la vista previa                                                                                                                                                                                                                                                                                                                                | Se resuelven en backlinks y enlaces rotos, pero en la vista previa se muestran como texto; el autocompletado ya inserta enlaces por UUID                                                                                     | `features/notes/`                       |
| Biblioteca con miles de documentos                                                                                                                                                                                                                                                                                                                                                     | Funciona (probado con 2 500), pero la lista no está virtualizada: el lienzo tarda unos 2,8 s en aparecer con ese volumen                                                                                                     | `features/library/`                     |
| Importar `.excalidraw`: conservar el original si hubo conversión (§12.1)                                                                                                                                                                                                                                                                                                               | Se importa la escena normalizada y se informa de lo descartado, pero no se guarda el archivo original aparte                                                                                                                 | `app/importExport.ts`                   |
| Mensajes técnicos de sincronización en inglés                                                                                                                                                                                                                                                                                                                                          | Los textos de la interfaz están traducidos; los mensajes de error que llegan del adaptador (Drive, carpeta) se muestran en español                                                                                           | `adapters/drive`, `adapters/filesystem` |
| Pruebas en el iPad y dos semanas de uso real (5.8)                                                                                                                                                                                                                                                                                                                                     | Las hace el propietario: [docs/pruebas-ipad.md](docs/pruebas-ipad.md) y despliegue con copias                                                                                                                                | —                                       |
| Sidecar: ramas colapsables y notas incrustadas                                                                                                                                                                                                                                                                                                                                         | Los enlaces de elementos y los conectores sueltos ya se derivan y guardan; las ramas (6.2) y las tarjetas (6.3) siguen pendientes                                                                                            | `domain/sidecar.ts`                     |
| Pila de deshacer coordinada para comandos propios                                                                                                                                                                                                                                                                                                                                      | El deshacer del motor pasa la prueba de 100 acciones (fase 0); falta coordinarlo con comandos propios                                                                                                                        | —                                       |
| Interfaz propia del modo «Solo lápiz» (RF-47, fase 6)                                                                                                                                                                                                                                                                                                                                  | El motor activa su modo lápiz al detectar el Apple Pencil y la barra propia muestra el interruptor «Solo lápiz»; el modo propio con rechazo de palma documentado y los bloques manuscritos en notas son de la fase 6         | `features/canvas/CanvasView.tsx`        |
| Búsqueda en documentos en conflicto                                                                                                                                                                                                                                                                                                                                                    | Se indexa la cabeza más reciente; el diseño pide indexar todas con una marca visible                                                                                                                                         | `application/KnowledgeService.ts`       |
| Frontmatter YAML completo                                                                                                                                                                                                                                                                                                                                                              | Hay un subconjunto: valores simples y listas en línea. Si no lo reconoce, conserva el texto y avisa                                                                                                                          | `domain/frontmatter.ts`                 |
| Paleta del lienzo (DESIGN.md §3.2)                                                                                                                                                                                                                                                                                                                                                     | La barra de herramientas propia ya está; falta un selector de color con la paleta del lienzo (la 0.18.1 no deja cambiar la suya)                                                                                             | `features/canvas/CanvasView.tsx`        |
| Nota adhesiva: color y texto (DESIGN.md §3.5)                                                                                                                                                                                                                                                                                                                                          | Se inserta con la barra o con N, siempre en mantequilla; falta elegir el color y que el texto quede arriba a la izquierda (el motor lo centra)                                                                               | `features/canvas/stickyNote.ts`         |
| Stickers en oscuro (DESIGN.md «Selector de stickers»)                                                                                                                                                                                                                                                                                                                                  | Conservan su color con una capa sin filtro, pero quedan por encima de las formas aunque estén detrás en el orden de capas, no respetan el recorte de un marco y la exportación en oscuro los muestra con el filtro del motor | `features/canvas/stickerLayer.ts`       |
| Calendario: lo que falta (DESIGN.md §8.6)                                                                                                                                                                                                                                                                                                                                              | Selector de fechas propio, hoja de «hoy», eventos repetidos, semana desde el domingo y búsqueda de eventos                                                                                                                   | `features/calendar/`                    |
| Calendario y plantillas con versiones antiguas de la app                                                                                                                                                                                                                                                                                                                               | Una versión anterior al 14/10/2026 no reconoce esos tipos de documento: actualizar todos los dispositivos antes de usarlos                                                                                                   | `domain/revision.ts`                    |
| Documentos: lo que falta (beta) Con formato: exportar (PDF/DOCX/Markdown), tablas, imágenes, búsqueda. Markdown: tablas desde la barra, imágenes propias (las de Markdown se muestran sin descargar), enlaces `[[…]]` con autocompletado, documentos en la exportación Markdown por carpetas. Ambos: paginación real al editar, iconos propios de negrita/cursiva y pruebas en el iPad | `features/docs/`                                                                                                                                                                                                             |
| Documentos con versiones antiguas de la app                                                                                                                                                                                                                                                                                                                                            | Una versión anterior al 15/10/2026 no reconoce `doc`, ni una anterior al 16/10/2026 `mddoc` y `docfolder`: actualizar todos los dispositivos antes de usarlos                                                                | `domain/revision.ts`                    |
| Desactivar la biblioteca externa de Excalidraw                                                                                                                                                                                                                                                                                                                                         | Se quitaron los enlaces del menú; falta comprobar «Explorar bibliotecas»                                                                                                                                                     | —                                       |

## Decisiones de implementación

- **TypeScript 6.0.3**, no 7.x: typescript-eslint 8.71 solo admite TypeScript por debajo de 6.1.
- **React 19.3** con Excalidraw 0.18.1: el manifiesto de Excalidraw acepta React 19. pnpm
  avisa de que algunas subdependencias de Radix declaran React ≤ 18. En los recorridos de
  Chromium y en la fase 0 no ha dado problemas.
- **Versiones exactas** (`save-exact`) y `pnpm-lock.yaml` versionado.
- **Identidad del almacén y del dispositivo** en la tabla `deviceSettings`, porque el diseño no
  incluye una tabla `vault`.
- **Imágenes del lienzo:** en la escena guardada, el `dataURL` de cada archivo se sustituye por
  `mindnote-asset:<sha256>`. La escena conserva el esquema `.excalidraw` y los bytes se guardan
  una sola vez. Una futura exportación `.excalidraw` tendrá que volver a incrustarlos.
- **Almacén temporal:** usa `fake-indexeddb` (dependencia de ejecución, cargada solo en ese
  caso) para dar una IndexedDB en memoria cuando la del navegador no está disponible.
- **Liberation Sans 1.05 excluida:** no se copia a `public/fonts`; el estilo de letra antiguo «Normal» del motor usa la fuente sin serifa del sistema.
- **Fuentes:** la fuente CJK Xiaolai (unos 13 MB) no se precachea; se guarda en caché la
  primera vez que se usa.
- **Conflictos:** al abrir un documento con dos cabezas se edita la más reciente y la sesión
  solo sigue esa rama, así que un guardado nunca fusiona un conflicto sin una decisión explícita.

## Licencia y derechos de autor

aline se publica en **tres niveles de licencia**, separados por carpeta:

| Nivel                                  | Qué cubre                                                                                                                                                                                                                                          | Licencia                                                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Código propio**                   | Todo el código fuente original del proyecto: `src/`, `tests/`, `scripts/`, `spikes/`, configuración (`*.config.ts`, `index.html`, `public/_headers`…) y documentación (`docs/`, `*.md`)                                                            | **GNU AGPLv3** (`AGPL-3.0-only`), [LICENSE](LICENSE). Copyright (C) 2026 F. C.                                                                                                                          |
| **2. Motores y librerías de terceros** | Excalidraw, Milkdown, Tiptap, ProseMirror, CodeMirror, React, unified/remark, Dexie y el resto de dependencias de `package.json`; las fuentes tipográficas; el parche del motor (`patches/`) y los textos de `licenses/`                           | **Su propia licencia** (MIT, Apache-2.0, OFL-1.1, BSD, ISC…), conservada sin cambios. Resumen en [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md); inventario en [docs/licencias.md](docs/licencias.md) |
| **3. Marca y recursos gráficos**       | El nombre «aline», el logotipo, los iconos de la aplicación y de la interfaz, los **stickers** del lienzo, las notas adhesivas, las ilustraciones y los esquemas de color: [brand/](brand/) (salvo `brand/third-party/`) y sus copias en `public/` | **Todos los derechos reservados** © 2026 ALINE. Marca (™) **fuera de la AGPLv3**: ver [TRADEMARKS_AND_ASSETS.md](TRADEMARKS_AND_ASSETS.md)                                                              |

**Qué significa en la práctica.** Puedes usar, estudiar, modificar y redistribuir el código según la
AGPLv3; si ofreces una versión modificada como servicio en red, debes ofrecer su código fuente a sus
usuarios (sección 13). Las librerías de terceros siguen bajo sus licencias permisivas. En cambio, la
marca y los recursos gráficos no se pueden redistribuir: un fork o una versión de terceros debe
**cambiar el nombre y sustituir** logotipos, iconos y stickers por los suyos. Los stickers y las
notas adhesivas sí se pueden usar libremente dentro de los documentos que crees con la aplicación y
en lo que exportes de ellos.

**Contribuciones y elementos futuros.** Cada archivo nuevo hereda la licencia de su carpeta: el
código nuevo es AGPLv3; un motor o librería nueva entra como dependencia con su licencia (debe
pasar `pnpm licenses:check` y aparecer en THIRD-PARTY-NOTICES.md); un recurso gráfico nuevo de la
marca va en `brand/` y queda con todos los derechos reservados.

### Cumplimiento en la aplicación compilada

La aplicación compilada incluye Excalidraw (MIT), otras dependencias y fuentes de terceros. Para cumplir sus licencias, `pnpm assets` genera dos archivos que se publican en `dist/` y se enlazan desde «Estado y diagnóstico → Licencias»:

- `THIRD-PARTY-NOTICES.txt`: los avisos de copyright y el texto de licencia de cada paquete y de cada fuente;
- `LICENSE.txt`: la licencia GNU AGPLv3 de la aplicación.

Los textos que los paquetes npm no incluyen están en [licenses/](licenses/). El inventario y la verificación de las fuentes están en [docs/licencias.md](docs/licencias.md). La fuente Liberation Sans 1.05 no se distribuye porque su licencia (GPLv2 con excepción y cláusulas añadidas) no encaja con el proyecto.
