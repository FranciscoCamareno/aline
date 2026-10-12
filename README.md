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
  adapters/excalidraw/ serialización de escenas y assets
  adapters/indexeddb/  esquema Dexie, transacciones, registro de almacenes, persistencia y cuota
  adapters/zip/        ZIP con fflate, rutas seguras y límites de descompresión
  adapters/filesystem/ (pendiente) carpeta Windows
  adapters/drive/      (pendiente) OAuth y Drive API
  workers/             hash SHA-256 y ZIP; (pendiente) búsqueda
  locales/es, locales/en
tests/unit, tests/e2e, tests/fase0
spikes/fase0          banco de viabilidad del motor (fuera del producto)
```

ESLint impide que `domain`, `application` y `ports` importen React, Dexie, Excalidraw o
adaptadores, y que la interfaz llame directamente a Drive o a la carpeta.

## Verificación

Última ejecución: 12/10/2026, Windows 11, Node 24.21.

- `pnpm verify`: typecheck, lint, 60 pruebas unitarias y compilación, todo correcto.
- `pnpm test:e2e`: 19 recorridos en Chromium sin fallos en dos ejecuciones seguidas. Además de
  los de las fases anteriores:
  - papelera: enviar, restaurar y eliminar definitivamente (CA-15);
  - historial: vista previa de una versión anterior, restauración y recarga (CA-23);
  - conflicto real entre dos pestañas, aviso, diferencias y combinación manual (CA-14);
  - copia ZIP, restauración en un almacén nuevo con comprobación byte a byte y apertura (CA-16);
  - trazo a medias recuperado tras cerrar la pestaña sin levantar el puntero;
  - cierre sin eventos de salida: lo escrito más de 5 s antes se conserva (CA-10 en Chromium);
  - la app compilada distribuye su licencia MIT y los avisos de terceros.
- `pnpm test:fase0`: 8 pruebas de viabilidad del motor (ver
  [docs/fase-0-viabilidad.md](docs/fase-0-viabilidad.md)).
- Pruebas unitarias de la fase 2: ida y vuelta del formato abierto, revisiones con objetos
  alterados o ausentes, versiones posteriores conservadas, controles de poda, copia y restauración
  byte a byte, rutas inseguras y bombas de descompresión, papelera y borrado definitivo,
  historial, las tres formas de resolver un conflicto, un fallo inyectado en cada etapa del
  guardado (sin escrituras parciales) y cuota agotada.

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

## Funciones pendientes

Los contratos ya están definidos en `src/ports/` y los adaptadores pendientes devuelven el
error `not-implemented` en vez de simular un éxito.
El orden de trabajo hasta la beta está en [docs/Plan-de-fases.md](docs/Plan-de-fases.md).

| Área                                                                                    | Estado                                                                                                                                        | Dónde                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Google Drive (OAuth GIS, Drive API v3, `appProperties`, subidas)                        | Contrato definido; sin implementar. Faltan el proyecto de Google Cloud y un origen HTTPS                                                      | `ports/RemoteStore.ts`, `ports/RemoteAuth.ts`, `adapters/drive/` |
| Sincronización (ciclo, cursor, staging, reintentos, Web Locks)                          | Contrato `SyncEngine`; la cola `outbox` ya se llena pero nadie la consume. Las restauraciones no generan salida pendiente                     | `ports/RemoteStore.ts`                                           |
| Carpeta local en Windows (File System Access)                                           | Contrato definido; sin implementar                                                                                                            | `ports/LocalFolderStore.ts`, `adapters/filesystem/`              |
| Poda selectiva de versiones y espacio que ocupan (RF-46)                                | Historial, papelera y borrado definitivo de documentos hechos; falta eliminar versiones concretas o antiguas y mostrar su espacio             | `features/history/`                                              |
| Enlaces `[[`, backlinks, enlaces rotos (RF-20 a RF-24)                                  | Solo se abren enlaces `mindnote://` en la vista previa                                                                                        | `features/notes/`                                                |
| Carpetas y etiquetas en la UI, búsqueda MiniSearch en worker                            | Pendientes; las etiquetas existen en el modelo                                                                                                | `workers/README.md`                                              |
| Exportación PNG/SVG/PDF propia, `.excalidraw` autocontenido, Markdown                   | Pendiente (fase 5). La copia ZIP completa ya está hecha. Solo están disponibles las exportaciones del menú de Excalidraw                      | —                                                                |
| Sidecar: enlaces de elementos, ramas colapsables, notas incrustadas, conectores sueltos | El sidecar se crea y se conserva; no tiene funciones                                                                                          | `domain/sidecar.ts`                                              |
| Pila de deshacer coordinada para comandos propios                                       | El deshacer del motor pasa la prueba de 100 acciones (fase 0); falta coordinarlo con comandos propios                                         | —                                                                |
| Interfaz del modo «Solo lápiz»                                                          | El motor activa `penMode` al detectar el lápiz y el Apple Pencil funciona en el iPad (fase 0); el borrador del trazo en curso ya está hecho   | `features/canvas/CanvasView.tsx`                                 |
| Frontmatter YAML completo                                                               | Hay un subconjunto: valores simples y listas en línea. Si no lo reconoce, conserva el texto y avisa                                           | `domain/frontmatter.ts`                                          |
| Desactivar la biblioteca externa de Excalidraw                                          | Se quitaron los enlaces del menú; falta comprobar «Explorar bibliotecas»                                                                      | —                                                                |
| Escritura del formato abierto en una carpeta o en Drive                                 | El serializador y el lector existen (`application/vaultFormat.ts`) y los usa la copia ZIP; faltan los adaptadores de carpeta y Drive (fase 4) | `application/vaultFormat.ts`                                     |

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
