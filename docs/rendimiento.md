# Rendimiento medido (plan 5.6)

Mediciones reales, con el equipo en el que se tomaron. No sustituyen las del iPad, que están pendientes en [pruebas-ipad.md](pruebas-ipad.md).

## Equipo y método

- **Equipo:** portátil con Intel Core i5-1155G7 (4 núcleos / 8 hilos, 2,5 GHz), 12 GB de RAM, Intel Iris Xe.
- **Sistema y versiones:** Windows 11 Home, Node 24.21 y Chromium de Playwright 1.64.0, con la compilación de producción (`pnpm build && pnpm preview`).
- **Ejecución:** cada medición se lanzó sola, sin otras pruebas en paralelo. Con varios navegadores a la vez los tiempos suben mucho; ver la nota del final.
- **Comandos:**
  - `pnpm test:rendimiento` (`tests/e2e/rendimiento.spec.ts`) para CA-12 y CA-31;
  - la prueba «volumen de referencia» de `tests/e2e/fase3.spec.ts` para RNF-10.
- **Cómo se mide:**
  - **Abrir:** desde el clic en la biblioteca hasta que el motor pinta la escena en su lienzo.
  - **Arrastre:** intervalo entre fotogramas mientras se arrastra un elemento con el ratón durante 60 movimientos.
  - **Datos:** los lienzos se crean con la importación real de `.excalidraw`. Las 100 versiones son 99 arrastres guardados de verdad.

## Resultados (13/10/2026)

| Criterio | Objetivo | Medido | Estado |
| --- | --- | --- | --- |
| CA-12 / RNF-02: abrir un lienzo de 1 000 elementos | < 2 s | 166 ms y 114 ms (dos aperturas) | Cumple en este PC |
| CA-12 / RNF-01: arrastrar con 1 000 elementos | < 100 ms | p95 17 ms entre fotogramas, máximo 33 ms | Cumple en este PC |
| CA-31 / RNF-17: abrir un lienzo con 100 versiones | < 2 s | 62 ms y 67 ms | Cumple en este PC |
| RNF-10: búsqueda con 2 000 notas y 500 lienzos | < 1 s | 1,5–7,1 ms por consulta en el worker; índice listo en 3,7 s | Cumple en este PC |
| Lienzo visible con 2 500 documentos en el almacén | — | 3,2 s | Sin objetivo propio: la biblioteca no está virtualizada |

## Límites conocidos

- **Carga de la máquina.** Con Chromium y Edge ejecutando toda la batería a la vez, el lienzo con 2 500 documentos tardó entre 10 y 14 s en Chromium y entre 2,2 y 2,9 s en Edge. Es contención de la máquina, no un resultado de rendimiento. Aun así, apunta a virtualizar la biblioteca si el almacén crece mucho.
- **iPad.** Nada de esta tabla está medido en el iPad (A16, Safari). Ahí la memoria y la CPU son menores, y el límite de lienzo de Safari (16,7 millones de píxeles) condiciona las exportaciones rasterizadas.
- **PBKDF2.** Desbloquear un almacén cifrado aplica 600 000 iteraciones de PBKDF2. En este PC es inmediato a efectos prácticos; en el iPad no se ha medido.
