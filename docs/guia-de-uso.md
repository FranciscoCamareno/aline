# Guía de uso

Aline (en la interfaz aparece todavía con el nombre provisional «MindNote») es un sistema personal de mapas mentales y notas conectadas. Funciona en el navegador del PC (Chrome o Edge) y en el iPad (Safari). Puede instalarse como aplicación y trabaja sin conexión.

_English version: [user-guide.md](user-guide.md)._

## 1. Primeros pasos

- **Abrir:** al entrar aparece un lienzo vacío listo para dibujar. No hace falta cuenta.
- **Dónde se guarda:** todo se guarda solo en este navegador, unos instantes después de cada cambio. La barra superior muestra «Guardado en este dispositivo» cuando el cambio ya está escrito.
- **Instalar** (recomendado, sobre todo en el iPad):
  - en el PC, con el icono de instalar de la barra de direcciones;
  - en el iPad, con Safari → Compartir → «Añadir a pantalla de inicio».

  Instalada, la aplicación conserva mejor sus datos y abre sin conexión.

## 2. Lienzos y mapas mentales

- **Lienzo nuevo:** en la pestaña **Notas** de la barra lateral, «+ Nuevo» → «Lienzo». Las herramientas están en la bandeja de abajo; sus atajos y estilos son los de Excalidraw.
- **Notas adhesivas y stickers:** la nota de la bandeja (o la tecla N) pone una nota adhesiva en el centro; con doble clic se escribe en ella. La hoja de stickers (o la tecla B) abre los stickers: se colocan con un clic o arrastrándolos al lienzo.
- **Plantillas:** selecciona elementos (también imágenes y stickers), pulsa «Plantillas» (arriba a la derecha) → «Guardar selección» y ponle un nombre. Cada plantilla muestra una miniatura. Para usarla, púlsala en el panel o arrástrala al lienzo: se inserta una copia.
- **Fondo del lienzo:** el botón **Fondo** de encima del lienzo elige liso, puntos, renglones o cuadrícula. Es de cada lienzo y se guarda con él. Al exportar a imagen o PDF, marca «Incluir el estilo del fondo» si lo quieres en la imagen.
- **Vincular un elemento** con una nota, otro lienzo o una web: selecciona el elemento y pulsa «Vincular» (encima del lienzo). El enlace se abre haciendo clic en el icono del elemento.
- **Conectores sueltos:** si una flecha deja de estar unida a una forma, aparece un aviso que permite seleccionar esas flechas.
- **Exportar** («Exportar» en la barra superior → «Imagen, PDF o .excalidraw…», o el menú ☰ del lienzo):
  - **PNG o SVG**, con fondo o sin él y a escala 1×, 2× o 3×;
  - **PDF A4**, encajado en una página o repartido en varias;
  - **.excalidraw**, para abrir el lienzo en Excalidraw. El diálogo avisa de lo que no viaja: enlaces internos, backlinks, historial, carpetas y etiquetas.
  - Se puede exportar solo la selección. Si la imagen no cabe en la memoria del navegador, el diálogo lo dice y propone una escala menor; nunca recorta nada en silencio.

## 3. Notas

- **Nota nueva:** «+ Nuevo» → «Nota». A la izquierda se escribe en Markdown y a la derecha se ve el resultado.
- **Enlazar otra nota:** escribe `[[` y elige una nota de la lista; si no existe, se puede crear.
- **Enlazar con un elemento de un lienzo:** al elegir un lienzo en el selector de enlaces (`[[`, Ctrl/⌘+K o el botón de enlazar), puedes enlazar el lienzo entero o uno de sus elementos: búscalo en la lista o púlsalo en la vista previa. Seguir el enlace abre el lienzo con ese elemento seleccionado.
- **Detalles y enlaces** (botón «Enlaces» de la barra superior): backlinks (quién enlaza a esta nota), enlaces rotos y etiquetas.
- **Exportar la nota:** «Exportar» → «Nota en Markdown (.md)» descarga la nota con su frontmatter (id, título y etiquetas).

## 3 bis. Calendario

- En la barra lateral, la pestaña **Calendario** abre el mes; **Semana** y **Día** muestran los eventos con hora como bloques y una línea roja en la hora actual.
- **Nuevo evento** (o doble clic en un día o en una hora): título, calendario, todo el día o con hora, fechas de inicio y fin y un color (los de las notas adhesivas).
- Pulsa un evento para editarlo, moverlo a otro calendario o eliminarlo.
- **Mis calendarios:** «+» crea otro calendario; la casilla lo muestra u oculta en la vista. Cada calendario tiene historial y entra en las copias y la sincronización como cualquier documento.
- Si un calendario se editó en dos sitios a la vez, aparece un aviso con **Resolver**: conserva una versión, ambas o **combina los eventos** (se juntan los de las dos).
- Antes de usar el calendario o las plantillas, actualiza la aplicación en todos tus dispositivos: una versión anterior no los reconoce.

## 3 ter. Documentos (beta)

- La pestaña **Documentos** de la barra lateral tiene su propio «+ Nuevo», buscador y carpetas (distintas de las de «Notas»):
  - **Documento con formato:** títulos, negrita, cursiva, subrayado, tachado, listas, citas y alineación. Se edita solo dentro de la aplicación.
  - **Documento Markdown:** se ve con formato pero se guarda en Markdown, como una nota: tiene copia legible en la carpeta o en Drive sin cifrar, se puede editar fuera y entra en la búsqueda. Al guardarlo, el Markdown se normaliza (por ejemplo, el estilo de las listas). Las imágenes se muestran como texto, sin descargarlas.
  - **Carpeta:** solo para documentos.
- **Continuo / Hoja** cambia solo la presentación (texto corrido o una hoja A4); no hay saltos de página al editar. Los documentos con formato se ven en hoja y los Markdown en continuo; se cambia en **Perfil → Preferencias e idioma → Documentos**, no desde el documento.
- **Imágenes:** pulsa una imagen para seleccionarla. Arrastra sus esquinas para cambiar el tamaño, o usa la barra que aparece encima: 25/50/75/100 % del ancho, girar a la izquierda o a la derecha, **Recortar** (arrastra el marco o sus esquinas; Intro aplica) y **Restablecer**. El archivo original no cambia; Word y Markdown reciben la imagen ya recortada y girada. En los documentos Markdown solo se puede girar o recortar, y se guarda una copia de la imagen.
- **Fuentes parecidas a Arial, Times New Roman y Georgia:** esas fuentes no se pueden incluir en la aplicación, así que se ofrecen **Arimo**, **Tinos** y **Gelasio**, con las mismas medidas; búscalas por cualquiera de los dos nombres.
- **Enlaces del documento:** el botón de enlace de la derecha de la barra abre un panel con todos los enlaces del documento (de todas las pestañas), a dónde lleva cada uno y si su destino cambió o se perdió. Al pasar por uno se ve una vista previa del destino (un extracto, una miniatura del lienzo o el evento; las direcciones web no se cargan). «Ir al texto» selecciona el enlace en el documento.
- Antes de usar documentos, actualiza la aplicación en todos tus dispositivos: una versión anterior no los reconoce.

## 3 quater. Apariencia y modo Zen

- **Esquemas de color:** en **Perfil → Preferencias e idioma** eliges un esquema claro (Papel, Blanco, Bruma o Salvia) y uno oscuro (Noche, Negro, Marea o Bosque). El interruptor de arriba a la derecha alterna entre los dos y recuerda cuál dejaste; «Seguir al sistema» usa el claro de día y el oscuro de noche. En la misma sección están el puntero (con una vista previa de los de aline y los del sistema), el idioma y el día en que empieza la semana.
- El lienzo se pinta con el fondo del esquema, pero lo guardado y lo exportado conservan su propio fondo.
- **Modo Zen** (clic derecho en el lienzo → «Modo zen», o Alt+Z): oculta también la barra lateral y la cabecera. Las herramientas del lienzo siguen a la vista; al salir, vuelve todo.

## 4. Organizar y buscar

- **Carpetas:** «+ Nuevo» → «Carpeta» crea una carpeta. Para mover un lienzo o una nota, arrástralo sobre una carpeta, o al espacio libre de «Todos» para sacarlo; también se puede cambiar en Detalles. Lo que se crea con una carpeta seleccionada va dentro de ella. Borrar una carpeta nunca borra su contenido: lo que queda sin carpeta aparece en «Recuperación».
- **Etiquetas:** se añaden en Detalles. En la biblioteca sirven de filtro.
- **Buscar archivos:** el campo de la biblioteca filtra la lista por título. Las pestañas «Todos» y «Recientes» cambian la vista; las acciones de cada documento (renombrar, papelera) están en su menú «⋯».
- **Buscar** (Ctrl+Mayús+F, o «⋯» de la barra superior → «Buscar»): busca en títulos, notas y textos de los lienzos. Al abrir un resultado se resalta el texto o el elemento encontrado.

## 5. Importar y exportar en bloque

- **Importar archivos:** «+ Nuevo» → «Importar archivos…» (notas `.md` y lienzos `.excalidraw`).
- **Importar una carpeta de Markdown:** «+ Nuevo» → «Importar carpeta…»; se recrean las subcarpetas.
- **Exportar en Markdown (ZIP):** «Exportar» de la barra superior → las notas de la carpeta seleccionada o de todo el almacén.

Al terminar una importación se muestra un informe con lo que no se pudo traer y por qué. Por ejemplo:

- el contenido web incrustado no se importa, porque cargaría páginas externas;
- las imágenes enlazadas desde internet tampoco;
- los campos del frontmatter que la aplicación no usa no se conservan.

Importar siempre crea documentos nuevos; nunca sobrescribe los existentes.

## 6. Historial, papelera y conflictos

- **Historial:** cada guardado es una versión. Desde «Historial de versiones» (botón del reloj de la barra superior) se ve una versión anterior, se compara y se restaura. Restaurar crea una versión nueva; no se pierde nada.
- **Papelera:** borrar envía a la papelera (**Perfil → Papelera**, abajo en la barra lateral), desde donde se puede restaurar. «Eliminar definitivamente» pide confirmación.
- **Conflictos:** si dos equipos editan lo mismo sin conexión, se conservan ambas versiones y se avisa. Se resuelve eligiendo una, combinándolas o guardando las dos como documentos separados.

## 7. Copias y almacenes

En «Estado y diagnóstico» («⋯» de la barra superior):

- **Copia completa (ZIP):** todo el almacén con historial, papelera y adjuntos, en formato abierto. Haz una con regularidad y guárdala fuera del equipo.
- **Restaurar una copia:** siempre se restaura en un almacén nuevo, nunca encima del actual.
- **Varios almacenes:** se pueden crear varios almacenes independientes y cambiar entre ellos.
- **Exportación de emergencia:** está disponible si el almacenamiento del navegador falla.

## 8. Varios equipos: carpeta o Google Drive

En «Dónde se guarda» se conecta **un** destino por almacén.

**Carpeta del ordenador** (Chrome o Edge en el PC):

- La carpeta recibe el formato abierto: notas legibles con cualquier editor, versiones y copias.
- Las copias de `readable/` se pueden editar fuera de la aplicación; entran como versiones nuevas.

**Google Drive:**

- Antes de conectar se elige el modo:
  - **sin cifrar:** Google puede leer el contenido; a cambio, las notas se leen y editan desde Drive;
  - **cifrado de extremo a extremo:** Google no puede leer el contenido.
- Con cifrado:
  - se crea una contraseña y se guarda un **código de recuperación**;
  - si se pierden los dos, la copia de Drive no se puede recuperar;
  - cada equipo pide la contraseña una vez.
- En «Cifrado y contraseña» se cambia la contraseña, se genera otro código o se cambia de modo. Los demás equipos se adaptan solos.
- Tras recargar la página hay que pulsar «Autorizar de nuevo», porque el permiso de Google solo vive mientras la página está abierta.

**Desde otro equipo:** crea o abre un almacén, conecta el mismo destino y elige «Abrir ese almacén aquí».

La sincronización ocurre al abrir, al volver a la pestaña, unos segundos después de cada cambio y cada minuto. No ocurre con la aplicación cerrada.

## 9. iPad y Apple Pencil

- **Lápiz:** con el Apple Pencil el lienzo activa el modo lápiz del motor. El lápiz dibuja y los dedos desplazan y hacen zoom con dos dedos. El botón de modo lápiz aparece en la barra de herramientas del lienzo cuando se detecta el lápiz.
- **Biblioteca:** en vertical se superpone al lienzo. Se cierra al abrir un documento, al tocar fuera o deslizándola hacia la izquierda.
- **Botones:** miden al menos 44 px para tocarlos con el dedo.
- **Sin carpeta local:** en el iPad no hay carpeta local; usa Google Drive o las copias ZIP.

## 10. Privacidad

- Sin Google Drive, la aplicación no se conecta con ningún servicio externo: ni analítica ni telemetría.
- Los diagnósticos son locales y no contienen el texto de las notas.
- Las imágenes externas de las notas se muestran como enlaces y no se cargan solas.
