# Matriz de pruebas manuales en el iPad (criterio de salida de la beta)

Las pruebas automáticas usan Chromium y Edge en Windows, más una emulación táctil de Chromium, que no es un iPad. La beta exige completar esta matriz en el iPad real, con Safari y con la PWA instalada (plan, fase 5).

**Cómo completarla:**

- Marca cada fila con ✅ (bien), ❌ (falla) o — (no aplica).
- Anota la fecha y la versión: el número de compilación de «Estado y diagnóstico».
- Si algo falla, descarga el diagnóstico desde «Estado y diagnóstico» y adjúntalo.

**Equipo:** iPad A16, Apple Pencil USB-C, iPadOS ____. **Fecha:** ____. **Versión:** ____.

| # | Prueba | Safari | PWA instalada |
| --- | --- | --- | --- |
| 1 | Instalar: Compartir → «Añadir a pantalla de inicio»; abre a pantalla completa con el icono | — | |
| 2 | Primera apertura sin conexión (modo avión) tras haberla abierto una vez | | |
| 3 | Dibujar con el Apple Pencil: el modo lápiz se activa y la palma apoyada no dibuja (20 frases con la palma apoyada) | | |
| 4 | Dos dedos: desplazar y hacer zoom en el lienzo sin crear trazos | | |
| 5 | Sesión de 10 minutos dibujando; cerrar la app a la fuerza y reabrir: no falta ningún trazo terminado | | |
| 6 | Girar a vertical y a horizontal con un lienzo y con una nota abiertos | | |
| 7 | Biblioteca en vertical: se superpone; se cierra al abrir un documento, al tocar fuera y al deslizarla a la izquierda | | |
| 8 | Botones fáciles de pulsar con el dedo (barra superior, biblioteca, diálogos) | | |
| 9 | Escribir una nota con el teclado en pantalla: la página no se amplía al enfocar y el teclado no tapa lo que se escribe | | |
| 10 | Autocompletar `[[` en una nota y abrir el enlace | | |
| 11 | Buscar (lupa) y abrir un resultado de lienzo: resalta el elemento | | |
| 12 | Exportar PNG, SVG y PDF de un lienzo; abrir cada archivo en la app Archivos | | |
| 13 | Exportar un lienzo grande a escala 3×: si no cabe, el aviso propone una escala menor | | |
| 14 | Importar un `.excalidraw` y un `.md` desde la app Archivos | | |
| 15 | Copia completa (ZIP) y restaurarla en un almacén nuevo; anotar el tamaño de la copia: ____ MB | | |
| 16 | Conectar Google Drive sin cifrar; sincronizar con el PC en ambos sentidos | | |
| 17 | Conectar Google Drive cifrado; anotar cuánto tarda en desbloquear con la contraseña: ____ s | | |
| 18 | Tras cerrar la PWA y volver a abrirla: «Autorizar de nuevo» funciona y no vuelve a pedir la contraseña del cifrado | | |
| 19 | Editar la misma nota sin conexión en el iPad y en el PC; al reconectar aparece el conflicto con las dos versiones | | |
| 20 | «Estado y diagnóstico»: el almacenamiento aparece como persistente (PWA) | | |

**Notas y fallos:**

-
