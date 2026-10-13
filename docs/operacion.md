# Operación: despliegue, copias y recuperación

Para el propietario que publica y mantiene su instancia. Cómo se usa la aplicación está en [guia-de-uso.md](guia-de-uso.md).

_English version: [operations.md](operations.md)._

## 1. Despliegue

La aplicación es estática: no hay servidor de aplicación ni base de datos remota (diseño §1).

**Compilar.** `pnpm install` y después `pnpm build`. El resultado queda en `dist/`. `pnpm build` también:

- copia las fuentes del motor (sin Liberation Sans);
- genera `LICENSE.txt` y `THIRD-PARTY-NOTICES.txt`, que deben publicarse con la aplicación.

**Configuración pública.** `.env` (versionado) lleva `VITE_GOOGLE_CLIENT_ID`. Es público por diseño. El secreto del cliente OAuth no se usa en ninguna parte.

**Alojamiento actual:** Cloudflare Worker con assets estáticos.

- `wrangler.jsonc` publica `dist/` con respuesta de aplicación de una página para rutas desconocidas.
- El origen es https://aline.projeck.workers.dev. Tiene que coincidir con los «Orígenes autorizados de JavaScript» del cliente OAuth en Google Cloud.
- Cloudflare añade las cabeceras `Report-To` y `NEL`; conviene revisarlas frente a RNF-05.

**Cabeceras.** `public/_headers` lleva:

- la CSP, todavía en modo informe;
- `nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy`.

Si la consola del navegador no muestra avisos «[Report Only]» al usar Drive, cambia `Content-Security-Policy-Report-Only` por `Content-Security-Policy`.

**Antes de publicar,** ejecuta `pnpm verify` y `pnpm test:e2e`.

**Actualizaciones.** Los navegadores que ya tienen la aplicación ven «Hay una nueva versión disponible». Al pulsar «Actualizar», la aplicación guarda lo pendiente antes de cambiar de versión; nunca se actualiza en mitad de una escritura.

## 2. Copias de seguridad

El almacén vive en el navegador de cada equipo. El navegador puede borrarlo: al limpiar los datos del sitio o, en el iPad, por falta de espacio. **Las copias son responsabilidad del propietario.**

| Qué | Cómo | Frecuencia recomendada |
| --- | --- | --- |
| Copia completa (ZIP) | Estado y diagnóstico → «Descargar copia completa» | Semanal y antes de cambios grandes |
| Carpeta o Google Drive | «Dónde se guarda» | Continua mientras la aplicación está abierta |
| Markdown | Biblioteca → «Importar y exportar» → «Exportar todas las notas en Markdown» | Opcional, para leer las notas con cualquier editor |

- **La copia ZIP es la única que guarda todo:** historial, papelera, controles, carpetas, etiquetas y adjuntos. Su manifiesto verifica cada archivo por SHA-256.
- **Guárdala fuera del equipo,** en otro disco o en otro servicio.
- **Drive cifrado:** guarda también el código de recuperación, fuera de Google y fuera del equipo. Sin la contraseña ni el código, la copia de Drive no se puede leer. La copia ZIP local no está cifrada y no depende de ellos.

## 3. Recuperación

| Situación | Qué hacer |
| --- | --- |
| Se borraron los datos del navegador | Abrir la aplicación → Estado y diagnóstico → restaurar la última copia ZIP; o, desde otro equipo o un almacén nuevo, conectar la carpeta o Drive y elegir «Abrir ese almacén aquí» |
| Una copia ZIP no supera la verificación | No se restaura nada; probar con otra copia. La aplicación indica qué archivo falla |
| El navegador no puede abrir IndexedDB | La aplicación ofrece un almacén temporal (solo en memoria) para no perder lo que se escriba; exportarlo antes de cerrar |
| Falla el guardado local (espacio, error) | Aparece «Sin espacio» o «Error al guardar» y se ofrece la exportación de emergencia; liberar espacio y volver a intentar |
| Contraseña de Drive olvidada | Desbloquear con el código de recuperación y después cambiar la contraseña en «Cifrado y contraseña» |
| Contraseña y código perdidos | La copia cifrada de Drive no se puede recuperar. Si un equipo aún tiene el almacén abierto, quitar el cifrado o crear una copia ZIP desde ese equipo |
| Conflicto entre equipos | Panel de conflicto: elegir una versión, combinarlas o guardarlas como documentos separados. Ninguna se pierde hasta resolverlo |
| Un documento se abre «en solo lectura» | Lo guardó una versión más nueva del formato, o su contenido es inválido. No se modifica; actualizar la aplicación o consultar el diagnóstico |
| Documento eliminado por error | Papelera → «Restaurar». Si se eliminó definitivamente, restaurar una copia ZIP anterior en un almacén nuevo y exportar el documento |

**Leer los datos sin la aplicación.** El formato abierto está especificado en [formato-almacen.md](formato-almacen.md):

- las notas son Markdown;
- los lienzos son `.excalidraw`;
- las versiones son JSON verificables por SHA-256;
- un almacén cifrado en Drive se descifra siguiendo el §7 de ese documento.

## 4. Diagnóstico

Estado y diagnóstico muestra:

- el uso de almacenamiento y si el navegador lo marcó como persistente;
- el estado de la sincronización;
- un registro local de errores, rotado por tamaño, que nunca guarda el texto de las notas ni tokens.

«Exportar diagnóstico» descarga ese registro para analizarlo.
