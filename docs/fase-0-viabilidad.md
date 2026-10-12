# Fase 0 — Viabilidad del motor de lienzo

Versión 1.0 | 12 de octubre de 2026 | Plan: [Plan-de-fases.md](Plan-de-fases.md) §3, fase 0 | Diseño: §9, §11, §17

Este informe registra las pruebas de viabilidad de Excalidraw como motor (R-19, D-14, DP-11). Distingue lo **medido en el PC**, lo **indicativo** (eventos emulados) y lo **pendiente en el iPad**. Las pruebas del iPad no se han ejecutado y no se dan por superadas.

## 1. Resumen y decisión

| # | Prueba | Resultado en el PC (Chromium) | iPad |
| --- | --- | --- | --- |
| 0.1 | 1 000 elementos: apertura y arrastre | **Pasa**: apertura de 52–63 ms, arrastre con un máximo de 48–56 ms por evento | Pendiente |
| 0.2 | Enlace `mindnote://` en un elemento | **Pasa** | — |
| 0.3 | `customData` y sidecar | **Pasa, con una condición**: el motor copia `customData` al duplicar y al pegar | — |
| 0.4 | Apple Pencil (USB-C) y palma | **Indicativo**: `penMode` se activa con el lápiz e ignora el toque | **Funciona** según el propietario (§6) |
| 0.5 | Borrar un extremo de un conector (RN-07) | **Pasa**: el conector queda suelto, no se borra | — |
| 0.6 | Rama colapsada y deshacer | **Falla la estrategia ingenua**. **Pasa la alternativa** (ocultos en la escena) | — |
| 0.6b | 100 deshacer y rehacer (CA-22) | **Pasa** | — |
| 0.7 | Exportar solo lo visible | **Pasa** | — |

**Decisión: se avanza con Excalidraw.** Pasan 0.2, 0.3 y 0.5, que eran la condición del plan. No hace falta registrar un cambio de motor.

**Quedan abiertos** y no bloquean las fases 1 a 5:

- **RF-47 y RF-48** (lápiz): el propietario confirma que el Apple Pencil funciona en el iPad; faltan los datos detallados del §6 para cerrar CA-25 y CA-26;
- **RF-15** (ramas colapsables), que solo puede construirse con la estrategia alternativa de 0.6c y con las pruebas adicionales del §3.6;
- **el rendimiento en el iPad** (0.1).

## 2. Entorno

| Elemento | Valor |
| --- | --- |
| Equipo | Windows 11 Home, Intel Core i5-1155G7 a 2,50 GHz, 12 GB de RAM, Intel Iris Xe |
| Navegador | Chromium headless shell 156 (Playwright 1.64.0), ventana de 1440 × 900 |
| Motor | @excalidraw/excalidraw 0.18.1 con React 19.3.0, compilación de producción |
| Banco | `spikes/fase0/` (fuera del producto), pruebas en `tests/fase0/fase0.spec.ts` |
| Resultados en bruto | `spikes/fase0/results/chromium.json` (última ejecución) |
| Repeticiones | 3 ejecuciones completas; las cifras son el rango observado |

Para repetirlo: `pnpm test:fase0`.

## 3. Resultados por prueba

### 3.1 — 0.1 Rendimiento con 1 000 elementos (RNF-01, RNF-02, CA-12)

La escena tiene 333 rectángulos con etiqueta, 333 flechas ancladas y un texto suelto, en total 1 000 elementos. La escena serializada ocupa unos 623 KB.

| Medida | CPU normal | CPU ×4 (emulada) | Meta |
| --- | --- | --- | --- |
| Montaje del motor (mediana de 5) | 52–63 ms | 333–690 ms | < 2 s |
| Reabrir con el códec del producto (deserializar + montar) | 60–77 ms | 693–888 ms | < 2 s |
| Serializar al guardar | 8 ms | 42–83 ms | — |
| Arrastre: eventos de más de 16 ms | 2 de 61 | 4 de 122 | p95 < 100 ms |
| Arrastre: evento más lento | 48–56 ms | 128–272 ms | < 100 ms |
| Arrastre: p95 del intervalo entre frames | 16,7 ms | 66,7–99,9 ms | — |

**Lectura:**

- En este PC se cumplen las metas con mucho margen.
- Con la CPU ralentizada ×4, el percentil 95 de los eventos sigue por debajo de 16 ms (menos del 5 % los supera), pero algunos eventos sueltos superan 100 ms. Probablemente es el primer `pointerdown`, que selecciona el elemento.
- La ralentización emulada **no equivale al iPad**: solo indica que conviene medir allí antes de dar CA-12 por cumplido.
- No incluye imágenes. El diseño exige medirlas aparte (§16.1).

### 3.2 — 0.2 Enlace interno (RF-20)

- `element.link = "mindnote://document/<uuid>"` se conserva al asignarlo por la API, con `serializeAsJSON` + `restore` y con el códec del producto.
- El saneamiento del motor (`@braintree/sanitize-url`) solo bloquea `javascript:`, `data:` y `vbscript:`. El esquema propio pasa intacto.
- Al pulsar el icono de enlace, `onLinkOpen` recibe el elemento con el enlace. Con `preventDefault()` no se abre ninguna ventana (0 ventanas observadas).
- El editor de enlaces del propio motor (Ctrl+K) también guarda el enlace sin cambios.

**Consecuencia:** RF-20 puede usar el campo `link` nativo como vía de interacción. El sidecar sigue siendo la autoridad (`elementLinks`), como manda el diseño §9.

### 3.3 — 0.3 `customData`

- Se conserva al guardar y reabrir y al deshacer un cambio.
- **Al duplicar (Ctrl+D) y al copiar y pegar, el motor copia `customData`** al elemento nuevo. Tras ambas operaciones había tres elementos con la misma marca. Los elementos nuevos tienen id distinto.

**Consecuencia:** `customData` no sirve como identidad. El sidecar debe indexar por id de elemento, e ignorar o regenerar cualquier marca de `customData` cuyo id no coincida con su entrada. Esto confirma la regla del diseño: `customData` solo es una referencia redundante.

### 3.4 — 0.4 Lápiz (indicativo en Chromium)

Los eventos se generaron con el protocolo de depuración de Chromium: ratón con `pointerType: "pen"` y toques reales de pantalla táctil.

| Paso | Resultado |
| --- | --- |
| Trazo con lápiz y herramienta de dibujo libre | Se crea el trazo; el motor activa `penMode` y `penDetected` |
| Toque con `penMode` activo | **No** se crea trazo |
| Toque con `penMode` desactivado | Se crea trazo |
| Guardar y reabrir el trazo con el códec | Puntos y presiones idénticos |

**Matices:**

- El motor marca `simulatePressure: true` cuando la presión recibida es 0,5, como hace el emulador. Con el Apple Pencil (USB-C), que no mide presión, el grosor será el elegido o una variación simulada, como prevé el diseño.
- En el código del motor, `penMode` solo bloquea el toque con herramientas de dibujo. Con la herramienta de selección, el toque puede seleccionar y mover.

**Esto no certifica el rechazo de palma**: hace falta el iPad (§4).

### 3.5 — 0.5 Conector suelto (RN-07)

Hay dos nodos A y B y una flecha anclada a ambos. Al borrar B con la tecla Supr:

- La flecha **sigue existiendo y no está borrada**; `startBinding` = A y `endBinding` = vacío.
- Al deshacer, B vuelve y la flecha recupera su anclaje.

**Consecuencia:** no hace falta restaurar flechas. Basta con **marcar** el conector suelto en `danglingConnectorIds` y mostrar esa marca (plan 3.2: tamaño S).

### 3.6 — 0.6 Ramas colapsadas (RF-15, CA-05)

El árbol tiene la raíz R, los hijos C1 y C2, el nieto G1 y tres flechas: 11 elementos con etiquetas. Al colapsar R se ocultan 9.

**Estrategia A — sacar los ocultos de la escena (ingenua): FALLA.**

1. Se registra una acción (mover C2) y se colapsa R con `CaptureUpdateAction.NEVER`.
2. Al deshacer, el historial **reinsertó C2 en la escena como borrado** (`isDeleted: true`).
3. Al expandir, C2 ya no se restauró: tras deshacer quedaron 10 elementos visibles de 11. **Pérdida visible de un nodo.**
4. Además, el conector oculto no sigue a la raíz movida: al expandir quedó a 30 px, y se corrigió solo al mover la raíz de nuevo.

Es exactamente el riesgo que el diseño anticipa en §9.1.

**Estrategia B — ocultos dentro de la escena, con opacidad 0 y bloqueados: PASA la misma secuencia.**

| Comprobación | Resultado |
| --- | --- |
| Seleccionar todo con la rama colapsada | Solo se selecciona R |
| Clic sobre la posición de un nodo oculto | No selecciona nada |
| Deshacer con la rama colapsada | C2 no se borra ni se hace visible; ningún elemento se pierde |
| Mover la raíz colapsada y expandir | El conector oculto sigue a la raíz (1 px) |
| Expandir | 11 de 11 elementos, opacidades restauradas, ninguno bloqueado; G1 conserva su posición |
| Deshacer dos veces tras expandir | 11 elementos, ninguno borrado |
| Exportar SVG filtrando los ocultos | Contiene «RAIZ» y ninguno de los textos ocultos |

**Pendiente de precisar antes de entregar RF-15:**

- **Qué pasa con la entrada del historial de C2.** Al deshacer con la rama colapsada, C2 siguió en su posición movida. No se ha determinado si esa entrada se descarta o se aplica más tarde.
- **El menú del motor puede desbloquear elementos** («Desbloquear todo»). Un nodo oculto desbloqueado sería seleccionable aunque invisible. El adaptador debe volver a aplicar la proyección o desactivar esa acción.
- **La opacidad y el bloqueo originales** deben guardarse en el sidecar (`collapsedNodeIds` y los valores originales). Si no, se mezclarían con los cambios del usuario al guardar.
- **La búsqueda y la exportación** deben filtrar los ocultos de forma explícita: la escena los contiene.
- **Faltan pruebas largas**: 100 deshacer intercalando colapsos, guardar y reabrir con la rama colapsada, y copiar y pegar un nodo colapsado.

### 3.7 — 0.6b Deshacer 100 acciones (RF-04, CA-22)

Se hicieron 100 movimientos registrados en el historial (por la API). Ctrl+Z ×100 volvió al estado inicial y Ctrl+Mayús+Z ×100 al final. **Pasa.** Falta repetirlo con gestos del usuario mezclados con comandos propios cuando existan (plan 6.8).

### 3.8 — 0.7 Exportar la proyección visible

`exportToSvg` y `exportToBlob` (PNG) con los elementos visibles generan archivos que contienen la raíz y no los nodos ocultos. Con la estrategia B, la lista se filtra con la proyección antes de exportar. **Pasa.** Queda la comprobación en visores externos (CA-13), que corresponde a la fase 5.

## 4. Protocolo para el iPad (pendiente, lo ejecuta el propietario)

**Preparación en el PC:**

1. Ejecutar `pnpm spike:fase0 --host`. Si Windows lo pide, permitir el acceso en la red privada.
2. En el iPad, con Safari, abrir `http://<IP-del-PC>:4174`. El banco muestra un panel «Diagnóstico de lápiz».

**Pruebas con el banco:**

| Paso | Qué hacer | Qué anotar |
| --- | --- | --- |
| 1 | Elegir la herramienta de dibujo libre y trazar con el lápiz | `penDetected` y `penMode` pasan a `true` |
| 2 | Con la palma apoyada, escribir 20 frases cortas | «trazos por puntero»: `touch` debe seguir en 0 |
| 3 | Desplazar y hacer zoom con dos dedos mientras `penMode` está activo | Si funciona sin crear trazos |
| 4 | Con la herramienta de selección, apoyar la palma | Si selecciona o mueve elementos por error |
| 5 | Mirar la línea «presión» | Número de valores distintos; con USB-C se espera presión constante o simulada |
| 6 | Pulsar «Montar 1 000», arrastrar nodos | Tiempo mostrado (meta < 2 s) y sensación de respuesta |
| 7 | Sesión de 10 minutos, cambiando de orientación | Fallos, saltos o trazos perdidos |

**Guardar y reabrir (CA-26).** El banco no guarda. Hay que usar la aplicación del producto con `pnpm build` y `pnpm preview --host`, abrir `http://<IP-del-PC>:4173`, escribir a mano una palabra, cerrar la pestaña y reabrirla. En HTTP de red local el Service Worker no se instala; el guardado en IndexedDB sí funciona.

**Fuera de alcance de este protocolo.** La instalación como PWA y `storage.persist` exigen HTTPS. Se probarán con el alojamiento de la fase 4 o con un certificado local.

**Registro de resultados.** Anotarlos en una sección nueva de este documento, con el modelo de iPad, la versión de iPadOS, la versión de Safari y la fecha.

## 5. Consecuencias para el plan

| Punto del plan | Cambio |
| --- | --- |
| 3.2 Conectores sueltos | El motor ya conserva la flecha: tamaño **S**, solo marcar y mostrar |
| 3.5 Vincular elementos | Usar `element.link` con `mindnote://` y `onLinkOpen`; el sidecar es la autoridad |
| Sidecar (general) | Indexar por id de elemento; `customData` puede quedar duplicado tras copiar o pegar |
| 6.2 Ramas colapsables | Viable **solo** con la estrategia B y tras las pruebas pendientes del §3.6 |
| 6.7 y 5.4 Lápiz | Siguen condicionados a la prueba 0.4 en el iPad |
| 5.6 Rendimiento | Repetir CA-12 en el iPad y con imágenes |

## 6. Resultado en el iPad

**12 de octubre de 2026.** El propietario informa de que **el Apple Pencil (USB-C) funciona** en el iPad con el banco de la fase 0. Con esto RF-47 y RF-48 dejan de estar bloqueados.

No se han registrado todavía los datos detallados del protocolo (§4). Hay que anotarlos antes de dar por cumplidos CA-25, CA-26 y CA-12 en el iPad:

- modelo de iPad, versión de iPadOS y de Safari;
- trazos creados por toque con la palma apoyada (paso 2) y comportamiento con la herramienta de selección (paso 4);
- valores de presión observados (paso 5);
- tiempo de «Montar 1 000» y fluidez del arrastre (paso 6);
- sesión de 10 minutos con cambios de orientación (paso 7) y guardar y reabrir con la aplicación del producto (CA-26).

