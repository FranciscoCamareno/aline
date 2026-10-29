# Plan de fases: versión 2.0

Versión 0.1 | 28 de octubre de 2026 | Base: la 1.0.0 (etiqueta `v1.0.0`) | Diseño: [Diseno-tecnico-sistema.md](../Diseno-tecnico-sistema.md)

Este documento empieza la preparación de la 2.0. El plan anterior (fases 0 a 10, de la beta a la
1.0) está archivado en [historial/Plan-de-fases-1.0.md](../historial/Plan-de-fases-1.0.md): el
código y los documentos citan sus tareas como «plan 9.x» o «plan 10.x», y ahí siguen. Para no
mezclar referencias, la numeración continúa: las fases de la 2.0 empiezan en la **11**.

**De momento todo es local:** nada se empuja a GitHub ni se publica hasta que el propietario lo
diga. Los puntos de la 2.0 pueden crecer; este documento recoge solo los primeros.

## 1. Lo que sigue pendiente de la 1.0

Se trae aquí lo del plan archivado que todavía cuenta; el resto ya está hecho o solo es historia.

| Pendiente | Quién | Notas |
| --- | --- | --- |
| Matriz de pruebas en el iPad ([pruebas-ipad.md](../pruebas-ipad.md)) y dos semanas de uso real | Propietario | Lo exigía la definición de beta. Con la fase 13 (cuaderno) pasa a ser más importante: el cuaderno es para el iPad y el Apple Pencil |
| Modo «Solo lápiz» propio y bloques manuscritos en notas (antigua 6.7; RF-47, RF-48, CA-25, CA-26) | — | Sigue esperando la prueba 0.4 en el iPad. Encaja con la fase 13, pero no entra en ella salvo decisión |
| Google Drive con Google real: modo cifrado y dos equipos | Propietario | La conexión simple ya funciona en producción |
| Recorrido con Google real tras publicar la 1.0 (consola abierta, CSP) | Propietario | `docs/operacion.md` |
| Recorrido e2e intermitente: «conflicto entre dos pestañas» en Edge con los dos navegadores a la vez | — | Pasa solo; vigilarlo |
| Riesgos que siguen vivos: R-13 (Safari borra el almacenamiento), R-02 (el alcance crece) | — | Misma mitigación: PWA instalada, `persist`, copias; cada punto nuevo entra por decisión explícita |

## 2. Fases de la 2.0

Cada fase se cierra con `pnpm verify` y sus recorridos e2e y se puede terminar sola. Orden
propuesto: **11 → 12 → 13**. La 11 es la base de la 12 (el inicio es donde viven los entornos);
la 13 es independiente y podría ir antes si el propietario lo prefiere.

### Fase 11 — Inicio: todos los documentos en un solo sitio

**Qué pide el propietario:** una página o sección «Inicio» en la barra lateral que muestre todos
los documentos y notas, al estilo de «Mi unidad» de Google Drive, y desde la que se llegue a los
entornos de trabajo (fase 12).

**Análisis.** Hoy la barra lateral tiene tres secciones (Notas, Documentos, Calendario), cada una
con su lista y sus carpetas, y la vista principal es siempre un documento. No hay un sitio con
todo junto. Se puede hacer sin tocar el formato: es una vista sobre `useUiStore().documents`.

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 11.1 | Sección `home` («Inicio») en la barra lateral, la primera (Inicio → Notas → Documentos → Calendario), y una vista principal propia cuando está activa (no abre un documento) | **Hecha (28/10/2026).** `section` = `home`, que no abre documento (como el calendario) y conserva el abierto para volver; icono nuevo `brand/icons/ui/inicio.svg`; barra plegada y su «Nuevo» con todo. `section` gana el valor `home`; entrar en Inicio no abre el documento más reciente. En la barra plegada (9.19), un icono más | M |
| 11.2 | Vista «Inicio» al estilo de «Mi unidad»: cuadrícula y lista (preferencia de este navegador), con nombre, tipo, carpeta y fecha de modificación; orden por nombre o fecha; filtro por tipo (notas, lienzos, documentos, calendarios, carpetas); búsqueda por título | **Hecha (28/10/2026).** `features/home/HomeView.tsx` y reglas puras en `application/home.ts` (`inicio.test.ts`); preferencias en `mindnote.home`. Las carpetas de Notas y de Documentos se muestran como carpetas y se entra en ellas (miga de pan). Lo archivado no sale, como en la barra | M |
| 11.3 | Miniaturas: lienzos y plantillas con `exportToSvg` (como `TemplateThumb`), notas y documentos con las primeras líneas del texto indexado, calendarios con los próximos eventos | **Hecha (28/10/2026).** `HomeThumb.tsx`: se cargan al verse (IntersectionObserver); el lienzo reutiliza `CanvasPreview`; las notas sin el encabezado que repite el título. Se pintan al verse (perezosas) y se guardan en memoria; con miles de documentos, paginado como `LoadMore` (9.21) | M |
| 11.4 | Acciones sobre cada elemento: abrir, renombrar, mover a carpeta, archivar, papelera, «Añadir a un entorno» (cuando exista la 12); selección múltiple para mover, archivar o añadir a un entorno | **Hecha (28/10/2026)**, salvo «Añadir a un entorno» (llega con la fase 12). Mover a una carpeta de su sección (`moveTargets`), archivar y papelera, uno o varios; enviar a la papelera desde Inicio no cambia de sección. Las mismas operaciones de `VaultService` que ya usa la barra; nada nuevo en el formato | M |
| 11.5 | Bloques de arriba: «Recientes» (los últimos abiertos) y «Entornos» (tarjetas, fase 12) | **Hecha (28/10/2026)** la parte de «Recientes» (lo último modificado); «Entornos» llega con la fase 12. — | S |

**Decidido (28/10/2026):** se sigue abriendo el último documento (Inicio, a un clic); entran los
calendarios, no las plantillas. Recorrido en `tests/e2e/inicio.spec.ts`.

### Fase 12 — Entornos de trabajo para compartir

**Qué pide el propietario:** agrupar documentos, notas, etc. en un entorno de trabajo y compartir
solo lo que está dentro de ese entorno con personas concretas, exportándolo o de otra forma.

**Análisis.** La aplicación no tiene cuentas ni servidor (decisión de diseño), así que «compartir
con alguien» solo puede ser: (a) **un paquete** que se exporta y la otra persona importa en su
aline, o lee sin aline; o (b) **una carpeta de Google Drive compartida** con esas personas, que
cada una sincroniza. La (b) es un cambio grande de arquitectura: varias personas escribiendo en el
mismo sitio, permisos, el ámbito `drive.file` (la aplicación solo ve lo que crea; la carpeta de
otra persona hay que abrirla con Google Picker), conflictos entre personas y, con cifrado,
compartir la clave. La (a) cabe en lo que ya existe: el formato abierto (`application/vaultFormat.ts`),
las copias ZIP y la importación con identidades.

Se propone hacer la (a) en la 2.0 y dejar la (b) como estudio aparte (12.7), sin compromiso.

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 12.1 | Modelo: tipo de documento nuevo `workspace` («entorno») con nombre, color, descripción y la lista de sus miembros (ids de documentos, con orden) | **Cambio de formato** (tipo nuevo, como `calendar` o `doc`): registrar en el diseño y en `formato-almacen.md`, esquema JSON, `isFolderKind` y compañía no lo incluyen. Un documento puede estar en varios entornos (decisión D-12a). Si dos dispositivos cambian los miembros a la vez, se unen (como `mergeCalendars`) | M |
| 12.2 | Interfaz: crear, renombrar, colorear y borrar entornos; añadir y quitar documentos (desde Inicio, desde «⋯» de cada fila y arrastrando a la tarjeta del entorno); vista del entorno en Inicio con sus miembros | Quitar un documento de un entorno no lo borra; borrar un entorno no borra sus documentos (como las carpetas: nunca en cascada) | M |
| 12.3 | Antes de compartir, un informe: qué documentos entran, qué imágenes y adjuntos, y **qué enlaces llevan fuera del entorno** (quedarán rotos para quien lo reciba), con la opción de añadir esos destinos | Sale del índice de enlaces (`KnowledgeService.outgoing`) | S |
| 12.4 | **Exportar el entorno como paquete** `.aline` (ZIP con el formato abierto: solo sus documentos, su versión vigente y sus objetos, más un manifiesto) | Solo la versión vigente por defecto: el historial puede guardar texto que se borró a propósito (D-12c). Cifrado opcional con contraseña reutilizando `shared/crypto.ts` (D-12d) | M |
| 12.5 | **Importar un paquete** en otro aline: vista previa de lo que trae, y se importa como un entorno. Volver a importar una versión posterior del mismo paquete la actualiza (las identidades se conservan; si los dos cambiaron lo mismo, queda como conflicto, con la interfaz que ya existe) | Decisión D-12b: conservar identidades (se puede actualizar) o importar como copias nuevas (más simple, sin actualizaciones). Nunca mezcla almacenes: los documentos entran en el almacén abierto | L |
| 12.6 | Exportar el entorno para quien no usa aline: carpeta en Markdown, PDF de los documentos y PNG/PDF de los lienzos, en un ZIP | Reutiliza las exportaciones existentes (9.8, 9.9, fase 5) | M |
| 12.7 | Estudio (sin implementar): compartir en vivo con una carpeta de Drive compartida | Entregable: un informe con lo que haría falta (Picker, permisos, varias personas, cifrado) y su coste, para decidir si entra en una versión posterior | S |

**Decisiones pendientes del propietario:**

- **D-12a** ¿Un documento puede estar en varios entornos (como etiquetas) o solo en uno (como una
  carpeta)? Recomendación: en varios.
- **D-12b** Al importar un paquete, ¿conservar identidades para poder recibir actualizaciones, o
  importar siempre copias? Recomendación: conservar identidades.
- **D-12c** ¿El paquete lleva el historial de versiones? Recomendación: no por defecto, con una
  casilla para incluirlo.
- **D-12d** ¿Cifrar el paquete con contraseña? Recomendación: opcional.
- **D-12e** ¿Hace falta la 12.6 (exportar para quien no tiene aline) en la 2.0?

### Fase 13 — Lienzo en modo cuaderno

**Qué pide el propietario:** al crear un lienzo, elegir entre el lienzo infinito actual o una
vista de cuaderno con páginas, como GoodNotes, con las mismas funciones que el lienzo.

**Análisis.** El motor (Excalidraw 0.18.1) solo tiene el lienzo infinito: no tiene páginas ni
permite limitar el desplazamiento (no hay restricciones de scroll en su API). Lo viable sin cambiar
de motor es hacer las páginas con lo que ya trae y con capas propias:

- **Cada página es un marco del motor** (`frame`): los marcos ya recortan lo que contienen, se
  exportan y se pueden enfocar (`scrollToContent`). Las páginas van bloqueadas, una debajo de otra,
  con un hueco entre ellas, todas del mismo tamaño (A4 vertical por defecto).
- **El fondo** se pinta con la capa de la 1.0 (10.9): mesa gris fuera de las páginas y, dentro,
  blanco con el estilo elegido (liso, puntos, renglones, cuadrícula), que en un cuaderno es lo
  natural. La capa pasa de gradientes de CSS a dibujar en su propio canvas.
- **El desplazamiento** se limita desde fuera: si la vista se sale de la columna de páginas, se
  devuelve (`updateScene` sin crear historial). El zoom tiene un mínimo y un «ajustar a la página».
- **Lo que se dibuja fuera de una página** no se pierde (el motor no lo impide): o se mueve a la
  página más cercana o se marca; decisión D-13c.
- Es **el mismo tipo de documento** `canvas` con un modo en el sidecar (`layout`), así que enlaces
  a elementos, búsqueda, plantillas, stickers, mapa mental y exportación siguen funcionando.

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 13.1 | Prueba de viabilidad: páginas como marcos bloqueados, recorte, límites de desplazamiento y rendimiento con 50 páginas, también con el lápiz en el iPad | Como la fase 0: se decide si seguir antes de construir encima. El iPad lo prueba el propietario | M |
| 13.2 | Modelo: `layout` en el sidecar (`{ mode: 'notebook', page: { size, orientation }, pages: [ids de los marcos] }`); «Nuevo → Cuaderno» además de «Lienzo» | **Cambio de formato** compatible (como `background` en la 10.9): una versión anterior vería las páginas como marcos sueltos en un lienzo infinito, sin perder nada | M |
| 13.3 | Vista de cuaderno: columna de páginas, límites de desplazamiento, ajustar a la página, paso de página (botones, teclado y deslizar), número de página | — | L |
| 13.4 | Páginas: añadir (al final o detrás de la actual), duplicar, borrar con confirmación, reordenar (miniaturas en un panel lateral) | Un paso de deshacer por operación (como 9.25) | M |
| 13.5 | Fondo por cuaderno con los estilos de la 10.9 (y quizá plantillas de página: Cornell, pentagrama…, D-13d) | La capa del fondo dibuja solo dentro de las páginas | M |
| 13.6 | Exportar: PDF con una página por página del cuaderno (tamaño real), PNG de la página actual | jsPDF ya está | M |
| 13.7 | Convertir un lienzo infinito en cuaderno y al revés (D-13b) | — | M |

**Decisiones pendientes del propietario:**

- **D-13a** Tamaños de página: ¿A4 y Carta, vertical y horizontal? Recomendación: A4 y Carta,
  las dos orientaciones, elegidas al crear el cuaderno.
- **D-13b** ¿Se puede convertir un lienzo existente en cuaderno? Recomendación: sí, colocando el
  contenido en páginas sin escalarlo; y de cuaderno a lienzo, quitando las páginas.
- **D-13c** ¿Qué pasa con lo que se dibuja fuera de las páginas? Recomendación: se acepta, pero
  se marca y no se exporta (como en una mesa).
- **D-13d** ¿Plantillas de página (Cornell, pentagrama, agenda) además de los estilos de fondo?

## 3. Riesgos de la 2.0

| Riesgo | Efecto | Mitigación |
| --- | --- | --- |
| El motor no aguanta muchas páginas (muchos marcos) con fluidez en el iPad | El cuaderno no es usable | 13.1 antes de construir; si falla, cargar solo las páginas cercanas o replantear |
| Una actualización del motor cambia cómo funcionan los marcos o el recorte | El cuaderno se rompe | Recorridos e2e de la fase 13 que lo comprueben, como `stickers.spec.ts` |
| Paquetes de entornos con datos que no se querían compartir | Fuga de información | Informe previo (12.3), solo versión vigente por defecto, cifrado opcional |
| Identidades importadas que chocan con las propias | Datos mezclados | Los UUID no chocan en la práctica; la importación comprueba hashes y nunca sobrescribe (crea cabezas en conflicto) |
| El alcance crece (R-02) | La 2.0 se alarga | Cada punto nuevo entra por decisión explícita y con su fase |
