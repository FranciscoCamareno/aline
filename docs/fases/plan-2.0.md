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
propuesto: **11 → 12 → 13 → 14**. La 11 es la base de la 12 (el inicio es donde viven los
entornos); la 13 es independiente y podría ir antes si el propietario lo prefiere. La 14
(pomodoro) también es independiente y no toca el formato.

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
| 11.4 | Acciones sobre cada elemento: abrir, renombrar, mover a carpeta, archivar, papelera, «Añadir a un entorno» (cuando exista la 12); selección múltiple para mover, archivar o añadir a un entorno | **Hecha (28/10/2026)**, con «Añadir a un entorno» desde la fase 12. Mover a una carpeta de su sección (`moveTargets`), archivar y papelera, uno o varios; enviar a la papelera desde Inicio no cambia de sección. Las mismas operaciones de `VaultService` que ya usa la barra; nada nuevo en el formato | M |
| 11.5 | Bloques de arriba: «Recientes» (los últimos abiertos) y «Entornos» (tarjetas, fase 12) | **Hecha (28/10/2026):** «Recientes» (lo último modificado) y, desde la fase 12, «Entornos de trabajo». — | S |

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
| 12.1 | Modelo: tipo de documento nuevo `workspace` («entorno») con nombre, color, descripción y la lista de sus miembros (ids de documentos, con orden) | **Hecha (28/10/2026).** `domain/workspace.ts`, tipo `workspace` (formato §2.5.5, esquema JSON, cabecera del diseño), `VaultService.createWorkspace/readWorkspace/updateWorkspace` (las cabezas en conflicto se unen al leer y el siguiente cambio guarda la unión). Icono `entorno.svg`. **Cambio de formato** (tipo nuevo, como `calendar` o `doc`): registrar en el diseño y en `formato-almacen.md`, esquema JSON, `isFolderKind` y compañía no lo incluyen. Un documento puede estar en varios entornos (decisión D-12a). Si dos dispositivos cambian los miembros a la vez, se unen (como `mergeCalendars`) | M |
| 12.2 | Interfaz: crear, renombrar, colorear y borrar entornos; añadir y quitar documentos (desde Inicio, desde «⋯» de cada fila y arrastrando a la tarjeta del entorno); vista del entorno en Inicio con sus miembros | **Hecha (28/10/2026).** Bloque «Entornos de trabajo» en Inicio (tarjetas con su color, «Nuevo entorno»), vista del entorno con sus miembros, nombre, color y papelera; «Añadir a un entorno» desde «⋯» y en grupo; «Quitar del entorno». Quitar un documento de un entorno no lo borra; borrar un entorno no borra sus documentos (como las carpetas: nunca en cascada) | M |
| 12.3 | Antes de compartir, un informe: qué documentos entran, qué imágenes y adjuntos, y **qué enlaces llevan fuera del entorno** (quedarán rotos para quien lo reciba), con la opción de añadir esos destinos | **Hecha (28/10/2026).** En «Compartir»: cuántos documentos y qué enlaces llevan fuera, con «Añadir al entorno». Sale del índice de enlaces (`KnowledgeService.outgoing`) | S |
| 12.4 | **Exportar el entorno como paquete** `.aline` (ZIP con el formato abierto: solo sus documentos, su versión vigente y sus objetos, más un manifiesto) | **Hecha (28/10/2026).** `application/workspacePackage.ts` y `app/workspaceShare.ts`; historial y contraseña opcionales (`ALP1`, PBKDF2 600 000). Solo la versión vigente por defecto: el historial puede guardar texto que se borró a propósito (D-12c). Cifrado opcional con contraseña reutilizando `shared/crypto.ts` (D-12d) | M |
| 12.5 | **Importar un paquete** en otro aline: vista previa de lo que trae, y se importa como un entorno. Volver a importar una versión posterior del mismo paquete la actualiza (las identidades se conservan; si los dos cambiaron lo mismo, queda como conflicto, con la interfaz que ya existe) | **Hecha (28/10/2026).** Vista previa (nuevos, se actualizan, ya están), importación con identidades: con historial como al sincronizar, sin historial como versión nueva encima de la importada antes (`importPackageVersions`). Pruebas en `entornos.test.ts` (también actualizar y conflicto) y `entornos.spec.ts` (otro navegador). Decisión D-12b: conservar identidades (se puede actualizar) o importar como copias nuevas (más simple, sin actualizaciones). Nunca mezcla almacenes: los documentos entran en el almacén abierto | L |
| 12.6 | Exportar el entorno para quien no usa aline: carpeta en Markdown, PDF de los documentos y PNG/PDF de los lienzos, en un ZIP | **Hecha (28/10/2026).** ZIP con notas y documentos Markdown, documentos con formato en Word y Markdown, lienzos en PNG y `.excalidraw` y calendarios como lista de próximos eventos. Reutiliza las exportaciones existentes (9.8, 9.9, fase 5) | M |
| 12.7 | Estudio (sin implementar): compartir en vivo con una carpeta de Drive compartida | **Hecho (28/10/2026):** [estudio-drive-compartido.md](estudio-drive-compartido.md). Entregable: un informe con lo que haría falta (Picker, permisos, varias personas, cifrado) y su coste, para decidir si entra en una versión posterior | S |

**Decidido (28/10/2026):** un documento puede estar en varios entornos (D-12a); al importar se
conservan las identidades para recibir actualizaciones (D-12b); el paquete no lleva historial salvo
que se marque (D-12c); cifrado con contraseña opcional (D-12d); y sí se exporta para quien no usa
aline (D-12e, 12.6).

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
| 13.1 | Prueba de viabilidad: páginas como marcos bloqueados, recorte, límites de desplazamiento y rendimiento con 50 páginas, también con el lápiz en el iPad | **Hecha en Chromium (28/10/2026); falta el iPad (propietario).** Los marcos bloqueados recortan lo suyo y se exportan solos; dibujar en la mesa se detiene antes de llegar al motor; lo arrastrado fuera vuelve dentro; con 50 páginas, añadir y desplazarse sigue fluido en el PC. Como la fase 0: se decide si seguir antes de construir encima. El iPad lo prueba el propietario | M |
| 13.2 | Modelo: `layout` en el sidecar (`{ mode: 'notebook', page: { size, orientation }, pages: [ids de los marcos] }`); «Nuevo → Cuaderno» además de «Lienzo» | **Hecha (28/10/2026).** «Nuevo → Cuaderno» (debajo de «Lienzo», también en Inicio y en la barra plegada) con tamaño y orientación; sidecar `notebook` y primera página ya en la escena. **Cambio de formato** compatible (como `background` en la 10.9): una versión anterior vería las páginas como marcos sueltos en un lienzo infinito, sin perder nada | M |
| 13.3 | Vista de cuaderno: columna de páginas, límites de desplazamiento, ajustar a la página, paso de página (botones, teclado y deslizar), número de página | **Hecha (28/10/2026).** Columna de páginas sobre la mesa, límites del desplazamiento, la primera página a lo ancho al abrir, barra de páginas (anterior, siguiente, página N de M, añadir) y solo se dibuja dentro de las páginas (decisión del propietario: nada fuera, como GoodNotes). — | L |
| 13.4 | Páginas: añadir (al final o detrás de la actual), duplicar, borrar con confirmación, reordenar (miniaturas en un panel lateral) | **Hecha (28/10/2026).** Panel con miniaturas (exportación del marco): ir, subir, bajar, duplicar y borrar con confirmación (nunca la última); cada operación es un paso de deshacer y devuelve el foco al lienzo. Un paso de deshacer por operación (como 9.25) | M |
| 13.5 | Fondo por cuaderno con los estilos de la 10.9 (y quizá plantillas de página: Cornell, pentagrama…, D-13d) | **Hecha (28/10/2026)** con los estilos de la 10.9, recortados a cada página. Sin plantillas de página (D-13d). La capa del fondo dibuja solo dentro de las páginas | M |
| 13.6 | Exportar: PDF con una página por página del cuaderno (tamaño real), PNG de la página actual | **Hecha (28/10/2026).** PDF con una página por página del cuaderno, a su tamaño (A4 o Carta) y orientación, con el estilo del fondo si se pide. jsPDF ya está | M |
| 13.7 | Convertir un lienzo infinito en cuaderno y al revés (D-13b) | **Hecha (28/10/2026)** desde el menú «Fondo»: lienzo → cuaderno (el contenido sin escalar desde la primera página, con las páginas que hagan falta) y cuaderno → lienzo (se quitan las páginas). Vacía el historial de deshacer. — | M |

**Decidido (28/10/2026):** A4 y Carta en las dos orientaciones, elegidos al crear (D-13a); se
puede convertir en los dos sentidos (D-13b); **solo se dibuja dentro de las páginas**, como
GoodNotes (D-13c, distinto de lo recomendado); sin plantillas de página por ahora (D-13d); y
«Cuaderno» es una opción propia de «Nuevo», debajo de «Lienzo». Recorridos en
`tests/e2e/cuaderno.spec.ts`; geometría en `tests/unit/cuaderno.test.ts`.

### Fase 14 — Pomodoro con mascota en la cabecera

**Qué pide el propietario:** una opción «Pomodoro» en el menú de Perfil que abra un modal para
elegir cuántos minutos u horas de enfoque. Al aceptar, en la cabecera aparece el temporizador con
una mascota pequeña. Al pulsarlo se despliega como una muesca (referencia: Coucou, la mascota que
vive en la muesca del Mac), con la hora en grande y la mascota con la que se puede interactuar.

**Diseño (31/10/2026).** Lienzo de diseño privado del propietario:
<https://claude.ai/artifact/7Kyf5ZDazx36dp3c64XADF>. Tiene el prototipo de la cabecera con la
muesca, el modal, las tres mascotas en cinco estados y la anatomía del chip y la muesca. Las
mascotas son **Tomi** (tomate coral), **Tofu** (cuadrado blandito crema, con cinta agua en el
enfoque) y **Pico** (triángulo agua con gafas). Siguen la construcción de los stickers (DESIGN.md
§2.3) con el estilo de figuras geométricas de Dots y Coucou. Sus estados son enfoque, descanso,
en pausa, último minuto y terminado.

**Análisis.** No toca el formato ni el almacén: un temporizador no es contenido. No crea
revisiones, no se sincroniza y no sale del dispositivo, así que no hay cambio de arquitectura. Lo
que sí cambia es el sistema de diseño. Hoy los stickers van «nunca en toolbars» y como mucho tres
por pantalla (§2.3), y la mascota vive en la cabecera. Hace falta registrar la excepción, como las
de la «G» de Google o el esquema Negro.

- **El tiempo se calcula, no se cuenta.** Se guarda la hora de fin (`endsAt`), o lo que quedaba
  si está en pausa, y lo restante es `endsAt − Date.now()`. Así sobrevive a recargas, a pestañas
  en segundo plano y a que el equipo se duerma, y no se desvía.
- **Las pestañas en segundo plano** limitan los temporizadores. Chrome llega a uno por minuto
  tras 5 minutos oculta. El aviso de fin usa un temporizador en un worker dedicado, que no sufre
  esa limitación, y al volver a la pestaña se recalcula todo.
- **Varias pestañas** comparten el mismo pomodoro (evento `storage`). Solo una suena y avisa al
  terminar cada fase: la primera que marca esa fase como avisada.
- **El sonido se sintetiza** con Web Audio (dos notas suaves). Así no hay archivo, ni licencia,
  ni red, y la CSP no cambia. El aviso del sistema (`Notification`) es opcional: el permiso se
  pide solo al marcar su casilla y, con la PWA instalada, se muestra desde el service worker.

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 14.1 | Registrar el diseño. En DESIGN.md: la excepción de §2.3 (mascota en la cabecera: una sola, entre 40 y 104 px), el componente «Pomodoro: chip y muesca» (§6), los iconos nuevos `reproducir`, `pausa`, `saltar` y `detener` (§7.4) y las reglas de movimiento | **Hecha (31/10/2026).** DESIGN.md §2.3 (excepción), §2.3.1 (mascotas), §6 y §7.4; `brand/mascotas/` declarada en TRADEMARKS_AND_ASSETS.md. Falta actualizar `ui-icons-preview.png`. Las 15 ilustraciones van a `brand/mascotas/<mascota>-<estado>.svg` (nivel 3: todos los derechos reservados), con su `mascotas-preview.png`. Los iconos nuevos van a `brand/icons/ui/` y a `IconName`. Cuidado con el contraste: el resaltador del chip en oscuro es `#6B5520`, como el del logotipo | S |
| 14.2 | Dominio puro `domain/pomodoro.ts`: configuración (zod desde `domain/zod.ts`), fases (enfoque, descanso, descanso largo), y las transiciones empezar, pausar, reanudar, +5 min, saltar, detener y siguiente fase, todas con el instante como argumento | **Hecha (31/10/2026).** Además, «Saltar» y «+5 min» sobre una fase terminada, la clave de cada fase (`phaseKey`) para avisar una vez y la lectura tolerante (`readSession`, `readConfig`). Sin reloj propio: `derive(state, now)` devuelve fase, restante, ciclo, si terminó y el estado de ánimo de la mascota (`enfoque`, `descanso`, `pausa`, `ultimo` en el último minuto, `fin`). Límites: de 5 min a 4 h de enfoque y de 1 a 8 ciclos. Pruebas en `tests/unit/pomodoro.test.ts` | M |
| 14.3 | Estado de la aplicación `app/pomodoro.ts`: tienda propia (zustand), guardada en `localStorage` `mindnote.pomodoro` (sesión en curso y última configuración), sincronizada entre pestañas, con un tic de 1 s solo mientras corre y la pestaña se ve | **Hecha (31/10/2026).** `usePomodoro` y `startPomodoroRuntime` (tic de 1 s mientras corre, recálculo al volver a la pestaña, evento `storage`). Fuera del almacén, como las demás preferencias de este navegador (`mindnote.home`, `mindnote.docLayout.*`). Lectura tolerante: un valor corrupto o de otra versión se descarta, nunca rompe el arranque | S |
| 14.4 | Modal `features/pomodoro/PomodoroDialog.tsx`, abierto desde «Pomodoro», el primer elemento del menú de Perfil (también en la barra plegada, `LibraryRail`). Ofrece enfoque (25, 50, 1 h 30 u «Otro…» con horas y minutos), descanso (5, 10, 15 o sin descanso), ciclos, mascota, sonido y aviso del sistema, con el total y la hora de fin | **Hecha (31/10/2026).** `features/pomodoro/PomodoroDialog.tsx`; las casillas de sonido y aviso se guardan, pero no hacen nada hasta la 14.7. Con un pomodoro en marcha, el elemento del menú muestra lo que queda y abre la muesca en vez del modal. Recuerda la última configuración. Las claves van en es y en en (`accesibilidad.test.ts`) | M |
| 14.5 | Chip y muesca en la cabecera: `PomodoroChip.tsx` centrado entre los dos espaciadores de `.topbar`, y `PomodoroNotch.tsx`, que cuelga del borde inferior de la cabecera (mismo panel y sin borde arriba) | **Hecha (31/10/2026)**, con parte de la 14.6: balanceo, saltito, bocadillo al pulsar la mascota y «reducir movimiento». Token nuevo `--highlighter`. A 375 px la cabecera ya se desbordaba sin el chip; a 768 px cabe. El chip lleva un resaltador que avanza bajo la hora, muestra «¡Hecho!» en mantequilla y la hora en grafito en pausa. La muesca se cierra con Escape, con un clic fuera o con el chip, y devuelve el foco. El chip es `role="timer"` sin anuncios por segundo; los cambios de fase se anuncian en una región `polite`. En pantalla estrecha, chip compacto («18′») y muesca a todo el ancho. En modo Zen, un chip flotante atenuado (App lo pinta cuando `zen`) | L |
| 14.6 | Mascota viva: las ilustraciones según el estado, el balanceo en el enfoque, el salto y las chispas al terminar, y la reacción al pulsarla (cara feliz y una frase corta 1,8 s, de una lista traducida) | **Hecha (31/10/2026)** junto con la 14.5. Con `prefers-reduced-motion`, todo pasa a cambios de estado sin animación. La mascota es un `<button>` con nombre accesible | S |
| 14.7 | Avisos al terminar cada fase: sonido con Web Audio, `Notification` opcional y el temporizador en un worker para las pestañas ocultas | **Hecha (31/10/2026).** `app/pomodoroAlerts.ts` (sonido de dos notas, aviso con `Notification` o, en el iPad, desde el service worker; una sola pestaña avisa, con Web Locks), `workers/pomodoroTimer.worker.ts` y el título de la pestaña (D-14d). El permiso se pide al marcar la casilla del modal. Una fase que terminó con la aplicación cerrada hace más de 2 min no se avisa. Sin peticiones de red: lo comprueba la prueba de privacidad e2e, y `csp.spec.ts` sigue pasando sin tocar `_headers`. Al terminar no empieza solo el descanso (D-14b): el chip queda en «¡Hecho!» hasta que se pulse | M |
| 14.8 | Recorrido e2e `tests/e2e/pomodoro.spec.ts` con el reloj de Playwright (`page.clock`): configurar, empezar, pausar, recargar y seguir, terminar, empezar el descanso, dos pestañas y modo Zen | **Hecha en Chromium (31/10/2026)**, con la comprobación de que no hay peticiones fuera del origen; los puntos 21 a 23 de [pruebas-ipad.md](../pruebas-ipad.md) son del propietario. Lo que no prueba Chromium (avisos en el iPad con la PWA instalada, sonido con el iPad en silencio) va a [pruebas-ipad.md](../pruebas-ipad.md) para el propietario | M |

**Decidido (31/10/2026):**

- **D-14a. Mascotas.** Entran las tres, elegibles en el modal; **Tofu** es la de por defecto
  (decisión del propietario, distinta de lo recomendado, que era Tomi).
- **D-14b. Al terminar una fase.** No empieza sola la siguiente: el chip queda en «¡Hecho!» hasta
  que el usuario la empiece.
- **D-14c. Descanso largo.** 15 min tras el último ciclo, configurable.
- **D-14d. Título de la pestaña.** Mientras está oculta, muestra lo que queda («18:20 · aline»).
- **D-14e. Dónde va el chip.** Centrado en la cabecera.

Orden de trabajo: 14.1 y 14.2 primero (no dependen de nada), luego 14.3, y después 14.4 a 14.7
sobre la tienda. La 14.8 se escribe con cada tarea y se cierra al final.

## 3. Riesgos de la 2.0

| Riesgo | Efecto | Mitigación |
| --- | --- | --- |
| El motor no aguanta muchas páginas (muchos marcos) con fluidez en el iPad | El cuaderno no es usable | 13.1 antes de construir; si falla, cargar solo las páginas cercanas o replantear |
| Una actualización del motor cambia cómo funcionan los marcos o el recorte | El cuaderno se rompe | Recorridos e2e de la fase 13 que lo comprueben, como `stickers.spec.ts` |
| Paquetes de entornos con datos que no se querían compartir | Fuga de información | Informe previo (12.3), solo versión vigente por defecto, cifrado opcional |
| Identidades importadas que chocan con las propias | Datos mezclados | Los UUID no chocan en la práctica; la importación comprueba hashes y nunca sobrescribe (crea cabezas en conflicto) |
| Un paquete malicioso usa ids conocidos (por enlaces `aline://` de lo compartido) | Romper un documento de aquí cambiándole el tipo, o meter documentos privados en el entorno para que salgan al compartirlo otra vez | Revisión de seguridad del 31/10/2026: `guardPackage` descarta documentos de otro tipo que el local, otros entornos y revisiones sueltas; `foreignMembers` quita del entorno los documentos de aquí que el paquete no trae (`entornos.test.ts`) |
| El navegador retrasa o no muestra el aviso de fin del pomodoro (pestaña oculta, iPad, permiso denegado) | El usuario no se entera de que terminó | Tiempo calculado desde `endsAt`, temporizador en un worker, título de la pestaña y chip en «¡Hecho!» al volver; el iPad lo prueba el propietario |
| La cabecera se llena en pantallas estrechas con el chip del pomodoro | Se tapan el título o las acciones | Chip compacto bajo cierto ancho y muesca a todo el ancho (14.5) |
| El alcance crece (R-02) | La 2.0 se alarga | Cada punto nuevo entra por decisión explícita y con su fase |
