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

- **Lienzo nuevo:** biblioteca (☰) → «+ Nuevo lienzo». Las herramientas, atajos y estilos son los de Excalidraw.
- **Vincular un elemento** con una nota, otro lienzo o una web: selecciona el elemento y pulsa «🔗 Vincular» (encima del lienzo). El enlace se abre haciendo clic en el icono del elemento.
- **Conectores sueltos:** si una flecha deja de estar unida a una forma, aparece un aviso que permite seleccionar esas flechas.
- **Exportar** (botón «Exportar…» encima del lienzo, o menú ☰ del lienzo):
  - **PNG o SVG**, con fondo o sin él y a escala 1×, 2× o 3×;
  - **PDF A4**, encajado en una página o repartido en varias;
  - **.excalidraw**, para abrir el lienzo en Excalidraw. El diálogo avisa de lo que no viaja: enlaces internos, backlinks, historial, carpetas y etiquetas.
  - Se puede exportar solo la selección. Si la imagen no cabe en la memoria del navegador, el diálogo lo dice y propone una escala menor; nunca recorta nada en silencio.

## 3. Notas

- **Nota nueva:** «+ Nueva nota». A la izquierda se escribe en Markdown y a la derecha se ve el resultado.
- **Enlazar otra nota:** escribe `[[` y elige una nota de la lista; si no existe, se puede crear.
- **Detalles y enlaces** (botón 🔗 de la barra superior): backlinks (quién enlaza a esta nota), enlaces rotos y etiquetas.
- **Exportar la nota:** «Exportar .md» descarga la nota con su frontmatter (id, título y etiquetas).

## 4. Organizar y buscar

- **Carpetas:** «+ Nueva carpeta» crea una carpeta. Lo que se crea con una carpeta seleccionada va dentro de ella. Borrar una carpeta nunca borra su contenido: lo que queda sin carpeta aparece en «Recuperación».
- **Etiquetas:** se añaden en Detalles. En la biblioteca sirven de filtro.
- **Buscar** (Ctrl+Mayús+F): busca en títulos, notas y textos de los lienzos. Al abrir un resultado se resalta el texto o el elemento encontrado.

## 5. Importar y exportar en bloque

En la biblioteca, «Importar y exportar»:

- **Importar archivos:** notas `.md` y lienzos `.excalidraw`.
- **Importar una carpeta de Markdown:** se recrean las subcarpetas.
- **Exportar en Markdown (ZIP):** las notas de la carpeta seleccionada o de todo el almacén.

Al terminar una importación se muestra un informe con lo que no se pudo traer y por qué. Por ejemplo:

- el contenido web incrustado no se importa, porque cargaría páginas externas;
- las imágenes enlazadas desde internet tampoco;
- los campos del frontmatter que la aplicación no usa no se conservan.

Importar siempre crea documentos nuevos; nunca sobrescribe los existentes.

## 6. Historial, papelera y conflictos

- **Historial:** cada guardado es una versión. Desde «Historial de versiones» (botón 🕘) se ve una versión anterior, se compara y se restaura. Restaurar crea una versión nueva; no se pierde nada.
- **Papelera:** borrar envía a la papelera, desde donde se puede restaurar. «Eliminar definitivamente» pide confirmación.
- **Conflictos:** si dos equipos editan lo mismo sin conexión, se conservan ambas versiones y se avisa. Se resuelve eligiendo una, combinándolas o guardando las dos como documentos separados.

## 7. Copias y almacenes

En «Estado y diagnóstico» (botón ⓘ):

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
