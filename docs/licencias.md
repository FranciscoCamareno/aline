# Inventario de licencias

Generado con `node scripts/licenses.ts` el 2026-10-16 a partir de `pnpm licenses list --prod`. No editar a mano.

Requisito RNF-12: toda dependencia tiene una licencia compatible con el uso previsto. Se admiten las licencias permisivas de la lista del script; cualquier otra aparece en «Por revisar» y hace fallar `--check`.

## Resumen

| Licencia | Paquetes |
| --- | --- |
| MIT | 349 |
| ISC | 38 |
| Apache-2.0 | 11 |
| BSD-3-Clause | 7 |
| OFL-1.1 | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |
| CC0-1.0 | 1 |
| (MIT AND Zlib) | 1 |
| Unlicense | 1 |
| 0BSD | 1 |

## Por revisar

Ninguna dependencia de producción tiene una licencia fuera de la lista admitida.

## Licencia del código propio

MIT, `Copyright (c) 2026 F. C.` (archivo `LICENSE` del repositorio; decisión DP-09). Se distribuye con la aplicación como `LICENSE.txt`.

## Cumplimiento en la aplicación compilada

Las licencias MIT, BSD, Apache-2.0 y OFL-1.1 exigen que los avisos de copyright y de permiso acompañen a cada copia distribuida. El repositorio no contiene código de terceros (`node_modules` y `public/fonts` no se versionan), pero `dist/` sí. Por eso `pnpm assets` (antes de `dev` y `build`) genera:

- `THIRD-PARTY-NOTICES.txt`: licencia de cada dependencia de producción y del código de Workbox y Vite incluido en el Service Worker y el cargador. Si un paquete npm no trae archivo de licencia, se usa la del repositorio de origen (`licenses/`) o la sección de licencia de su README. También incluye el aviso de copyright de cada fuente, leído de su propio archivo WOFF2, con su licencia.
- `LICENSE.txt`: la licencia MIT de la aplicación.

Ambos se enlazan desde «Estado y diagnóstico → Licencias» y se precachean para el uso sin conexión.

## Fuentes del lienzo

Licencias comprobadas el 12/10/2026 en los metadatos de cada archivo WOFF2 (`scripts/font-metadata.ts`) y, cuando el archivo no la declara, en la fuente oficial.

| Fuente | Versión | Licencia | Evidencia | ¿Se distribuye? |
| --- | --- | --- | --- | --- |
| Virgil | 001.001 | OFL-1.1 | Texto OFL en el archivo | Sí |
| Excalifont | 1.000 | OFL-1.1 | El archivo solo dice «All rights reserved»; la página oficial de Excalidraw la publica bajo OFL-1.1 | Sí |
| Assistant | 3.000 | OFL-1.1 | Texto OFL en el archivo | Sí |
| Cascadia Code | 2005.150 | OFL-1.1 | URL de la OFL en el archivo; repositorio de Microsoft bajo OFL-1.1 | Sí |
| Nunito | 3.602 | OFL-1.1 | URL de la OFL en el archivo | Sí |
| Lilita One | 1.002 | OFL-1.1 (nombre reservado «Lilita One») | URL de la OFL en el archivo | Sí, sin modificar |
| Comic Shanns | 1.3.0 | MIT | Texto MIT completo en el archivo | Sí |
| Xiaolai SC | 3.11 | OFL-1.1 | El archivo no la declara; el paquete LXGW en CTAN la publica bajo OFL-1.1 | Sí |
| Liberation Sans | 1.05 | GPLv2 con excepción de fuentes y cláusulas añadidas de Red Hat (serie 1.x) | Remite a «the license agreement»; la serie 2.x, bajo OFL, es otra versión | **No**: se excluye de la copia y de `dist/` |

**Liberation Sans 1.05.** El motor la usa para el estilo de letra antiguo «Normal» (Helvetica). Su licencia no encaja con un proyecto MIT que podría venderse. Debian llegó a considerarla no redistribuible. No se distribuye: los textos con ese estilo se muestran con la fuente sin serifa del sistema. Si hiciera falta, la alternativa es la serie 2.x (OFL), sustituyendo el archivo.

## Otros recursos

| Recurso | Origen | Licencia |
| --- | --- | --- |
| Marca: logotipo, iconos de la PWA, iconos de interfaz y stickers (`brand/`, copiados a `public/`) | Propio | MIT (la del código propio) |
| Iconos de la interfaz del motor | Incluidos en el código de `@excalidraw/excalidraw` | MIT (licencia del paquete) |

## Paquetes

| Paquete | Versión | Licencia |
| --- | --- | --- |
| @antfu/install-pkg | 2.1.0 | MIT |
| @babel/runtime | 7.29.10 | MIT |
| @braintree/sanitize-url | 6.0.2, 7.1.2 | MIT |
| @chevrotain/cst-dts-gen | 11.0.3 | Apache-2.0 |
| @chevrotain/gast | 11.0.3 | Apache-2.0 |
| @chevrotain/regexp-to-ast | 11.0.3 | Apache-2.0 |
| @chevrotain/types | 11.0.3, 11.1.2 | Apache-2.0 |
| @chevrotain/utils | 11.0.3 | Apache-2.0 |
| @codemirror/autocomplete | 6.20.3 | MIT |
| @codemirror/commands | 6.11.1 | MIT |
| @codemirror/lang-css | 6.3.1 | MIT |
| @codemirror/lang-html | 6.4.12 | MIT |
| @codemirror/lang-javascript | 6.2.5 | MIT |
| @codemirror/lang-markdown | 6.5.2 | MIT |
| @codemirror/language | 6.13.1 | MIT |
| @codemirror/lint | 6.9.7 | MIT |
| @codemirror/search | 6.7.2 | MIT |
| @codemirror/state | 6.7.6 | MIT |
| @codemirror/streamparser | 6.0.0 | MIT |
| @codemirror/view | 6.43.14 | MIT |
| @excalidraw/excalidraw | 0.18.1 | MIT |
| @excalidraw/laser-pointer | 1.3.1 | MIT |
| @excalidraw/markdown-to-text | 0.1.2 | MIT |
| @excalidraw/mermaid-to-excalidraw | 2.2.2 | MIT |
| @excalidraw/random-username | 1.1.0 | MIT |
| @floating-ui/core | 1.8.0 | MIT |
| @floating-ui/dom | 1.8.0 | MIT |
| @floating-ui/react-dom | 2.1.9 | MIT |
| @floating-ui/utils | 0.2.12 | MIT |
| @fontsource/nunito | 5.3.0 | OFL-1.1 |
| @iconify/types | 2.0.0 | MIT |
| @iconify/utils | 3.1.7 | MIT |
| @lezer/common | 1.5.3 | MIT |
| @lezer/css | 1.3.9 | MIT |
| @lezer/highlight | 1.2.5 | MIT |
| @lezer/html | 1.3.13 | MIT |
| @lezer/javascript | 1.5.6 | MIT |
| @lezer/lr | 1.4.11 | MIT |
| @lezer/markdown | 1.8.0 | MIT |
| @marijn/find-cluster-break | 1.0.4 | MIT |
| @mermaid-js/parser | 0.6.3, 1.2.1 | MIT |
| @milkdown/core | 7.22.2 | MIT |
| @milkdown/ctx | 7.22.2 | MIT |
| @milkdown/exception | 7.22.2 | MIT |
| @milkdown/plugin-clipboard | 7.22.2 | MIT |
| @milkdown/plugin-history | 7.22.2 | MIT |
| @milkdown/plugin-listener | 7.22.2 | MIT |
| @milkdown/preset-commonmark | 7.22.2 | MIT |
| @milkdown/preset-gfm | 7.22.2 | MIT |
| @milkdown/prose | 7.22.2 | MIT |
| @milkdown/transformer | 7.22.2 | MIT |
| @milkdown/utils | 7.22.2 | MIT |
| @radix-ui/primitive | 1.0.0, 1.1.1 | MIT |
| @radix-ui/react-arrow | 1.1.2 | MIT |
| @radix-ui/react-collection | 1.0.1 | MIT |
| @radix-ui/react-compose-refs | 1.0.0, 1.1.1 | MIT |
| @radix-ui/react-context | 1.0.0, 1.1.1 | MIT |
| @radix-ui/react-direction | 1.0.0 | MIT |
| @radix-ui/react-dismissable-layer | 1.1.5 | MIT |
| @radix-ui/react-focus-guards | 1.1.1 | MIT |
| @radix-ui/react-focus-scope | 1.1.2 | MIT |
| @radix-ui/react-id | 1.0.0, 1.1.0 | MIT |
| @radix-ui/react-popover | 1.1.6 | MIT |
| @radix-ui/react-popper | 1.2.2 | MIT |
| @radix-ui/react-portal | 1.1.4 | MIT |
| @radix-ui/react-presence | 1.0.0, 1.1.2 | MIT |
| @radix-ui/react-primitive | 1.0.1, 2.0.2 | MIT |
| @radix-ui/react-roving-focus | 1.0.2 | MIT |
| @radix-ui/react-slot | 1.0.1, 1.1.2 | MIT |
| @radix-ui/react-tabs | 1.0.2 | MIT |
| @radix-ui/react-use-callback-ref | 1.0.0, 1.1.0 | MIT |
| @radix-ui/react-use-controllable-state | 1.0.0, 1.1.0 | MIT |
| @radix-ui/react-use-escape-keydown | 1.1.0 | MIT |
| @radix-ui/react-use-layout-effect | 1.0.0, 1.1.0 | MIT |
| @radix-ui/react-use-rect | 1.1.0 | MIT |
| @radix-ui/react-use-size | 1.1.0 | MIT |
| @radix-ui/rect | 1.1.0 | MIT |
| @tiptap/core | 3.31.4 | MIT |
| @tiptap/extension-blockquote | 3.31.4 | MIT |
| @tiptap/extension-bold | 3.31.4 | MIT |
| @tiptap/extension-bullet-list | 3.31.4 | MIT |
| @tiptap/extension-code | 3.31.4 | MIT |
| @tiptap/extension-code-block | 3.31.4 | MIT |
| @tiptap/extension-document | 3.31.4 | MIT |
| @tiptap/extension-dropcursor | 3.31.4 | MIT |
| @tiptap/extension-gapcursor | 3.31.4 | MIT |
| @tiptap/extension-hard-break | 3.31.4 | MIT |
| @tiptap/extension-heading | 3.31.4 | MIT |
| @tiptap/extension-horizontal-rule | 3.31.4 | MIT |
| @tiptap/extension-italic | 3.31.4 | MIT |
| @tiptap/extension-link | 3.31.4 | MIT |
| @tiptap/extension-list | 3.31.4 | MIT |
| @tiptap/extension-list-item | 3.31.4 | MIT |
| @tiptap/extension-list-keymap | 3.31.4 | MIT |
| @tiptap/extension-ordered-list | 3.31.4 | MIT |
| @tiptap/extension-paragraph | 3.31.4 | MIT |
| @tiptap/extension-strike | 3.31.4 | MIT |
| @tiptap/extension-text | 3.31.4 | MIT |
| @tiptap/extension-text-align | 3.31.4 | MIT |
| @tiptap/extension-underline | 3.31.4 | MIT |
| @tiptap/extensions | 3.31.4 | MIT |
| @tiptap/pm | 3.31.4 | MIT |
| @tiptap/react | 3.31.4 | MIT |
| @tiptap/starter-kit | 3.31.4 | MIT |
| @types/d3 | 7.4.3 | MIT |
| @types/d3-array | 3.2.2 | MIT |
| @types/d3-axis | 3.0.6 | MIT |
| @types/d3-brush | 3.0.6 | MIT |
| @types/d3-chord | 3.0.6 | MIT |
| @types/d3-color | 3.1.3 | MIT |
| @types/d3-contour | 3.0.6 | MIT |
| @types/d3-delaunay | 6.0.4 | MIT |
| @types/d3-dispatch | 3.0.7 | MIT |
| @types/d3-drag | 3.0.7 | MIT |
| @types/d3-dsv | 3.0.7 | MIT |
| @types/d3-ease | 3.0.2 | MIT |
| @types/d3-fetch | 3.0.7 | MIT |
| @types/d3-force | 3.0.10 | MIT |
| @types/d3-format | 3.0.4 | MIT |
| @types/d3-geo | 3.1.1 | MIT |
| @types/d3-hierarchy | 3.1.7 | MIT |
| @types/d3-interpolate | 3.0.4 | MIT |
| @types/d3-path | 3.1.1 | MIT |
| @types/d3-polygon | 3.0.2 | MIT |
| @types/d3-quadtree | 3.0.6 | MIT |
| @types/d3-random | 3.0.4 | MIT |
| @types/d3-scale | 4.0.9 | MIT |
| @types/d3-scale-chromatic | 3.1.0 | MIT |
| @types/d3-selection | 3.0.12 | MIT |
| @types/d3-shape | 3.2.0 | MIT |
| @types/d3-time | 3.0.4 | MIT |
| @types/d3-time-format | 4.0.3 | MIT |
| @types/d3-timer | 3.0.2 | MIT |
| @types/d3-transition | 3.0.9 | MIT |
| @types/d3-zoom | 3.0.9 | MIT |
| @types/debug | 4.1.13 | MIT |
| @types/geojson | 7946.0.16 | MIT |
| @types/hast | 3.0.5 | MIT |
| @types/lodash | 4.17.26 | MIT |
| @types/lodash-es | 4.17.12 | MIT |
| @types/mdast | 4.0.4 | MIT |
| @types/ms | 2.1.0 | MIT |
| @types/pako | 2.0.4 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @types/unist | 3.0.3 | MIT |
| @types/use-sync-external-store | 0.0.6 | MIT |
| @ungap/structured-clone | 1.4.0 | ISC |
| @upsetjs/venn.js | 2.0.0 | MIT |
| anymatch | 3.1.3 | ISC |
| aria-hidden | 1.2.6 | MIT |
| bail | 2.0.2 | MIT |
| binary-extensions | 2.3.0 | MIT |
| braces | 3.0.3 | MIT |
| browser-fs-access | 0.29.1 | Apache-2.0 |
| canvas-roundrect-polyfill | 0.0.1 | MIT |
| ccount | 2.0.1 | MIT |
| character-entities | 2.0.2 | MIT |
| character-entities-html4 | 2.1.0 | MIT |
| character-entities-legacy | 3.0.0 | MIT |
| chevrotain | 11.0.3 | Apache-2.0 |
| chevrotain-allstar | 0.3.1 | MIT |
| chokidar | 3.6.0 | MIT |
| clsx | 1.1.1 | MIT |
| codemirror | 6.0.2 | MIT |
| comma-separated-tokens | 2.0.3 | MIT |
| commander | 7.2.0, 8.3.0 | MIT |
| cose-base | 1.0.3, 2.2.0 | MIT |
| crc-32 | 0.3.0 | Apache-2.0 |
| crelt | 1.0.7 | MIT |
| cross-env | 7.0.3 | MIT |
| cross-spawn | 7.0.6 | MIT |
| csstype | 3.2.3 | MIT |
| cytoscape | 3.34.3 | MIT |
| cytoscape-cose-bilkent | 4.1.0 | MIT |
| cytoscape-fcose | 2.2.0 | MIT |
| d3 | 7.9.0 | ISC |
| d3-array | 3.2.4 | ISC |
| d3-array | 2.12.1 | BSD-3-Clause |
| d3-axis | 3.0.0 | ISC |
| d3-brush | 3.0.0 | ISC |
| d3-chord | 3.0.1 | ISC |
| d3-color | 3.1.0 | ISC |
| d3-contour | 4.0.2 | ISC |
| d3-delaunay | 6.0.4 | ISC |
| d3-dispatch | 3.0.1 | ISC |
| d3-drag | 3.0.0 | ISC |
| d3-dsv | 3.0.1 | ISC |
| d3-ease | 3.0.1 | BSD-3-Clause |
| d3-fetch | 3.0.1 | ISC |
| d3-force | 3.0.0 | ISC |
| d3-format | 3.1.2 | ISC |
| d3-geo | 3.1.1 | ISC |
| d3-hierarchy | 3.1.2 | ISC |
| d3-interpolate | 3.0.1 | ISC |
| d3-path | 3.1.0 | ISC |
| d3-path | 1.0.9 | BSD-3-Clause |
| d3-polygon | 3.0.1 | ISC |
| d3-quadtree | 3.0.1 | ISC |
| d3-random | 3.0.1 | ISC |
| d3-sankey | 0.12.3 | BSD-3-Clause |
| d3-scale | 4.0.2 | ISC |
| d3-scale-chromatic | 3.1.0 | ISC |
| d3-selection | 3.0.0 | ISC |
| d3-shape | 3.2.0 | ISC |
| d3-shape | 1.3.7 | BSD-3-Clause |
| d3-time | 3.1.0 | ISC |
| d3-time-format | 4.1.0 | ISC |
| d3-timer | 3.0.1 | ISC |
| d3-transition | 3.0.1 | ISC |
| d3-zoom | 3.0.0 | ISC |
| dagre-d3-es | 7.0.14 | MIT |
| dayjs | 1.11.23 | MIT |
| debug | 4.4.3 | MIT |
| decode-named-character-reference | 1.3.0 | MIT |
| delaunator | 5.1.0 | ISC |
| dequal | 2.0.3 | MIT |
| detect-node-es | 1.1.0 | MIT |
| devlop | 1.1.0 | MIT |
| dexie | 4.4.6 | Apache-2.0 |
| dompurify | 3.4.16 | (MPL-2.0 OR Apache-2.0) |
| es-toolkit | 1.52.0 | MIT |
| es6-promise-pool | 2.5.0 | MIT |
| escape-string-regexp | 5.0.0 | MIT |
| extend | 3.0.2 | MIT |
| fake-indexeddb | 6.2.5 | Apache-2.0 |
| fast-equals | 5.4.5 | MIT |
| fast-png | 6.4.0 | MIT |
| fastdom | 1.0.12 | MIT |
| fflate | 0.8.3 | MIT |
| fill-range | 7.1.1 | MIT |
| fractional-indexing | 3.2.0 | CC0-1.0 |
| fuzzy | 0.1.3 | MIT |
| get-nonce | 1.0.1 | MIT |
| glob-parent | 5.1.2 | ISC |
| glur | 1.1.2 | MIT |
| hachure-fill | 0.5.2 | MIT |
| hast-util-sanitize | 5.0.2 | MIT |
| hast-util-to-html | 9.0.5 | MIT |
| hast-util-whitespace | 3.0.0 | MIT |
| html-parse-stringify | 4.0.1 | MIT |
| html-void-elements | 3.0.0 | MIT |
| i18next | 26.4.3 | MIT |
| iconv-lite | 0.6.3 | MIT |
| image-blob-reduce | 3.0.1 | MIT |
| immutable | 4.3.9 | MIT |
| import-meta-resolve | 4.2.0 | MIT |
| inherits | 2.0.4 | ISC |
| internmap | 1.0.1, 2.0.3 | ISC |
| iobuffer | 5.4.0 | MIT |
| is-binary-path | 2.1.0 | MIT |
| is-extglob | 2.1.1 | MIT |
| is-glob | 4.0.3 | MIT |
| is-number | 7.0.0 | MIT |
| is-plain-obj | 4.1.0 | MIT |
| isexe | 2.0.0 | ISC |
| jotai | 2.11.0 | MIT |
| jotai-scope | 0.7.2 | MIT |
| jspdf | 4.2.1 | MIT |
| katex | 0.16.47 | MIT |
| khroma | 2.1.0 | MIT |
| langium | 3.3.1 | MIT |
| layout-base | 1.0.2, 2.0.1 | MIT |
| linkifyjs | 4.3.3 | MIT |
| lodash-es | 4.18.1 | MIT |
| lodash.debounce | 4.0.8 | MIT |
| lodash.throttle | 4.1.1 | MIT |
| longest-streak | 3.1.0 | MIT |
| markdown-table | 3.0.4 | MIT |
| marked | 16.4.2 | MIT |
| mdast-util-definitions | 6.0.0 | MIT |
| mdast-util-find-and-replace | 3.0.3 | MIT |
| mdast-util-from-markdown | 2.1.0 | MIT |
| mdast-util-gfm | 3.1.0 | MIT |
| mdast-util-gfm-autolink-literal | 2.0.1 | MIT |
| mdast-util-gfm-footnote | 2.1.0 | MIT |
| mdast-util-gfm-strikethrough | 2.0.1 | MIT |
| mdast-util-gfm-table | 2.0.0 | MIT |
| mdast-util-gfm-task-list-item | 2.0.0 | MIT |
| mdast-util-phrasing | 4.1.0 | MIT |
| mdast-util-to-hast | 13.2.1 | MIT |
| mdast-util-to-markdown | 2.2.0 | MIT |
| mdast-util-to-string | 4.0.0 | MIT |
| mermaid | 11.17.2 | MIT |
| micromark | 4.0.3 | MIT |
| micromark-core-commonmark | 2.0.4 | MIT |
| micromark-extension-gfm | 3.0.0 | MIT |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT |
| micromark-extension-gfm-footnote | 2.1.0 | MIT |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT |
| micromark-extension-gfm-table | 2.1.2 | MIT |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT |
| micromark-factory-destination | 2.0.1 | MIT |
| micromark-factory-label | 2.0.1 | MIT |
| micromark-factory-space | 2.1.0 | MIT |
| micromark-factory-title | 2.0.1 | MIT |
| micromark-factory-whitespace | 2.0.1 | MIT |
| micromark-util-character | 2.1.1 | MIT |
| micromark-util-chunked | 2.0.1 | MIT |
| micromark-util-classify-character | 2.0.1 | MIT |
| micromark-util-combine-extensions | 2.0.1 | MIT |
| micromark-util-decode-numeric-character-reference | 2.0.2 | MIT |
| micromark-util-decode-string | 2.0.1 | MIT |
| micromark-util-edit-map | 1.0.0 | MIT |
| micromark-util-encode | 2.0.1 | MIT |
| micromark-util-html-tag-name | 2.0.1 | MIT |
| micromark-util-normalize-identifier | 2.0.1 | MIT |
| micromark-util-resolve-all | 2.0.1 | MIT |
| micromark-util-sanitize-uri | 2.0.1 | MIT |
| micromark-util-subtokenize | 2.1.0 | MIT |
| micromark-util-symbol | 2.0.1 | MIT |
| micromark-util-types | 2.0.3 | MIT |
| minisearch | 7.2.0 | MIT |
| ms | 2.1.3 | MIT |
| multimath | 2.0.0 | MIT |
| nanoid | 3.3.20, 4.0.2, 6.0.2 | MIT |
| normalize-path | 3.0.0 | MIT |
| object-assign | 4.1.1 | MIT |
| open-color | 1.9.1 | MIT |
| orderedmap | 2.1.1 | MIT |
| package-manager-detector | 1.9.0 | MIT |
| pako | 2.0.3, 2.2.0 | (MIT AND Zlib) |
| path-data-parser | 0.1.0 | MIT |
| path-key | 3.1.1 | MIT |
| perfect-freehand | 1.2.0 | MIT |
| pica | 7.1.1 | MIT |
| picomatch | 2.3.2 | MIT |
| png-chunk-text | 1.0.0 | MIT |
| png-chunks-encode | 1.0.0 | MIT |
| png-chunks-extract | 1.0.0 | MIT |
| points-on-curve | 0.2.0, 1.0.1 | MIT |
| points-on-path | 0.2.1 | MIT |
| property-information | 7.2.0 | MIT |
| prosemirror-changeset | 2.4.4 | MIT |
| prosemirror-commands | 1.7.2 | MIT |
| prosemirror-dropcursor | 1.8.4 | MIT |
| prosemirror-gapcursor | 1.4.1 | MIT |
| prosemirror-history | 1.5.1 | MIT |
| prosemirror-inputrules | 1.5.1 | MIT |
| prosemirror-keymap | 1.2.3 | MIT |
| prosemirror-model | 1.25.12 | MIT |
| prosemirror-safari-ime-span | 1.0.2 | MIT |
| prosemirror-schema-list | 1.5.1 | MIT |
| prosemirror-state | 1.4.4 | MIT |
| prosemirror-tables | 1.8.5 | MIT |
| prosemirror-transform | 1.12.2 | MIT |
| prosemirror-view | 1.42.6 | MIT |
| pwacompat | 2.0.17 | Apache-2.0 |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| react-i18next | 17.0.16 | MIT |
| react-remove-scroll | 2.7.2 | MIT |
| react-remove-scroll-bar | 2.3.8 | MIT |
| react-style-singleton | 2.2.3 | MIT |
| readdirp | 3.6.0 | MIT |
| rehype-sanitize | 6.0.0 | MIT |
| rehype-stringify | 10.0.1 | MIT |
| remark | 15.0.1 | MIT |
| remark-gfm | 4.0.1 | MIT |
| remark-inline-links | 7.0.0 | MIT |
| remark-parse | 11.0.0 | MIT |
| remark-rehype | 11.1.2 | MIT |
| remark-stringify | 11.0.0 | MIT |
| robust-predicates | 3.0.3 | Unlicense |
| rope-sequence | 1.3.4 | MIT |
| roughjs | 4.6.4, 4.6.6 | MIT |
| rw | 1.3.3 | BSD-3-Clause |
| safer-buffer | 2.1.2 | MIT |
| sass | 1.51.0 | MIT |
| scheduler | 0.28.0 | MIT |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| sliced | 1.0.1 | MIT |
| source-map-js | 1.2.2 | BSD-3-Clause |
| space-separated-tokens | 2.0.2 | MIT |
| strictdom | 1.0.1 | MIT |
| stringify-entities | 4.0.4 | MIT |
| style-mod | 4.1.4 | MIT |
| stylis | 4.4.0 | MIT |
| tinyexec | 1.3.1 | MIT |
| to-regex-range | 5.0.1 | MIT |
| trim-lines | 3.0.1 | MIT |
| trough | 2.2.0 | MIT |
| ts-dedent | 2.3.0 | MIT |
| tslib | 2.8.1 | 0BSD |
| tunnel-rat | 0.1.2 | MIT |
| unified | 11.0.5 | MIT |
| unist-util-is | 6.0.1 | MIT |
| unist-util-position | 5.0.0 | MIT |
| unist-util-stringify-position | 4.0.0 | MIT |
| unist-util-visit | 5.1.0 | MIT |
| unist-util-visit-parents | 6.0.2 | MIT |
| use-callback-ref | 1.3.3 | MIT |
| use-sidecar | 1.1.3 | MIT |
| use-sync-external-store | 1.7.0 | MIT |
| uuid | 14.0.3 | MIT |
| vfile | 6.0.3 | MIT |
| vfile-message | 4.0.3 | MIT |
| vscode-jsonrpc | 8.2.0 | MIT |
| vscode-languageserver | 9.0.1 | MIT |
| vscode-languageserver-protocol | 3.17.5 | MIT |
| vscode-languageserver-textdocument | 1.0.15 | MIT |
| vscode-languageserver-types | 3.17.5 | MIT |
| vscode-uri | 3.0.8 | MIT |
| w3c-keyname | 2.2.8 | MIT |
| webworkify | 1.5.0 | MIT |
| which | 2.0.2 | ISC |
| zod | 4.6.6 | MIT |
| zustand | 4.5.7, 5.0.15 | MIT |
| zwitch | 2.0.4 | MIT |
