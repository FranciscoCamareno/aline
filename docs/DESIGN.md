# aline — Sistema de diseño

> Un cuaderno de papel crema con un resaltador amarillo pastel destapado. Cálido y táctil, con la personalidad en el marco y el lienzo despejado para pensar.

Referencia de estilo: superr.ai, adaptada de una landing de marketing a una herramienta de uso prolongado.

**Temas:** claro y oscuro. **Idiomas de la interfaz:** español e inglés.

---

## 1. Principios

1. **La personalidad vive en el marco, no en el lienzo.** Logo, sidebar, estados vacíos, onboarding y biblioteca llevan el carácter de la marca. El área de dibujo y escritura se mantiene neutra para que el contenido del usuario sea lo protagonista.
2. **Tinta sobre papel.** Bordes oscuros y finos en lugar de rellenos pesados, superficies mate, sombras casi imperceptibles. Nada de gradientes, glassmorphism ni neones.
3. **El amarillo es superficie, nunca texto.** Mantequilla rellena, resalta y marca estados activos. El texto siempre va en tinta (o en crema, en oscuro).
4. **Los colores de sticker son decoración.** Nunca se usan para estados, enlaces ni acciones.
5. **Los neutros son cálidos en ambos temas.** No se usan grises fríos ni negro puro.

---

## 2. Color

### 2.1 Tokens de la interfaz

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg-canvas` | `#FFFDF4` papel | `#16140C` noche | Fondo de la app y del lienzo |
| `--bg-panel` | `#F8F2E1` papel viejo | `#24211B` corteza | Sidebar, barras de herramientas |
| `--bg-popover` | `#FFFDF4` papel | `#2F2B22` tabaco | Menús, diálogos, popovers |
| `--border-soft` | `#E8DFC6` cartón | `#3A3428` cuero | Divisores, bordes de paneles |
| `--border-ink` | `#262118` tinta | `#B5AC97` arena | Bordes de botones y controles |
| `--text-primary` | `#262118` tinta | `#F3EEDF` crema | Texto principal, iconos |
| `--text-secondary` | `#6B6250` grafito | `#B5AC97` arena | Texto secundario, etiquetas de sección |
| `--text-accent` | `#8A5A00` ocre tinta | `#FFD66B` | Captions "a mano", anotaciones |
| `--brand` | `#FFE380` mantequilla | `#FFE380` mantequilla | Botón primario, ítem activo de toolbar, resaltador |
| `--brand-hover` | `#F5C842` yema | `#F5C842` yema | Hover y presionado del primario |
| `--on-brand` | `#262118` tinta | `#262118` tinta | Texto e iconos sobre mantequilla (13:1) |
| `--selection-soft` | `#FFF6CC` crema limón | `#3B3320` miel de noche | Ítem seleccionado en listas, hover de filas |
| `--on-selection-soft` | `#262118` tinta | `#FFE380` mantequilla | Texto sobre la selección suave |
| `--secondary` | `#BFDFE2` agua | `#284A4F` | Diferenciar notas de lienzos, carpetas, etiquetas |
| `--secondary-soft` | `#DCEFF1` agua clara | `#1F3335` | Chips, fondos de etiqueta |
| `--on-secondary` | `#24555C` | `#BFDFE2` | Texto sobre agua |
| `--focus` | `#3B7780` agua profunda | `#7FC4CC` agua luz | Anillo de foco, enlaces entre notas |
| `--link` | `#3B7780` | `#7FC4CC` | Enlaces internos (wikilinks) |

### 2.2 Semánticos

| Token | Claro (texto / fondo) | Oscuro (texto / fondo) | Ejemplo |
|---|---|---|---|
| `--success` | `#2E7A4D` / `#E4F2E7` | `#7BC79A` / `#1F3327` | "Guardado" |
| `--warning` | `#AD500A` / `#FCE9D7` | `#F0A35E` / `#3A2716` | "Sin conexión" |
| `--danger` | `#B83A26` / `#FBE4DF` | `#F08A78` / `#3C211C` | "Error al sincronizar", borrar |

El aviso es naranja y no amarillo, para no confundirse con la marca.

Agua profunda, éxito y aviso se oscurecieron un poco respecto a la primera propuesta (`#3F7F88`, `#2F7D4F`, `#B4530A`), que quedaba por debajo de 4,5:1 en claro. Sobre el lienzo, la selección sigue en `#3F7F88` (§3.3): es un contorno, no texto.

### 2.3 Stickers (solo decoración)

Colores: `#FF9B7A` coral · `#F7AFCB` rosa · `#A8D5A2` brote · `#BFDFE2` agua, más mantequilla y yema de la marca. Archivos: `brand/stickers/sticker-*.svg` y PNG de 512px.

**Construcción** (lienzo de 160×160):

1. **Sombra:** la silueta en tinta, desplazada 4 u. a la derecha y 5 u. hacia abajo.
2. **Troquel:** la silueta en papel, ampliada 9 u.: el borde blanco de una pegatina recortada.
3. **Arte:** rellenos con contorno tinta de 5 u. Las líneas (flecha, garabato) se dibujan como un trazo tinta ancho con el color encima, 10 u. más fino.
4. **Caras** (solo en los personajes): ojos ovalados tinta con un brillo de papel, sonrisa de 3.5 u. y rubor rosa o coral.

**Set:** la "a" (personaje de marca, con un ojo), nube, corazón, nota, lápiz y estallido, que son personajes con cara, más rayo, chispas, bocadillo, exclamación, flecha, garabato y corona como acentos sin cara.

**Uso:**
- Se colocan girados entre 5° y 15°, nunca alineados a la grilla. El giro es de colocación: los archivos van rectos.
- Son iguales en ambos temas; en oscuro, el troquel de papel los separa del fondo.
- Solo en estados vacíos, onboarding, bienvenida, celebraciones (por ejemplo, la primera nota creada) y "acerca de". Nunca en toolbars, listas ni dentro del lienzo.
- Máximo tres por pantalla. Tamaño entre 48 y 160px.
- Los colores de sticker no se usan para estados, enlaces ni acciones.

### 2.4 Contraste verificado

| Par | Ratio |
|---|---|
| Tinta sobre papel | 15.7:1 |
| Tinta sobre mantequilla | 13:1 |
| Grafito sobre papel | 5.9:1 |
| Ocre tinta sobre papel | 5.8:1 |
| Crema sobre noche | ≥ 15:1 |
| Arena sobre noche | ≥ 7.6:1 |
| Agua profunda sobre papel / papel viejo | 4.98 / 4.54:1 |
| Éxito sobre su fondo | 4.53:1 |
| Aviso sobre su fondo | 4.52:1 |

Regla: todo texto ≥ 4.5:1; iconos y bordes funcionales ≥ 3:1. `tests/unit/accesibilidad.test.ts` lo comprueba sobre los tokens reales de `src/app/styles.css` en los dos temas y en los 8 esquemas.

### 2.5 Esquemas de color

8 esquemas en 4 pares claro ↔ oscuro. El usuario elige **uno claro y uno oscuro** en Preferencias (Perfil → Preferencias); por defecto, Papel y Noche. El interruptor de la cabecera alterna entre los dos elegidos; «Seguir al sistema» usa el claro de día y el oscuro de noche. Es una preferencia del navegador (`mindnote.scheme.light` / `.dark`), aplicada con `data-scheme` en `<html>`.

- **Constante (identidad):** mantequilla y yema, foco y enlaces agua, semánticos, rellenos del lienzo, notas adhesivas, stickers y objetos ilustrados.
- **Variable (atmósfera):** lienzo, paneles, popovers, líneas, textos y selección suave. En Bruma y Salvia, foco y enlaces usan `#38727B` (un agua algo más oscura) para llegar a 4,5:1 sobre su panel.

| Esquema | Modo | Lienzo | Panel | Línea | Texto | Texto 2 | Selección | Par |
|---|---|---|---|---|---|---|---|---|
| Papel | Claro | `#FFFDF4` | `#F8F2E1` | `#E8DFC6` | `#262118` | `#6B6250` | `#FFF6CC` | Noche |
| Blanco | Claro | `#FFFFFF` | `#FFFFFF` | `#E5E2DA` | `#262118` | `#5F5B53` | `#FFF6CC` | Negro |
| Bruma | Claro | `#F6FAFA` | `#E6F0F1` | `#CFE0E2` | `#1E2A2D` | `#4F6669` | `#FFF3C4` | Marea |
| Salvia | Claro | `#F8FAF3` | `#EBF0E2` | `#D3DCC5` | `#22291E` | `#56634D` | `#FBF2C2` | Bosque |
| Noche | Oscuro | `#16140C` | `#24211B` | `#3A3428` | `#F3EEDF` | `#B5AC97` | `#3B3320` | Papel |
| Negro | Oscuro | `#000000` | `#000000` | `#2A2A2A` | `#F5F3EE` | `#A9A59D` | `#302D22` | Blanco |
| Marea | Oscuro | `#141818` | `#162428` | `#2B4147` | `#E6F0F1` | `#9CB3B6` | `#303932` | Bruma |
| Bosque | Oscuro | `#161812` | `#192219` | `#304030` | `#ECF1E6` | `#A6B49D` | `#323724` | Salvia |

**Lienzo:**
- El lienzo oscuro de cada par es el filtro del motor sobre el lienzo claro del par. Por eso, en un esquema oscuro, el lienzo se pinta con el fondo claro de su par (Marea con el de Bruma) y el filtro lo convierte en el suyo.
- El fondo del esquema solo se **pinta**: la escena guarda su propio fondo (papel en los lienzos nuevos) y lo conservan las revisiones y las exportaciones. Un lienzo con un fondo elegido a propósito (distinto de los cuatro de esquema) conserva el suyo.
- **Negro** invierte al 100 % (`--theme-filter: invert(100%) hue-rotate(180deg)`) para llegar a negro puro: es la única excepción a no sobrescribir `--theme-filter` (§3.1). Las exportaciones oscuras usan el filtro del motor, así que en Negro el fondo exportado es `#121212`.
- La esquina recortada de una nota adhesiva toma el fondo pintado al crearla; en otro esquema puede notarse.

**Archivos** (`brand/themes/`): `tokens.css` y `themes.json` (fuente), y por esquema `aline-logo.svg` (logotipo con su tinta y su resaltador) y `preview.png` (miniatura del selector). Los objetos de la barra en oscuro usan el troquel crema de `tools-dark/` en los cuatro esquemas oscuros (los troqueles de cada esquema apenas difieren).

---

## 3. Lienzo (Excalidraw 0.18.1)

### 3.1 Cómo funciona el tema oscuro

Excalidraw guarda siempre los colores claros. En oscuro aplica un filtro CSS sobre el `<canvas>`:

```css
.excalidraw.theme--dark { --theme-filter: invert(93%) hue-rotate(180deg); }
```

El `hue-rotate` compensa la inversión: los tonos se conservan y solo cambia la luminosidad. En las exportaciones oscuras, el filtro sale de la constante JS `THEME_FILTER`.

**Decisión:** no se sobrescribe `--theme-filter`. La paleta oscura del lienzo se deriva de la clara. Así, pantalla y exportaciones coinciden, y el modelo de datos no cambia. Por eso `--bg-canvas` oscuro es exactamente `#16140C`, el resultado del filtro aplicado a `#FFFDF4`.

### 3.2 Paleta del lienzo (colores guardados)

Fondo de escena (`viewBackgroundColor`): `#FFFDF4`. Se aplica a los lienzos nuevos; los existentes conservan el suyo. El trazo empieza en tinta (`currentItemStrokeColor`).

La 0.18.1 no permite sustituir la paleta de su selector de color (no hay prop para ello): las tablas siguientes son la paleta prevista, pendiente de un selector propio.

**Trazos**

| Nombre | Guardado | Se ve en oscuro | Contraste claro / oscuro |
|---|---|---|---|
| Tinta (por defecto) | `#262118` | `#D4D0C8` | 15.7 / 12.0 |
| Rojo | `#B83A26` | `#FC907E` | 5.6 / 8.3 |
| Agua | `#2F6F78` | `#6DA4AC` | 5.6 / 6.6 |
| Verde | `#2F7D4F` | `#61A47C` | 4.9 / 6.2 |
| Ocre | `#8A5A00` | `#C3994C` | 5.8 / 7.0 |
| Violeta | `#6B4FA0` | `#AD95DB` | 6.3 / 7.1 |

**Rellenos**

| Nombre | Guardado | Se ve en oscuro | Contraste del texto tinta |
|---|---|---|---|
| Mantequilla | `#FFE380` | `#442C00` | 8.5 |
| Agua | `#BFDFE2` | `#1D393B` | 8.0 |
| Rosa | `#F7AFCB` | `#773951` | 5.5 |
| Verde | `#A8D5A2` | `#264D21` | 6.3 |
| Durazno | `#FFC9A8` | `#5F3114` | 7.1 |
| Lavanda | `#D8CCF0` | `#3F3554` | 7.4 |

Valores calculados con la matriz del estándar CSS; el navegador puede variar ligeramente.

### 3.3 Variables de Excalidraw a sobrescribir

```css
.excalidraw {
  --color-selection: #3F7F88;            /* agua profunda, se ve tal cual */
}
.excalidraw.theme--dark {
  --color-selection: #00515A;            /* pre-invertido: se ve #7FC4CC */
}
```

- En oscuro se usa "agua luz" porque `#3F7F88` sobre `#16140C` queda en torno a 4:1, poco para un contorno punteado fino.
- La selección no puede ser amarilla: un elemento con relleno mantequilla seleccionado no se distinguiría.
- Las variables `--color-primary*` pertenecen a la interfaz de Excalidraw, que **no** pasa por el filtro. Usan los valores directos: `--brand` para activo y `--brand-hover` para hover, con `--on-brand` encima.

Inventario de la 0.18.1 y su token (en `src/app/styles.css`, bajo `.workspace .excalidraw.excalidraw`):

| Variable del motor | Token | Dónde se ve |
|---|---|---|
| `--color-surface-primary-container` / `--color-on-primary-container` | `--brand` / `--on-brand` | Herramienta activa, opción seleccionada |
| `--color-primary` | `--brand` | Botones primarios, interruptores, pestañas activas |
| `--color-primary-hover`, `--color-primary-darker`, `--color-brand-hover` | `--brand-hover` | Hover de lo anterior |
| `--color-primary-darkest`, `--color-brand-active` | `--border-ink` | Borde al pulsar |
| `--color-primary-light` / `--color-primary-light-darker` | `--selection-soft` / `--brand` | Ítem seleccionado en menús |
| `--island-bg-color`, `--sidebar-bg-color` | `--bg-panel` | Barras y paneles |
| `--popup-bg-color` | `--bg-popover` | Menús y diálogos |
| `--default-bg-color`, `--input-bg-color`, `--color-surface-lowest` | `--bg-canvas` | Campos y fondos |
| `--color-surface-high`, `--color-border-outline-variant` | `--border-soft` | Hover y bordes |
| `--color-on-surface` / `--color-border-outline` | `--text-primary` / `--text-secondary` | Texto e iconos |
| `--focus-highlight-color`, `--link-color` | `--focus`, `--link` | Foco y enlaces |
| `--ui-font` | Nunito | Toda la interfaz del motor |

Donde el motor usa `--color-primary` como color de texto (etiquetas de la biblioteca, cuentagotas) o pone texto blanco encima (botón primario de los diálogos), una regla aparte lo pasa a tinta: el amarillo nunca es texto.

### 3.4 Tests

- e2e: `--color-selection` correcto en claro y oscuro.
- e2e: el fondo del lienzo renderizado en oscuro coincide con `--bg-canvas` (`#16140C`). Si una actualización de Excalidraw cambia el filtro, este test lo detecta.

### 3.5 Notas adhesivas

Viven en el lienzo, así que usan **la misma paleta de rellenos del lienzo** y pasan por el filtro oscuro como cualquier otro elemento. Se construyen solo con primitivas de Excalidraw, agrupadas: no requieren cambios en el motor.

**Construcción** (nota de 200×200; se puede redimensionar):

1. Rectángulo con el color de relleno, contorno tinta de 2px, esquinas rectas y `roughness: 0`.
2. Banda adhesiva: un rectángulo de 24px de alto arriba, sin contorno, con el relleno mezclado al 7% con tinta.
3. Esquina doblada abajo a la derecha (28px), con el relleno mezclado al 16% con tinta. La misma esquina de los iconos de nota y del sticker. Debajo lleva un triángulo del color del lienzo que "recorta" la esquina.
4. Texto ligado al rectángulo, para que se ajuste solo: fuente del lienzo (Excalifont), 16px, tinta, alineado arriba a la izquierda, margen de 16px.

| Color | Relleno | Banda | Doblez | Se ve en oscuro |
|---|---|---|---|---|
| Mantequilla | `#FFE380` | `#F0D579` | `#DCC46F` | `#442C00` |
| Agua | `#BFDFE2` | `#B4D2D4` | `#A7C1C2` | `#1D393B` |
| Rosa | `#F7AFCB` | `#E8A5BE` | `#D698AE` | `#773951` |
| Brote | `#A8D5A2` | `#9FC898` | `#93B88C` | `#264D21` |
| Durazno | `#FFC9A8` | `#F0BD9E` | `#DCAE91` | `#5F3114` |
| Lavanda | `#D8CCF0` | `#CCC0E1` | `#BCB1CD` | `#3F3554` |

- En oscuro, la banda y el doblez quedan más claros que el cuerpo, por la inversión. Se siguen leyendo como banda y doblez.
- Color por defecto: mantequilla. Los demás se eligen desde el panel de propiedades de la nota.
- El triángulo que recorta la esquina usa el color de fondo del lienzo; si algún día el lienzo admite otros fondos, debe tomar ese color.
- Biblioteca provisional: `brand/notes/aline-notas.excalidrawlib`. Hasta que exista la herramienta, se importa en la biblioteca de Excalidraw y las notas se arrastran desde ahí.

---

## 4. Tipografía

| Familia | Uso | Pesos | Fuente |
|---|---|---|---|
| **Cherry Bomb One** | Base del logotipo (ya convertido a SVG) | 400 (único) | Google Fonts, OFL |
| **Nunito** | Toda la interfaz | 400, 600, 700 | Google Fonts, OFL |
| **Excalifont** (por defecto de Excalidraw) | Texto dentro del lienzo | — | Incluida en Excalidraw |

Cherry Bomb One no se carga en la app: el logotipo se usa como SVG. No se usa en títulos, botones ni ningún otro texto.

El texto del lienzo usa por ahora la fuente manuscrita de Excalidraw. Pendiente: comprobar qué otras fuentes admite la 0.18.1 y si se pueden añadir propias.

### Logotipo y símbolo

**Concepto: el resaltador.** "aline" en Cherry Bomb One, sin modificar las letras, sobre un trazo de marcador mantequilla. Es el mismo gesto que el componente "Resaltador" de la interfaz: marcar lo importante. El símbolo es la "a" sola con el mismo trazo detrás.

**Construcción** (en unidades de la fuente; altura x = 470):

- Resaltador: cubre el 52% inferior de la altura x y baja un 9% por debajo de la línea base. Sobresale un 10% de la altura x a la izquierda de la "a" y termina justo después de la "e".
- Punta biselada, como un marcador de punta cincel: los extremos se inclinan un 22% de la altura del trazo, con las esquinas apenas redondeadas.
- Espaciado entre letras: −6 unidades respecto al de la fuente.
- En el ícono, la "a" se centra ópticamente (un poco por debajo del centro geométrico) y el resaltador queda algo desplazado a la izquierda, como si el trazo empezara antes de la letra.

| Archivo | Uso | Colores |
|---|---|---|
| `aline-logo.svg` | Sidebar y encabezados en tema claro | Letras tinta, resaltador mantequilla |
| `aline-logo-dark.svg` | Sidebar y encabezados en tema oscuro | Letras crema, resaltador `#6B5520` |
| `aline-logo-mono.svg` | Un solo color: grabados, sellos, impresión en B/N | Tinta, sin resaltador |
| `aline-icon.svg` / `-192/512.png` | Ícono de la PWA en escritorio | Placa papel con borde tinta, "a" tinta, resaltador mantequilla |
| `aline-icon-dark.svg` | El símbolo sobre fondos oscuros dentro de la app | Placa mantequilla, "a" tinta, resaltador yema |
| `aline-icon-maskable.svg` / `-512.png` | Ícono `maskable` del manifiesto (Android, Chrome) | Fondo papel a sangre, contenido dentro de la zona segura |
| `apple-touch-icon.svg` / `-180.png` | Pantalla de inicio del iPad | Fondo papel a sangre, sin transparencias |
| `favicon.svg` / `-16/32/48.png` | Pestaña del navegador | La "a" algo más grande para ganar legibilidad |

Reglas:

- En oscuro, las letras nunca van sobre mantequilla, porque crema sobre mantequilla no tiene contraste. Por eso el resaltador oscuro es un ocre profundo.
- La versión mono se usa solo cuando no hay color disponible; el resaltador nunca se sustituye por un gris.
- Altura mínima del logotipo: 20px. En la sidebar, entre 24 y 28px. Por debajo de 20px se usa el símbolo.
- A 16px el resaltador del favicon apenas se percibe; la "a" sola tiene que bastar.
- Área de respeto: media altura x (el alto del resaltador) alrededor de todo el logotipo.
- No cambiar la inclinación ni el color del resaltador, no rotar ni deformar las letras, no añadir sombras ni contornos.

### Escala de la interfaz (Nunito)

| Rol | Tamaño | Peso | Interlineado |
|---|---|---|---|
| caption | 12px | 400 | 1.4 |
| label | 13px | 600 | 1.4 |
| body-sm | 14px | 400 | 1.5 |
| body | 16px | 400 | 1.6 |
| subheading | 20px | 600 | 1.3 |
| heading | 28px | 700 | 1.2 |
| display | 40px | 700 | 1.1 |

Alineación a la izquierda siempre; no se centran bloques de texto. Sin letter-spacing en títulos.

---

## 5. Espaciado, radios y bordes

**Unidad base:** 4px. Escala: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.

| Elemento | Radio |
|---|---|
| Inputs, ítems de lista, botones de herramienta | 8px |
| Tarjetas, toolbars, popovers, paneles flotantes | 12px |
| Botones de acción, chips, etiquetas | 20px (pill) |

| Borde | Grosor | Color |
|---|---|---|
| Botón y control (claro) | 1.5px | `--border-ink` |
| Botón secundario (oscuro) | 1.5px | `--border-ink` (arena) |
| Divisor y borde de panel | 1px | `--border-soft` |
| Sticker | 2px | tinta en ambos temas |

### Elevación

| Nivel | Claro | Oscuro |
|---|---|---|
| Tarjeta o panel flotante | `0 2px 20px rgba(38,33,24,0.06)` | sin sombra; usar `--border-soft` |
| Botón | `0 1px 2px rgba(38,33,24,0.25)` | sin sombra |
| Popover | `0 8px 24px rgba(38,33,24,0.10)` | `0 8px 24px rgba(0,0,0,0.40)` |

---

## 6. Componentes

### Botón primario
Fondo `--brand`, texto `--on-brand` en Nunito 14px 600, radio 20px, padding 8px 20px. En claro lleva borde de 1.5px en tinta; en oscuro, sin borde. Hover y presionado: `--brand-hover`. Máximo **uno** por vista (por ejemplo, "Nuevo lienzo"). El relleno amarillo es lo que distingue la acción principal de las secundarias.

### Botón secundario
Fondo transparente, borde de 1.5px `--border-ink`, texto `--text-primary`, mismas medidas que el primario. Hover: `--selection-soft`.

### Botón de herramienta (toolbar)
32×32px, radio 8px, icono de 18px en `--text-primary`. Hover: `--selection-soft`. Activo: fondo `--brand`, borde de 1.5px en tinta e icono en `--on-brand`. El atajo numérico va en caption de 10px, color `--text-secondary`.

### Toolbar
Fondo `--bg-panel`, borde de 1px `--border-soft`, radio 12px, padding 4px, separación de 4px entre botones.

### Sidebar (biblioteca)
Ocupa toda la altura, a la izquierda de la cabecera. De arriba abajo:

1. Logotipo y botón `panel-lateral` para plegarla. Plegada, la cabecera muestra ese botón y el logotipo.
2. **Nuevo**: el único botón primario, con un desplegable: Lienzo, Nota, Carpeta │ Importar archivos…, Importar carpeta….
3. Buscador de títulos ("Buscar archivos…"), con el icono `buscar` dentro del campo.
4. Pestañas **Todos** (carpetas, etiquetas y "Recuperación") y **Recientes**. La activa lleva `--selection-soft`.
5. La lista, con su propio desplazamiento. Los lienzos y las notas se arrastran a una carpeta (su fila o su contenido) o al espacio libre de «Todos» para sacarlos a la raíz; el destino se marca con el anillo de foco discontinuo y la fila arrastrada se atenúa. Sin arrastre, la carpeta se cambia en el panel de Detalles.
6. Pie: solo **Perfil** (icono y texto en `--text-secondary`), que abre hacia arriba un menú con **Configuración**, **Temas**, **Idioma**, **Papelera** (con su recuento) y, tras un divisor, **Estado y diagnóstico** (también en el «⋯» de la cabecera). Cada opción abre el modal de **Configuración** en su sección: navegación lateral sobre `--bg-panel` (sección activa en `--selection-soft` con la marca yema a la izquierda) y el contenido a la derecha sobre `--bg-popover`, con su título y el botón de cerrar. Secciones: **Almacenamiento** («Dónde se guarda»: Google Drive o una carpeta, con el aviso y la elección de cifrado), **Apariencia** («Seguir al sistema» y los esquemas, §2.5), **Idioma** y **Papelera** (restaurar o borrar definitivamente, con confirmación). No se cierra con un clic fuera, para no perder una contraseña a medio escribir. En pantallas estrechas la navegación pasa arriba como pestañas. El estado remoto de la cabecera abre Almacenamiento.
   - Los menús «⋯» se mantienen dentro de la ventana (si se salen, se recolocan) y sus textos largos saltan de línea; Escape los cierra también desde su botón. La **ayuda** de atajos es el botón «?» del motor, abajo a la derecha del lienzo, en el estilo de la aplicación (40 px, borde tinta, radio 12) y solo con un lienzo abierto. La entrada «Ayuda» del menú del lienzo y los textos de ayuda que el motor pone bajo su barra («Para mover el lienzo…») no se muestran. El atajo «?» también abre el diálogo.

El diálogo de ayuda usa los tokens de la interfaz (fondo `--bg-popover`, teclas en `--selection-soft`) y no trae los cuatro enlaces externos del motor (documentación, blog, GitHub, YouTube): la aplicación no ofrece salidas a la red sin que el usuario las pida (diseño §13).

### Cabecera
Título del documento, chip de guardado y chip del destino conectado a la izquierda. A la derecha, solo: Historial (icono), **Enlaces** y **Exportar ▾** (botones secundarios con texto), el menú **⋯** (Buscar, Estado y diagnóstico) y el interruptor de tema. Exportar ofrece el documento abierto (lienzo: imagen, PDF o `.excalidraw`; nota: `.md`) y, tras un divisor, las notas en Markdown (.zip) de la carpeta elegida o de todo el almacén.

### Menú desplegable
Popover `--bg-popover`, borde de 1px `--border-soft`, radio 12px, padding 6px y `--shadow-popover`. Elementos de 36px con glifo de 18px, texto de 14px y, a la derecha, el atajo en `--text-secondary`; hover y foco en `--selection-soft`. Los destructivos van en `--danger`. Se coloca fijo junto a su botón (no lo recorta la lista con scroll) y se abre hacia arriba si no cabe debajo. Teclado: Intro, Espacio o flecha abajo lo abren con el foco en el primer elemento; flechas, Inicio y Fin lo recorren; Escape lo cierra y devuelve el foco al botón.

### Ítem de sidebar
Altura 32px, radio 8px, padding horizontal 8px, icono de 16px + texto de 14px. Seleccionado: fondo `--selection-soft` y texto `--on-selection-soft`. Hover: `--selection-soft` al 60%. Las acciones (renombrar, enviar a la papelera) están en el menú **⋯** de la fila, que aparece al hacer hover, con el foco o en la fila activa.

### Encabezado de sección (sidebar)
Nunito 12px 600, color `--text-secondary`, margen superior de 16px.

### Chip de estado
Pill de radio 20px, padding 3px 10px, 12px 600, con el par texto/fondo semántico correspondiente (por ejemplo, "Guardado" con `--success`).

### Input
Altura 36px, radio 8px, fondo `--bg-canvas`, borde de 1px `--border-soft`; en foco, borde `--focus` y anillo de 2px `--focus` al 30%. Placeholder en `--text-secondary`.

### Resaltador
Para destacar una palabra en notas o títulos: fondo `--brand` en la mitad inferior del texto (`linear-gradient(transparent 45%, var(--brand) 45%)`). Es el único gradiente permitido, porque imita un trazo de marcador.

### Caption "a mano"
Nunito 14px, cursiva, color `--text-accent`, con una flecha SVG curva de 1.5px. Solo en onboarding, estados vacíos y ayudas contextuales.

### Texto de la interfaz
Mayúscula inicial normal en etiquetas, botones, menús y mensajes ("Nuevo lienzo", "Guardado"). La minúscula total queda reservada al logotipo.

### Estado vacío
Logo o sticker rotado + título en Nunito 20px 700 + una línea en `--text-secondary` + botón primario. Es una invitación ("Crea tu primer lienzo"), nunca una disculpa.

### Anillo de foco
`outline: 2px solid var(--focus); outline-offset: 2px;` en todos los elementos interactivos. Nunca se elimina.

---

## 7. Iconos

Hay dos niveles, que comparten la misma línea (tinta, uniones y terminales redondeadas) y la misma paleta.

### 7.1 Objetos de la barra de herramientas (48×64)

Cada herramienta es un **objeto físico** que asoma de una bandeja, como lápices en un portalápices. Archivos: `brand/icons/tools/*.svg`.

- Contorno tinta de 2.5px; rellenos solo de la paleta: papel, mantequilla, yema, cartón y agua.
- **Familia por color:** las herramientas de dibujo y escritura (lápiz, texto, nota) llevan mantequilla; las formas, agua; las de navegación (selección, mano), papel.
- Los objetos se dibujan más largos que el lienzo de 64px: la bandeja tapa su base.
- Los objetos no cambian de color entre temas. En oscuro llevan además un **troquel crema** (`#F3EEDF`) de 1.5px por fuera del contorno tinta, como un sticker, porque la tinta sola desaparece sobre la bandeja oscura. Archivos: `brand/icons/tools-dark/*.svg`.

| Herramienta | Objeto | Atajo |
|---|---|---|
| Selección | Cursor de papel | V |
| Mano | Mano abierta | H |
| Lápiz | Lápiz amarillo con punta de grafito | P |
| Texto | Bloque tipográfico con una "A" resaltada | T |
| Nota adhesiva | Taco de notas mantequilla con esquina doblada | N |
| Stickers | Hoja de stickers con un corazón troquelado; abre el selector de stickers | B |
| Formas | Muestra la forma activa (ver abajo) | R · D · O · A · L |
| Borrador | Goma de papel con funda agua | E |
| Bloquear herramienta | Candado: abierto en papel, cerrado en mantequilla | Q |
| Más herramientas | Caja de herramientas de cartón; abre el panel secundario | — |

**Orden de la barra principal:** candado │ selección, mano, lápiz, texto, nota, stickers, formas, borrador │ caja.

El atajo de stickers es **B**. La propuesta inicial, Mayús+S, ya la usa Excalidraw (cuentagotas del trazo), y S abre el color del trazo. Las letras sueltas libres en la 0.18.1 son B, C, J, M, U, W, Y y Z; la N es de la nota.

### Panel secundario

Se abre al lado de la barra principal cuando se pulsa la caja de herramientas, que queda levantada mientras el panel está abierto. Tiene la misma bandeja, en un segundo bloque separado por 16px.

| Herramienta | Objeto | Atajo |
|---|---|---|
| Marco | Caballete con un lienzo con marcas de corte | F |
| ~~Incrustar web~~ | Ventana de navegador con `</>` | — |
| Puntero láser | Puntero con punto rojo (`#B83A26`, el rojo del lienzo) | K |
| Imagen | Polaroid con paisaje | 9 |
| │ Diagrama desde Mermaid | Tarjeta con un diagrama de nodos | — |

El divisor separa las herramientas de inserción del grupo "Generar". No se usa el logotipo de Mermaid: es una marca de terceros.

**Formas agrupadas:** una sola casilla muestra la forma activa y un chevron indica que se despliega. El menú lista rectángulo, rombo, elipse, flecha y línea con su glifo, su nombre y su atajo. Como objetos, las formas son **plantillas de recorte**: una placa agua con la forma calada y marcas de regla en el borde. Todas comparten la misma placa y solo cambia el calado, lo que las agrupa como familia. En oscuro, el calado deja ver la bandeja.

### Selector de stickers

Popover que se abre sobre la casilla de stickers, centrado en ella y a 16px por encima de los objetos. La casilla sube mientras está abierto, como la caja.

- Fondo `--bg-popover`, borde de 1.5px `--border-soft`, radio 16px, padding 14px.
- Título "Stickers" (Nunito 13px 700, `--text-secondary`).
- Cuadrícula de 5 columnas con celdas de 62px; cada sticker a 52px. Hover y foco: fondo `--selection-soft`, radio 10px.
- Orden: primero los personajes (a, nube, corazón, nota, lápiz, estallido) y después los acentos (rayo, chispas, bocadillo, exclamación, flecha, garabato, corona).
- Clic o arrastre: el sticker se coloca en el lienzo como imagen, a 120px y con un giro aleatorio entre −10° y 10°. Con clic va al centro de la vista; arrastrado, donde se suelta. Queda seleccionado y se deshace con Ctrl+Z. El giro se puede quitar con la rotación normal.
- **Verificado en la 0.18.1 (color en oscuro):** el filtro del tema oscuro (`invert(93%) hue-rotate(180deg)`) no puede mostrar un amarillo saturado, por mucho que se compense la imagen antes: el mantequilla necesitaría un azul negativo. Insertar PNG en vez de SVG (el motor contrarresta su filtro en los mapas de bits, no en los SVG) deja los rosas, verdes y corales casi exactos, pero el amarillo se veía melocotón. Por eso, en oscuro, los stickers se dibujan en una capa propia sin filtro (`src/features/canvas/stickerLayer.ts`). Se inserta el PNG de 512px (`brand/stickers/sticker-*-512.png`) y se guarda como cualquier imagen del lienzo; el selector muestra los SVG.
- **Límites de esa capa (solo en oscuro):** los stickers se ven por encima del resto de elementos aunque estén detrás en el orden de capas; no respetan el recorte de un marco; y la exportación en oscuro (PNG, SVG, PDF) sigue pasando por el filtro del motor, así que ahí el amarillo se ve más apagado. Las notas adhesivas y las formas no cambian.
- Accesibilidad: la casilla tiene `aria-haspopup="dialog"` y `aria-expanded`; el selector es un `dialog` con nombre "Stickers", cada sticker un botón con su nombre, y Escape lo cierra devolviendo el foco a la casilla.

### 7.2 Estados de la barra

- **Reposo:** el objeto asoma de la bandeja.
- **Hover:** sube 4px (transición de 120ms con ease-out).
- **Activo:** sube 14px y aparece un punto mantequilla con borde tinta bajo la casilla. La caja de herramientas abierta sube, pero no lleva punto: el punto marca solo la herramienta de dibujo activa.
- **Candado:** es un interruptor (`aria-pressed`), no una herramienta; cambia de objeto (abierto/cerrado) y no sube.
- **Formas:** al pulsar el chevron, o con una pulsación larga, se abre el menú encima de la barra; al elegir una forma, esta pasa a ser la de la casilla y queda activa.
- Bandeja: `--bg-panel`, borde de 1.5px `--border-soft`, radio 22px, con un labio frontal que tapa la base de los objetos.
- Accesibilidad: cada casilla es un `button` con `aria-label` ("Lápiz (P)") y `aria-pressed`; la casilla de formas tiene `aria-haspopup="menu"`.

### 7.3 Glifos (24×24)

La versión de línea de cada herramienta, para menús, tooltips, ayudas de atajos y tamaños pequeños. Archivos: `brand/icons/glyphs/*.svg`. Trazo de 2px en `currentColor`, sin rellenos. Tamaños: 16px en listas, 18–20px en menús y 20px en el encabezado.

### 7.4 Iconos de interfaz (24×24)

Son los iconos del resto del sistema: sidebar, encabezado, menús, diálogos y estados. Archivos: `brand/icons/ui/*.svg` (67 iconos, incluidos `sticker` y `tema-sistema`). Siguen la misma línea que los glifos de herramientas, pero son más discretos: **sin relleno por defecto**.

- Trazo de 2px en `currentColor`, terminales y uniones redondeadas, radios de esquina de 1.5–2, sobre una retícula de 24 con margen de 3–4px.
- Grupos: navegación, acciones, vista, contenido, y estado y sistema.
- **Capa de acento:** casi todos los iconos con superficie (carpeta, nota, estrella, nube…) traen una forma interior `class="ac"` con `fill="var(--icon-accent, none)"`. Es invisible por defecto y se activa solo en estados seleccionados o activos. Es el puente con las herramientas ilustradas: el mismo relleno mantequilla, pero solo cuando importa.

```css
.icon { color: var(--text-primary); --icon-accent: none; }
.is-active .icon, .icon.is-on { --icon-accent: #FFE380; }              /* claro */
[data-theme="dark"] .is-active .icon { color: #FFE380; --icon-accent: #5C4E1E; }
```

Usos típicos del acento: ítem activo de la sidebar (carpeta, nota, lienzo), favorito marcado, nota fijada, filtro aplicado, vista seleccionada (cuadrícula o lista).

- Los iconos de estado (`info`, `aviso`, `error`, `exito`) toman el color semántico por `color` y, como acento, su fondo semántico (por ejemplo, `--icon-accent: var(--danger-bg)`).
- No se mezclan con iconos de otras librerías; si falta uno, se dibuja siguiendo estas reglas.

### 7.5 Interruptor de tema

Sustituye al desplegable de tema de la cabecera. Referencia: `brand/icons/theme/theme-switch-{light,dark}.svg`; en la app se construye con los iconos `tema-claro` y `tema-oscuro`.

- Carril de 72×36, radio completo. Claro: `--bg-panel` con borde tinta de 1.5px. Oscuro: tabaco `#2F2B22` con borde cuero.
- Pomo de 30px que se desliza al lado del tema activo:
  - Claro: pomo papel con un **sol** mantequilla (contorno tinta y 8 rayos).
  - Oscuro: pomo mantequilla con una **luna** creciente crema y contorno tinta.
- El icono del otro tema queda en el carril en `--text-secondary`, como pista de a dónde lleva el cambio.
- Transición: el pomo se desplaza en 200ms con ease-out (sin animación con "reducir movimiento").
- Accesibilidad: `role="switch"`, `aria-checked` (oscuro = true) y `aria-label="Tema oscuro"`; se activa con Espacio o Enter. En pantallas táctiles el área pulsable mide 44px de alto, aunque el carril se vea de 36.
- **Esquemas:** el interruptor alterna entre el esquema claro y el oscuro elegidos en Preferencias (§2.5); su carril oscuro usa `--bg-popover` del esquema.
- **Seguir al sistema:** es una opción de Preferencias (glifo `tema-sistema`), no del interruptor. Si está activa, el interruptor refleja el tema resuelto y, al tocarlo, se pasa a modo manual.

## 8. Calendario

Archivos: `brand/calendar/` (vistas en PNG y SVG, hoja de "hoy") y los iconos `calendario`, `calendario-hoy`, `evento-mas` y `repetir` en `brand/icons/ui/`, más el objeto `calendario` en `icons/tools/`.

### 8.1 Números y letras

- **Todo en Nunito con cifras tabulares** (`font-variant-numeric: tabular-nums`), para que las columnas de números no bailen. Cherry Bomb One sigue reservada al logotipo.
- Iniciales de los días: **L M X J V S D**, con X para miércoles, que es la convención en español para no repetir la M. En vista de mes: Lun, Mar, Mié, Jue, Vie, Sáb, Dom.
- Meses en minúscula ("octubre"), salvo en el título de la vista ("Octubre 2026").
- La semana empieza el lunes por defecto, configurable.

| Rol | Tamaño | Peso |
|---|---|---|
| Título del mes | 32px; el año en `--text-secondary` y peso 400 | 700 |
| Número de día en la celda | 14px | 600 |
| Número de día en la semana | 15px | 700 |
| Días de la semana (encabezado) | 12px | 700 |
| Hora | 11px | 400 |
| Chip de evento | 12px | 600 (todo el día) / 400 (con hora) |
| Hoja de "hoy" | 68px | 700 |

### 8.2 Vista de mes

- Cabecera: título, anterior y siguiente (círculos de 34px con borde suave), "Hoy" (botón secundario), selector Día, Semana y Mes (segmentado, activo en mantequilla) y "Nuevo evento" (botón primario, el único de la vista).
- Cuadrícula de 7×6 en una tarjeta con radio 14px y líneas de 1px `--border-soft`. El fin de semana lleva un tinte apenas más cálido (`#FBF7EA` / `#1B1912`).
- **Hoy:** el número en un círculo mantequilla de 28px con borde tinta, la misma pastilla que el pomo del interruptor y el estado activo de la barra.
- **Día seleccionado:** contorno de 2px `--focus` con radio 10px.
- Días de otro mes: `--text-secondary` (en vez de un `--text-muted` más claro, que no llegaría a 4,5:1). El día 1 de cada mes lleva la abreviatura ("1 oct").
- Máximo 2 chips y "+N más" si hay más de 3 eventos.

### 8.3 Eventos

- **Los colores son los mismos de las notas adhesivas** (mantequilla, agua, rosa, brote, durazno y lavanda), de modo que un color significa lo mismo en el lienzo y en el calendario.
- En oscuro se usa el mismo valor que produce el filtro del lienzo (`#442C00`, `#1D393B`, `#773951`, `#264D21`, `#5F3114`, `#3F3554`) con texto crema, así una nota y su evento se ven iguales.
- Chip: 22px de alto, radio 6px, sin borde. Con hora: "10:00 Título" en peso regular. Todo el día: título en negrita. Varios días: una barra continua que cruza las celdas, con las esquinas redondeadas solo en los extremos.
- Vista de semana: bloques con radio 8px, borde tinta de 1.5px en claro (sin borde en oscuro), título en negrita y horario debajo. La línea de "ahora" es roja (`#B83A26` / `#F08A78`) con un punto al inicio.

### 8.4 Selector de fechas

Popover de 296px. Hoy: anillo de 1.5px. Inicio y fin de rango: círculos mantequilla con borde tinta. Días intermedios: banda `--selection-soft`. Días con eventos: un punto de 4px bajo el número.

### 8.5 Hoja de "hoy"

Taco de calendario ilustrado (cabecera mantequilla, anillas, día de la semana, número grande y mes) para la sidebar, el estado vacío del calendario o la pantalla de inicio. Es un objeto ilustrado, como los de la barra: no cambia en oscuro.

### 8.6 Implementado (14/10/2026)

- **Estructura:** la biblioteca tiene dos secciones, **Biblioteca** (lienzos y notas) y **Calendario**, como pestañas bajo el logotipo; la activa lleva `--selection-soft` y una marca yema a la izquierda. En Calendario, la biblioteca muestra **Nuevo evento** (el botón principal) y **Mis calendarios**, con una casilla del color de cada calendario para mostrarlo u ocultarlo (preferencia de este navegador) y su menú ⋯ (renombrar, enviar a la papelera; el último no se puede borrar). El primer calendario, «Personal», se crea solo.
- **Cabecera de la vista:** título, anterior y siguiente, Hoy y el selector **Día · Semana · Mes**. «Nuevo evento» aparece aquí solo con la biblioteca plegada, para no repetir el botón principal.
- **Mes y semana** según §8.2–8.3. Una celda muestra hasta 3 eventos; si tiene más, 2 y «+N más», que abre esa semana. Las barras de varios días se cortan donde su carril no cabe. Doble clic en un día (o en una hora de la semana) crea un evento allí.
- **Datos:** cada calendario es un documento `calendar` del almacén con revisiones, historial, papelera, copias y sincronización (`docs/formato-almacen.md` §2.5.1). Las fechas son locales, sin zona horaria.
- **Vista de día:** la misma retícula de horas con una sola columna (fila de «todo el día», bloques, línea de «ahora»); anterior/siguiente avanzan un día.
- **Marco del día seleccionado:** un contorno de 2 px dentro de su celda (pseudoelemento por encima de las vecinas). Cada semana del mes tiene un alto mínimo (118 px) para que las celdas nunca se salgan de su fila; si la ventana es baja, el mes se desplaza.
- **Conflictos:** si un calendario tiene varias cabezas, la vista muestra un aviso y el panel de resolución: conservar una versión, conservar ambas (la otra pasa a un calendario nuevo) o **combinar eventos** (unión por `id`; si un evento está en varias, vale el de la versión más reciente; uno borrado en una versión reaparece si otra lo conserva).
- **Pendiente:** selector de fechas propio (§8.4; hoy se usan los controles del navegador), hoja de «hoy» (§8.5), eventos repetidos (icono `repetir`), semana que empiece en domingo (el dominio ya lo admite) y buscar eventos.

## 9. Plantillas del lienzo

Sustituyen a la biblioteca de Excalidraw, que no admite imágenes ni se guardaba. Botón **Plantillas** arriba a la derecha del lienzo, donde estaba «Biblioteca»; abre un panel con **Guardar selección** (pide un nombre) y la lista de plantillas. Un clic inserta la plantilla en el centro de la vista; también se puede arrastrar al lienzo. Cada inserción es una copia con identidades nuevas (textos ligados, flechas unidas y grupos incluidos), seleccionada y deshacible. Las plantillas son documentos `template` del almacén (§2.5.2 del formato) y admiten imágenes y stickers. Cada plantilla muestra una miniatura de su escena (papel claro fijo, también en oscuro).

## 10. Hacer y no hacer

**Hacer**
- Usar mantequilla como superficie (primario, activo, resaltador) y tinta como texto encima.
- Mantener neutros cálidos en ambos temas.
- Elegir colores del lienzo pensando en cómo se ven invertidos (sección 3).
- Probar cada color nuevo en claro y en oscuro antes de añadirlo.

**No hacer**
- Texto amarillo sobre papel (contraste insuficiente).
- Usar colores de sticker para estados, enlaces o acciones.
- Usar Cherry Bomb One fuera del logotipo.
- Poner más de un botón primario por vista.
- Usar negro puro o grises fríos.
- Usar amarillo como color de selección del lienzo.
- Sobrescribir `--theme-filter` de Excalidraw.

---

## 11. Pendientes

- [x] Inventariar las variables `--color-primary*` de Excalidraw 0.18.1 y asignarles tokens (§3.3).
- [x] Barra de herramientas de objetos (§7.1–7.2) y panel secundario (`src/features/canvas/ToolTray.tsx`). La barra del motor sigue en el árbol, oculta, para conservar su texto de ayuda. «Incrustar web» se quitó: el diseño técnico descarta el contenido web incrustado por privacidad (§13, RNF-05); el objeto sigue en `brand/`. Cuando el motor detecta un lápiz, la bandeja muestra el interruptor «Solo lápiz», que antes estaba en la barra del motor. Sin espacio a los lados, el panel secundario se coloca encima de la barra principal.
- [ ] Selector de color propio con la paleta del lienzo (§3.2): la 0.18.1 no deja cambiar la suya.
- [ ] Comprobar qué fuentes admite el lienzo en la 0.18.1 y si se pueden añadir propias.
- [ ] Revisar el relleno rosa en oscuro; si desentona, cambiarlo a `#F2BBD0`.
- [x] Nota adhesiva como herramienta propia (§3.5, `src/features/canvas/stickyNote.ts`): la casilla o la tecla N insertan una nota mantequilla en el centro de la vista, agrupada y seleccionada.
- [ ] Texto de la nota arriba a la izquierda con margen de 16 px: el motor descarta los textos vacíos, así que la nota se crea sin texto y el que se escribe con doble clic lo coloca el motor centrado.
- [ ] Elegir el color de la nota desde el panel de propiedades (hoy siempre mantequilla; los seis colores ya están en `STICKY_COLORS`).
- [ ] Decidir dónde vive la biblioteca (hoy es un botón aparte en la esquina superior derecha).
- [ ] Revisar el logotipo en un editor vectorial: limpiar contornos y ajustar el kerning a mano.
- [x] Corregir en la implementación el fondo del lienzo (`#F5FAFF` → `#FFFDF4`) y las notas adhesivas según §3.5. En el código actual, los lienzos nuevos empiezan en `#FFFDF4` y las notas llevan relleno, banda, doblez y trazo tinta. Los lienzos ya existentes conservan su fondo; se cambia desde el menú del lienzo ("Fondo del lienzo").
- [x] Atajo de stickers: B (Mayús+S y S ya los usa Excalidraw).
- [x] Selector de stickers, interruptor de tema y nueva estructura de la sidebar y la cabecera (§6, §7).
- [x] Stickers con su color en oscuro (capa sin filtro) y diálogo de ayuda en el estilo de la aplicación; el botón «?» vuelve al pie del lienzo y la biblioteca tiene «Perfil» en su lugar.
- [ ] Stickers en oscuro: respetar el orden de capas con las formas y el recorte de los marcos, y que la exportación en oscuro los muestre con su color.
- [x] Calendario básico (§8.6): secciones en la biblioteca, vistas de mes y semana, eventos con los colores de las notas adhesivas, varios calendarios.
- [x] Plantillas del lienzo (§9) en lugar de la biblioteca del motor.
- [x] Calendario: vista de día y resolución de conflictos (§8.6).
- [x] Plantillas: miniaturas en el panel.
- [ ] Calendario: selector de fechas propio, hoja de «hoy» y eventos repetidos (§8.6).
