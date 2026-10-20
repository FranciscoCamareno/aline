# Avisos de terceros · Third-party notices

aline está construido sobre motores y librerías de código abierto de terceros. **No son código
propio**: conservan su propia licencia y sus avisos de copyright, que la AGPLv3 del proyecto no
sustituye. Todas son licencias permisivas compatibles con la AGPLv3.
· aline is built on third-party open-source engines and libraries. **They are not our code**: they
keep their own licenses and copyright notices, which the project's AGPLv3 does not replace. All of
them are permissive licenses compatible with the AGPLv3.

- **Textos completos** de cada licencia y aviso de copyright (también los de dependencias
  indirectas y fuentes): se generan con `pnpm assets` en `public/THIRD-PARTY-NOTICES.txt`, se
  distribuyen con la aplicación compilada y se enlazan desde «Estado y diagnóstico → Licencias».
- **Inventario completo** (unos 450 paquetes) y verificación de las fuentes:
  [docs/licencias.md](docs/licencias.md), generado por `pnpm licenses`; `pnpm licenses:check`
  falla ante una licencia no admitida.
- Textos que los paquetes npm no incluyen: [licenses/](licenses/).

Los paquetes no se versionan en este repositorio (`node_modules/` y `public/fonts*` están en
`.gitignore`); solo se incluyen en `dist/`.

## Motores y librerías directas · Direct engines and libraries

| Componente                                | Paquetes                                                                                                                                             | Licencia                             | Copyright                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| Excalidraw (motor del lienzo)             | `@excalidraw/excalidraw`                                                                                                                             | MIT                                  | © 2020 Excalidraw                               |
| Milkdown (documentos Markdown)            | `@milkdown/core`, `ctx`, `prose`, `transformer`, `utils`, `preset-commonmark`, `preset-gfm`, `plugin-clipboard`, `plugin-history`, `plugin-listener` | MIT                                  | © 2020-present Mirone                           |
| Tiptap (documentos con formato)           | `@tiptap/core`, `pm`, `react`, `starter-kit`, `extensions`, `extension-image`, `extension-text-align`, `extension-text-style`, `extension-table`     | MIT                                  | © 2025 Tiptap GmbH                              |
| ProseMirror (base de Milkdown y Tiptap)   | `prosemirror-*` (indirectas)                                                                                                                         | MIT                                  | © 2015–2017 Marijn Haverbeke and others         |
| CodeMirror (editor de notas)              | `codemirror`, `@codemirror/autocomplete`, `lang-markdown`, `language`, `state`, `view`, `@lezer/highlight`                                           | MIT                                  | © 2018–2021 Marijn Haverbeke and others         |
| unified / remark / rehype (Markdown)      | `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify`                                                      | MIT                                  | © 2015 Titus Wormer                             |
| React                                     | `react`, `react-dom`                                                                                                                                 | MIT                                  | © Meta Platforms, Inc. and affiliates           |
| Dexie (IndexedDB)                         | `dexie`                                                                                                                                              | Apache-2.0                           | © David Fahlander                               |
| fake-indexeddb (almacén temporal)         | `fake-indexeddb`                                                                                                                                     | Apache-2.0                           | © Jeremy Scheff                                 |
| MiniSearch (búsqueda)                     | `minisearch`                                                                                                                                         | MIT                                  | © 2022 Luca Ongaro                              |
| i18next (traducciones)                    | `i18next`, `react-i18next`                                                                                                                           | MIT                                  | © 2011-present i18next                          |
| zod (validación)                          | `zod`                                                                                                                                                | MIT                                  | © 2025 Colin McDonnell                          |
| zustand (estado de la interfaz)           | `zustand`                                                                                                                                            | MIT                                  | © 2019 Paul Henschel                            |
| fflate (ZIP)                              | `fflate`                                                                                                                                             | MIT                                  | © Arjun Barrett                                 |
| jsPDF (exportar PDF)                      | `jspdf`                                                                                                                                              | MIT                                  | © 2010–2025 James Hall; 2015–2025 yWorks GmbH   |
| docx (exportar Word)                      | `docx`                                                                                                                                               | MIT                                  | © 2016 Dolan Miu                                |
| Workbox (Service Worker, solo en `dist/`) | `workbox-*` (desarrollo, incluido en la compilación)                                                                                                 | MIT                                  | © 2018 Google LLC                               |
| Fuentes del lienzo                        | Virgil, Excalifont, Assistant, Cascadia Code, Nunito, Lilita One, Xiaolai SC, Comic Shanns (con `@excalidraw/excalidraw`)                            | OFL-1.1, MIT                         | Sus autores (aviso leído de cada archivo WOFF2) |
| Fuentes adicionales                       | `@fontsource/*` (24 familias de Google Fonts)                                                                                                        | OFL-1.1; Permanent Marker Apache-2.0 | Sus autores                                     |

Los años y titulares exactos son los de cada archivo de licencia, reproducidos íntegros en
`THIRD-PARTY-NOTICES.txt`; si difieren de esta tabla, prevalece ese archivo.

## Código de terceros modificado en este repositorio

- [`patches/@excalidraw__excalidraw@0.18.1.patch`](patches/): modifica el código de Excalidraw
  (MIT) para registrar las fuentes adicionales. Al ser una modificación de código MIT, el parche se
  ofrece bajo la **licencia MIT** de Excalidraw ([licenses/excalidraw.LICENSE.txt](licenses/excalidraw.LICENSE.txt)).
- [`licenses/`](licenses/): textos oficiales de licencias de terceros, reproducidos sin cambios.

## Marcas de terceros

Google y el logotipo «G» (`brand/third-party/google-g.svg`) son marcas de Google LLC; se usan solo
para identificar el servicio Google Drive, según sus normas de marca.
