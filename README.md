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
  features/history/    (pendiente)
  features/status/     estado del almacén, exportación de emergencia y diagnóstico
  adapters/excalidraw/ serialización de escenas y assets
  adapters/indexeddb/  esquema Dexie, transacciones, persistencia y cuota
  adapters/filesystem/ (pendiente) carpeta Windows
  adapters/drive/      (pendiente) OAuth y Drive API
  workers/             hash SHA-256; (pendiente) búsqueda y ZIP
  locales/es, locales/en
tests/unit, tests/e2e, tests/fase0
spikes/fase0          banco de viabilidad del motor (fuera del producto)
```

ESLint impide que `domain`, `application` y `ports` importen React, Dexie, Excalidraw o
adaptadores, y que la interfaz llame directamente a Drive o a la carpeta.

## Verificación

Última ejecución: 12/10/2026, Windows 11, Node 24.21.

- `pnpm verify`: typecheck, lint, 38 pruebas unitarias y compilación, todo correcto.
- `pnpm licenses:check`: 339 paquetes de producción, ninguno fuera de la lista admitida.
- `pnpm test:e2e`: 12 recorridos en Chromium sin fallos en dos ejecuciones seguidas:
  - primera apertura con lienzo vacío;
  - dibujar, recargar y comprobar que la escena reabierta conserva el contenido;
  - nota Markdown guardada y reabierta, con frontmatter correcto;
  - cambiar de documento antes de que venza la espera de 500 ms sin perder el texto;
  - renombrar nota y lienzo conservando UUID, título y frontmatter;
  - sin Drive no hay peticiones fuera del origen; la app abre sin conexión tras instalarse;
  - vuelve al último documento abierto, no al último modificado;
  - panel de estado: persistencia, diagnóstico (sin texto de notas) y exportación de emergencia
    que contiene todo el contenido;
  - almacén inaccesible: aviso y almacén temporal funcional;
  - revisión de versión futura: solo lectura y nada se guarda encima;
  - nota de unos 48 KB guardada con el hash en el worker y reabierta íntegra.
- `pnpm test:fase0`: 8 pruebas de viabilidad del motor (ver
  [docs/fase-0-viabilidad.md](docs/fase-0-viabilidad.md)).
- Las pruebas unitarias cubren también la atomicidad del commit, las ramas ante cabezas
  concurrentes, la restauración, el saneamiento de la vista previa, la sincronía entre los
  esquemas del código y los JSON Schema publicados, la rotación del diagnóstico y la exportación
  de emergencia byte a byte.

**No verificado** (no se ha ejecutado):

- Rechazo de palma, presión y rendimiento en el iPad: el propietario confirma que el Apple Pencil
  funciona, pero faltan los datos detallados del protocolo de la fase 0 (§4 y §6 del informe).
- Pérdida máxima ante cierre del proceso o corte eléctrico (RNF-04).
- Cuota del navegador agotada en un navegador real: el código lo trata, pero no se ha provocado.
- Instalación como PWA en el escritorio o en la pantalla de inicio del iPad.
- El flujo de actualización de la PWA con una versión nueva publicada (requiere un despliegue).
- La integración continua: el workflow existe, pero no se ha ejecutado porque el repositorio no
  tiene remoto.

## Funciones pendientes

Los contratos ya están definidos en `src/ports/` y los adaptadores pendientes devuelven el
error `not-implemented` en vez de simular un éxito.
El orden de trabajo hasta la beta está en [docs/Plan-de-fases.md](docs/Plan-de-fases.md).

| Área                                                                                    | Estado                                                                                                                                  | Dónde                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Google Drive (OAuth GIS, Drive API v3, `appProperties`, subidas)                        | Contrato definido; sin implementar. Faltan el proyecto de Google Cloud y un origen HTTPS                                                | `ports/RemoteStore.ts`, `ports/RemoteAuth.ts`, `adapters/drive/` |
| Sincronización (ciclo, cursor, staging, reintentos, Web Locks)                          | Contrato `SyncEngine`; la cola `outbox` ya se llena pero nadie la consume                                                               | `ports/RemoteStore.ts`                                           |
| Carpeta local en Windows (File System Access)                                           | Contrato definido; sin implementar                                                                                                      | `ports/LocalFolderStore.ts`, `adapters/filesystem/`              |
| Resolución de conflictos                                                                | Se detectan y se conservan las dos cabezas; `resolve` sin implementar y sin UI                                                          | `adapters/indexeddb/DexieVaultRepository.ts`                     |
| Historial, papelera y poda de versiones                                                 | Datos registrados (`historyIndex`, `restore`); sin UI ni poda                                                                           | `features/history/README.md`                                     |
| Enlaces `[[`, backlinks, enlaces rotos (RF-20 a RF-24)                                  | Solo se abren enlaces `mindnote://` en la vista previa                                                                                  | `features/notes/`                                                |
| Carpetas y etiquetas en la UI, búsqueda MiniSearch en worker                            | Pendientes; las etiquetas existen en el modelo                                                                                          | `workers/README.md`                                              |
| Exportación PNG/SVG/PDF propia, `.excalidraw` autocontenido, Markdown, ZIP completo     | Pendiente. Solo están disponibles las exportaciones del menú de Excalidraw                                                              | —                                                                |
| Sidecar: enlaces de elementos, ramas colapsables, notas incrustadas, conectores sueltos | El sidecar se crea y se conserva; no tiene funciones                                                                                    | `domain/sidecar.ts`                                              |
| Pila de deshacer coordinada para comandos propios                                       | El deshacer del motor pasa la prueba de 100 acciones (fase 0); falta coordinarlo con comandos propios                                   | —                                                                |
| Modo «Solo lápiz» y borrador de trazo en curso                                          | El motor activa `penMode` al detectar el lápiz y el Apple Pencil funciona en el iPad (fase 0); falta la interfaz del modo y el borrador | `features/canvas/CanvasView.tsx`                                 |
| Frontmatter YAML completo                                                               | Hay un subconjunto: valores simples y listas en línea. Si no lo reconoce, conserva el texto y avisa                                     | `domain/frontmatter.ts`                                          |
| Desactivar la biblioteca externa de Excalidraw                                          | Se quitaron los enlaces del menú; falta comprobar «Explorar bibliotecas»                                                                | —                                                                |
| Abrir otro almacén y varios almacenes por navegador                                     | El almacén inaccesible ofrece reintentar o un almacén temporal; elegir otro llega con el plan 2.2                                       | `app/StartupError.tsx`                                           |
| Escritura del formato abierto en disco (`vault/`)                                       | Especificado en `docs/formato-almacen.md` con JSON Schema; el serializador llega con el plan 2.1                                        | `domain/format.ts`                                               |

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
