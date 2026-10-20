# Diseño técnico del sistema personal de mapas mentales y notas conectadas

Versión 1.2 | 14 de octubre de 2026 | Base: documento de requerimientos de 34 páginas

> **Cambio de arquitectura registrado (13/10/2026): cifrado opcional en Google Drive.** A petición del propietario se revisa DP-07. El almacén sigue sin cifrar en el equipo y en la carpeta local. La copia en Google Drive puede ir sin cifrar (como hasta ahora, con el aviso RN-12) o cifrada de extremo a extremo; el propietario lo elige al conectar Drive y puede cambiarlo después. Afecta a §1.1, §2, §6 (formato en Drive), §13 (nueva §13.1) y §16 (RF-43, RF-44, RNF-15). El modelo de revisiones y el protocolo de sincronización no cambian: el cifrado es una capa del adaptador de Drive.

> **Cambio de arquitectura registrado (14/10/2026): calendario y plantillas del lienzo.** A petición del propietario, el almacén admite dos tipos de documento más: `calendar` (un calendario con sus eventos, cuerpo JSON en `objects/<hash>.json`) y `template` (una plantilla del lienzo: escena `.excalidraw` con sus imágenes como assets, cuerpo en `objects/<hash>.excalidraw`). Los dos son documentos revisionados como notas y lienzos: historial, papelera, copias completas y sincronización sin cambios de protocolo. El formato sigue siendo la v1 (`formatVersion: 1`); `metadata.kind` amplía su enumeración y aparece el esquema `calendar.schema.json`. Afecta a §5, §6 y al documento del formato (`docs/formato-almacen.md`). **Compatibilidad hacia atrás:** una versión de la aplicación anterior a este cambio no reconoce esos tipos y trata sus revisiones como contenido inválido (solo lectura); hay que actualizar todos los dispositivos antes de usar el calendario o las plantillas. Las plantillas sustituyen a la biblioteca del motor, que no admite imágenes y no se guardaba.

> **Cambio de arquitectura registrado (15/10/2026): documentos de texto enriquecido.** A petición del propietario, el almacén admite un tipo de documento más: `doc`, un documento con formato libre (títulos, negrita, cursiva, subrayado, listas, citas, alineación) editado con **Tiptap 3** (núcleo MIT, sobre ProseMirror; no se usan sus extensiones de pago). El cuerpo es JSON con el árbol del editor (`objects/<hash>.json`, esquema `rich-doc.schema.json`). No sustituye a las notas: las notas siguen siendo Markdown de texto plano (DP-03) y el editor de notas sigue siendo CodeMirror; un `doc` no tiene copia legible en `readable/` y solo se edita dentro de la aplicación. Es un documento revisionado como los demás: historial, papelera, conflictos (conservar o duplicar), copias completas, sincronización y cifrado de Drive sin cambios de protocolo. El formato sigue siendo la v1; `metadata.kind` amplía su enumeración. Vive en su propia sección de la barra lateral («Documentos»), fuera de las carpetas, y por ahora no entra en el índice de enlaces y búsqueda. La vista «Hoja» (A4) es solo presentación: no hay paginación al editar. Sin extensión de imágenes ni incrustados, lo pegado desde la web no descarga nada (§13). Afecta a §5, §6 y a `docs/formato-almacen.md` §2.5.3. **Compatibilidad hacia atrás:** igual que con el calendario, una versión anterior de la aplicación trata esas revisiones como contenido inválido; hay que actualizar todos los dispositivos antes de usar documentos.

> **Cambio de arquitectura registrado (16/10/2026): documentos Markdown y carpetas de «Documentos».** A petición del propietario, la sección «Documentos» ofrece dos editores y su propio árbol de carpetas. Se añaden dos tipos de documento: `mddoc`, un documento Markdown editado con **Milkdown 7** (paquetes base, MIT; sin Crepe ni `@milkdown/react`), con exactamente el formato de una nota (frontmatter y cuerpo en `objects/<hash>.md`, copia legible en `readable/`, edición externa, índice de enlaces y búsqueda); y `docfolder`, una carpeta de la sección «Documentos». Las carpetas de cada sección son independientes: notas y lienzos solo van en `folder`; documentos (`doc`, `mddoc`) solo en `docfolder`. Los documentos con formato (`doc`) dejan de ir siempre en la raíz. Milkdown reescribe el Markdown al guardarlo (estilo de listas, escapes), lo que esta sección acepta frente a la regla de §2 «sin conversión destructiva», que sigue valiendo para las notas (CodeMirror). Las imágenes de Markdown se muestran sin descargarlas (§13). La sección «Biblioteca» pasa a llamarse «Notas» en la interfaz. El formato sigue siendo la v1; protocolo de sincronización y cifrado sin cambios. Afecta a §5, §6 y a `docs/formato-almacen.md` §2.3, §2.5.3 y §2.5.4. **Compatibilidad hacia atrás:** una versión anterior de la aplicación trata esas revisiones como contenido inválido; hay que actualizar todos los dispositivos antes de usarlas.

> **Cambio registrado (16/10/2026): esquemas de color y excepción al filtro del lienzo.** La interfaz ofrece 8 esquemas de color en 4 pares claro ↔ oscuro (`docs/DESIGN.md` §2.5, `brand/themes/`). El usuario elige uno claro y uno oscuro en Preferencias; el interruptor de la cabecera alterna entre ellos y «Seguir al sistema» usa el que toque. Es una preferencia de este navegador (`localStorage`), no contenido ni sincronización. El fondo del lienzo se **pinta** con el del esquema cuando la escena tiene un fondo de esquema (el papel de los lienzos nuevos), pero **no se guarda**: escena, firma de contenido, revisiones y exportaciones conservan el fondo guardado. **Excepción a la regla de no sobrescribir `--theme-filter`:** solo en el esquema Negro, el lienzo invierte al 100 % para llegar a negro puro, a petición del propietario; las exportaciones oscuras siguen usando el filtro del motor (fondo `#121212`). El modelo de datos y el formato no cambian.

> **Cambio de arquitectura registrado (16/10/2026): todo enlazable y anclas de texto.** A petición del propietario, cualquier documento (notas, lienzos, documentos con formato y Markdown, calendarios y sus eventos) podrá enlazar y ser enlazado, y un enlace podrá salir de un fragmento de texto seleccionado y apuntar a un fragmento concreto de otro documento. Se eligió la opción híbrida: el destino se describe con una **cita textual** (texto exacto con contexto, la gramática de los fragmentos de texto de los navegadores), que no modifica el documento de destino y vale también para las copias `readable/` editadas fuera; en los documentos con formato se añade un **id de bloque** (`attrs.anchor`), escrito solo al crear el ancla para que abrir un documento no genere revisiones ni conflictos (por eso no se usa la extensión UniqueID de Tiptap, MIT, que asigna ids a todos los bloques al abrir). Las citas se toman sobre el texto mostrado, no el fuente. El esquema de los enlaces pasa de `mindnote://` (nombre provisional) a `aline://`; los enlaces anteriores se siguen leyendo y nunca se reescriben. Sintaxis completa en `docs/formato-almacen.md` §2.3.1; el formato sigue siendo la v1. Afecta a §10 y a §2.3.1, §2.5, §2.5.1 y §2.5.3 del formato. Plan por fases en `docs/Plan-de-fases.md` (fase 7). Desde la fase 7.E, los documentos con formato y los calendarios entran en el índice de enlaces y búsqueda (revisa lo dicho en el cambio del 15/10/2026), y el sidecar del lienzo guarda el ancla de sus enlaces (`fragment`, opcional). **Compatibilidad hacia atrás:** una versión anterior de la aplicación muestra como rotos los enlaces `aline://`; hay que actualizar todos los dispositivos.

> **Cambio de arquitectura registrado (17/10/2026): orden manual y archivado.** A petición del propietario, la barra lateral admite orden manual (arrastrar arriba y abajo, también carpetas dentro y fuera de otras) y archivar. Se guardan como metadatos opcionales de la revisión: `sortKey`, una clave fraccional que solo cambia en el documento movido, y `archived`. Así se sincronizan entre dispositivos como cualquier otro cambio de metadatos (un movimiento simultáneo en dos dispositivos es un conflicto de metadatos, como un renombrado). El formato sigue siendo la v1 (`docs/formato-almacen.md` §2.2). Lo archivado no se borra ni va a la papelera: sale de la barra, de Recientes y de los selectores de enlaces, sigue en la búsqueda con la marca «Archivado» y se gestiona en Configuración → Archivo. **Compatibilidad hacia atrás:** una versión anterior de la aplicación descarta estas claves al guardar; hay que actualizar todos los dispositivos. **Excepción de marca registrada:** los botones de Google Drive usan el logotipo «G» de Google según sus normas para botones de inicio de sesión, servido desde el propio origen (`brand/third-party/`); es la única excepción a la regla de iconos propios y no contacta con Google antes de la confirmación (§13).

> **Cambio registrado (17/10/2026): fuentes adicionales y parche del motor del lienzo.** A petición del propietario, lienzos y documentos con formato ofrecen un catálogo de 24 fuentes de Google Fonts (paquetes Fontsource, OFL-1.1 y una Apache-2.0), servidas desde el propio origen y descargadas solo al usarse (fuera de la precarga del PWA). Excalidraw 0.18.1 no permite registrar fuentes propias, así que se **parchea el motor** (`patches/@excalidraw__excalidraw@0.18.1.patch`, `pnpm patch`): `Fonts.init` registra además las fuentes de `globalThis.__alineExtraFonts` con sus métricas, y la app amplía la tabla exportada `FONT_FAMILY`. Las escenas guardan `fontFamily` ≥ 2001 para esas fuentes (formato §2.4); otras aplicaciones de Excalidraw muestran esos textos con su fuente por defecto. En los documentos con formato, fuente y tamaño son una marca `textStyle` (formato §2.5.3). Una prueba e2e y otra unitaria fallan si una actualización del motor deja el parche sin aplicar o sin efecto.

> **Cambio registrado (17/10/2026): comentarios, paginación, zoom y capítulos en los documentos con formato.** Los comentarios de Tiptap son de pago y dependen de su nube, así que son propios: los hilos (texto, respuestas, resuelto) se guardan en el propio documento (`comments`, formato §2.5.3) y el texto comentado lleva la marca `comment`; cambio de formato compatible (clave opcional, el formato sigue siendo la v1). La paginación de la vista «Hoja» deja de ser una sola hoja: decoraciones que miden los bloques e insertan los saltos de página A4 sin tocar el documento (un bloque más alto que una página no se parte). Zoom (propiedad CSS `zoom`, para que el editor siga colocando bien el cursor) y panel de capítulos (calculado de los títulos, sin ids) son presentación. Revisa lo dicho el 15/10/2026 sobre «Hoja» («no hay paginación al editar»).

> **Cambio de arquitectura registrado (17/10/2026): imágenes en los documentos y exportación a Word y PDF.** Los documentos con formato y los Markdown admiten imágenes: solo archivos del equipo (subir, pegar o arrastrar; PNG, JPEG, GIF o WebP de hasta 10 MB), guardados como archivos del almacén en `contentRefs.assets` y citados como `mindnote-asset:<sha256>`, igual que en el lienzo; cada revisión aporta solo los bytes nuevos y conserva las imágenes que sigue citando. Nunca se carga una imagen remota (§13): al pegar HTML, las imágenes de otras webs se descartan. En la copia legible de un documento Markdown la imagen es solo su cita. Revisa lo dicho el 15/10/2026 («sin extensión de imágenes»). Un documento con formato se exporta a Word (.docx, librería `docx`, MIT, cargada solo al exportar) y a PDF con la impresión del navegador («Guardar como PDF», A4 con los márgenes de la vista «Hoja»). El formato sigue siendo la v1 (`docs/formato-almacen.md` §2.3 y §2.5.3).

> **Cambio registrado (17/10/2026): pestañas, barra de herramientas y burbuja de selección en los documentos con formato.** A petición del propietario, y siguiendo la estructura de Google Docs con el diseño de la aplicación: un documento con formato puede tener varias **pestañas** (crear, renombrar, duplicar, eliminar), guardadas en el propio documento (`tabs`, formato §2.5.3; la principal sigue siendo el `content` raíz, así los documentos existentes no cambian). El panel «Pestañas del documento» sustituye al de capítulos y muestra los capítulos de la pestaña activa. Cada pestaña se edita con su propio editor (el deshacer no mezcla pestañas). Índice, enlaces con ancla, comentarios, imágenes y la exportación a Word cubren todas las pestañas; un enlace o comentario de otra pestaña cambia a ella. La impresión a PDF imprime la pestaña activa. La barra de herramientas pasa a una sola fila compacta (zoom y tamaño de letra editables, alineación y vista en menús) y, al seleccionar texto, una **burbuja flotante** ofrece comentar y enlazar (solo enlazar en los documentos Markdown). Cambio de formato compatible: el formato sigue siendo la v1.

> **Cambio registrado (17/10/2026): licencia en tres niveles.** A petición del propietario se revisa DP-09. El código propio pasa de MIT a **GNU AGPLv3** (`AGPL-3.0-only`, `LICENSE`); los motores y librerías de terceros conservan sus licencias permisivas (`THIRD-PARTY-NOTICES.md`, `docs/licencias.md`; `pnpm licenses:check` solo admite licencias compatibles); el nombre «aline», el logotipo, los iconos, los stickers y demás recursos de `brand/` (y sus copias en `public/`) quedan con todos los derechos reservados, fuera de la AGPLv3 (`TRADEMARKS_AND_ASSETS.md`, `brand/LICENSE.md`). Las versiones ya publicadas con MIT siguen siendo MIT para quien las obtuvo. La aplicación enlaza su código fuente desde «Estado y diagnóstico → Licencias» (AGPLv3 §13).

> **Cambio registrado (20/10/2026): eventos repetidos en el calendario.** A petición del propietario (plan 9.11), un evento puede repetirse cada N días, semanas (en uno o varios días), meses (mismo día del mes; se saltan los meses que no lo tienen) o años, y terminar en una fecha, tras un número de veces o nunca. Se guarda en el propio evento como clave opcional `recurrence` (formato §2.5.1), con `exceptions`: las apariciones quitadas al borrar o editar «solo este» (la editada pasa a ser un evento propio). Es un cambio compatible: sin subir `schemaVersion`; una versión anterior de la aplicación conserva la clave al editar el evento, pero solo muestra su primera aparición. Las apariciones se calculan al mostrar (`occurrencesBetween`), nunca se guardan una a una. La fusión de conflictos sigue siendo por `id` de evento: la serie entera es la de la versión más reciente.

Este diseño convierte los requisitos en decisiones de implementación. Es una especificación para comenzar a construir; no certifica que las pruebas de hardware, rendimiento o integración ya hayan pasado. Se distinguen los requisitos heredados, las decisiones técnicas propuestas y las verificaciones pendientes.

## 1. Decisión de arquitectura

Construir una **PWA con React y TypeScript**, usando **Excalidraw** para el lienzo, **Markdown** para las notas y **IndexedDB** para el guardado transaccional inmediato. Agregar adaptadores para exportar y guardar en una carpeta local en Windows y para sincronizar directamente con la API de Google Drive.

Toda la lógica de negocio se ejecuta en el dispositivo. Un alojamiento estático entrega la aplicación, sus fuentes y sus recursos; no recibe notas ni dibujos. Google Drive es el único servicio remoto de contenido, cuando el propietario lo activa. La primera versión no necesita un servidor de aplicación ni una base de datos remota.

La arquitectura es un monolito modular en el cliente. Tiene menos piezas que operar y permite compartir la misma implementación entre el PC y el iPad. El motor del lienzo, el almacenamiento y Drive quedan detrás de interfaces propias para contener cambios de proveedores.

### 1.1 Decisiones heredadas y confirmaciones

| Decisión | Resolución aplicada | Origen |
| --- | --- | --- |
| Producto propio | Construir sin reabrir la elección de adoptar Obsidian | DP-01 |
| Plataforma | Web instalable; escritorio empaquetado después | DP-02 |
| Notas | Markdown de texto plano, editable fuera del sistema | DP-03 |
| Sincronización | Google Drive opcional; operación local disponible | DP-04 |
| Colaboración | Fuera de la primera versión, incluso solo lectura | DP-05 |
| Lienzo | Excalidraw; intercambio en .excalidraw | DP-06, DP-11 |
| Cifrado | Equipo y carpeta local sin cifrar; copia en Drive sin cifrar o cifrada de extremo a extremo, a elección del propietario y modificable (§13.1) | DP-07 (revisada el 13/10/2026), DP-12 |
| Versiones | Sin eliminación automática por edad | DP-08 |
| Lápiz | Apple Pencil USB-C, confirmado en esta conversación | DP-10 |
| Escritura manual | Trazos; sin OCR ni búsqueda de escritura manuscrita | DP-13 |
| Infraestructura | Aún no hay alojamiento ni proyecto Google Cloud | Confirmación del propietario |

Las instrucciones y recomendaciones contenidas en el PDF se tratan como material de referencia. No autorizan publicar, contratar servicios, compartir datos ni modificar una cuenta. Este trabajo entrega el diseño y la preparación necesaria; esas acciones no se ejecutan.

### 1.2 Precisiones que evitan promesas incorrectas

- **Primera apertura:** crear un almacén en el navegador y mostrar un lienzo vacío de inmediato. Elegir carpeta o conectar Drive ocurre después, sin bloquear la captura inicial. Resuelve la tensión entre CA-01 y CA-33.
- **Local en iPad:** es almacenamiento del navegador; no se promete acceso persistente a una carpeta de la aplicación Archivos. La lectura con un editor externo se ofrece mediante exportación Markdown y ZIP.
- **Drive sin servidor:** requiere autorización Google; no implica crear una cuenta propia del producto. Si vence el token, el usuario debe reautorizar. Reconectar la red no garantiza que la autorización siga vigente [S3].
- **Segundo plano:** sincronizar al abrir, al recuperar foco y mientras la aplicación permanezca activa. No prometer actividad permanente con la PWA cerrada o suspendida.
- **Durabilidad web:** una transacción local evita estados parciales lógicos, pero no garantiza sobrevivir a todo fallo físico ni al borrado del almacenamiento del navegador. RNF-04 se valida ante cierre de proceso; una garantía frente a corte eléctrico requiere pruebas adicionales de plataforma.
- **Presión:** el Apple Pencil USB-C no tiene sensibilidad a presión. El trazo usa grosor elegido o variación simulada; no basa ninguna función en presión real [S7].
- **Safari:** la instalación y la petición de almacenamiento persistente reducen riesgos, pero no sustituyen una copia de seguridad. La política de almacenamiento depende de cuotas, persistencia y condiciones del sistema; no se reduce a una regla universal de siete días [S6].

## 2. Alcance de entregas

El documento contiene 22 RF de prioridad Debe. Constituyen la primera entrega funcional: RF-01, 02, 04, 07, 08, 12, 13, 17, 20, 21, 22, 23, 25, 26, 29, 30, 32, 33, 36, 37, 41 y 42. Papelera, identificadores inmutables y exportación completa también son obligatorios por las reglas de negocio.

La versión personal prevista incluye una segunda entrega con los Debería: estilo y alineación, mano alzada, imágenes, marcos, hijos y ramas, incrustación de notas, enlaces rotos, galería, historial navegable, importaciones, atajos y lápiz. El historial estructural se implementa desde el comienzo porque protege la sincronización; su interfaz completa puede llegar después.

Los Podría se mantienen opcionales: cuadrícula y ajuste, distribución automática, convertir texto en nota, grafo y plantillas. Las funciones gratuitas del motor pueden habilitarse si no añaden complejidad. RF-38 queda fuera. RF-43 y RF-44 vuelven con la revisión de DP-07 (§13.1). No se incorporan cuentas propias, plugins, IA, OCR ni aplicación móvil completa.

## 3. Lenguajes, bibliotecas y herramientas

| Área | Selección propuesta | Motivo y límite |
| --- | --- | --- |
| Lenguaje de aplicación | TypeScript con strict | Un lenguaje para interfaz, dominio, trabajadores y adaptadores |
| Interfaz | React, HTML y CSS | Integra el componente Excalidraw; CSS propio con variables |
| Compilación | Vite; Node.js 22.12 o superior compatible | Produce archivos estáticos; Node solo se usa para desarrollar y compilar [S8] |
| Lienzo | @excalidraw/excalidraw | Decisión del documento; licencia MIT comprobada [S1, S13] |
| Edición de notas | CodeMirror 6, modo Markdown | Conserva texto fuente; vista previa separada, sin conversión destructiva |
| Markdown | unified + remark-parse + remark-gfm + remark-rehype + rehype-sanitize | AST para enlaces y vista previa saneada; HTML crudo desactivado |
| Base local | Dexie sobre IndexedDB | Transacciones y consultas locales [S9] |
| Estado de interfaz | React y Zustand | Solo selección, paneles y estado visual; no reemplaza la persistencia |
| Validación | Zod y JSON Schema versionado | Verificar entradas, importaciones y compatibilidad |
| Búsqueda | MiniSearch en Web Worker | Índice reconstruible; texto completo local [S10] |
| Sincronización | fetch + Google Identity Services + Drive API v3 | Acceso directo desde el navegador [S3, S4] |
| PWA | Service Worker con Workbox, integrado mediante vite-plugin-pwa | Caché de recursos del producto; actualización controlada |
| Exportaciones | Excalidraw PNG/SVG; jsPDF para PDF | PDF como imagen paginada en v1, sin prometer vectores [S2, S11] |
| Copias | fflate para ZIP | Formato documentado, verificación por SHA-256 [S12] |
| Idiomas | i18next y react-i18next | Español e inglés, incluidos mensajes y errores |
| Verificación | Vitest; Playwright; pruebas manuales en iPad real | Los navegadores simulados no certifican el lápiz físico |
| Calidad | ESLint, Prettier, Git y pnpm | Código consistente, historial y versiones reproducibles |

Fijar versiones exactas después de la prueba de integración, registrar pnpm-lock.yaml y usar instalación congelada en CI. No tomar latest como política de producción. Confirmar la compatibilidad React/Excalidraw con el manifiesto del paquete elegido. Mantener inventario de dependencias y sus licencias, incluidas fuentes e iconos; no asumir que una licencia del motor cubre todos sus recursos.

El código propio se publica bajo GNU AGPLv3 y la marca con todos los derechos reservados (cambio registrado el 17/10/2026; antes se proponía MIT). No se necesita Python, Java, C#, PHP, PostgreSQL ni una base de grafos para ejecutar esta versión.

## 4. Componentes y responsabilidades

```text
PC Windows / iPad: PWA React
  Interfaz: lienzo | notas | biblioteca | búsqueda | historial
                          |
  Servicios de aplicación: comandos, validación, enlaces, versiones
         |                |                    |
  CanvasAdapter       VaultRepository       Trabajadores
  Excalidraw          Dexie / IndexedDB      búsqueda / ZIP / hash
                          |
                  Cola persistente de salida
                    /                  \
       LocalFolderAdapter          DriveAdapter
       carpeta Windows             OAuth + Drive API

Alojamiento HTTPS: entrega código y recursos; no almacena contenido.
```

| Módulo | Responsabilidad | Dependencias permitidas |
| --- | --- | --- |
| domain | Entidades, revisiones, conflictos, reglas RN | Sin React, Drive ni Excalidraw |
| application | Casos de uso y coordinación de transacciones | domain e interfaces de puertos |
| canvas | Interfaz del lienzo y adaptación de escenas | Puerto CanvasAdapter y componente motor |
| notes | Editor, enlaces rápidos y vista previa | application y parser Markdown |
| knowledge | Backlinks, etiquetas y referencias rotas | Revisiones activas y AST |
| persistence | Transacciones, recuperación y cuotas | Dexie y APIs del navegador |
| sync | Descarga, cola, reintentos y divergencias | Repositorio y puerto RemoteStore |
| portability | Importación, exportación y ZIP | Validadores y adaptador del motor |
| ui | Biblioteca, paneles, avisos y preferencias | Casos de uso; sin llamadas directas a Drive |

No introducir microservicios ni un bus de eventos remoto. Los comandos internos y eventos locales permiten coordinar módulos. Las operaciones que cambian contenido pasan por application, con excepción de la edición interactiva del motor, cuyos cambios se capturan y guardan mediante el adaptador.

### 4.1 Experiencia de uso

PC: barra lateral con carpetas, etiquetas y recientes; lienzo central; panel derecho de nota, backlinks o historial. La búsqueda abre una paleta y lleva al elemento encontrado. iPad: lienzo a pantalla completa, botones de al menos 44 CSS px como objetivo de diseño, paneles deslizables y modo lápiz explícito.

Estados visibles separados: «Cambios pendientes», «Guardado en este dispositivo», «Pendiente de escribir en carpeta», «Pendiente de sincronizar», «Sincronizado», «Necesita autorización», «Conflicto» y «Sin espacio». No mostrar «Sincronizado» al confirmar solo una escritura local.

## 5. Modelo de dominio y contratos de datos

| Entidad | Campos esenciales | Regla |
| --- | --- | --- |
| Vault | id, formatVersion, name, createdAt | Almacén independiente; UUID generado localmente |
| Document | id, kind, title, folderId, tags, headRevisionIds | kind: note, canvas, folder, calendar o template (los dos últimos desde el 14/10/2026); solo notas y lienzos van en carpetas; dos cabezas indican conflicto |
| Revision | id, documentId, parentIds, deviceId, createdAt, operation, metadata, contentRefs | Instantánea inmutable; fechas informativas |
| Asset | sha256, mimeType, byteLength, blob | Contenido direccionado por hash, deduplicado |
| Folder | id, parentId, title | Entidad revisionada; sin ciclos |
| Link | sourceDocumentId, sourceElementId o rango, targetDocumentId, targetElementId, kind | Derivado de contenido, no editable como backlink |
| VersionPrune | id, revisionIds, deviceId, createdAt | Orden explícita de retirada de versiones |
| DeviceState | deviceId, localGeneration, syncCursor, remoteFileMap | Configuración privada de cada instalación |

UUID mediante crypto.randomUUID para almacenes, documentos, carpetas y revisiones; identificadores nativos del motor para elementos. Un duplicado de documento recibe nuevo UUID; una restauración conserva el del documento. Etiquetas: normalización Unicode NFC, trim y minúsculas para unicidad, con etiqueta visible conservada.

```typescript
type Revision = {
  schemaVersion: 1;
  id: string;
  documentId: string;
  parentIds: string[];
  deviceId: string;
  createdAt: string; // ISO 8601 UTC, no determina precedencia
  operation: "save" | "delete" | "restore" | "resolve" | "external";
  metadata: {
    kind: "note" | "canvas" | "folder";
    title: string;
    folderId: string | null;
    tags: string[];
    deleted: boolean;
  };
  contentRefs: {
    body: string | null;       // SHA-256 del Markdown o escena
    extensions: string | null;
    assets: string[];
  };
};
```

El cuerpo de una escena conserva el esquema Excalidraw. Las funciones propias viven en un sidecar JSON y se publican en la misma revisión lógica. Las imágenes se guardan como blobs separados y se rehidratan al cargar. La exportación .excalidraw vuelve a incluir los archivos necesarios para ser autocontenida.

```json
{
  "schemaVersion": 1,
  "documentId": "UUID-del-lienzo",
  "elementLinks": {
    "elemento-A": {"documentId": "UUID-de-nota", "elementId": null}
  },
  "mindMap": {
    "parentByNode": {"elemento-B": "elemento-A"},
    "collapsedNodeIds": ["elemento-A"]
  },
  "noteEmbeds": [],
  "danglingConnectorIds": []
}
```

Validadores: UUID válido, versión soportada, identificadores no duplicados, hashes presentes, dimensiones y números finitos, límites de tamaño y ausencia de ciclos en árboles. Una versión desconocida se abre solo en modo lectura o se rechaza con mensaje claro; nunca se descarta contenido desconocido al guardar.

### 5.1 Markdown y enlaces estables

```markdown
---
schema_version: 1
id: 8b53f815-9d38-4313-a1ad-cb690fabf23c
title: Ideas de arquitectura
tags: [idea, sistema]
---

# Ideas de arquitectura

Ver [Mapa principal](aline://document/UUID-del-mapa).
```

El esquema interno es `aline://` (hasta el 16/10/2026, el nombre provisional `mindnote://`, que se sigue leyendo; formato §2.3.1). El renderer lo intercepta; no requiere instalar un protocolo del sistema operativo. El frontmatter viaja en importaciones y exportaciones. El contenido original se preserva como bytes UTF-8; el hash se calcula sobre bytes exactos, no sobre texto normalizado.

El usuario escribe [[ y selecciona una sugerencia por título; al confirmar se inserta un enlace Markdown con UUID. Un [[Título]] importado se resuelve solo cuando hay un único destino, o queda pendiente. Nunca escoger silenciosamente entre nombres duplicados.

Renombrar conserva el UUID y crea una revisión de metadatos. La interfaz muestra el título vigente para referencias internas; el texto explícito de un enlace puede mantenerse como alias. RF-23 se cumple porque los enlaces siguen resolviendo sin reescritura masiva. Si se ofrece «actualizar etiquetas visibles», hacerlo mediante revisiones independientes, sin convertirlo en requisito para la integridad del enlace.

En notas, un cambio de título, etiquetas o carpeta vuelve a serializar el frontmatter de la nueva revisión para que coincida con sus metadatos; conserva el cuerpo y la instantánea anterior. El Markdown sin frontmatter se puede importar, asignándole identidad local. Un frontmatter inválido se señala y se conserva como texto hasta resolverlo.

### 5.2 Trazos dentro de notas

El cuerpo de la nota sigue siendo Markdown. Cada bloque manuscrito referencia un adjunto Excalidraw mediante enlace y una vista previa PNG local. El paquete completo incluye ambos archivos. El editor abre el adjunto en modo lápiz. No se serializan puntos del lápiz dentro de párrafos Markdown ni se convierte el trazo a texto.

## 6. Formato abierto del almacén

La representación portable tiene los siguientes directorios. Todos los archivos de contenido son Markdown, JSON, .excalidraw o imágenes comunes. El README del almacén explica cómo localizar las revisiones activas sin ejecutar la aplicación.

```text
vault/
  vault.json                   identidad y versión del formato
  README.md                    especificación de lectura
  revisions/<revisionId>.json  metadatos y referencias de contenido
  objects/<sha256>.md          instantáneas de notas
  objects/<sha256>.excalidraw  instantáneas de escenas
  objects/<sha256>.json        extensiones propias
  assets/<sha256>.<extension>  adjuntos y vistas previas
  heads/<deviceId>.json        índice acelerador, reconstruible
  readable/<docId>/<revId>.md  copia legible y editable de nota
  controls/<operationId>.json eliminaciones explícitas de versiones
  catalog.json                 catálogo derivado de títulos y cabezas
```

**Decisión técnica de integridad:** los archivos de revisiones y objetos se crean una vez y la aplicación no los sobrescribe. Las copias readable usan nombres por revisión; esto evita que dos equipos escriban encima de una misma nota en Drive. catalog.json es una ayuda, nunca la autoridad para decidir qué cambio gana. Cada instalación puede producir su catálogo con nombre de dispositivo si no hay un único escritor.

El coste es conservar varias copias legibles de una nota. La biblioteca del producto muestra solo las cabezas vigentes; el explorador de archivos muestra revisiones. Para trabajar fuera del sistema se ofrece además «Exportar notas actuales» con una carpeta limpia de .md, adjuntos y catálogo. La app puede importar esa carpeta como cambios externos. No se promete un único archivo mutable compartido en Drive con exclusión mutua perfecta.

Esta elección satisface texto plano e integridad sin depender de escrituras condicionales remotas no verificadas. Si se prefiere más adelante notes/<id>.md como archivo compartido estable, habrá que validar control de concurrencia de Drive o añadir un coordinador; no basta comparar modifiedTime y luego sobrescribir.

En IndexedDB, guardar tablas: documents, revisions, blobs, outbox, remoteFiles, incomingStaging, externalObservations, linkIndex, searchDocuments, historyIndex, controls, deviceSettings y diagnostics. Los índices de enlaces, búsqueda, historial y miniaturas son reconstruibles. IndexedDB contiene bytes del formato abierto y estado operativo; no es la única forma de recuperar contenido.

## 7. Guardado, recuperación y versiones

### 7.1 Secuencia de guardado local

1. Capturar cambios relevantes de contenido mediante onChange; ignorar desplazamiento, zoom o selección para no generar revisiones de contenido [S1].
2. Agrupar cambios con espera de 500 ms y límite máximo de 2 s durante edición continua, ambos objetivos propuestos. Guardar también al terminar un trazo y antes de cambiar de documento.
3. Construir una instantánea coherente de cuerpo, extensiones y referencias. Calcular hashes fuera de la ruta de dibujo.
4. En una sola transacción IndexedDB, insertar blobs nuevos, revisión, cabezas y operación outbox. Confirmar «Guardado en este dispositivo» solo al completar la transacción.
5. Actualizar índices derivados de manera asíncrona. Si fallan, reconstruir; el contenido ya está conservado.
6. Los adaptadores escriben objetos primero y el registro de revisión al final. Los lectores no activan una revisión hasta tener y validar todos sus objetos.

Almacenar un borrador de trazo en curso periódicamente para no perder una línea larga antes del pointerup. Una revisión completa y el borrador tienen ciclos distintos. visibilitychange puede provocar un guardado adicional, pero no reemplaza el guardado periódico: no se depende de beforeunload.

En carpeta Windows, createWritable y close ofrecen la escritura segura documentada para un archivo; no equivalen a una transacción de varios archivos [S5]. Usar archivos nuevos por hash y publicar la revisión al final. Revalidar permisos tras reiniciar. Ante carpeta desconectada, mantener la cola local y permitir exportar recuperación.

Solicitar navigator.storage.persist, consultar persisted y estimate, y manejar QuotaExceededError. Avisar de cuota alta; ante cuota agotada no mostrar guardado exitoso. Ofrecer exportación de emergencia y eliminación explícita de versiones. No borrar versiones automáticamente para liberar espacio.

### 7.2 Historial

Una revisión confirmada representa un punto recuperable; no se guarda una versión por cada movimiento de ratón. Contenido idéntico comparte blobs. historyIndex lista metadatos sin cargar cuerpos. Abrir el lienzo actual no enumera ni descarga todas sus versiones.

Restaurar crea una revisión nueva con contenido antiguo y padre igual a la cabeza actual. Conserva la versión reemplazada. Papelera: operation delete conserva contenido e identidad, marca deleted; los backlinks se muestran rotos hasta restaurar.

Eliminar versiones requiere selección, cálculo del espacio realmente liberable y confirmación. Emitir un control VersionPrune; otros equipos deben aplicarlo antes de subir revisiones antiguas. Conservar metadatos mínimos de ascendencia cuando una revisión siga siendo padre de otra. Borrar blobs solo si ninguna revisión retenida los referencia. No eliminar cabezas, conflictos pendientes ni objetos en envío.

Los registros de poda impiden que un equipo sin conexión resucite una versión eliminada. Sus metadatos pueden conservarse aunque el cuerpo histórico se elimine. Mostrar tamaño lógico y espacio físico liberable como medidas distintas.

## 8. Sincronización entre dispositivos

### 8.1 Protocolo de revisiones

La precedencia depende de parentIds, no del reloj de los equipos. Cada documento forma un grafo de revisiones. Una revisión nueva apunta a las cabezas que el dispositivo conocía al editar. Dos cabezas sin relación de ascendencia son divergentes y permanecen visibles.

| Estado | Acción |
| --- | --- |
| Mismo revisionId y mismos hashes | No hacer nada; operación idempotente |
| Remoto desciende del local, sin borrador local | Avanzar a la revisión remota |
| Local desciende del remoto | Subir las revisiones faltantes |
| Cambios en documentos distintos | Incorporar ambos independientemente |
| Dos descendientes distintos del mismo padre | Conflicto; conservar ambas cabezas |
| Eliminación frente a edición concurrente | Conflicto entre papelera y contenido; no gana el borrado |
| Objetos incompletos o hash incorrecto | No activar; reintentar o poner en cuarentena |

Ejemplo: PC e iPad parten de R0. El PC crea R1(parent=R0) y el iPad R2(parent=R0) sin red. Drive conserva R1 y R2 como archivos diferentes. La interfaz ofrece conservar R1, conservar R2, duplicar o combinar manualmente. Resolver genera R3(parentIds=[R1,R2]). Elegir R1 no destruye R2 del historial.

No se implementa CRDT en v1 ni fusión automática de escenas. La divergencia se detecta a nivel documento; es deliberadamente conservadora aunque dos elementos distintos hayan cambiado. En notas se muestra un diff de texto para facilitar combinación manual.

### 8.2 Ciclo con Drive

1. Verificar autorización, almacén y dispositivo. Mantener un solo sincronizador por instalación con Web Locks si está disponible y una concesión transaccional con generación como respaldo.
2. Obtener los cambios remotos y aplicar primero los controles de poda. En el primer enlace, tomar un cursor inicial y reconciliar la lista completa; después consumir el feed para cubrir cambios ocurridos durante el listado.
3. Descargar objetos y revisiones en staging, verificar hashes y activar mediante transacción local. No avanzar el cursor hasta haber registrado todos los cambios de esa página [S14].
4. Subir blobs nuevos y luego revisiones selladas. Llevar operationId persistente para deduplicar reintentos. Si una petición terminó sin respuesta, buscar su resultado antes de crear de nuevo.
5. Descargar de nuevo cambios y calcular cabezas. Actualizar índices aceleradores solo después de conservar las revisiones.
6. Confirmar «Sincronizado» cuando no haya salida pendiente y se haya completado la consulta entrante más reciente; mostrar hora de esa consulta. Esto no implica que otros dispositivos no puedan producir cambios después.

Usar appProperties para vaultId, documentId, revisionId, hash y operationId. Los IDs de Drive son distintos de los UUID de dominio; guardar el mapeo. Los nombres de archivo no son únicos en Drive y no sirven para deduplicar. Solicitar solo los campos usados, paginar todas las listas y verificar permisos.

Al reanudar, validar la sesión de subida y comprobar si el archivo ya existe por operación. Subidas pequeñas multipart; adjuntos grandes resumibles [S15]. Propuesta: concurrencia de dos subidas en iPad y tres en PC, ajustable después de medir.

Reintentos con backoff exponencial y jitter, respetando Retry-After cuando se reciba. 401 pasa a «Necesita autorización»; 403 se clasifica por permisos o cuota; 429 y errores transitorios se reintentan; 404 de almacén no provoca borrar datos locales. Cancelar conexión conserva todo lo local.

### 8.3 Edición externa y límites del protocolo

Escanear copias readable y archivos importados al abrir el almacén, recuperar foco y antes de sincronizar. File System Access no proporciona aquí una promesa universal de observación instantánea: el diseño usa lectura y comparación de hashes. En Drive usar el feed de cambios y una reconciliación completa cuando el cursor sea inválido.

Si se modifica readable/<docId>/<revId>.md, comparar con el hash registrado y crear una revisión external cuyo padre es revId. Conservar el archivo observado y registrar su hash para no importarlo de nuevo. Si existía una edición descendiente en la app, ambas quedan en conflicto. Al renombrar o mover un archivo externo, el UUID del frontmatter conserva identidad; si falta, pedir asociación o importarlo como nota nueva.

La aplicación no reescribe una copia readable que pueda estar editando un programa externo. Borrar una copia readable no borra el documento; la eliminación del documento se realiza con papelera o mediante una importación explícita. Alterar manualmente objetos o revisiones internos es corrupción detectada, no un método soportado de edición.

La garantía del protocolo cubre cambios confirmados por aplicaciones que lo respetan. Una persona que sobrescriba o elimine directamente los archivos históricos en Drive puede destruir información; ningún cliente puede garantizar recuperar bytes que nunca recibió. Los backups completos y la separación entre originales y copias editables cubren este riesgo operacional.

### 8.4 Selección de almacenamiento

| Modo | Guardado inmediato | Representación portable | Entre equipos |
| --- | --- | --- | --- |
| Navegador | IndexedDB | Exportar ZIP y Markdown | Transferencia manual |
| Carpeta Windows | IndexedDB + cola hacia carpeta elegida | Almacén abierto en disco | Copiar/importar almacén; evitar escritores externos sobre objetos |
| Google Drive | IndexedDB + sincronización | Archivos visibles en carpeta propia de Drive | API directa y revisiones |

La carpeta del cliente Google Drive para escritorio no se usa simultáneamente con el adaptador API para el mismo almacén. Mantener una sola vía remota evita dobles escrituras y conflictos artificiales. Conectar un almacén local a Drive compara vaultId: mismo ID reconcilia, ID distinto requiere importar o elegir otro almacén. Cambiar de modo no borra el origen.

## 9. Integración del lienzo y mapas mentales

CanvasAdapter carga la escena completa, recibe cambios, actualiza elementos mediante API pública y obtiene una escena para exportar. onLinkOpen permite interceptar enlaces internos; customData admite metadatos por elemento. Estos mecanismos están documentados, pero la preservación de datos y la interacción concreta se deben probar con la versión fijada [S1].

El sidecar es la autoridad para enlaces, ramas e incrustaciones. customData contiene solo una marca de identidad o referencia redundante, nunca el único ejemplar de información propia. No reutilizar tipos internos no publicados del motor como contratos de dominio.

### 9.1 Ramas colapsables

El árbol mental es independiente de las flechas visuales. parentByNode exige un padre máximo y ausencia de ciclos; las conexiones conceptuales pueden formar un grafo general y no participan en colapso. Crear hijo añade forma, texto y flecha, y actualiza el árbol como un comando único.

Colapsar no marca descendientes como eliminados. Conserva la escena completa y calcula una proyección visible para el motor. Oculta descendientes y sus conectores, conserva posiciones y muestra un contador en el nodo raíz. Las conexiones con extremos ocultos se ocultan temporalmente; se restablecen al expandir.

Al recibir cambios de una proyección, reconciliar únicamente IDs que estaban visibles; los ocultos se conservan intactos. Distinguir ocultación, eliminación y tombstones propios del motor. Este comportamiento necesita una prueba específica porque una reinyección ingenua puede romper bindings, selección o undo. No se entrega RF-15 hasta pasar esa prueba.

### 9.2 Deshacer y reglas de conectores

Definir una pila de comandos del producto por lienzo con mínimo propuesto de 100 entradas; el adapter coordina las acciones del motor para evitar dos pilas que deshagan contenidos distintos. El protocolo de integración y las opciones de captura de historial se fijan tras la prueba del motor. No usar DOM privado ni interceptar atajos de forma que dupliquen un undo.

Las operaciones propias registran antes/después de escena y sidecar. Si la API elegida no permite coordinar de forma fiable una única pila, usar snapshots/deltas del adaptador como autoridad y desactivar las acciones duplicadas del motor. Medir memoria con 100 acciones: no copiar adjuntos binarios en cada entrada. El undo de sesión no sustituye el historial persistente.

Borrar un extremo de flecha conserva el conector, deja libre la unión afectada y lo añade a danglingConnectorIds. Si el comportamiento nativo elimina una flecha, el adaptador debe restaurarla mediante el mismo comando, sin generar una segunda acción de deshacer. Es un requisito de prueba explícito para RN-07.

### 9.3 Notas incrustadas y exportación visible

Una nota incrustada referencia un UUID; no duplica el texto como fuente editable independiente. En v1.1 se genera una tarjeta con título y extracto, usando elementos nativos de texto y marco. Abrirla lleva a la nota. Cambiar la nota actualiza su proyección sin modificar su identidad.

Los elementos generados deben distinguirse de los elementos libres y reconstruirse al cargar. La exportación visual usa exactamente la proyección visible, incluidas tarjetas, indicadores y trazos. El formato propio completo conserva también contenido oculto. No depender de un overlay HTML que desaparezca al exportar PNG o SVG.

## 10. Notas, búsqueda y backlinks

CodeMirror conserva Markdown fuente y una vista previa presenta el formato básico requerido. El parser extrae enlaces, etiquetas y texto indexable; no emplear expresiones regulares como único método para analizar Markdown con código, escapes o enlaces anidados.

Los backlinks se calculan a partir de las revisiones activas, excluyendo origen en papelera. Cada enlace almacena localmente documento y elemento/rango de origen. El destino puede ser un documento, un elemento de lienzo, un evento o un fragmento de texto descrito por una cita y, en documentos con formato, por un id de bloque (formato §2.3.1); una cita que ya no aparece deja el enlace con el ancla perdida, visible como enlace roto. Dos cabezas en conflicto se indexan con su revisionId y una marca visible para que la búsqueda no esconda ninguna versión divergente. Restaurar recalcula referencias.

Un enlace interno inválido aparece roto. Los enlaces web se validan sintácticamente pero no se comprueba su disponibilidad automáticamente, porque provocaría conexiones no configuradas. No obtener títulos ni vistas previas de páginas remotas sin una acción explícita.

### 10.1 Estrategia de búsqueda

Indexar cada nota o lienzo como documento de texto agregado, con título, etiquetas y texto de formas, etiquetas de flechas y tarjetas. Con el volumen de referencia son aproximadamente 2 500 documentos activos, no 500 000 registros independientes de elementos. Una tabla auxiliar relaciona fragmentos de texto con elementId.

MiniSearch corre en un trabajador y aplica búsqueda por prefijo, tokens y tolerancia a errores configurable [S10]. Buscar primero documentos y luego localizar coincidencias dentro de los resultados mediante el mapa auxiliar. Al elegir una coincidencia, cargar el lienzo, centrar y resaltar el elemento. El índice se actualiza por documento cambiado y se puede reconstruir desde contenido.

Conservar texto original para la vista; normalizar mayúsculas y diacríticos para búsqueda. Las notas manuscritas son localizables por título, etiquetas y contexto, no por lo escrito a mano. El primer indexado tiene progreso visible; no se promete búsqueda completa antes de terminarlo.

El objetivo de menos de 1 s se medirá desde la consulta hasta resultados navegables con índice preparado. Registrar separadamente tiempo de indexación inicial y tiempo de abrir el resultado. El límite real depende de bytes de texto e imágenes, no solo del número de notas.

## 11. Lápiz e iPad

Dispositivo objetivo: iPad A16 con Apple Pencil USB-C. Adoptar modo «Solo lápiz»: los punteros pen dibujan; touch no crea trazos, aunque puede usarse para desplazamiento y zoom de dos dedos. Ofrecer otro modo para dedo o ratón, con aviso de que no tiene el mismo rechazo de palma.

Comprobar pointerType y el comportamiento del motor en hardware real. No asegurar que un callback observado pueda impedir un trazo: validar la opción de modo lápiz del componente o el punto de extensión público necesario. Si no puede evitarse la creación de trazos touch, RF-47 queda bloqueado hasta resolver el adaptador o revisar el motor; no declarar que un filtro posterior es rechazo de palma certificado.

Guardar coordenadas y propiedades de los trazos nativos de Excalidraw, junto con grosor seleccionado y modo de simulación. Evitar rasterizar el único original. Un PNG es vista previa y no sustituye el archivo editable. Orientación horizontal y vertical, teclado virtual y navegación deben probarse en Safari y en la PWA instalada.

No se exige hover ni gesto de doble toque del lápiz. La matriz Apple confirma ausencia de presión en USB-C [S7]. La validación mínima incluye 20 frases con palma apoyada, sesión de 10 minutos, cambio de orientación y reapertura sin pérdida de trazo. Son tamaños de prueba propuestos.

## 12. Importación, exportación y recuperación

### 12.1 Formatos

| Operación | Comportamiento |
| --- | --- |
| PNG | Exportar proyección visible, fondo configurable y escala; controlar memoria |
| SVG | Exportar con imágenes y fuentes disponibles localmente; comprobar en visor externo |
| PDF | Renderizar la proyección a imagen e insertar mediante jsPDF; encajar o paginar |
| .excalidraw | Importar/serializar por las utilidades de la versión fijada; adjuntos autocontenidos |
| Markdown | Texto UTF-8 con frontmatter y adjuntos; exportación individual o carpeta actual |
| Almacén completo | ZIP con formato propio, originales, extensiones, historial, papelera y controles |

PNG y SVG usan las utilidades del componente. PDF requiere una capa adicional; no es una función que deba darse por cubierta al instalar Excalidraw [S2, S11]. Fondo, escala y selección se aplican antes de convertir. Si la imagen excede el presupuesto de memoria, ofrecer menor escala, selección o exportación paginada. No truncar elementos silenciosamente.

Al exportar .excalidraw informar que backlinks, organización, identidad de notas y árbol de colapso requieren el formato propio. Representar tarjetas como formas y texto cuando sea posible; no afirmar que conservan su vínculo semántico. La exportación de intercambio y el ZIP completo tienen promesas distintas: solo el segundo garantiza toda la semántica del producto.

La importación enumera elementos no soportados, valida tamaños y conserva el original si necesita conversión. Dos documentos con mismo UUID y contenido distinto entran como revisión externa o conflicto; importar como copia genera nuevo UUID y reescribe referencias internas del conjunto importado.

### 12.2 Copia completa y restauración

1. Capturar una generación consistente del almacén; fijar el conjunto de revisiones y referencias mientras se prepara la copia.
2. Generar ZIP con backup-manifest.json: versión, vaultId, fecha, rutas, tamaños y SHA-256 de cada archivo. Excluir tokens, permisos de navegador e índices reconstruibles.
3. Al restaurar, validar manifiesto, hashes, rutas y límites de descompresión; impedir rutas que salgan del directorio destino.
4. Restaurar en un almacén nuevo, nunca encima del activo. Reconstruir índices y comparar inventario antes de ofrecer abrirlo.
5. Conservar el original hasta que el propietario decida retirarlo. Comprobar igualdad de bytes de los archivos de contenido, no de cachés ni configuración de dispositivo.

fflate permite ZIP en el cliente [S12]. Propuesta inicial: aviso a partir de 250 MB y evaluación de memoria antes de procesar; no tratar ese número como capacidad garantizada. Para copias grandes, implementar ZIP por bloques y escritura incremental cuando la plataforma lo permita. En iPad, validar tamaño máximo real y ofrecer exportaciones separadas si el dispositivo no puede producir el ZIP completo, mostrando que no cumplen aún CA-16 para ese tamaño. Ese límite debe quedar registrado antes de usarlo con datos reales.

## 13. Seguridad y privacidad

El contenido permanece sin cifrar en el equipo y en la carpeta local (DP-07 revisada). HTTPS protege el transporte, pero no cifra los archivos guardados. Para Google Drive, el propietario elige al conectar entre sin cifrar (aviso RN-12) y cifrado de extremo a extremo (§13.1); nada se envía a Google antes de esa elección.

Usar OAuth con scope drive.file. Es un permiso por archivo, no acceso general a todo Drive [S4]. Crear archivos con el mismo cliente OAuth usado en todos los equipos. Elegir una carpeta mediante Picker no debe asumirse como permiso recursivo de todo archivo ajeno: comprobar cada archivo y pedir selección explícita/importación cuando no sea accesible.

No usar appDataFolder para las notas, porque no ofrece la visibilidad normal exigida. No incrustar client_secret ni refresh tokens en JavaScript. El client ID es configuración pública; el access token vive en memoria y se descarta al salir. La revocación y el cambio de cuenta no eliminan el almacén local.

Antes de aceptar una cuenta distinta, comprobar el acceso al vaultId seleccionado y pedir elección si el almacén pertenece a otro espacio; evitar subir automáticamente notas locales al Drive equivocado.

Saneamiento de Markdown y SVG importado, bloqueo de javascript y esquemas peligrosos, enlaces externos con protección de opener, y ausencia de iframes remotos automáticos. Las imágenes externas se muestran como referencias hasta que el usuario decida descargarlas o importarlas; no ejecutar solicitudes silenciosas para renderizarlas.

Fuentes, iconos, paquetes del motor y recursos PWA se sirven desde el mismo origen. Desactivar bibliotecas externas y funciones del componente que abran servicios no usados. El código GIS se carga solo después de elegir conectar Drive. No se incorporan analítica, reportes remotos de errores ni telemetría.

Configurar CSP y cabeceras mediante el alojamiento [S16]. Allowlist mínima por tipo de recurso: origen propio y, cuando se configure Drive, endpoints exactos de autenticación y API Google. Validar con CSP en modo reporte local durante integración y después bloquear. No escribir una CSP supuestamente final antes de probar los scripts y ventanas de Google.

### 13.1 Cifrado opcional de la copia en Drive

**Elección.** Al pulsar «Conectar Google Drive» se muestran las dos opciones, sin ninguna marcada:

- **Sin cifrar.** Aviso RN-12: Google y quien acceda a la cuenta pueden leer el contenido. A cambio, se puede leer y editar desde Drive y no hay contraseña que perder.
- **Cifrado.** Aviso: una contraseña y un código de recuperación perdidos hacen irrecuperable la copia de Drive; las notas no se leen ni editan desde Drive; el nombre del almacén, la cantidad, el tamaño y las fechas de los archivos siguen visibles. Se pide una contraseña de 10 caracteres como mínimo, y después se muestra un código de recuperación que hay que confirmar como guardado antes de continuar.

**Claves.**

- Cada almacén tiene una clave aleatoria de 256 bits. Se guarda envuelta en `encryption.json` (raíz de la carpeta de Drive, sin cifrar) con dos ranuras: una con la contraseña y otra con el código de recuperación.
- Ranuras: PBKDF2-SHA256 con 600 000 iteraciones y sal aleatoria, y la clave envuelta con AES-256-GCM. Los datos autenticados atan cada ranura a su almacén.
- `encryption.json` llega de Drive sin cifrar y se lee antes de comprobar ningún secreto, así que se valida antes de derivar nada: como mucho 16 KiB y 4 ranuras, entre 1 000 y 10 000 000 iteraciones, y sal, IV y clave envuelta de 16, 12 y 48 bytes exactos (auditoría de seguridad del 13/10/2026, H06).
- De la clave se derivan, con HKDF-SHA256, una clave AES-256-GCM para el contenido y otra HMAC-SHA256 para nombrar objetos.
- Cambiar la contraseña o el código solo reenvuelve la clave; no hay que volver a subir nada.
- En cada equipo, la clave derivada se guarda como `CryptoKey` no extraíble en IndexedDB, junto al almacén local, que ya está sin cifrar. Se pide una vez por equipo. Desconectar Drive la borra.
- Se usa solo Web Crypto: sin dependencias nuevas ni servidor.

**Qué se cifra.**

- Revisiones, objetos (notas, escenas, sidecars y adjuntos, con su tipo MIME dentro), controles e índices. Formato: `MNE1` + IV de 12 bytes + AES-256-GCM, con los datos autenticados `vaultId|ámbito|id`, para que un archivo movido o alterado no se acepte.
- Los objetos se nombran con HMAC(hash), no con su hash, para no revelar contenidos repetidos.
- Las revisiones no llevan `documentId` en `appProperties`.
- No hay copias legibles (`readable/`), así que no hay ediciones externas desde Drive.
- `vault.json` queda sin cifrar, porque la identidad del almacén hace falta para no mezclar almacenes (§8.4).
- La carpeta raíz lleva `appProperties.encrypted = true`. El adaptador nunca escribe sin cifrar en una carpeta cifrada, ni al revés.

**Cambio de modo.** Desde «Cifrado y contraseña»:

1. Se crea una carpeta nueva del mismo almacén en el otro modo y se sube todo, con marcas de publicación propias del destino `drive:<carpeta>`. Las versiones, el historial y los conflictos se conservan.
2. Cuando la carpeta nueva está completa, la antigua se marca `supersededBy` y se ofrece moverla a la papelera de Drive.
3. Los demás equipos detectan la marca (o la carpeta en la papelera) y se trasladan a la carpeta que indica `supersededBy`, siguiendo la cadena si hubo varios cambios; sin esa marca, solo si la cuenta tiene exactamente otra carpeta del almacén. Si la nueva está cifrada, piden la contraseña. Lo que hubieran subido solo a la carpeta antigua no se pierde: está en su almacén local y se publica en la nueva.
4. **Nunca se deja de cifrar sin confirmación** (auditoría de seguridad del 13/10/2026, H01). Si un equipo con la carpeta cifrada encuentra que la sustituye una sin cifrar, no sube nada a ella: queda en «revisar cifrado» y el propietario elige entre aceptar la carpeta sin cifrar o volver a cifrar en una carpeta nueva (contraseña y código nuevos), que sustituirá a la sin cifrar cuando esté completa.

**Conectar eligiendo cifrar cuando Drive ya tiene el almacén sin cifrar.** No se publica nada. Se ofrece crear una carpeta cifrada nueva (la sin cifrar se marca como sustituida cuando la nueva está completa y se ofrece moverla a la papelera) o usar expresamente la carpeta sin cifrar.

**Desconectar.** Siempre desvincula el equipo y borra su clave, sin tocar el almacén local ni Drive. Si Google no confirma la revocación del permiso (respuesta sin éxito, sin respuesta en 15 s, o sin token en memoria tras recargar), se avisa de que el permiso puede seguir concedido y de dónde retirarlo (H07).

Pasar de sin cifrar a cifrado no borra lo que Google ya pudo leer. La papelera y el historial de Drive conservan la carpeta antigua durante un tiempo, y el aviso lo dice.

Los diagnósticos son locales y rotados por tamaño, sin contenido de notas ni tokens. Exportarlos requiere acción del propietario. Esta rotación no afecta al historial de documentos, que no tiene borrado automático. El alojamiento puede procesar metadatos técnicos de solicitudes; distinguir eso de la promesa de no enviar contenido ni telemetría del producto.

## 14. Preparación del entorno y publicación

### 14.1 Entorno de desarrollo

Windows 11, Git, Node compatible con Vite, pnpm, editor de código y navegadores Chrome/Edge. Requisitos propuestos para desarrollar con comodidad: 8 GB de RAM mínimo operativo y 16 GB recomendado; no son mediciones ni requisitos mínimos del usuario final.

Crear repositorio con una app Vite react-ts. Configurar TypeScript strict, scripts dev/build/typecheck/lint/test/test:e2e y lockfile. Registrar versiones de Node y pnpm. Usar .env.local para configuración de desarrollo sin incluir tokens. Variables propuestas:

```text
VITE_GOOGLE_CLIENT_ID=cliente-OAuth-publico
VITE_GOOGLE_PICKER_API_KEY=clave-restringida-si-se-usa-Picker
VITE_APP_BASE_URL=https://origen-elegido
```

Las variables VITE son públicas en la compilación. Restringir la clave Picker por APIs y origen; nunca almacenar secretos con ese prefijo.

### 14.2 Alojamiento propuesto

Cloudflare Pages para el paquete estático producido en dist, con HTTPS, recursos del mismo origen y archivo de cabeceras. La documentación permite cabeceras personalizadas mediante _headers [S16]. Esta recomendación no presupone precio ni permanencia de un plan gratuito: revisar condiciones al contratar o activar.

Preparación: crear cuenta de alojamiento, conectar el repositorio, establecer el comando de compilación y directorio dist, definir origen estable de producción y probar HTTPS. No habilitar funciones de servidor para esta versión. Un dominio propio es opcional; su coste depende del proveedor. Mantener el origen estable: cambiar dominio o puerto crea otro espacio de almacenamiento y exige exportación/importación.

El manifiesto PWA define name, short_name, start_url, scope, display standalone e iconos. El Service Worker precachea todos los recursos necesarios para el núcleo, incluyendo fuentes y módulos que se cargan después; no cachea access tokens ni respuestas privadas de Drive. La primera instalación requiere red; las siguientes aperturas funcionan con la aplicación ya descargada.

### 14.3 Google Cloud y Drive

1. Crear proyecto de Google Cloud del propietario y habilitar Drive API; habilitar Picker API si se utilizará para selección explícita de archivos ajenos.
2. Configurar marca y consentimiento OAuth: aplicación personal en pruebas con el propietario como usuario de prueba; declarar drive.file y datos de contacto. Revisar políticas antes de distribuir a terceros [S3, S4].
3. Crear cliente OAuth de tipo web; registrar exactamente los orígenes HTTPS de producción y el localhost usado para desarrollo. No añadir orígenes de previews arbitrarios.
4. Configurar client ID público. Para Picker, clave restringida por referer y API. Probar cancelación, consentimiento parcial, expiración, revocación y cambio de cuenta.
5. Crear almacén de Drive desde la app y abrirlo en otro equipo con el mismo cliente. Importar archivos existentes mediante selección explícita cuando sea necesario.
6. Probar desconexión y reconexión sin cerrar y cerrando la PWA. Si la autorización expiró, mostrar «Reconectar Drive» sin bloquear la edición local.

Una distribución oficial puede usar un proyecto OAuth administrado por quien publica. Cada persona que autoaloje una copia independiente configura su propio proyecto y sus orígenes. No afirmar que todo usuario final necesita credenciales de desarrollador. Publicación OAuth puede requerir pasos adicionales según audiencia y permisos; no se ejecuta como parte de este diseño.

### 14.4 Actualizaciones

Al detectar una nueva aplicación, ofrecer actualizar después de confirmar guardados y pausar trabajadores. No activar Service Worker nuevo en mitad de una escritura. Antes de migrar formato, generar copia o conservar los bytes originales. Migraciones versionadas, idempotentes y verificables; nunca modificar silenciosamente una versión que un cliente antiguo interpreta distinto.

Separar versión de app, formato del almacén, sidecar y esquema Excalidraw. Si un cliente no entiende la versión nueva, lectura segura o bloqueo de edición con exportación disponible. Revertir la app no implica revertir automáticamente datos migrados.

## 15. Estructura del código y contratos internos

```text
src/
  app/                 arranque, navegación, preferencias
  domain/              entidades y reglas puras
  application/         comandos y consultas
  ports/               contratos sin proveedores
  features/canvas/     lienzo y comandos de mapa
  features/notes/      editor y bloques manuscritos
  features/library/    carpetas, recientes y etiquetas
  features/history/    versiones, papelera y conflictos
  adapters/excalidraw/ motor y proyección visible
  adapters/indexeddb/  transacciones y recuperación
  adapters/filesystem/ carpeta Windows
  adapters/drive/      OAuth, API y mapeo de IDs
  workers/             búsqueda, hashes, exportación ZIP
  locales/es/          traducciones españolas
  locales/en/          traducciones inglesas
tests/                 dominio, integraciones y recorridos
docs/                  formato, decisiones y operación
public/                manifiesto, iconos, fuentes y cabeceras
```

```typescript
interface VaultRepository {
  getHeads(documentId: string): Promise<Revision[]>;
  commit(change: CommitInput): Promise<CommitResult>;
  resolve(documentId: string, parents: string[], choice: ResolveInput): Promise<Revision>;
  restore(documentId: string, revisionId: string): Promise<Revision>;
  exportSnapshot(): Promise<VaultSnapshot>;
}

interface RemoteStore {
  pull(cursor: string | null): Promise<RemoteChangePage>;
  putObject(hash: string, bytes: Uint8Array, operationId: string): Promise<void>;
  publishRevision(revision: Revision, operationId: string): Promise<void>;
  publishControl(control: VersionPrune): Promise<void>;
}
```

CommitInput contiene la generación y cabezas conocidas al comenzar la edición. commit comprueba concurrencia en la transacción: si otra pestaña avanzó la cabeza, conserva el cambio como rama y devuelve conflicto o exige recarga, sin sobrescribir. Los tipos omitidos en este extracto se documentan junto con JSON Schema durante la fase de formato; no son una API REST incompleta.

Comandos: CreateDocument, SaveNote, SaveCanvas, RenameDocument, MoveDocument, SetTags, LinkElement, CreateChild, CollapseBranch, TrashDocument, RestoreDocument, RestoreRevision, ResolveConflict, PruneVersions, ConnectDrive, ImportArchive y ExportArchive. Eventos: RevisionCommitted, DocumentHeadsChanged, LinkIndexUpdated, SyncStatusChanged y StorageFailure.

Una orden de carpeta que afecta varios documentos se expresa como revisiones independientes; una eliminación de carpeta no elimina notas por cascada. En referencias a carpetas retiradas se utiliza una carpeta de recuperación hasta reorganizar. No prometer transacciones remotas entre todos los documentos.

## 16. Matriz de implementación y aceptación

| Requisitos | Solución | Validación principal |
| --- | --- | --- |
| RF-01, 02, 07, 08 | Motor y shell sin configuración inicial | CA-01, CA-12 y nuevos CA-T01/T02 |
| RF-03, 05, 06, 09, 10, 11 | Capacidades del motor, guardado de assets y estilos | CA-24; comprobar cada capacidad integrada |
| RF-04 | Pila coordinada de 100 acciones | CA-22 y prueba con comandos propios |
| RF-12, 13 | Bindings y etiquetas del motor | CA-02, CA-03; RN-07 |
| RF-14, 15, 16 | Árbol propio, comando hijo y proyección | CA-04, CA-05; layout diferido |
| RF-17, 18, 19 | Markdown, tarjetas y conversión opcional | CA-20, CA-28; conservación de adjuntos |
| RF-20, 21, 22, 23, 24 | UUID, parser, sugerencias e índice de enlaces | CA-06, 07, 08 y CA-T03 |
| RF-25, 26, 27, 28 | Entidades carpeta, etiquetas, búsqueda y galería | CA-09, CA-21; grafo diferido |
| RF-29, 30 | Transacción local y formato abierto | CA-10, 17, 28; fallos de escritura |
| RF-31, 46 | Revisiones, restauración y poda explícita | CA-23, 31, 32 |
| RF-32 | ZIP consistente y restauración aislada | CA-16 y comparación de hashes |
| RF-33 | PNG/SVG y PDF adicional | CA-13 en visores estándar |
| RF-34, 35, 45 | Importación y exportación con avisos | CA-18, CA-30; ida y vuelta Markdown |
| RF-36, 37, 41, 42 | Adaptadores y DAG de revisiones | CA-14, 29, 33; cortes y expiración |
| RF-39, 40 | Atajos por contexto y plantillas opcionales | CA-01; plantillas diferidas |
| RF-47, 48, 49 | Modo lápiz, escenas de tinta y UI táctil | CA-25, CA-26, hardware USB-C |
| RF-38, 43, 44 | Fuera de alcance o descartados | Sin implementación |
| RNF-01, 02, 10, 17 | Carga actual separada de historial y worker | CA-12, CA-31 y benchmark de búsqueda |
| RNF-03, 04, 16 | Caché completa, transacciones y cola | CA-10, CA-11, CA-29 |
| RNF-05, 06, 13 | Red restringida, consentimiento y logs locales | CA-19, CA-27 y revisión de logs |
| RNF-07, 08, 14 | PWA PC/iPad, teclado y lápiz | Matriz de navegadores y pruebas accesibles |
| RNF-09, 11, 12 | Esquemas, traducciones e inventario de licencias | Migración, revisión es/en y licencias |
| RNF-15 | Código de recuperación mostrado una vez y confirmado (§13.1) | Prueba e2e de creación y desbloqueo con el código |

CA-T01: crear cada forma RF-07, mover, rotar, redimensionar, duplicar y borrar; reabrir conserva el resultado. CA-T02: desplazamiento y zoom no limitan el lienzo ni generan versiones de contenido. CA-T03: [[ ofrece sugerencias, resuelve un UUID y conserva el enlace al renombrar. Complementan los criterios indirectos señalados por el documento.

### 16.1 Metas no funcionales propuestas

| Métrica | Objetivo de aceptación | Condición de medición |
| --- | --- | --- |
| Primera captura | Menos de 10 s | Instalación descargada, sin cuenta ni Drive |
| Apertura de lienzo | Menos de 2 s | 1 000 elementos, contenido local; imágenes medidas aparte |
| Arrastre | Menos de 100 ms de respuesta | Percentil 95 de interacción en hardware objetivo |
| Pérdida ante cierre | Máximo 5 s de cambios | Cierre de proceso; borradores y checkpoints activos |
| Búsqueda | Menos de 1 s | 2 000 notas, 500 lienzos, índice listo |
| Apertura con historial | Menos de 2 s | 100 versiones; no cargar cuerpos antiguos |
| Conectividad del núcleo | Completa sin internet | Recursos PWA precacheados y documentos locales |
| Red sin Drive | Solo origen de app al instalar/actualizar | Cero servicios de contenido o telemetría |

Son objetivos de diseño tomados o derivados del PDF, no resultados obtenidos. Registrar tamaño de texto, adjuntos, navegador, versión de sistema y hardware. No aceptar un benchmark vacío sin imágenes como prueba de todo el rango posible.

### 16.2 Pruebas necesarias

- Dominio: UUID estable, etiquetas, ciclos de árbol, cabezas concurrentes, borrado frente a edición, restauración y poda con ancestros retenidos.
- Persistencia: fallo antes/después de cada etapa, objetos huérfanos, cuota agotada, permiso retirado, dos pestañas y cierre durante trazo largo.
- Sincronización: tres dispositivos, offline, respuestas perdidas, duplicados, subidas parciales, cursor inválido, eliminación de versión con dispositivo desconectado y reautorización Google.
- Portabilidad: ida y vuelta .excalidraw con imágenes; ZIP con historial y papelera; Markdown editado fuera de la app; hashes idénticos de contenido restaurado.
- Lienzo: 100 undo/redo con enlaces y colapso; flecha suelta al borrar nodo; exportación de tarjetas y elementos visibles; preservación de ocultos.
- Producto: teclado, foco, contraste, zoom, español/inglés; red sin dependencias externas; iPad real con palma apoyada.

Playwright WebKit ayuda con automatización, pero no reemplaza Safari en iPad. Repetir pruebas con la app instalada y desde pestaña, con permisos restablecidos y almacenamiento cercano a su límite. Los tests de Drive reales usan un almacén de prueba, no el personal.

## 17. Plan de construcción y criterios para avanzar

| Fase | Entregable | Se avanza cuando |
| --- | --- | --- |
| 0. Viabilidad | Prototipo motor en PC/iPad: enlace, tinta, colapso, undo y exportación | El adaptador puede satisfacer reglas; métricas y fallos registrados |
| 1. Base | Repo, PWA, es/en, arranque local, esquemas y documentos de formato | Abrir sin cuenta; operar sin red después de instalar |
| 2. Datos | IndexedDB, revisiones, carpeta, papelera y backup | Fallos no producen pérdida silenciosa; ZIP se restaura |
| 3. Núcleo de ideas | Lienzo, Markdown, enlaces, organización y búsqueda | Los CA del núcleo pasan en Windows |
| 4. Drive | OAuth, cola, protocolo, conflictos y cambios externos | Pruebas entre dos equipos y iPad sin sobrescrituras |
| 5. Entrega Debe | PNG/SVG/PDF, accesibilidad, endurecimiento y documentación | Los 22 RF Debe y reglas obligatorias están cubiertos |
| 6. Entrega Debería | Ramas, tarjetas, historial UI, importaciones, tinta e iPad completo | CA de cada función pasan, incluidos los físicos |

El prototipo de fase 0 no necesita implementar Drive ni el producto entero. Además de las tres pruebas del Anexo A, añadir ramas, integración undo y RN-07 porque son riesgos del adaptador. Si falla una parte, investigar primero la API pública; un cambio a React Flow con perfect-freehand requiere reevaluar formas, dibujo, formato y esfuerzo. No sustituir el motor decidido sin registrar el cambio de arquitectura.

Backlog inicial concreto: crear CanvasAdapter y una escena de 1 000 elementos; interceptar un enlace interno; guardar/reabrir un trazo USB-C; conservar un conector al borrar nodo; probar proyección de rama y 100 undo; definir JSON Schema v1; implementar transacción revisión+outbox; inyectar fallos; generar y restaurar un ZIP; recién después ampliar interfaz y Drive.

No dar una fecha de entrega sin conocer dedicación y experiencia. La fase 0 y las pruebas de persistencia permiten estimar con evidencia. El núcleo local puede empezar de inmediato; la conexión real a Drive requiere el proyecto OAuth y el origen de la PWA. La publicación de código queda separada de la aceptación técnica.

## 18. Decisiones pendientes y límites aceptados del diseño

| Punto | Estado | Impacto |
| --- | --- | --- |
| Modelo de lápiz | Cerrado: USB-C | No se exige presión variable |
| Alojamiento y OAuth | Preparación definida; recursos aún no creados | Necesarios para uso entre dispositivos por Drive |
| Motor y adaptador | Pendiente de prueba física y técnica | Condiciona tinta, undo, ramas y conectores |
| Volumen real y tamaños | Supuesto S-04; bytes aún sin confirmar | Cuota, memoria, copias y benchmark |
| Esquema abierto por revisión | Propuesto en este diseño | Evita sobrescrituras; aumenta número de archivos |
| Empaquetado de escritorio | Diferido | No bloquea Windows web ni iPad |
| Licencia del código propio | GNU AGPLv3; marca y recursos de `brand/` con todos los derechos reservados | Decidida el 17/10/2026 (DP-09); bibliotecas se revisan aparte (`pnpm licenses:check`) |
| Colaboración simultánea futura | Fuera de v1 | Requiere nuevo protocolo; Drive actual no es base de coedición |
| Cifrado de la copia en Drive | Opcional desde el 13/10/2026 (§13.1) | Sin contraseña ni código, la copia de Drive es irrecuperable; el equipo y la carpeta siguen legibles |

Riesgos principales: esfuerzo de sincronización robusta, integración de funciones propias con Excalidraw y durabilidad del navegador en iPad. Se mitigan con pruebas tempranas, protocolo no destructivo y copias independientes. Conservar historia ilimitada significa crecimiento ilimitado de bytes y operaciones; la UI debe mostrarlo y no esconderlo tras una política de limpieza automática.

El diseño está listo para iniciar la fase de viabilidad y el núcleo local. No se presenta como una implementación ya validada ni como autorización para desplegar servicios. Las verificaciones pendientes tienen pruebas y criterios concretos, por lo que no quedan decisiones esenciales sin un camino de resolución.

## 19. Fuentes técnicas oficiales

Las referencias siguientes respaldan capacidades de plataforma o biblioteca. El protocolo de revisiones, el modelo de dominio y la organización modular son decisiones propuestas en este diseño, no funciones ya proporcionadas por esas bibliotecas. Consulta: 11 de octubre de 2026; no se asumen versiones futuras.

- [S1 - Excalidraw: props, onChange, onLinkOpen y customData](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/).
- [S2 - Excalidraw: utilidades de exportación](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export).
- [S3 - Google Identity: token model y expiración](https://developers.google.com/identity/oauth2/web/guides/use-token-model).
- [S4 - Google Drive: permisos por archivo y scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- [S5 - Chrome: acceso al sistema de archivos](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).
- [S6 - WebKit: política de almacenamiento y persistencia](https://webkit.org/blog/14403/updates-to-storage-policy/).
- [S7 - Apple: compatibilidad y prestaciones del Pencil USB-C](https://www.apple.com/apple-pencil/).
- [S8 - Vite: requisitos y configuración inicial](https://vite.dev/guide/).
- [S9 - Dexie: diseño sobre IndexedDB](https://dexie.org/docs/Tutorial/Design).
- [S10 - MiniSearch: repositorio oficial](https://github.com/lucaong/minisearch).
- [S11 - jsPDF: repositorio oficial](https://github.com/parallax/jsPDF).
- [S12 - fflate: repositorio oficial](https://github.com/101arrowz/fflate).
- [S13 - Excalidraw: licencia MIT](https://github.com/excalidraw/excalidraw/blob/master/LICENSE).
- [S14 - Drive: recuperación incremental de cambios](https://developers.google.com/workspace/drive/api/guides/manage-changes).
- [S15 - Drive: cargas simples y resumibles](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
- [S16 - Cloudflare Pages: cabeceras de respuestas](https://developers.cloudflare.com/pages/configuration/headers/).

Fuente funcional: Documento de Requerimientos: Sistema personal de mapas mentales y notas conectadas, proporcionado por el propietario, 34 páginas. La conversación confirma Apple Pencil USB-C y ausencia actual de alojamiento/proyecto Google Cloud.
