# Documento de Requerimientos: Sistema personal de mapas mentales y notas conectadas

Oct 11, 2026 · @Fran

## 1. Contexto y resumen

El Sistema es una herramienta personal para pensar visualmente: un lienzo libre al estilo de [Excalidraw](https://excalidraw.com/) donde se escriben notas, se dibujan mapas mentales y conceptuales y se enlazan ideas como en Obsidian.

Su uso previsto es una persona, con acceso opcional para unas pocas más y desde pocos ordenadores. El centro del producto es el lienzo; la capa de notas enlazadas lo complementa y no lo reemplaza.

| Referencia | Qué se toma | Qué no se toma |
| --- | --- | --- |
| Excalidraw | Lienzo infinito, trazo de boceto, flechas ancladas a formas, formato de archivo abierto | Un dibujo suelto sin organización entre muchos dibujos ni enlaces entre ellos |
| Obsidian | Notas en archivos locales, enlaces bidireccionales, backlinks, búsqueda, etiquetas | El editor de texto como eje, el ecosistema de plugins, el grafo como pieza central |

Las descripciones de ambas herramientas son conocimiento general y no se verificaron en esta sesión.

**Hallazgo crítico:** antes de construir hay que descartar lo que ya existe. Obsidian tiene un plugin comunitario de Excalidraw que ya combina lienzo de boceto, notas y enlaces. Construir solo se justifica si algún requisito "Debe" de este documento queda sin cubrir tras probar esa alternativa (ver DP-01). Actualización del 11 de octubre: el propietario decidió construir un sistema propio sin esa prueba previa; el riesgo queda aceptado y registrado como R-01.

## 2. Objetivos del sistema

El Sistema busca reducir la fricción entre tener una idea y verla conectada con las demás. Las metas numéricas son propuestas a confirmar, no datos dados.

| ID | Objetivo | Cómo se mide (meta propuesta) |
| --- | --- | --- |
| OBJ-01 | Capturar una idea sin fricción | De abrir el Sistema a tener un texto escrito en el lienzo en menos de 10 s, sin cuenta ni configuración |
| OBJ-02 | Construir mapas mentales y conceptuales en un lienzo libre | Un mapa de 30 nodos se arma y reorganiza sin rehacer conectores a mano |
| OBJ-03 | Conectar ideas entre lienzos y notas | Todo enlace creado en un lugar aparece como backlink en su destino |
| OBJ-04 | Poseer los datos | Todo el contenido se exporta y se lee en formato abierto, sin depender del Sistema ni de un servicio de terceros |
| OBJ-05 | Trabajar en pocos ordenadores con los mismos datos | Mismo almacén abierto en 2 o 3 equipos sin pérdida silenciosa de cambios |
| OBJ-06 | Encontrar lo escrito | Búsqueda de texto completo en menos de 1 s con hasta 2 000 notas y 500 lienzos |
| OBJ-07 | Tomar notas a mano con lápiz en una tableta | Una nota manuscrita se guarda y se reabre sin pérdida de trazo; la palma apoyada no deja trazos falsos |
| OBJ-08 | Mantener los datos legibles | Las notas se abren con cualquier editor de texto, en el equipo y en Google Drive |

## 3. Alcance e instrucciones del documento

La primera versión cubre lienzo, notas, enlaces, búsqueda y almacenamiento local confiable; todo lo demás queda fuera hasta decidirlo.

**Dentro del alcance**

- Lienzo infinito con formas, texto, conectores, imágenes y escritura a mano con lápiz.
- Notas de texto como documentos propios y vinculables desde el lienzo.
- Enlaces entre elementos, notas y lienzos, con backlinks.
- Carpetas, etiquetas y búsqueda de texto completo.
- Almacenamiento sin cifrar, en archivos de texto plano, local o en Google Drive, con guardado automático, historial de versiones, exportación y copia de seguridad.
- Uso por una persona, en ordenador y en iPad con lápiz, con guardado local o en Google Drive.

**Fuera del alcance (primera versión)**

- Colaboración de cualquier tipo, incluidos la simultánea en tiempo real y el compartir en solo lectura (DP-05).
- Aplicación de móvil con funciones completas; el móvil solo cubriría notas escritas a mano (DP-10).
- Sistema de plugins o tienda de extensiones.
- Cuentas, planes de pago y múltiples organizaciones. El cifrado es opcional y solo para la copia en Google Drive (DP-07, revisada el 13/10/2026).
- Funciones de inteligencia artificial generativa y reconocimiento de texto en imágenes.

**Convenciones**

- Prioridad con escala de cuatro niveles: Debe, Debería, Podría, No ahora.
- Identificadores: HU (historia), RF (funcional), RNF (no funcional), RN (regla de negocio), FP y FA (flujo principal y alternativo), R (riesgo), DP (decisión pendiente), CA (criterio de aceptación).
- Cada RF cita la HU que lo origina y cada CA cita lo que verifica; la matriz final cierra el circuito.
- Las metas con número son propuestas y se marcan como tales hasta que el propietario las confirme.

## 4. Actores

Hay un actor humano que decide todo (el propietario); colaboradores y receptores quedan fuera de la primera versión y los otros dos actores son sistemas externos.

| ID | Actor | Tipo | Qué hace con el Sistema |
| --- | --- | --- | --- |
| A1 | Propietario | Humano, principal | Crea, edita, organiza, exporta, configura y administra todo |
| A2 | Colaborador limitado (1 a 4 personas) | Humano, opcional | Fuera de la primera versión: DP-05 decidió no tener colaboración por ahora |
| A3 | Receptor de solo lectura | Humano, opcional | Fuera de la primera versión: no se comparte con nadie por ahora (DP-05) |
| A4 | Almacenamiento local | Sistema externo | Guarda los archivos del almacén en cada ordenador |
| A5 | Mecanismo de sincronización | Sistema externo, opcional | Lleva el almacén entre equipos mediante Google Drive (DP-04) |

## 5. Historias de usuario

Dieciocho de las veintiuna historias son "Debe" o "Debería"; HU-16 queda como "Podría", HU-13 pasa a "No ahora" porque no habrá colaboración y HU-20 vuelve como "Debería", limitada a la copia en Drive y a elección del propietario (DP-07 revisada).

| ID | Historia | Prioridad |
| --- | --- | --- |
| HU-01 | Como propietario, quiero abrir el Sistema y escribir o dibujar sin crear cuenta ni configurar, para capturar ideas sin fricción | Debe |
| HU-02 | Como propietario, quiero crear y editar formas y texto en un lienzo infinito, para volcar ideas sin límite de espacio | Debe |
| HU-03 | Como propietario, quiero conectar nodos con flechas que siguen al mover los nodos, para reorganizar un mapa sin rehacer conexiones | Debe |
| HU-04 | Como propietario, quiero colapsar y expandir ramas de un mapa mental, para ver solo lo relevante | Debería |
| HU-05 | Como propietario, quiero escribir notas largas con formato básico y vincularlas desde el lienzo, para no apretar texto extenso dentro de formas | Debe |
| HU-06 | Como propietario, quiero enlazar notas y lienzos y ver los backlinks, para descubrir conexiones entre ideas | Debe |
| HU-07 | Como propietario, quiero buscar texto en todos los lienzos y notas, para encontrar lo que escribí | Debe |
| HU-08 | Como propietario, quiero organizar con carpetas y etiquetas, para no perder el orden cuando crezca el contenido | Debe |
| HU-09 | Como propietario, quiero deshacer y rehacer cambios, para experimentar sin miedo a romper un mapa | Debe |
| HU-10 | Como propietario, quiero exportar un lienzo como imagen o PDF, para usarlo en otros documentos | Debe |
| HU-11 | Como propietario, quiero abrir los mismos datos en otro de mis ordenadores, para continuar donde quedé | Debe |
| HU-12 | Como propietario, quiero recuperar una versión anterior de un lienzo o nota, para deshacer un error descubierto tarde | Debería |
| HU-13 | Como propietario, quiero compartir un lienzo en solo lectura con una persona, para mostrarle un mapa sin darle acceso a todo | No ahora |
| HU-14 | Como propietario, quiero trabajar sin internet, para usarlo en cualquier lugar | Debe |
| HU-15 | Como propietario, quiero pegar o arrastrar imágenes al lienzo, para anotar sobre capturas y referencias | Debería |
| HU-16 | Como propietario, quiero partir de plantillas de mapa mental o conceptual, para empezar más rápido | Podría |
| HU-17 | Como propietario, quiero importar y exportar archivos .excalidraw, e importar notas Markdown, para no perder lo que ya tengo | Debería |
| HU-18 | Como propietario, quiero una copia de seguridad completa, para no perder mi trabajo si falla un disco | Debe |
| HU-19 | Como propietario, quiero escribir a mano con un lápiz en un iPad, para tomar notas manuscritas sin teclado | Debería |
| HU-20 | Como propietario, quiero elegir si cifro la copia de mi almacén en Google Drive, para que Google no pueda leerla si así lo decido (DP-07 revisada) | Debería |
| HU-21 | Como propietario, quiero elegir si mis datos se guardan en una carpeta local o en Google Drive, para trabajar con o sin la nube | Debe |

## 6. Requerimientos funcionales

Son 49 requerimientos en 12 módulos. RF-43 y RF-44, descartados al principio, volvieron como "Debería" al revisar DP-07; 22 son "Debe" y definen el mínimo de la primera versión. Cada uno cita la historia que lo origina. Con Excalidraw como motor (DP-11), RF-01 a RF-13 pasan de construirse a integrarse y verificarse.

### Lienzo

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-01 | Ofrecer un lienzo infinito con desplazamiento y zoom | Debe | HU-02 |
| RF-02 | Permitir crear, mover, redimensionar, rotar, duplicar y eliminar elementos | Debe | HU-02 |
| RF-03 | Permitir selección múltiple, alineación y distribución básicas | Debería | HU-02 |
| RF-04 | Deshacer y rehacer por lienzo, con al menos 100 acciones de historial (meta propuesta) | Debe | HU-09 |
| RF-05 | Permitir cambiar estilo de trazo (boceto o limpio), color, relleno y grosor | Debería | HU-02 |
| RF-06 | Ofrecer cuadrícula y ajuste magnético, ambos opcionales | Podría | HU-02 |

### Elementos

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-07 | Ofrecer formas básicas: rectángulo, elipse, rombo, línea y flecha | Debe | HU-02 |
| RF-08 | Permitir texto libre sobre el lienzo, editable con doble clic | Debe | HU-01, HU-02 |
| RF-09 | Permitir dibujo a mano alzada | Debería | HU-02 |
| RF-10 | Permitir insertar imágenes al pegar o arrastrar | Debería | HU-15 |
| RF-11 | Ofrecer marcos que agrupen elementos y se muevan como uno | Debería | HU-04 |

### Conexiones y mapas

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-12 | Anclar conectores a elementos, de modo que sigan su movimiento | Debe | HU-03 |
| RF-13 | Permitir una etiqueta de texto sobre un conector, para nombrar la relación | Debe | HU-03 |
| RF-14 | Crear un nodo hijo ya conectado con un atajo desde el nodo seleccionado | Debería | HU-03, HU-04 |
| RF-15 | Colapsar y expandir ramas de un árbol de nodos | Debería | HU-04 |
| RF-16 | Ofrecer una reorganización automática opcional de un árbol | Podría | HU-04 |

### Notas

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-17 | Ofrecer notas como documentos propios con títulos, listas, negrita, código y enlaces | Debe | HU-05 |
| RF-18 | Permitir incrustar una nota, o su vista previa, dentro de un lienzo | Debería | HU-05 |
| RF-19 | Convertir un texto del lienzo en una nota propia | Podría | HU-05 |

### Enlaces

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-20 | Vincular un elemento del lienzo a una nota, a otro lienzo o a una dirección web | Debe | HU-06 |
| RF-21 | Ofrecer sintaxis rápida de enlace interno al escribir una nota, con sugerencias de destino | Debe | HU-06 |
| RF-22 | Mostrar un panel de backlinks en cada nota y lienzo | Debe | HU-06 |
| RF-23 | Actualizar los enlaces entrantes cuando se renombra una nota o lienzo | Debe | HU-06 |
| RF-24 | Detectar y listar enlaces rotos | Debería | HU-06 |

### Organización y búsqueda

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-25 | Permitir carpetas y etiquetas para notas y lienzos | Debe | HU-08 |
| RF-26 | Buscar texto completo, incluido el texto dentro de elementos del lienzo, y llevar al elemento encontrado | Debe | HU-07 |
| RF-27 | Mostrar una vista de galería con miniaturas y elementos recientes | Debería | HU-08 |
| RF-28 | Mostrar un grafo de enlaces entre notas y lienzos | Podría | HU-06 |

### Persistencia y versiones

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-29 | Guardar automáticamente y de forma continua, sin acción del usuario | Debe | HU-01 |
| RF-30 | Guardar los datos en archivos de formato abierto y documentado, con las notas en Markdown de texto plano | Debe | HU-18 |
| RF-31 | Mantener historial de versiones por lienzo y nota, con restauración, conservado hasta que el propietario elimine versiones (DP-08) | Debería | HU-12 |
| RF-32 | Generar una copia de seguridad completa del almacén en un solo archivo y restaurarla | Debe | HU-18 |

### Importación y exportación

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-33 | Exportar un lienzo a PNG, SVG y PDF, con fondo y escala configurables | Debe | HU-10 |
| RF-34 | Importar archivos .excalidraw | Debería | HU-17 |
| RF-35 | Importar y exportar notas en Markdown | Debería | HU-17 |

### Varios equipos y compartir

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-36 | Permitir abrir el mismo almacén en otro ordenador del propietario (mediante Google Drive o carpeta local, DP-04) | Debe | HU-11 |
| RF-37 | Detectar copias divergentes de un mismo elemento y conservar ambas, sin sobrescribir en silencio | Debe | HU-11 |
| RF-38 | Permitir compartir un lienzo en solo lectura (fuera de la primera versión, DP-05) | No ahora | HU-13 |

### Atajos y plantillas

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-39 | Ofrecer atajos de teclado para las acciones frecuentes de creación, enlace y búsqueda | Debería | HU-01 |
| RF-40 | Ofrecer plantillas de mapa mental y de mapa conceptual | Podría | HU-16 |

### Almacenamiento, cifrado y nube

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-41 | Permitir elegir dónde se guarda el almacén: carpeta local o Google Drive | Debe | HU-21 |
| RF-42 | Sincronizar el almacén con Google Drive, seguir funcionando sin conexión y sincronizar al volver | Debe | HU-11, HU-21 |
| RF-43 | Al conectar Google Drive, el Sistema permite elegir entre guardar el contenido sin cifrar o cifrado de extremo a extremo, y permite cambiar esa elección después desde la configuración sin perder versiones (DP-07 revisada, DP-12) | Debería | HU-20 |
| RF-44 | Si el almacén está cifrado en Drive, el Sistema pide la contraseña o el código de recuperación una vez en cada equipo, y permite cambiar la contraseña y generar un código nuevo | Debería | HU-20 |
| RF-45 | Exportar un lienzo a .excalidraw avisando qué elementos propios no tienen equivalente y se pierden | Debería | HU-17 |
| RF-46 | Mostrar el espacio que ocupan las versiones y permitir eliminar versiones concretas o antiguas | Debería | HU-12 |

### Lápiz y tableta

| ID | El Sistema debe… | Prioridad | HU |
| --- | --- | --- | --- |
| RF-47 | Aceptar entrada con lápiz en una tableta y descartar el apoyo de la palma de la mano | Debería | HU-19 |
| RF-48 | Guardar la escritura a mano como trazos dentro de un lienzo o una nota (sin conversión a texto, DP-13) | Debería | HU-19 |
| RF-49 | Adaptar los controles al uso táctil y con lápiz: tamaño de los botones y gestos de desplazamiento y zoom | Debería | HU-19 |

## 7. Requerimientos no funcionales

Lo que más condiciona el diseño es la confianza en los datos: no perder trabajo, no depender de terceros y funcionar sin internet. Las metas numéricas son propuestas y dependen de confirmar el volumen en S-04.

| ID | Categoría | Requerimiento | Meta propuesta |
| --- | --- | --- | --- |
| RNF-01 | Rendimiento | La interacción con el lienzo no muestra retrasos perceptibles | Menos de 100 ms al arrastrar con 1 000 elementos |
| RNF-02 | Rendimiento | Abrir un lienzo es rápido | Menos de 2 s con 1 000 elementos |
| RNF-03 | Disponibilidad | Todas las funciones núcleo operan sin conexión a internet | Las funciones RF-01 a RF-30 sin red |
| RNF-04 | Integridad | Un cierre abrupto no corrompe archivos ni pierde trabajo reciente | Pérdida máxima de 5 s; escritura atómica de archivos |
| RNF-05 | Privacidad | Los datos salen del equipo solo hacia el Google Drive que el propietario configure; no hay telemetría | Cero conexiones salientes no configuradas |
| RNF-06 | Seguridad | El contenido local y la carpeta local no se cifran; la copia en Drive se cifra solo si el propietario lo elige. Sin cifrar, la protección depende de la cuenta de Google y del bloqueo del equipo, y el Sistema lo advierte al conectar Drive (DP-07 revisada) | Elección y avisos visibles al conectar Drive |
| RNF-07 | Portabilidad | Funciona como página web instalable en el PC y en el iPad, con empaquetado de escritorio opcional (DP-02); los datos se leen sin el Sistema | Windows 11 con Chrome y Edge; iPadOS con Safari |
| RNF-08 | Usabilidad | La primera acción útil no requiere tutorial; hay contraste suficiente, uso por teclado y zoom de interfaz | Primera acción en menos de 10 s |
| RNF-09 | Mantenibilidad | El formato de datos está documentado y cada archivo lleva la versión de su esquema, para migrar sin pérdida | Documento del formato al día |
| RNF-10 | Escalabilidad | La búsqueda y la navegación no se degradan con el crecimiento | Búsqueda en menos de 1 s con 2 000 notas y 500 lienzos |
| RNF-11 | Localización | Interfaz y documentación en español e inglés | Ambos idiomas disponibles |
| RNF-12 | Licencias | Toda dependencia tiene una licencia compatible con el uso previsto | Revisión previa a incorporar cada dependencia |
| RNF-13 | Diagnóstico | Los errores se registran localmente y el propietario los puede consultar, sin envío externo | Registro local legible |
| RNF-14 | Entrada | Funciona con ratón y teclado en escritorio y con lápiz en el iPad, como uso secundario; el móvil solo para notas escritas a mano | Apple Pencil (USB-C), sin sensibilidad a presión (DP-10) |
| RNF-15 | Recuperación | Con Drive cifrado, el Sistema entrega un código de recuperación y exige confirmar que se guardó antes de usarlo; sin contraseña ni código, la copia de Drive no se puede recuperar y el Sistema lo advierte | Código mostrado una vez y confirmado |
| RNF-16 | Sincronización | La sincronización con Google Drive tolera cortes de red y no deja archivos a medias | Reanuda sin pérdida tras un corte |
| RNF-17 | Escalabilidad | El historial de versiones sin límite no vuelve lenta la apertura de un lienzo | Menos de 2 s con 100 versiones guardadas |

## 8. Reglas de negocio

Las reglas protegen una promesa: el contenido del propietario nunca se pierde ni se pisa sin que lo sepa.

| ID | Regla |
| --- | --- |
| RN-01 | Cada nota y cada lienzo tiene un identificador único e inmutable; el nombre puede cambiar sin romper enlaces |
| RN-02 | Un enlace interno apunta al identificador, nunca al texto del nombre |
| RN-03 | Eliminar una nota o lienzo lo envía a una papelera recuperable; el borrado definitivo exige una acción explícita |
| RN-04 | El Sistema nunca sobrescribe en silencio una copia más reciente con una más antigua; ante divergencia conserva ambas |
| RN-05 | Todo el contenido del propietario es exportable en formato abierto, sin pérdida |
| RN-06 | Un elemento de lienzo pertenece a un solo lienzo; una nota puede aparecer en varios lienzos por incrustación o enlace |
| RN-07 | Si se borra un extremo de un conector, el conector queda suelto y marcado; no se elimina en silencio |
| RN-08 | Las etiquetas no distinguen mayúsculas de minúsculas y no se duplican |
| RN-09 | Solo el propietario cambia la configuración del almacén y lo que se comparte |
| RN-10 | Los backlinks se calculan a partir de los enlaces existentes y no se editan a mano |
| RN-11 | Las notas se guardan como Markdown de texto plano y se pueden leer y editar fuera del Sistema |
| RN-12 | Antes de conectar Google Drive, el Sistema pide elegir entre sin cifrar y cifrado, explica las consecuencias de cada opción (sin cifrar: Google puede leer el contenido; cifrado: una contraseña perdida no se recupera) y no contacta con Google hasta esa elección |
| RN-13 | Las versiones antiguas solo se eliminan por acción explícita del propietario |

## 9. Flujos principales y alternativos

Siete flujos cubren el uso diario; el más delicado es continuar en otro ordenador (FP-04), porque es donde se puede perder trabajo.

### FP-01 Capturar una idea (HU-01, RF-08, RF-29)

1. El propietario abre el Sistema.
2. El Sistema muestra el último lienzo abierto, o uno vacío.
3. El propietario hace doble clic en un punto y escribe.
4. El Sistema guarda el cambio sin que nadie lo pida.

- **FA-01a Primera vez:** el Sistema crea el almacén local y un lienzo vacío, sin pedir cuenta.
- **FA-01b Almacén inaccesible** (disco desconectado o carpeta movida): el Sistema avisa y ofrece abrir otro almacén o trabajar en uno temporal, sin descartar nada.

### FP-02 Construir un mapa mental (HU-03, HU-04, RF-12 a RF-15)

1. El propietario crea un nodo central con texto.
2. Con el nodo seleccionado, usa el atajo para crear un hijo conectado y escribe su texto.
3. Repite el paso 2 y mueve nodos; los conectores siguen a los nodos.
4. Colapsa las ramas que no necesita ver.

- **FA-02a Nodo borrado:** los conectores que quedan sueltos se marcan, no se eliminan (RN-07).
- **FA-02b Error:** deshacer restituye el estado anterior (RF-04).

### FP-03 Enlazar una idea con una nota (HU-06, RF-20 a RF-24)

1. El propietario selecciona un elemento y elige vincular.
2. Busca la nota o el lienzo de destino por nombre.
3. El Sistema crea el enlace y registra el backlink.
4. Al abrir el destino, el panel de backlinks muestra el origen.

- **FA-03a Destino inexistente:** el propietario lo crea en el momento y el enlace se completa.
- **FA-03b Destino renombrado:** el enlace sigue funcionando (RN-01, RN-02).
- **FA-03c Destino eliminado:** el enlace se marca como roto y aparece en la lista de enlaces rotos.

### FP-04 Continuar en otro ordenador (HU-11, RF-36, RF-37)

1. El propietario abre el almacén en el equipo B.
2. El Sistema compara lo que hay en B con los cambios llegados del equipo A.
3. Si no hay cambios, trabaja con normalidad.
4. Si hay cambios que no chocan, los incorpora.
5. Si el mismo elemento cambió en ambos equipos, muestra el conflicto, conserva las dos versiones y deja elegir (RN-04).

El esquema de abajo resume las ramas de este flujo.

&#91;embedded content: FP-04 continuar en otro ordenador · 2 decisiones, 3 resultados\]

Solo el último caso, el choque sobre un mismo elemento, exige una decisión del propietario.

- **FA-04a Sin conexión a Google Drive:** el Sistema trabaja con la copia local y sincroniza cuando vuelve la conexión (RF-42).
- **FA-04b Archivo editado fuera del Sistema:** el Sistema lo trata como un cambio de otro equipo y no lo sobrescribe (RN-04).

### FP-05 Exportar un lienzo (HU-10, RF-33)

1. El propietario abre el lienzo y elige exportar.
2. Elige formato (PNG, SVG o PDF), fondo y escala.
3. El Sistema genera el archivo y lo entrega.

- **FA-05a Lienzo muy grande:** el Sistema ofrece exportar solo la selección o reducir la escala.

### FP-06 Restaurar una versión anterior (HU-12, RF-31)

1. El propietario abre el historial de un lienzo o nota.
2. Elige una versión y ve su vista previa.
3. Confirma la restauración.
4. El Sistema guarda la versión actual en el historial antes de aplicar la restaurada.

- **FA-06a Sin historial:** el Sistema indica que no hay versiones previas.

### FP-07 Tomar una nota a mano en tableta (HU-19, RF-47, RF-48)

1. El propietario abre un lienzo o una nota en la tableta.
2. Escribe con el lápiz y apoya la mano en la pantalla.
3. El Sistema ignora la palma, dibuja el trazo y lo guarda como parte del contenido.

- **FA-07a Conversión a texto:** para buscar o copiar lo escrito a mano hace falta reconocimiento de escritura, fuera del alcance por decisión del propietario (DP-13).
- **FA-07b Tableta sin lápiz compatible:** el Sistema deja escribir con el dedo o el ratón y avisa de que el rechazo de palma no está disponible.

## 10. Casos de riesgo

Tras las decisiones del propietario, los riesgos más serios son tres plataformas a la vez (R-15, R-18), la pérdida de datos locales en Safari (R-13) y un alcance que se infla (R-02). Probabilidad e impacto son estimaciones iniciales.

| ID | Riesgo | Prob. | Impacto | Mitigación |
| --- | --- | --- | --- | --- |
| R-01 | Reinventar lo que ya existe (Obsidian con el plugin de Excalidraw) | Media | Medio | Decisión tomada por el propietario sin prueba previa; riesgo aceptado y a revisar si el alcance se infla (R-02) |
| R-02 | El alcance se infla: todo Obsidian más todo Excalidraw | Alta | Alto | Construir primero solo los "Debe"; lo demás entra por decisión explícita |
| R-03 | Pérdida de cambios por conflictos al usar varios equipos | Media | Alto | RN-04, RF-37, RF-31 y RF-32 |
| R-04 | Archivo corrupto por cierre abrupto o corte de energía | Media | Alto | Escritura atómica y límite de pérdida (RNF-04) |
| R-05 | Lienzos grandes o con muchas imágenes vuelven lenta la interacción | Media | Medio | Metas de RNF-01 y RNF-02; límite de tamaño de imagen a definir |
| R-06 | Formato propio sin documentar deja al propietario atrapado | Baja | Alto | RN-05, RNF-09, RF-30 |
| R-07 | Cambios en una librería de lienzo de terceros rompen compatibilidad | Alta | Medio | Fijar versiones y aislar la librería detrás de una capa propia (Excalidraw, DP-11) |
| R-08 | Mantenimiento a largo plazo recae en una sola persona | Alta | Medio | Mantener el Sistema pequeño y los datos en formatos abiertos |
| R-09 | Fuga de datos por un enlace compartido o una carpeta en la nube mal configurados | Media | Alto | RNF-05, RNF-06, RN-09 |
| R-10 | Un colaborador espera edición simultánea que no existe | Media | Bajo | Declarar el límite desde el inicio (DP-05) |
| R-11 | La búsqueda no encuentra texto escrito dentro de formas del lienzo | Media | Medio | RF-26 y CA-09 como criterio de aceptación |
| R-12 | El contenido queda en texto plano: lo puede leer quien acceda a la cuenta de Google o al equipo | Media | Medio | Cifrado opcional de la copia en Drive y aviso al conectar (RN-12, RNF-06); el propietario decide |
| R-13 | Safari del iPad borra el almacenamiento de una web que no está instalada tras 7 días sin uso, y se pierde lo que no se sincronizó | Baja | Medio | Instalarla en la pantalla de inicio, sincronizar con Drive a menudo y mostrar qué falta por sincronizar (RNF-16) |
| R-14 | Dependencia de Google: acceder a Drive exige credenciales de desarrollador y su API puede cambiar | Media | Alto | Aislar Drive detrás de una capa propia y mantener siempre la opción local (RF-41) |
| R-15 | Escritorio, web y tableta a la vez dispersan el esfuerzo de una sola persona | Media | Alto | Una sola base web para el PC y el iPad (DP-02); el empaquetado de escritorio se hace después |
| R-16 | El historial sin límite consume disco y cuota de Drive y alarga la sincronización | Media | Medio | RF-46 y RNF-17 |
| R-17 | Si más adelante se quiere colaboración simultánea, archivos sincronizados por Drive lo dificultan mucho | Media | Alto | Anotarlo como límite de diseño y no prometerlo en la primera versión |
| R-18 | El iPad no ejecuta aplicaciones de escritorio: el uso con lápiz exige una web instalable o una aplicación nativa de iPad | Baja | Alto | Tomar la web instalable como base (DP-02, DP-10) |
| R-19 | Excalidraw no admite enlaces a notas, ramas colapsables o datos propios en sus archivos, y habría que forzarlo | Media | Alto | Prueba corta antes de construir (Anexo A); si falla, React Flow con perfect-freehand |

## 11. Dependencias

Las cuatro decisiones base ya están tomadas; lo único que falta antes de construir es la prueba corta de Excalidraw (Anexo A). Todo lo técnico de abajo cuelga de ellas.

| ID | Dependencia | Tipo | Depende de | Qué bloquea |
| --- | --- | --- | --- | --- |
| D-01 | Decisión de construir o adoptar (resuelta: sistema propio) | Decisión | DP-01 | Todo el proyecto |
| D-02 | Plataforma de ejecución (resuelta: web instalable como base) | Técnica | DP-02 | Persistencia, acceso a archivos, sincronización |
| D-03 | Formato de las notas | Técnica | DP-03 | RF-17, RF-35, RN-05 |
| D-04 | Sincronización mediante Google Drive y su API (resuelta en DP-04) | Técnica | DP-04 | RF-36, RF-37, R-03 |
| D-05 | Motor de lienzo: Excalidraw, paquete @excalidraw/excalidraw con licencia MIT (decidido) | Técnica y licencia | DP-11 | RF-01 a RF-16, R-07 |
| D-06 | Acceso al sistema de archivos del equipo | Externa | D-02 | RF-29, RF-30, RNF-04 |
| D-07 | Bibliotecas para exportar a PNG, SVG y PDF | Externa y licencia | D-02 | RF-33 |
| D-08 | Lista de equipos y sistemas operativos del propietario | Información | Propietario | RNF-07 |
| D-09 | Tiempo disponible del propietario para construir y mantener | Recurso | Propietario | Alcance realista de la primera versión |
| D-10 | Credenciales de Google para acceder a Drive (proyecto de desarrollador y pantalla de consentimiento) | Externa | Propietario, DP-04 | RF-41, RF-42 |
| D-11 | Soporte de Safari en el iPad para web instalable, almacenamiento y lápiz | Técnica | DP-02, DP-10 | RF-42, RF-47, RF-48 |
| D-12 | iPad (A16) con Apple Pencil, para probar | Información y hardware | Propietario, DP-10 | RF-47 a RF-49, RNF-14 |
| D-13 | Licencia del código al publicarlo | Licencia | DP-09 | RNF-12 |
| D-14 | Prueba corta de Excalidraw en el PC y en el iPad: trazo con lápiz, enlace a notas y 1 000 elementos | Tarea | Propietario, DP-11 | RF-20, RF-47, RF-48, RNF-01, R-19 |

## 12. Supuestos abiertos y decisiones pendientes

El cifrado se descartó y las notas serán Markdown de texto plano; la plataforma quedó decidida (web instalable como base, DP-02) y el motor del lienzo quedó decidido (Excalidraw, DP-11); ya no hay decisiones abiertas, solo una prueba pendiente.

### Supuestos abiertos

| ID | Supuesto | Si es falso, afecta a |
| --- | --- | --- |
| S-01 | Un propietario; sin colaboradores en la primera versión (DP-05) | A2, A3, DP-05 |
| S-02 | Entre 2 y 3 ordenadores, todos del propietario | RF-36, DP-04 |
| S-03 | Teclado y ratón en escritorio; lápiz en el iPad como uso secundario (DP-10) | RNF-14, DP-10 |
| S-04 | Hasta 500 lienzos, 2 000 notas y 1 000 elementos por lienzo | RNF-01, RNF-02, RNF-10 |
| S-05 | El propietario puede instalar y actualizar software en sus equipos | DP-02 |
| S-06 | Interfaz y documentación en español e ingles | RNF-11 |
| S-07 | Las notas pueden contener información sensible; el propietario decide si las guarda cifradas o sin cifrar en Google Drive | RNF-05, RNF-06 |
| S-08 | El iPad (A16) es la tableta de uso, con un Apple Pencil (USB-C), confirmado por el propietario | RF-47 a RF-49, DP-10 |
| S-09 | El PC de escritorio es el equipo principal, con Windows 11 y los navegadores Chrome y Edge, ambos basados en Chromium | RF-30, RF-41, RNF-07 |

### Decisiones pendientes

| ID | Decisión | Resolución del propietario | Estado | Puntos por cerrar |
| --- | --- | --- | --- | --- |
| DP-01 | ¿Construir o adoptar? | Sistema propio | Decidida | Sin prueba previa de las alternativas; riesgo R-01 aceptado. El motor del lienzo será Excalidraw (DP-11) |
| DP-02 | Plataforma | Web instalable como base, usada en el PC de escritorio (uso principal) y en el iPad (uso secundario); empaquetable como aplicación de escritorio | Decidida | Un iPad no ejecuta aplicaciones de escritorio, por eso la web es la base. Falta decidir el empaquetado de escritorio. Según mi conocimiento, en el PC un navegador basado en Chromium sí permite guardar en una carpeta y Safari en el iPad no |
| DP-03 | Formato de las notas | Markdown en archivos de texto plano, legibles fuera del Sistema | Decidida | Sin puntos abiertos; el choque con el cifrado desapareció al descartarlo |
| DP-04 | Sincronización entre equipos | Google Drive, como hace draw.io, y también guardado local a elección | Decidida, con puntos abiertos | Credenciales de Google; si el código se comparte, cada persona necesita las suyas. En el iPad el guardado local es el almacenamiento del navegador, no una carpeta, y Safari puede borrarlo si la web no está instalada (R-13) |
| DP-05 | Colaboración | Ninguna por ahora; la simultánea se estudia más adelante | Decidida | HU-13, RF-38 y los actores A2 y A3 salen de la primera versión; la edición simultánea futura condiciona el formato (R-17) |
| DP-06 | Relación con .excalidraw | Importar y exportar | Decidida | Con Excalidraw como motor, .excalidraw pasa a ser el formato nativo del lienzo; lo que Excalidraw no tiene (enlaces a notas, ramas colapsadas) hay que guardarlo aparte y comprobar que no se descarte (RF-45) |
| DP-07 | Cifrado | Revisada el 13/10/2026: notas en Markdown de texto plano en el equipo y en la carpeta local; la copia en Google Drive, sin cifrar o cifrada de extremo a extremo a elección del propietario, que puede cambiarla después (antes: sin cifrado; y antes: siempre cifrado) | Decidida | Sin cifrar, quien acceda a la cuenta de Google lee todo; cifrado, una contraseña y un código perdidos hacen irrecuperable la copia de Drive y las notas no se leen desde Drive (RN-12, RNF-06, RNF-15) |
| DP-08 | Política de versiones | Se conservan hasta que el usuario las elimine | Decidida | Crece sin límite en disco y en la cuota de Drive; exige ver el espacio y borrar (RF-46, RNF-17) |
| DP-09 | Publicación | Se piensa compartir el código; vender queda pendiente hasta construirlo | Decidida en parte | La licencia: una permisiva o dual no cierra la opción de vender; una copyleft la condiciona |
| DP-10 | Tableta, lápiz y móvil | PC de escritorio como uso principal; iPad (A16) con Apple Pencil (USB-C) como uso secundario; móvil solo para notas escritas a mano | Decidida | Modelo confirmado: Apple Pencil (USB-C). No mide presión, así que el grosor del trazo es el elegido o una variación simulada; ninguna función depende de la presión real |
| DP-11 | Motor del lienzo | Excalidraw (paquete @excalidraw/excalidraw, MIT) como motor del lienzo | Decidida | Prueba corta ejecutada en el PC el 12 de octubre de 2026 ([informe](fase-0-viabilidad.md)): el enlace de elementos a notas y los 1 000 elementos pasan; falta el trazo con el Apple Pencil (USB-C) y el rendimiento en el iPad. Si fallaran, la alternativa es React Flow con perfect-freehand |
| DP-12 | Cifrado: alcance y clave | Solo la copia en Drive; una clave por almacén, protegida con una contraseña y con un código de recuperación | Cerrada | El equipo y la carpeta local quedan sin cifrar; el nombre del almacén y el tamaño de los archivos siguen visibles en Drive |
| DP-13 | Escritura a mano | Guardar solo los trazos; no hace falta buscar el texto escrito a mano | Decidida | Sin puntos abiertos; el reconocimiento de escritura queda fuera del alcance |

## 13. Criterios de aceptación

Treinta y tres criterios cubren casi todos los requerimientos "Debe"; RF-01, RF-02, RF-07 y RF-21 solo se comprueban de forma indirecta (por CA-01, CA-12 y CA-06) y conviene darles criterio propio al planificar las pruebas; los dos "Podría" (HU-13 y HU-16) quedan sin criterio hasta que se decida si entran. Cada criterio se prueba con una acción y un resultado observable.

| ID | Dado / Cuando / Entonces | Verifica |
| --- | --- | --- |
| CA-01 | Dado el Sistema instalado, cuando el propietario lo abre por primera vez, entonces escribe un texto en el lienzo en menos de 10 s sin crear cuenta ni configurar nada | HU-01, RF-08, RNF-08 |
| CA-02 | Dados dos nodos conectados, cuando se mueve uno, entonces el conector sigue anclado a ambos | RF-12 |
| CA-03 | Dado un conector con etiqueta, cuando se mueve cualquiera de sus extremos, entonces la etiqueta permanece sobre el conector | RF-13 |
| CA-04 | Dado un nodo seleccionado, cuando se usa el atajo de hijo, entonces aparece un nodo conectado con el texto listo para editar | RF-14 |
| CA-05 | Dado un árbol de tres niveles, cuando se colapsa una rama, entonces sus descendientes se ocultan y al expandir reaparecen en su posición original | RF-15 |
| CA-06 | Dado un elemento vinculado a la nota A, cuando se abre el panel de backlinks de A, entonces aparece el lienzo de origen | RF-20, RF-22 |
| CA-07 | Dada la nota A con enlaces entrantes, cuando se renombra, entonces todos los enlaces siguen funcionando sin edición manual | RF-23, RN-01, RN-02 |
| CA-08 | Dado un enlace a una nota eliminada, cuando se abre la lista de enlaces rotos, entonces ese enlace figura en ella | RF-24 |
| CA-09 | Dado un texto escrito dentro de una forma, cuando se busca, entonces el resultado abre el lienzo y resalta ese elemento | RF-26 |
| CA-10 | Dado un cierre forzado durante la edición, cuando se reabre, entonces el archivo abre sin error y se perdieron como máximo los últimos 5 s | RF-29, RNF-04 |
| CA-11 | Dado el equipo sin conexión a internet, cuando se usan las funciones RF-01 a RF-30, entonces todas operan con normalidad | HU-14, RNF-03 |
| CA-12 | Dado un lienzo de 1 000 elementos, cuando se abre y se arrastra un elemento, entonces abre en menos de 2 s y el arrastre responde en menos de 100 ms | RNF-01, RNF-02 |
| CA-13 | Dado un lienzo, cuando se exporta a PNG, SVG y PDF, entonces los tres archivos abren en visores estándar y contienen todos los elementos visibles | RF-33 |
| CA-14 | Dadas dos copias divergentes del mismo lienzo, cuando se reúnen, entonces no se pierde ninguna y el propietario ve ambas | RF-37, RN-04 |
| CA-15 | Dada una nota eliminada, cuando se abre la papelera, entonces se puede restaurar con sus enlaces intactos | RN-03 |
| CA-16 | Dado un almacén, cuando se genera la copia de seguridad y se restaura en un equipo limpio, entonces el contenido coincide archivo por archivo | RF-32 |
| CA-17 | Dado un almacén, cuando se abren sus archivos de notas con un editor de texto, entonces el contenido es legible (texto plano, DP-03 y DP-07) | RN-05, RNF-07 |
| CA-18 | Dado un archivo .excalidraw válido, cuando se importa, entonces los elementos soportados aparecen y los no soportados se listan en un aviso | RF-34 |
| CA-19 | Dado el uso normal, cuando se observa el tráfico de red del equipo, entonces no hay conexiones salientes que el propietario no haya configurado | RNF-05 |
| CA-20 | Dada una nota con título, lista y negrita, cuando se cierra y se reabre, entonces conserva todo el formato | RF-17 |
| CA-21 | Dada una nota con la etiqueta "idea", cuando se filtra por esa etiqueta o se abre su carpeta, entonces la nota aparece | RF-25 |
| CA-22 | Dadas 100 acciones en un lienzo, cuando se deshacen las 100, entonces el lienzo vuelve al estado inicial | RF-04 |
| CA-23 | Dado un lienzo con tres versiones guardadas, cuando se restaura la primera, entonces el lienzo la muestra y las otras dos siguen en el historial | RF-31 |
| CA-24 | Dada una imagen en el portapapeles, cuando se pega en el lienzo, entonces aparece y sigue ahí al reabrir | RF-10 |
| CA-25 | Dada una tableta con lápiz, cuando se apoya la palma y se escribe una palabra, entonces solo queda el trazo del lápiz | RF-47 |
| CA-26 | Dada una palabra escrita a mano, cuando se cierra y se reabre el lienzo, entonces el trazo se conserva igual | RF-48 |
| CA-27 | Dado un almacén local, cuando se conecta por primera vez a Google Drive, entonces el Sistema pide elegir entre sin cifrar y cifrado, con el aviso de cada opción, y no contacta con Google antes de la elección | RN-12, RNF-06 |
| CA-28 | Dado un archivo Markdown editado fuera del Sistema, cuando se vuelve a abrir en el Sistema, entonces muestra el cambio sin errores | RF-30, RN-05 |
| CA-29 | Dado un almacén en Google Drive, cuando se pierde la conexión durante la edición y luego vuelve, entonces los cambios se sincronizan sin duplicar ni perder nada | RF-42, RNF-16 |
| CA-30 | Dado un lienzo, cuando se exporta a .excalidraw y se abre en Excalidraw, entonces aparecen las formas, los textos y las flechas, y el Sistema listó lo que no tiene equivalente | RF-45 |
| CA-31 | Dado un lienzo con 100 versiones guardadas, cuando se abre, entonces abre en menos de 2 s | RNF-17 |
| CA-32 | Dada una versión antigua, cuando el propietario la elimina, entonces desaparece del historial y baja el espacio ocupado | RF-46, RN-13 |
| CA-33 | Dado un almacén que ya funciona en el navegador (abierto sin configurar nada, CA-01), cuando el propietario elige después una carpeta local o Google Drive, entonces el almacén queda conectado a ese sitio con el mismo identificador, su contenido aparece allí, se vuelve a abrir desde allí y el origen anterior no se borra | RF-41 |

## 14. Matriz de trazabilidad

Cada historia llega a al menos un requerimiento; las dos que no tienen criterio de aceptación son HU-13 (No ahora) y HU-16 (Podría).

| HU | Requerimientos funcionales | No funcionales | Criterios de aceptación |
| --- | --- | --- | --- |
| HU-01 | RF-08, RF-29, RF-39 | RNF-08 | CA-01 |
| HU-02 | RF-01, RF-02, RF-03, RF-05, RF-06, RF-07, RF-08, RF-09 | RNF-01, RNF-02 | CA-12 |
| HU-03 | RF-12, RF-13, RF-14 |  | CA-02, CA-03, CA-04 |
| HU-04 | RF-11, RF-14, RF-15, RF-16 |  | CA-05 |
| HU-05 | RF-17, RF-18, RF-19 |  | CA-17, CA-20, CA-28 |
| HU-06 | RF-20, RF-21, RF-22, RF-23, RF-24, RF-28 |  | CA-06, CA-07, CA-08 |
| HU-07 | RF-26 | RNF-10 | CA-09 |
| HU-08 | RF-25, RF-27 |  | CA-21 |
| HU-09 | RF-04 |  | CA-22 |
| HU-10 | RF-33 |  | CA-13 |
| HU-11 | RF-36, RF-37, RF-42 | RNF-07 | CA-14 |
| HU-12 | RF-31, RF-46 | RNF-17 | CA-23, CA-31, CA-32 |
| HU-13 | RF-38 | RNF-06 | Fuera de la primera versión (DP-05) |
| HU-14 |  | RNF-03, RNF-05 | CA-11, CA-19 |
| HU-15 | RF-10 |  | CA-24 |
| HU-16 | RF-40 |  | Diferido hasta priorizarla |
| HU-17 | RF-34, RF-35, RF-45 |  | CA-18, CA-30 |
| HU-18 | RF-30, RF-32 | RNF-04, RNF-09 | CA-10, CA-15, CA-16 |
| HU-19 | RF-47, RF-48, RF-49 | RNF-14 | CA-25, CA-26 |
| HU-20 | RF-43, RF-44 | RNF-06, RNF-15 | CA-27 |
| HU-21 | RF-41, RF-42 | RNF-05, RNF-06, RNF-16 | CA-27, CA-29, CA-33 |

## 15. Anexo A: alternativas de código abierto para el motor del lienzo

Excalidraw empaquetado como componente es la alternativa de mejor ajuste: es MIT, se integra en una web y usa el formato .excalidraw que querías importar y exportar, mientras que construir todo el lienzo desde cero es el camino más caro.

Consultado el 11 de octubre de 2026. Las licencias salen de las páginas abiertas completas (Excalidraw, tldraw y draw.io); el resto viene de fragmentos de búsqueda y conviene verificarlo antes de depender de ello. Decisión del propietario el 11 de octubre: usar Excalidraw como motor (DP-11).

| Alternativa | Qué es | Licencia | Encaje con los requerimientos | Límite o riesgo |
| --- | --- | --- | --- | --- |
| [Excalidraw](https://github.com/excalidraw/excalidraw) (paquete @excalidraw/excalidraw) | Pizarra de estilo boceto, publicada como componente para integrar en otra web | MIT, sin clave de licencia | Trae lienzo infinito, formas, flechas ancladas con etiqueta, dibujo libre, imágenes, deshacer, zoom, exportar a PNG y SVG, y el formato abierto .excalidraw (RF-01 a RF-13 y RF-33; importar y exportar pasa a ser nativo, DP-06) | El guardado local, la sincronización, la colaboración y el modo sin conexión están en la app de excalidraw.com, no en el paquete, y habría que construirlos (RF-29, RF-41, RF-42). Su lista de funciones no menciona notas, enlaces con notas ni ramas colapsables |
| [tldraw](https://tldraw.dev/sdk-features/license-key) | Biblioteca de lienzo infinito para React | Licencia propia, no abierta: en producción exige clave; la gratuita (hobby) es discrecional, solo no comercial y con marca de agua; la comercial es de pago | Biblioteca completa de lienzo infinito | Choca con DP-09: si compartes el código y quizá vendes, cada persona que lo publique necesita su propia clave. Las licencias hobby y de prueba envían a tldraw el ID de licencia y la dirección de la página |
| [React Flow](https://reactflow.dev/) (@xyflow/react) | Nodos y conexiones para mapas, flujos y diagramas | MIT | Arrastre, zoom, selección múltiple y alta y baja de elementos ya incluidos; encaja con mapas mentales y conceptuales (RF-02, RF-12 a RF-14) | No dibuja a mano ni tiene estilo boceto; el trazo con lápiz habría que construirlo |
| [Konva](https://konvajs.org/docs/faq.html) y Fabric.js | Bibliotecas de canvas 2D con objetos, capas y eventos | MIT, ambas | Dan las piezas base de dibujo | Hay que construir todo el editor: [barras de herramientas, deshacer, exportar y selección](https://img.ly/blog/open-source-design-editor-sdks-a-developers-guide-to-choosing-the-right-solution/). Es el camino del motor propio y el más costoso |
| [perfect-freehand](https://www.jsdelivr.com/package/npm/perfect-freehand) | Convierte los puntos del lápiz en trazos suaves con grosor según la presión | MIT | Resuelve el grosor del trazo con el Apple Pencil (RF-47, RF-48), con presión real o simulada | No es un lienzo: complementa a React Flow, Konva y Fabric.js |
| [draw.io](https://github.com/jgraph/drawio) | Editor de diagramas y pizarra | Apache 2.0 para el código; los iconos y plantillas tienen condiciones propias | Muy completo para diagramas; se puede publicar una copia propia, pero el README la describe sin integraciones (no dice cuáles; por verificar si incluye Google Drive) | No acepta aportes externos, no tiene colaboración simultánea y su nombre y logo están protegidos; no es un lienzo de boceto con notas |
| [AFFiNE y BlockSuite](https://github.com/toeverything/AFFiNE) | Espacio de trabajo con documentos y lienzo sin bordes en el mismo producto | BlockSuite en MIT; AFFiNE: las fuentes consultadas discrepan entre MIT y MPL-2.0, por verificar | Es lo más parecido al sistema completo: notas y lienzo juntos | Es un producto grande, con base de datos propia (OctoBase) y motor de colaboración; no está claro que guarde Markdown plano. Sería adoptar un sistema entero, no construir el tuyo |
| [JSON Canvas](https://obsidian.md/blog/json-canvas/) | Formato abierto de archivo .canvas para lienzos (no es un motor) | MIT | Sirve como formato de guardado o de intercambio con Obsidian | Es conservador: nodos de texto, archivo, enlace y grupo, más conexiones; no cubre trazo a mano ni formas |

### Recomendación del analista

Usar Excalidraw como motor del lienzo y construir como propio lo que no trae: las notas en Markdown, los enlaces y backlinks, la búsqueda, el guardado local en Chrome y Edge, la sincronización con Google Drive, el historial de versiones y las ramas colapsables. Sigue siendo un sistema propio; lo que se sustituye es solo el dibujo del lienzo, la parte más costosa.

Qué cambiaría en este documento si se adopta:

- RF-01 a RF-13 y RF-33 pasan de construirse a integrarse.
- Importar y exportar .excalidraw (RF-34, RF-45) pasa a ser nativo.
- R-01 baja y R-07 sube, porque se depende de una librería de terceros.
- DP-09 no se complica: la licencia MIT no impide compartir el código ni venderlo.

### Qué falta verificar antes de construir

Una prueba corta con el componente, en el PC y en el iPad:

1. Cómo responde el trazo a mano con el Apple Pencil (USB-C) (DP-10).
2. Si un elemento puede enlazarse a una nota (RF-20).
3. Si aguanta 1 000 elementos sin retrasos (RNF-01).

Si alguna falla, la alternativa más razonable sería React Flow con perfect-freehand, que habría que probar igual.

### Fuentes

- [Excalidraw en GitHub](https://github.com/excalidraw/excalidraw)
- [tldraw, clave de licencia](https://tldraw.dev/sdk-features/license-key)
- [tldraw, licencia propia desde la versión 4.0](https://tldraw.dev/blog/20-things-i-wish-ai-chatbots-knew-about-tldraw)
- [draw.io en GitHub](https://github.com/jgraph/drawio)
- [React Flow](https://reactflow.dev/)
- [Konva, preguntas frecuentes](https://konvajs.org/docs/faq.html)
- [Editores de diseño de código abierto, IMG.LY](https://img.ly/blog/open-source-design-editor-sdks-a-developers-guide-to-choosing-the-right-solution/)
- [perfect-freehand en jsDelivr](https://www.jsdelivr.com/package/npm/perfect-freehand)
- [AFFiNE en GitHub](https://github.com/toeverything/AFFiNE)
- [AFFiNE, guía de Better Stack](https://betterstack.com/community/guides/linux/affine/)
- [JSON Canvas, anuncio de Obsidian](https://obsidian.md/blog/json-canvas/)
