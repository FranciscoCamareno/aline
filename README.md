# MindNote — núcleo local

Sistema personal de mapas mentales y notas conectadas. Esta es la **primera entrega**: el núcleo
local descrito en [docs/Diseno-tecnico-sistema.md](docs/Diseno-tecnico-sistema.md). Es una PWA
con React, TypeScript estricto y Vite, con lienzo Excalidraw, notas Markdown y guardado
automático en IndexedDB (Dexie). No necesita cuenta, servidor ni conexión a Google Drive.

> `mindnote` es un nombre provisional, igual que el esquema `mindnote://` del diseño.

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
| `pnpm licenses` / `pnpm licenses:check` | Inventario de licencias en `docs/licencias.md`; `check` falla ante una licencia no admitida |

Antes de la primera ejecución de `pnpm test:e2e` hay que instalar el navegador:
`pnpm exec playwright install chromium`.

`node scripts/generate-icons.mjs` regenera los iconos PNG de la PWA a partir de
`public/icon.svg`.

## Qué incluye

- **Primera apertura:** crea un almacén local (UUID) y muestra un lienzo vacío de inmediato.
- **Lienzos Excalidraw:** guardado automático con espera de 500 ms y máximo de 2 s, guardado
  al soltar el puntero, al ocultar la página y antes de cambiar de documento. Desplazamiento,
  zoom y selección no generan revisiones. Las imágenes se guardan aparte como blobs
  direccionados por SHA-256 y se rehidratan al abrir.
- **Notas Markdown:** CodeMirror 6, vista previa saneada (unified + remark + rehype-sanitize,
  sin HTML crudo ni carga de imágenes remotas), frontmatter con `schema_version`, `id`, `title`
  y `tags`. Los enlaces `mindnote://document/<UUID>` abren el documento dentro de la app.
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
- **Integración continua** en `.github/workflows/ci.yml` (formato, licencias, verify y E2E).
- Borrador de cabeceras de seguridad para Cloudflare Pages en `public/_headers`. La CSP va en
  modo informe (`Report-Only`) y **no es la definitiva**.

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
  adapters/filesystem/ (pendiente) carpeta Windows
  adapters/drive/      (pendiente) OAuth y Drive API
  workers/             hash SHA-256, ZIP y búsqueda (MiniSearch)
  locales/es, locales/en
tests/unit, tests/e2e, tests/fase0
spikes/fase0          banco de viabilidad del motor (fuera del producto)
```

ESLint impide que `domain`, `application` y `ports` importen React, Dexie, Excalidraw o
adaptadores, y que la interfaz llame directamente a Drive o a la carpeta.

## Verificación

Última ejecución: 13/10/2026, Windows 11, Node 24.21.

- `pnpm verify`: typecheck, lint, 80 pruebas unitarias y compilación, todo correcto.
- `pnpm test:e2e:all`: 31 recorridos en **Chromium** y los mismos 31 en **Microsoft Edge**, sin
  fallos; los de la fase 4 se repitieron 4 veces en paralelo sin fallos:
  - conectar una carpeta, revisar su contenido, sincronizar al recargar, abrir el almacén de la
    carpeta desde otro almacén («segundo equipo»), editar allí y ver el cambio en el primero
    (RF-36, CA-33);
  - editar una copia legible fuera de la aplicación y verla importada como «Cambio externo» (CA-28).
- Pruebas del protocolo (`tests/unit/sync.test.ts`, carpeta en memoria con la API de File
  System Access):
  - tres dispositivos que convergen;
  - ediciones concurrentes sin red que se conservan y se resuelven en todos (CA-14);
  - respuesta perdida sin duplicados;
  - objetos ausentes o alterados que no se activan hasta completarse;
  - carpeta de otro almacén que no se mezcla;
  - borrado definitivo que no resucita;
  - ediciones externas, incluida la que entra en conflicto con la aplicación;
  - reintentos con espera y `Retry-After`.
- Fases anteriores: los recorridos de las fases 1 a 3 (Chromium y Edge), la búsqueda con 2 000
  notas y 500 lienzos, y las 8 pruebas de viabilidad de la fase 0.

**No verificado** (no se ha ejecutado):

- Rechazo de palma, presión y rendimiento en el iPad: el propietario confirma que el Apple Pencil
  funciona, pero faltan los datos detallados del protocolo de la fase 0 (§4 y §6 del informe).
- Corte eléctrico o cierre del proceso del navegador completo (RNF-04): se ha probado el cierre
  de la pestaña sin eventos de salida, no un fallo del sistema.
- Cuota del navegador agotada en un navegador real: se ha probado con un fallo simulado en IndexedDB,
  no llenando el disco.
- Tamaño máximo de copia ZIP que soporta el iPad (diseño §12.2): no se ha medido.
- Instalación como PWA en el escritorio o en la pantalla de inicio del iPad.
- El flujo de actualización de la PWA con una versión nueva publicada (requiere un despliegue).
- El resultado del CI en GitHub: el repositorio es privado y no se ha consultado desde aquí.
- La carpeta con el selector nativo de Windows y con una carpeta real del disco: las pruebas usan
  el sistema de archivos privado del navegador (OPFS), que tiene la misma API pero no pasa por
  el diálogo ni por los permisos de una carpeta del usuario.
- Dos ordenadores reales sincronizando con una misma carpeta (p. ej. en una unidad de red).
- Google Drive: no implementado.

## Funciones pendientes

Los contratos ya están definidos en `src/ports/` y los adaptadores pendientes devuelven el
error `not-implemented` en vez de simular un éxito.
El orden de trabajo hasta la beta está en [docs/Plan-de-fases.md](docs/Plan-de-fases.md).

| Área                                                                  | Estado                                                                                                                                                                                                                         | Dónde                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Google Drive (OAuth GIS, Drive API v3, `appProperties`, subidas)      | Pendiente de que exista el proyecto de Google Cloud (pasos en `docs/Plan-de-fases.md`, fase 4). El motor de sincronización ya está hecho y probado con la carpeta; falta el adaptador `DriveRemoteStore` con el mismo contrato | `adapters/drive/`                 |
| Poda selectiva de versiones y espacio que ocupan (RF-46)              | Historial, papelera y borrado definitivo de documentos hechos; falta eliminar versiones concretas o antiguas y mostrar su espacio                                                                                              | `features/history/`               |
| Enlaces `[[Título]]` escritos a mano en la vista previa               | Se resuelven en backlinks y enlaces rotos, pero en la vista previa se muestran como texto; el autocompletado ya inserta enlaces por UUID                                                                                       | `features/notes/`                 |
| Biblioteca con miles de documentos                                    | Funciona (probado con 2 500), pero la lista no está virtualizada: el lienzo tarda unos 2,8 s en aparecer con ese volumen                                                                                                       | `features/library/`               |
| Exportación PNG/SVG/PDF propia, `.excalidraw` autocontenido, Markdown | Pendiente (fase 5). La copia ZIP completa ya está hecha. Solo están disponibles las exportaciones del menú de Excalidraw                                                                                                       | —                                 |
| Sidecar: ramas colapsables y notas incrustadas                        | Los enlaces de elementos y los conectores sueltos ya se derivan y guardan; las ramas (6.2) y las tarjetas (6.3) siguen pendientes                                                                                              | `domain/sidecar.ts`               |
| Pila de deshacer coordinada para comandos propios                     | El deshacer del motor pasa la prueba de 100 acciones (fase 0); falta coordinarlo con comandos propios                                                                                                                          | —                                 |
| Interfaz del modo «Solo lápiz»                                        | El motor activa `penMode` al detectar el lápiz y el Apple Pencil funciona en el iPad (fase 0); el borrador del trazo en curso ya está hecho                                                                                    | `features/canvas/CanvasView.tsx`  |
| Búsqueda en documentos en conflicto                                   | Se indexa la cabeza más reciente; el diseño pide indexar todas con una marca visible                                                                                                                                           | `application/KnowledgeService.ts` |
| Frontmatter YAML completo                                             | Hay un subconjunto: valores simples y listas en línea. Si no lo reconoce, conserva el texto y avisa                                                                                                                            | `domain/frontmatter.ts`           |
| Desactivar la biblioteca externa de Excalidraw                        | Se quitaron los enlaces del menú; falta comprobar «Explorar bibliotecas»                                                                                                                                                       | —                                 |

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

## Licencias

El código propio es software libre con licencia **MIT** (`LICENSE`, Copyright (c) 2026 F. C.).

La aplicación compilada incluye Excalidraw (MIT), otras dependencias y fuentes de terceros. Para cumplir sus licencias, `pnpm assets` genera dos archivos que se publican en `dist/` y se enlazan desde «Estado y diagnóstico → Licencias»:

- `THIRD-PARTY-NOTICES.txt`: los avisos de copyright y el texto de licencia de cada paquete y de cada fuente;
- `LICENSE.txt`: la licencia MIT de la aplicación.

Los textos que los paquetes npm no incluyen están en [licenses/](licenses/). El inventario y la verificación de las fuentes están en [docs/licencias.md](docs/licencias.md). La fuente Liberation Sans 1.05 no se distribuye porque su licencia (GPLv2 con excepción y cláusulas añadidas) no encaja con el proyecto.
