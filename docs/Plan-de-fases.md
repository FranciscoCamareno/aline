# Plan de fases: del núcleo local a la versión beta

Versión 1.8 | 12 de octubre de 2026 | Base: [Documento de Requerimientos](Documento%20de%20Requerimientos%20Sistema%20personal%20de%20mapas%20mentales%20y%20notas%20conectadas.md) y [Diseño técnico](Diseno-tecnico-sistema.md)

Este plan parte de lo que ya está construido y llega hasta una **beta utilizable** y después a la **versión 1.0**. Conserva la numeración de fases del diseño técnico (§17) para no crear dos mapas distintos. No incluye fechas: el diseño exige no darlas sin conocer la dedicación disponible (D-09). Los tamaños S, M y L indican complejidad relativa, no tiempo.

## 1. Punto de partida

La primera entrega cubre la mayor parte de la fase 1 y una parte de las fases 2 y 3. Está verificada con `pnpm verify` y 7 recorridos en Chromium (ver README).

| Ya existe | Requisitos cubiertos total o parcialmente |
| --- | --- |
| PWA React + TypeScript estricto + Vite, precache y funcionamiento sin red | RNF-03 (parcial), RNF-07 (parcial) |
| Lienzo Excalidraw con guardado automático | RF-01, 02, 07, 08, 29; RF-03, 05, 09, 10, 11 nativos sin verificar |
| Notas Markdown con frontmatter y vista previa saneada | RF-17, RF-30 (parcial), RN-11 |
| Crear, abrir y renombrar con UUID estable | RN-01, RN-02, RF-23 (por diseño) |
| Revisiones inmutables y transacción revisión + blobs + outbox | RF-29, RN-04 (local), base de RF-31 y RF-37 |
| Detección de conflicto entre pestañas, sin interfaz para resolverlo | RF-37 (parcial) |
| Contratos de Drive, sincronización y carpeta | — |
| Español e inglés | RNF-11 (parcial) |

**Lo que falta en la base** y condiciona varias fases:

1. **La fase 0 está ejecutada** ([informe](fase-0-viabilidad.md)): se avanza con Excalidraw. El propietario confirma que el Apple Pencil funciona en el iPad; faltan los datos detallados del protocolo (palma, presión, rendimiento).
2. **No existe el serializador del formato abierto** (`vault/` del diseño §6). IndexedDB guarda los bytes, pero nada los escribe como `revisions/`, `objects/`, `readable/` y `catalog.json`. La copia ZIP, la carpeta local y Drive dependen de esta pieza.
3. **Hay un solo almacén por navegador**: el nombre de la base IndexedDB es fijo. Restaurar una copia «en un almacén nuevo, nunca encima del activo» (§12.2) y FA-01b exigen poder tener varios.
4. ~~Al abrir se muestra el documento modificado más recientemente~~: resuelto en la fase 1 (se abre el último abierto).

## 2. Hitos

| Hito | Se alcanza al cerrar | Qué permite |
| --- | --- | --- |
| **Alfa local** | Fases 0, 1, 2 y 3 | Uso diario en el PC con almacenamiento del navegador y copias ZIP manuales. Sirve para probar el producto con contenido real antes de la sincronización |
| **Beta utilizable** | Fases 4 y 5 | Los 22 RF «Debe» y las reglas obligatorias cumplidos en Windows; dos PC y el iPad sincronizados por Drive; exportación e importación |
| **Versión 0.2.0** | Fase 9 | Drive cerrado, `[[` en todos los editores, tablas, eventos repetidos, punteros propios, barra lateral compacta y el núcleo de mapa mental |
| **Versión 1.0** | Fase 6 | Los «Debería»: ramas colapsables, tarjetas de notas, galería, poda de versiones y lápiz completo |

**Definición de beta utilizable.** El propietario puede usar el sistema como herramienta principal en el PC y como secundaria en el iPad sin riesgo conocido de pérdida de datos:

- pasan todos los CA asociados a los 22 RF «Debe» y a las reglas RN-01 a RN-13 aplicables;
- no hay errores abiertos de pérdida o corrupción de datos;
- se han completado dos semanas de uso real con copias de seguridad.

## 3. Fases

### Fase 0 — Viabilidad del motor (ejecutada en el PC; iPad pendiente)

**Estado (12/10/2026):** ver [fase-0-viabilidad.md](fase-0-viabilidad.md).

- Pasan en Chromium 0.1, 0.2, 0.3, 0.5, 0.6b y 0.7.
- 0.6 falla con la estrategia ingenua y pasa con la alternativa (ocultos en la escena con opacidad 0 y bloqueados).
- 0.4 solo es indicativa hasta probarla en el iPad.
- **Decisión: se avanza con Excalidraw.**

**Objetivo:** confirmar que Excalidraw 0.18.1 permite implementar las funciones propias sin forzar el motor (R-19, D-14). Se puede hacer en paralelo con el cierre de la fase 1.

| # | Prueba | Qué decide | Tamaño |
| --- | --- | --- | --- |
| 0.1 | Escena sintética de 1 000 elementos (`convertToExcalidrawElements`): medir apertura y arrastre (p95) en el PC y el iPad | RNF-01, RNF-02, CA-12 | S |
| 0.2 | Enlace interno: guardar `mindnote://document/<id>` en `element.link`, comprobar que el motor no lo descarta al sanear URLs e interceptarlo con `onLinkOpen` | RF-20. Si el motor bloquea el esquema, se guarda el enlace solo en el sidecar con una marca en `customData` | S |
| 0.3 | `customData` y sidecar sobreviven a guardar, reabrir, copiar, pegar y deshacer | §9, RF-45 | S |
| 0.4 | Trazo con Apple Pencil USB-C en Safari y en la PWA instalada: modo lápiz del motor (`penMode`), palma apoyada (20 frases), sesión de 10 minutos, cambio de orientación y reapertura | RF-47, RF-48, CA-25, CA-26 | M |
| 0.5 | Borrar un nodo con flechas unidas: el conector debe seguir existiendo y quedar suelto | RN-07 | S |
| 0.6 | Proyección de rama colapsada: ocultar descendientes sin borrarlos (`updateScene` con `CaptureUpdateAction.NEVER`), editar y expandir; luego 100 deshacer y rehacer | RF-15, RF-04, CA-05, CA-22 | M |
| 0.7 | Exportar a PNG y SVG exactamente la proyección visible | RF-33, §9.3 | S |

**Entregable:** `docs/fase-0-viabilidad.md`, con medidas, versiones de navegador y hardware, capturas, y una decisión sí o no para cada punto.

**Se avanza cuando** 0.2, 0.3 y 0.5 pasan. Si 0.4 o 0.6 fallan, se bloquean RF-47 y RF-15 en la fase 6, pero no la beta. Si falla 0.2 o 0.5 sin solución por la API pública, hay que registrar un cambio de arquitectura y evaluar React Flow con perfect-freehand, como indica el Anexo A.

**Necesita del propietario:** el iPad. Para probar el lápiz basta `vite --host` en la red local. La instalación como PWA y `storage.persist` en Safari exigen HTTPS: un certificado local (mkcert) o el alojamiento de la fase 4.

### Fase 1 — Cierre de la base (completada el 12/10/2026)

**Estado:** completada. Las tareas 1.2 a 1.9 están implementadas y probadas (38 pruebas unitarias y 12 recorridos E2E; ver README, «Verificación»).

**1.1:** repositorio publicado en https://github.com/FranciscoCamareno/aline (rama `main`, licencia MIT; desde el 17/10/2026, GNU AGPLv3). El CI se ejecuta en cada envío.

**Lo que queda fuera de la fase:**

- **«Abrir otro almacén» (FA-01b)** llega con varios almacenes (2.2).
- **Licencias de las fuentes del lienzo:** comprobadas (ver [licencias.md](licencias.md)). Liberation Sans 1.05 (GPLv2 con excepción) no se distribuye.
- **Exportación de emergencia:** es un JSON provisional, hasta la copia ZIP (2.3).

| # | Tarea | Requisitos | Tamaño |
| --- | --- | --- | --- |
| 1.1 | Primer commit, repositorio remoto e integración continua (`verify` + `test:e2e`) con instalación congelada | §3, §14.1 | S |
| 1.2 | Documento del formato v1 (`docs/formato-almacen.md`) y JSON Schema de `vault.json`, revisión, sidecar y manifiesto de copia | RNF-09, RF-30 | M |
| 1.3 | Validar al leer: una versión de esquema desconocida abre en solo lectura con aviso y nunca descarta contenido | §5, §14.4 | S |
| 1.4 | Registro local de diagnóstico con rotación por tamaño, visor y exportación manual, sin contenido ni tokens | RNF-13 | S |
| 1.5 | Estado del almacenamiento: persistencia concedida, uso y cuota, aviso de cuota alta, exportación de emergencia | §7.1, R-13 | S |
| 1.6 | Abrir el último documento abierto; almacén inaccesible: avisar y ofrecer otro almacén o uno temporal | FP-01, FA-01b | S |
| 1.7 | Actualización del Service Worker: guardar lo pendiente y pausar trabajadores antes de activar | §14.4 | S |
| 1.8 | Hash SHA-256 en un worker | §4, §7.1 | S |
| 1.9 | Inventario de licencias (dependencias, fuentes, iconos) | RNF-12 | S |

**Se avanza cuando** la app abre sin cuenta, funciona sin red tras instalarse y el formato está documentado. Las dos primeras condiciones ya están verificadas.

### Fase 2 — Datos: formato abierto, copias, papelera, historial y conflictos (completada el 12/10/2026)

**Estado:** completada. Las tareas 2.1 a 2.7 están implementadas y probadas: 60 pruebas unitarias y 19 recorridos E2E (ver README, «Verificación»).

**Decisiones tomadas durante la fase:**

- **ZIP:** la raíz del archivo es el propio directorio del almacén (`vault.json` en la raíz).
- **Restauración:** conserva el identificador del almacén y crea un dispositivo nuevo. No genera salida pendiente hacia Drive.
- **Combinar a mano:** solo para notas. En lienzos se conserva una versión o ambas, duplicando.
- **Robustez:** la prueba de cierre abrupto (CA-10) se hace en Chromium bloqueando los eventos de salida. Un corte eléctrico o la caída del navegador completo no se han probado.

**Queda fuera de la fase:**

- poda selectiva de versiones (RF-46, prevista en 6.6);
- tamaño máximo de copia en el iPad (§12.2), sin medir.

| # | Tarea | Requisitos y CA | Tamaño |
| --- | --- | --- | --- |
| 2.1 | **Serializador del formato abierto**: de revisiones a `vault/` (objects, revisions, readable, catalog, README) y lector con validación de hashes. Es la pieza común de ZIP, carpeta y Drive | RF-30, RN-05, §6 | M |
| 2.2 | **Varios almacenes**: una base IndexedDB por `vaultId`, registro de almacenes y selector | §12.2, FA-01b | M |
| 2.3 | **Copia completa ZIP** con fflate en un worker, `backup-manifest.json` con SHA-256; restauración validada (rutas, límites de descompresión) en un almacén nuevo, con comparación de inventario | RF-32, CA-16 | M |
| 2.4 | **Papelera**: `TrashDocument` / `RestoreDocument` como revisiones `delete` / `restore`, vista de papelera y borrado definitivo explícito | RN-03, CA-15 | S |
| 2.5 | **Historial**: lista desde `historyIndex` sin cargar cuerpos, vista previa y restauración | RF-31, FP-06, CA-23, CA-31 | M |
| 2.6 | **Resolución de conflictos**: ver ambas cabezas, conservar una, duplicar o combinar a mano (diff de texto en notas); implementar `VaultRepository.resolve` con `parentIds` = ambas cabezas | RF-37, RN-04, CA-14 | M |
| 2.7 | **Robustez**: borrador periódico del trazo en curso; aviso entre pestañas (BroadcastChannel) cuando cambian las cabezas; pruebas con fallos inyectados en cada etapa del commit; cierre forzado del navegador en mitad de una edición; cuota agotada | RNF-04, CA-10, §16.2 | M |

**Se avanza cuando** pasan CA-10, CA-14 (entre pestañas), CA-15, CA-16, CA-23 y CA-31, y ningún fallo inyectado produce una pérdida silenciosa.

### Fase 3 — Núcleo de ideas (completada el 12/10/2026) → hito alfa local

**Estado:** completada.

- Las tareas 3.1 a 3.8 están implementadas y probadas.
- 3.9 queda en su forma básica: paneles laterales para detalles, historial y conflictos, superpuestos en pantallas estrechas.
- Los criterios de salida pasan en Chromium y en Microsoft Edge (29 recorridos en cada uno):
  - CA-01 (2,9 s), CA-02, CA-03, CA-06, CA-07, CA-08, CA-09, CA-21 y CA-24;
  - CA-T01 y CA-T02;
  - CA-11 (recorrido sin conexión) y CA-20 (formato que se conserva);
  - CA-17, con las copias legibles de la copia ZIP, en pruebas unitarias;
  - CA-22, con 100 deshacer en la fase 0.
- La búsqueda con 2 000 notas y 500 lienzos sintéticos responde en 3–12 ms en el worker del navegador (RNF-10).

**Decisiones de la fase:**

- **Atajo de búsqueda:** Ctrl+Mayús+F. Ctrl+K ya lo usa Excalidraw para editar enlaces.
- **Resolución de `[[Título]]`:** se hace al consultar con los títulos vigentes, así que renombrar nunca deja el índice desfasado.
- **Carpetas:** son documentos de tipo `folder` en el catálogo, como prevé el diseño (§5).
- **Índice de búsqueda:** `searchDocuments` pasa a la versión 2 de la base, con un índice por revisión. Es una tabla derivada; el formato no cambia.
- **Rendimiento:** con 2 500 documentos el lienzo tardaba 8–10 s en aparecer. Ahora el worker de búsqueda lee directamente de IndexedDB y el indexado empieza cuando la interfaz está libre: tarda 2,8 s.

**Pendiente de la fase:**

- Indexar todas las cabezas de un documento en conflicto con una marca visible (hoy se indexa la más reciente).
- Virtualizar la biblioteca para volúmenes grandes.
- Mostrar como enlaces los `[[Título]]` escritos a mano en la vista previa.
- Repetir CA-01 y la búsqueda en el iPad.


| # | Tarea | Requisitos y CA | Tamaño |
| --- | --- | --- | --- |
| 3.1 | Verificar con pruebas propias las capacidades nativas del motor: formas, transformaciones, desplazamiento y zoom sin crear versiones, anclaje, etiquetas en flechas, 100 deshacer, imagen pegada | RF-01 a RF-13, CA-T01, CA-T02, CA-02, CA-03, CA-22, CA-24 | S |
| 3.2 | Conectores sueltos: marcar y registrar en `danglingConnectorIds`. La fase 0 confirmó que el motor conserva la flecha y solo la desancla | RN-07, FA-02a | S |
| 3.3 | Carpetas (entidad `Folder` con revisiones, sin ciclos ni cascada, carpeta de recuperación) y etiquetas (editor y filtro); recientes | RF-25, RN-08, CA-21 | M |
| 3.4 | Índice de enlaces derivado del AST Markdown (remark) y del sidecar o escena; se reconstruye desde las revisiones activas | §10, RN-10 | M |
| 3.5 | Vincular un elemento a una nota, a un lienzo o a una web con buscador de destino; crear el destino en el momento. Usar `element.link` con `mindnote://` y `onLinkOpen` (fase 0, prueba 0.2); el sidecar indexa por id de elemento porque `customData` se copia al duplicar | RF-20, FP-03, FA-03a | M |
| 3.6 | Autocompletado `[[` en CodeMirror que inserta un enlace con UUID; resolución de `[[Título]]` importado solo si el destino es único | RF-21, CA-T03 | M |
| 3.7 | Panel de backlinks; lista de enlaces rotos (incluidos los destinos en la papelera) | RF-22, RF-24, CA-06, CA-07, CA-08 | S |
| 3.8 | Búsqueda: MiniSearch en un worker, documentos agregados con el texto de las formas, mapa de fragmento a elemento, paleta (Ctrl+K), centrar y resaltar el elemento, progreso del primer indexado | RF-26, CA-09 | L |
| 3.9 | Distribución de la interfaz del §4.1: panel derecho para nota, backlinks e historial; paneles deslizables en pantallas estrechas | §4.1, RNF-08 | M |

**Se avanza cuando** pasan en Windows (Chrome y Edge) CA-01, 02, 03, 06, 07, 08, 09, 11, 17, 20, 21 y 22, y la búsqueda tarda menos de 1 s con el volumen de referencia sintético (2 000 notas y 500 lienzos, RNF-10).

**→ Hito alfa local.**

### Fase 4 — Almacenamiento externo y sincronización (implementada el 13/10/2026; Drive real funcionando desde el 19/10/2026)

**Estado:**

- **Hechas y probadas:** 4.1, 4.2, 4.3, 4.6 y 4.7 contra la carpeta local, en Chromium y Edge y con las pruebas del protocolo.
- **Hechas y probadas contra una simulación de Google:** 4.4 y 4.5. Hay pruebas unitarias del protocolo y recorridos en Chromium y Edge con GIS falso y la Drive API simulada.
- **4.8:** CSP con los endpoints exactos de Google, todavía en modo informe.
- **Google real (19/10/2026):** el propietario confirmó que la conexión con Google Drive real funciona en el despliegue y publicó la pantalla de consentimiento OAuth (sale del modo **Pruebas**: puede entrar cualquier cuenta de Google; el alcance `drive.file` no es sensible).
- **Pendiente del propietario:** revisar la consola durante un recorrido completo y, si no hay violaciones de CSP, pasarla a obligatoria (paso 6 más abajo); probar con Google real el modo cifrado (pasos 4 y 5) y dos equipos sobre el mismo almacén.
- **Alojamiento:** listo en https://aline.projeck.workers.dev. Es un Cloudflare Worker con assets estáticos (`wrangler.jsonc`) y aplica `public/_headers`.

**Decisiones de esta parte:**

- **El motor no depende del destino.** La carpeta implementa `RemoteStore`, el mismo contrato que implementará Drive, así que el protocolo ya está probado entre «dispositivos».
- **Contrato `RemoteStore` concretado:**
  - `pull` devuelve identificadores y las revisiones se leen bajo demanda;
  - `getObject` devuelve también el tipo MIME;
  - hay índices y copias legibles.
- **Qué falta publicar se calcula comparando** las revisiones locales con las marcas de publicación por destino (tabla `remoteFiles`). La cola `outbox` se vacía al publicar.
- **Corrección durante las pruebas:** un equipo que borraba definitivamente un documento volvía a descargar sus versiones de la carpeta. Ahora las órdenes de retirada locales se publican al empezar el ciclo y nunca se descargan versiones retiradas.
- **Recarga automática.** Si el documento abierto cambia en otro sitio y no hay cambios sin guardar, se recarga solo; si los hay, aparece el aviso.
- **Sin lienzo inicial en almacenes de carpeta.** Un almacén abierto desde una carpeta no recibe el lienzo de bienvenida: su contenido llega de la carpeta.

**Decisiones de Drive (4.4, 4.5, 4.8):**

- **Búsqueda por propiedades.** Cada archivo lleva `appProperties` (`mindnote` = tipo, `vaultId`, `revisionId`/`hash`/`controlId`/`documentId`, `operationId`) y se busca por ellas, no por ruta. Si dos equipos crean a la vez una carpeta `revisions`, solo se duplica el contenedor.
- **Idempotencia.** Antes de crear un objeto, una revisión o un control se comprueba si ya existe con esas propiedades. Una respuesta perdida no duplica nada. Solo los índices (`heads/`, `catalog.json`) se actualizan en su sitio.
- **Cursor.** El cursor es el `startPageToken`, tomado antes de listar. En los ciclos siguientes, el feed de cambios dice si algo de este almacén cambió, sin contar los índices. Si no cambió nada, no se relista. Aun así se relista todo cada 10 minutos para reintentar las revisiones que quedaron a medias. Un cursor inválido provoca una reconciliación completa.
- **Dos pasos para la ventana de Google.** Aceptar el aviso RN-12 carga GIS. «Continuar con Google» abre la ventana desde su propio clic, para que Safari no la bloquee.
- **Token solo en memoria.** Al recargar, el estado es «Necesita autorización» y se renueva con un clic. La revocación se hace al desconectar. Desconectar o cambiar de cuenta no borra nada local; si la otra cuenta no ve la carpeta, el estado es «no disponible».
- **CSP.** Orígenes `accounts.google.com/gsi/`, `www.googleapis.com` y `oauth2.googleapis.com`. `Referrer-Policy` pasa de `no-referrer` a `strict-origin-when-cross-origin`, porque GIS comprueba el origen; a otros sitios solo se envía el origen, nunca rutas.
- **ID de cliente en `.env` (versionado).** Es público por diseño. El secreto del cliente no se usa en ninguna parte.

**Cifrado opcional en Drive (cambio de arquitectura del 13/10/2026; DP-07 revisada, diseño §13.1, formato §7):**

- **Implementado:**
  - elección del modo al conectar (sin cifrar con el aviso RN-12, o cifrado con contraseña y código de recuperación);
  - desbloqueo en cada equipo;
  - cambio de contraseña y de código;
  - cambio de modo desde «Cifrado y contraseña», con carpeta nueva, traslado automático de los demás equipos y papelera opcional para la anterior.
- **Probado:** pruebas unitarias del protocolo cifrado y un recorrido e2e completo contra la simulación de Google, en Chromium y Edge.
- **Pendiente:**
  - prueba del modo cifrado con Google real (la conexión sin cifrar ya funciona, 19/10/2026);
  - medir PBKDF2 en el iPad;
  - comprobar que Safari conserva la clave no extraíble.

**Prueba con Google real (propietario):**

1. Publicar una compilación nueva (el despliegue de Cloudflare debe compilar con el `.env` del repositorio).
2. En https://aline.projeck.workers.dev → Estado y diagnóstico → «Conectar Google Drive…». Elegir un modo (probar los dos, uno en cada almacén de prueba), aceptar y pulsar «Continuar con Google». Elegir la cuenta de prueba y conceder el acceso.
3. Comprobar en drive.google.com:
   - existe la carpeta «Aline - Mi almacén» con `vault.json`, `revisions/`, `objects/` y `readable/`;
   - la barra superior muestra «☁️ Sincronizado · hh:mm».
4. Comprobar desde otro navegador o equipo: crear un almacén nuevo, conectar Drive y elegir «Abrir ese almacén aquí». Si está cifrado, escribir la contraseña. Las notas deben aparecer. Editar en ambos lados y sincronizar.
5. Cifrado:
   - abrir en drive.google.com un archivo `.bin` y comprobar que no se lee;
   - probar el código de recuperación en lugar de la contraseña;
   - cambiar de modo en «Cifrado y contraseña» y comprobar que el otro equipo se traslada solo;
   - probar en el iPad cuánto tarda en desbloquear.
6. Comprobar la CSP: abrir la consola (F12) durante todo el recorrido. Si no aparece ningún aviso «[Report Only] Refused to…», se puede cambiar `Content-Security-Policy-Report-Only` por `Content-Security-Policy` en `public/_headers`.
7. Avisarme de cualquier error. El diagnóstico (Estado y diagnóstico) registra los fallos de sincronización sin contenido de notas ni tokens.

**Observación del alojamiento:** Cloudflare añade las cabeceras `Report-To` y `NEL` (registro de errores de red). Con ellas, el navegador puede enviar a Cloudflare informes de fallos de conexión. Es un dato técnico del proveedor, no contenido, pero conviene revisarlo frente a RNF-05 y, si se quiere, desactivarlo en la configuración de Cloudflare.

**Lo que tiene que hacer el propietario para continuar con Drive (diseño §14.3):**

1. En https://console.cloud.google.com, crear un proyecto (por ejemplo «aline») y habilitar **Google Drive API**. Habilitar **Google Picker API** solo si se quiere abrir archivos ajenos a la aplicación.
2. Configurar la pantalla de consentimiento OAuth:
   - tipo **Externo**, en modo **Pruebas** al empezar, con tu cuenta como usuario de prueba;
   - **hecho el 19/10/2026:** la aplicación está publicada, así que puede entrar cualquier cuenta;
   - alcance únicamente `https://www.googleapis.com/auth/drive.file`.
3. Crear credenciales **ID de cliente OAuth** de tipo **Aplicación web**, con estos «Orígenes autorizados de JavaScript» (sin rutas):
   - `https://aline.projeck.workers.dev`
   - `http://localhost:5173`
   - `http://localhost:4173`

   No hacen falta URI de redirección: se usa el modelo de token de Google Identity Services.
4. Pasarme el **ID de cliente**. Es público por diseño. **Nunca** el secreto del cliente, que no se usa.
5. Configurarlo como variable de compilación `VITE_GOOGLE_CLIENT_ID`: en `.env.local` para desarrollo y en las variables de compilación de Cloudflare para el despliegue.


**Prerrequisitos del propietario** (ver §5): alojamiento con origen HTTPS estable, proyecto de Google Cloud con Drive API, cliente OAuth web y pantalla de consentimiento en pruebas, y una cuenta o carpeta de Drive de prueba.

| # | Tarea | Requisitos y CA | Tamaño |
| --- | --- | --- | --- |
| 4.1 | Pantalla «Dónde se guarda»: navegador, carpeta o Drive. Conectar compara `vaultId`; cambiar de modo no borra el origen | RF-41, CA-33, §8.4 | S |
| 4.2 | **Carpeta Windows**: consumir `outbox` escribiendo los objetos primero y la revisión al final; revalidar permisos; mantener la cola si la carpeta se desconecta | RF-41, RNF-04 | M |
| 4.3 | **Ediciones externas**: escanear las copias `readable` al abrir y al recuperar el foco; crear una revisión `external`; «Exportar notas actuales» e importarlas como cambios | CA-28, FA-04b, §8.3 | M |
| 4.4 | **Autorización con Google**: GIS cargado solo al conectar, aviso RN-12 con confirmación, token solo en memoria, estado «Necesita autorización», revocación y cambio de cuenta | RN-12, CA-27, §13 | M |
| 4.5 | **`DriveRemoteStore`**: carpeta propia, `appProperties`, mapeo de IDs, subida multipart y resumible, paginación, reintentos con backoff, jitter y `Retry-After` | RF-36, RF-42, §8.2 | L |
| 4.6 | **`SyncEngine`**: Web Locks y concesión de respaldo; controles de poda, staging, verificación y activación; subida, cursor y reconciliación completa; disparadores al abrir, al recuperar el foco y periódico; estados visibles y hora de la última consulta | RF-37, RF-42, RNF-16 | L |
| 4.7 | Pruebas del protocolo con un `RemoteStore` en memoria: tres dispositivos, respuestas perdidas, duplicados, subidas parciales, cursor inválido; después pruebas manuales con Drive real | CA-14, CA-29 | M |
| 4.8 | CSP con los endpoints exactos de Google, primero en modo informe y después en bloqueo | §13, CA-19 | S |
| 4.9 | **Cifrado opcional en Drive** (añadida el 13/10/2026): elección al conectar, contraseña y código de recuperación, desbloqueo por equipo, cambio de contraseña y de modo con traslado de los demás equipos | RF-43, RF-44, RNF-15, RN-12, CA-27, §13.1 | L |

**Se avanza cuando** dos PC y el iPad editan el mismo almacén, con y sin red, sin sobrescrituras ni duplicados (CA-14, CA-29, CA-33), en los dos modos de Drive, y la elección de cifrado con sus avisos aparece al conectar (CA-27).

### Fase 5 — Entrega «Debe» y beta (implementada el 13/10/2026; faltan las pruebas en el iPad y el uso real)

**Estado:**

- **Hechas y probadas en Chromium y Edge:** 5.1, 5.2, 5.3, 5.4 (emulación táctil), 5.5, 5.6 (en el PC) y 5.7.
- **Las hace el propietario:**
  - la matriz del iPad ([pruebas-ipad.md](pruebas-ipad.md)), que es parte del criterio de salida;
  - 5.8: desplegar y usar la aplicación dos semanas con copias.

**Decisiones de esta fase:**

- **PDF con jsPDF, como decide el diseño.**
  - Se carga solo al exportar.
  - Sus dependencias opcionales (HTML/SVG a PDF) no se instalan (`pnpm-workspace.yaml`). Un plugin de Vite resuelve solo las importaciones que hace jsPDF a un sustituto que falla al usarse, así que no se distribuye código sin uso.
- **Presupuesto de memoria de 16,7 Mpx** (el máximo de Safari). Por encima se propone la mayor escala que cabe, o exportar la selección; nunca se recorta en silencio (FA-05a). El PDF paginado reparte el raster en hojas A4 a lo ancho.
- **Importar crea siempre documentos nuevos, en una sola revisión** (`VaultService.importNote`, `importCanvas`), con la operación `save` para no cambiar el formato v1.
  - Los adjuntos importados se verifican por SHA-256.
  - Se descartan, y se listan, el contenido web incrustado (`embeddable`, `iframe`), las imágenes remotas, los tipos desconocidos y los elementos borrados.
  - Los campos de frontmatter que el modelo no tiene se listan como no conservados.
- **iPad.** El modo lápiz es el del motor, que ya muestra su botón al detectar el Apple Pencil. El modo «Solo lápiz» propio sigue en la fase 6 (6.7).
- **Pendiente detectado:** conservar el `.excalidraw` original cuando la importación lo convierte (§12.1), y traducir los mensajes técnicos que vienen de los adaptadores.


| # | Tarea | Requisitos y CA | Tamaño |
| --- | --- | --- | --- |
| 5.1 | Exportar PNG y SVG con fondo y escala configurables; PDF paginado con jsPDF; selección o escala menor si el lienzo es muy grande | RF-33, CA-13, FA-05a | M |
| 5.2 | `.excalidraw`: exportar autocontenido avisando de lo que se pierde e importar con la lista de lo no soportado | RF-34, RF-45, CA-18, CA-30 | S |
| 5.3 | Importar y exportar notas Markdown (individuales y carpeta) | RF-35 | S |
| 5.4 | iPad mínimo: PWA instalada, objetivos de 44 px, paneles deslizables, desplazamiento y zoom con dos dedos, y modo lápiz si la prueba 0.4 pasó | RF-49, RNF-07, RNF-14 | M |
| 5.5 | Endurecimiento: teclado y foco, contraste, zoom de interfaz, revisión es/en, observar el tráfico de red | RNF-08, RNF-11, CA-19 | M |
| 5.6 | Rendimiento medido y registrado con su hardware: CA-12, CA-31 y búsqueda | RNF-01, 02, 10, 17 | S |
| 5.7 | Documentación: guía de uso, formato y operación (despliegue, copias, recuperación) | RNF-09, RNF-11 | S |
| 5.8 | Despliegue en el origen de producción y dos semanas de uso real con copias | — | S |

**Criterio de salida:**

- Cumplida la definición de beta del §2.
- Matriz de pruebas manuales en el iPad documentada (Safari y PWA instalada).
- Ningún «Debe» queda pendiente sin una decisión registrada del propietario.

**→ Hito beta utilizable.**

### Fase 6 — Entrega «Debería» (versión 1.0)

| # | Tarea | Requisitos y CA | Condición |
| --- | --- | --- | --- |
| 6.1 | Crear un hijo conectado con atajo | RF-14, CA-04 | — |
| 6.2 | Colapsar y expandir ramas con proyección visible | RF-15, CA-05 | Solo con la estrategia B de la fase 0 (ocultos en escena) y tras sus pruebas pendientes |
| 6.3 | Tarjetas de nota incrustadas en el lienzo | RF-18, §9.3 | — |
| 6.4 | Galería con miniaturas | RF-27 | — |
| 6.5 | Atajos de teclado completos | RF-39 | — |
| 6.6 | Espacio que ocupan las versiones y poda explícita con controles `VersionPrune` | RF-46, RN-13, CA-32 | Antes, si la cuota se vuelve un problema |
| 6.7 | Lápiz completo: modo «Solo lápiz», bloques manuscritos dentro de notas (§5.2) | RF-47, RF-48, CA-25, CA-26 | Solo si pasó la prueba 0.4 |
| 6.8 | Deshacer coordinado del producto para los comandos propios | RF-04, §9.2 | Cuando existan comandos propios (6.1, 6.2) |

**Opcionales («Podría»), por decisión explícita:**

- cuadrícula y ajuste (RF-06, nativo);
- distribución automática (RF-16);
- convertir un texto en nota (RF-19);
- grafo (RF-28);
- plantillas (RF-40).

**Fuera de alcance:** RF-38, cuentas, plugins, IA y OCR. El empaquetado de escritorio queda diferido (DP-02).

### Fase 7 — Todo enlazable y anclas de texto (decidida el 16/10/2026)

Cambio de arquitectura registrado en la cabecera del diseño; sintaxis en `docs/formato-almacen.md` §2.3.1. Opción elegida por el propietario: **híbrida**, cita textual en todos los documentos más id de bloque en los documentos con formato. El id de bloque es una extensión propia que lo asigna solo al crear el ancla: la extensión UniqueID de Tiptap (MIT, verificada) asigna ids a todos los bloques al abrir, lo que crearía revisiones y conflictos sin editar.

| # | Tarea | Notas | Estado |
| --- | --- | --- | --- |
| 7.A | Modelo de ancla: esquema `aline://` (lee `mindnote://`), fragmentos `b=`, `ev=`, `t=` (`domain/links.ts`); texto mostrado y resolución de citas (`domain/anchors.ts`, `markdownProjection`, `richDocProjection`); registro del cambio | Sin interfaz | Hecha (16/10/2026) |
| 7.B | Origen desde cualquier selección: «Enlazar selección» (botón y Ctrl/⌘+K) en notas (CodeMirror), documentos Markdown (Milkdown) y documentos con formato (Tiptap admite `aline:`); selector y `[[` con todos los tipos (`isLinkableKind`) y eventos; seguir un enlace a un evento abre su día y el evento | El esquema de enlaces de Milkdown vaciaba en el DOM los `href` internos: se conservan los válidos (`linkKeepingInternal`) | Hecha (16/10/2026) |
| 7.C | Anclas de destino: «Copiar enlace a la selección» (botón y Ctrl/⌘+Mayús+K en los tres editores, «Copiar enlace al evento» en su diálogo; portapapeles interno, nunca el del sistema) y «Enlazar con lo copiado» en el selector; extensión propia de anclas de Tiptap (`features/docs/blockAnchors.ts`: asignación al copiar, sin duplicados al partir o pegar, `anchor: null` fuera del JSON guardado); `FocusTarget` con bloque y cita, y navegación al fragmento en notas, documentos Markdown y con formato; aviso si el ancla es aproximada o se perdió | Un enlace desde un lienzo conserva el ancla en `element.link`, pero el sidecar aún no (7.E) | Hecha (16/10/2026) |
| 7.D | Calendario enlazable: `links` opcional en el evento (internos o http/https, máximo 50; se conserva en versiones anteriores, `EventDialog` guarda con `...event`), sección «Enlaces» en el diálogo (añadir con el selector, quitar, seguir guardando antes lo cambiado), marca con el número de enlaces en la vista, prueba de `mergeCalendars` | Sin subir `schemaVersion`; esquema JSON regenerado | Hecha (16/10/2026) |
| 7.E | Índice: documentos con formato (texto mostrado y bloques anclados) y calendarios (eventos como elementos buscables) indexados; `StoredLink` con ancla de destino y contexto de origen; estados `approximate` y `anchor-lost` (solo el segundo cuenta como roto), calculados al consultar contra el texto indexado del destino, así que no hace falta reindexar a quien enlaza; ancla del lienzo en el sidecar (`fragment`); backlinks con contexto y apertura en el sitio del enlace; la búsqueda abre eventos | `KNOWLEDGE_INDEX_FORMAT` 2: se reconstruye el índice una vez | Hecha (16/10/2026) |
| 7.F | Resaltar en el destino los fragmentos con backlinks: subrayado de puntos con «Enlazado desde: …» al pasar, en notas (CodeMirror), documentos Markdown (Milkdown) y con formato (Tiptap); decoraciones que siguen al texto al editar y se recalculan con el índice; solo las anclas encontradas tal cual | Nueva dependencia directa `@codemirror/view` (ya estaba como transitiva, MIT) | Hecha (16/10/2026) |

### Fase 8 — Mejoras de organización, tipografía y documentos (decidida el 17/10/2026)

Decisiones del propietario: fuentes nuevas también en el lienzo parcheando el motor; imágenes de los documentos Markdown como archivos del almacén (en la copia legible, un enlace); PDF desde la impresión del navegador; lo archivado sale de la barra pero sigue en la búsqueda.

| # | Tarea | Notas | Estado |
| --- | --- | --- | --- |
| 8.1 | Barra lateral y perfil: secciones Notas → Documentos → Calendario; arrastrar carpetas dentro y fuera de otras; orden manual arrastrando (mitad de arriba o de abajo de una fila; en una carpeta, su cuarto superior o inferior) o con «Subir»/«Bajar» en «⋯»; «Archivar» en «⋯» y Configuración → Archivo; Perfil con «Almacenamiento» y «Archivo» (Estado y diagnóstico queda en «⋯»); botones de Google Drive con la marca de Google | Cambio de arquitectura: `sortKey` y `archived` en los metadatos (formato §2.2) | Hecha (17/10/2026) |
| 8.2 | Tipografía: 24 fuentes (`@fontsource`, OFL y una Apache-2.0) servidas desde el origen y cargadas al usarse; fuente con búsqueda y tamaño (A−/A+) en la barra de los documentos con formato; parche del motor para que salgan en el selector de fuentes del lienzo | Fuera de la precarga del PWA; métricas comprobadas contra los archivos | Hecha (17/10/2026) |
| 8.3 | Documentos con formato: zoom de la hoja (50–200 %), panel de capítulos, paginación A4 propia de la vista «Hoja» con contador de páginas (se descartó `tiptap-pagination-plus`: inyecta su propia hoja de estilos con colores fijos y rehace la maquetación de la hoja) y comentarios propios (hilos con respuestas, resolver o reabrir, eliminar; Ctrl/⌘+Alt+M) | Comentarios en el JSON del documento (formato §2.5.3); lo demás es presentación | Hecha (17/10/2026) |
| 8.4 | Imágenes en documentos con formato y Markdown (subir, pegar o arrastrar; archivos del almacén, nunca remotas); exportar a Word (`docx` 9.8.1, MIT, carga diferida; listas, títulos, fuentes, enlaces web e imágenes) y a PDF (impresión del navegador de una copia del contenido, A4) desde «Exportar» | Cambio de formato: assets en `doc` y `mddoc`; licencias BlueOak-1.0.0 (`sax`) y `(MIT OR GPL-3.0-or-later)` (`jszip`, usada bajo MIT) añadidas a la lista permitida | Hecha (17/10/2026) |
| 8.5 | Documentos con formato al estilo de Google Docs: pestañas del documento (crear, renombrar, duplicar, eliminar; capítulos de la activa en el mismo panel), barra de herramientas en una fila compacta, burbuja al seleccionar texto (comentar y enlazar) y lista de fuentes que no se descoloca (se pinta en `document.body` y se recoloca al moverse la barra) | Cambio de formato compatible: `tabs` en `doc` (formato §2.5.3) | Hecha (17/10/2026) |

### Fase 9 — Versión 0.2.0 (decidida el 19/10/2026)

Punto de partida: la 0.1.0 publicada y Drive funcionando con Google real, con la aplicación OAuth publicada (19/10/2026). La 0.2.0 junta el cierre de Drive, lo que falta en documentos y calendario, el pulido del lienzo, dos mejoras de interfaz pedidas por el propietario (punteros propios y barra lateral compacta), mantenimiento y el núcleo de mapa mental de la fase 6. Las etapas van en este orden; cada una se cierra con `pnpm verify` y sus recorridos e2e y puede publicarse sola. Si el alcance crece (R-02), la etapa G pasa a una 0.3.0 sin tocar las demás.

**Etapa A — Cerrar Drive**

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 9.1 | CSP obligatoria: cambiar `Content-Security-Policy-Report-Only` por `Content-Security-Policy` en `public/_headers` y ajustar la prueba que la comprueba | **Hecha (20/10/2026).** La consola con Google real solo mostró violaciones propias: la prueba de zod con `Function` (6 por carga; ahora `jitless`, `domain/zod.ts`) y unas 230 fuentes Xiaolai del motor con el CDN esm.sh de respaldo (el parche del motor ya no lo añade cuando las fuentes se sirven desde el propio origen, que además evita contactar con un tercero si una fuente local fallara). `tests/e2e/csp.spec.ts` sirve la aplicación con la CSP de `_headers` obligatoria y recorre lienzo con texto en chino, nota, documento y búsqueda sin violaciones (comprobado que falla si se quita el arreglo de zod). Los avisos de COOP sobre `window.closed` son de la ventana de Google y no los afecta la CSP. Pendiente del propietario: un recorrido de Drive con Google real tras publicar | S |
| 9.2 | Mensajes técnicos de sincronización traducidos: los adaptadores de Drive y de carpeta devuelven códigos (`DomainError` con `code` y datos), no frases; la interfaz los traduce con `t()` | **Hecha (19/10/2026).** `RemoteError` lleva un `code` estable (`REMOTE_ERROR_CODES` en `ports/RemoteStore.ts`) y el detalle técnico solo va al diagnóstico; el estado remoto guarda `problem` (código) en vez de texto; textos en `storage.errors.*`, y una prueba exige texto para cada código | S |

**Etapa B — `[[` en todas partes**

Hoy el autocompletado `[[` solo existe en el editor de las notas (CodeMirror, `features/notes/MarkdownEditor.tsx`); los documentos Markdown, los documentos con formato y el lienzo no lo tienen, y un `[[Título]]` escrito a mano se ve como texto en la vista previa. Lo primero es reproducir el caso del propietario en las notas, por si falla algo además de la falta en los otros editores.

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 9.3 | Comprobar el `[[` de las notas en el caso real del propietario (edición, vista dividida, vista previa) y corregir lo que falle | **Hecha (19/10/2026).** El autocompletado de las notas (CodeMirror) funciona y lo cubre el recorrido de la fase 3; no se encontró fallo. Si el propietario lo ve fallar, falta su caso concreto | S |
| 9.4 | `[[` en documentos Markdown (Milkdown) y con formato (Tiptap): al escribir `[[` aparece el mismo selector (`LinkPicker`: todos los `isLinkableKind` y los eventos, más «Crear nota» como en FA-03a) y se inserta un enlace `aline://` por UUID con el título como texto | **Hecha (19/10/2026).** Al escribir el segundo `[` se quitan los dos y se abre el selector de Ctrl/⌘+K (`features/docs/wikiTrigger.ts`, desde `handleTextInput` de cada editor; no en bloques de código); lo escrito después va a su búsqueda. Cancelar devuelve los `[[`. Recorridos en `enlaces.spec.ts` | M |
| 9.5 | `[[` en el lienzo: al editar un texto del lienzo, `[[` abre el selector y el elemento recibe el enlace en `element.link` (`aline://document/<id>`), quitando el `[[…` escrito | **Hecha (19/10/2026).** `features/canvas/canvasWikiLink.ts` escucha el `textarea` del motor, quita los `[[`, cierra su editor (el motor devuelve el foco a su contenedor al cerrarlo) y abre el selector; el enlace va al texto o a su contenedor. Si el texto quedó vacío, el motor lo borra y se crea un texto con el título enlazado. Cancelar no devuelve los corchetes. Recorrido en `fase3.spec.ts` | M |
| 9.6 | `[[Título]]` escrito a mano: en la vista previa de las notas y en los documentos Markdown se muestra como enlace si resuelve a un único título, y como enlace roto si no | **Hecha (19/10/2026).** Vista previa de notas: plugin de remark en `features/notes/markdown.ts` (enlace `wiki-link`, o `broken-link` si el título no es único). Documentos Markdown: decoraciones (`features/docs/wikiMarksMd.ts`) que se siguen al pulsar. De paso, el saneado conservaba solo la primera regla `className` de `a` y quitaba `image-reference`: corregido | S |

**Etapa C — Documentos**

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 9.7 | Tablas en los documentos con formato (insertar, filas y columnas, encabezado) y en los Markdown desde la barra (tabla GFM) | **Hecha (19/10/2026).** Tiptap: `@tiptap/extension-table` 3.31.4 (MIT, nueva dependencia directa; en `THIRD-PARTY-NOTICES.md` y `docs/licencias.md`), `TableKit` sin redimensionar columnas. Milkdown: la tabla GFM que ya traía `preset-gfm`, con los comandos de `@milkdown/prose/tables` y Tab/Mayús+Tab entre celdas; en la fila de encabezado no se ofrece quitarla ni insertar encima (GFM la exige). Menú común `TableMenu` (`toolbar.tsx`) e icono nuevo `brand/icons/ui/tabla.svg`. Word exporta tablas reales; PDF las imprime; las proyecciones de texto ya las recorrían. De paso: la barra del documento Markdown iba un paso por detrás de la selección (Milkdown avisa antes de actualizar la vista), corregido | M |
| 9.8 | Exportar un documento con formato a Markdown (todas las pestañas, imágenes como archivos al lado) | **Hecha (19/10/2026).** `domain/richDocMarkdown.ts` (puro, probado): títulos, marcas, enlaces, listas anidadas, citas, código, separador, imágenes y tablas GFM; cada pestaña bajo su título. «Exportar → Documento en Markdown» descarga el `.md`, o un ZIP con `assets/` si hay imágenes (`app/importExport.ts`, también para el `.md` de los documentos Markdown) y avisa de lo descartado | M |
| 9.9 | La exportación Markdown por carpetas incluye los documentos (`mddoc` tal cual, `doc` convertido con 9.8) y sus carpetas de documentos | **Hecha (19/10/2026).** `markdownTree` recorre las dos secciones: una carpeta de «Documentos» exporta sus documentos; todo el almacén pone las notas en la raíz y los documentos bajo `Documentos/`. Las imágenes van a `assets/` de cada carpeta | S |

**Etapa D — Calendario** (DESIGN.md §8.6)

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 9.10 | Selector de fechas y horas propio con los tokens (sin el nativo del navegador) | **Hecha (20/10/2026).** `features/calendar/DateField.tsx` (DESIGN.md §8.4: rango, hoy, puntos de días con eventos, días anteriores al inicio desactivados; flechas, Re Pág/Av Pág, Inicio/Fin, Intro y Escape, que no cierra el evento) y `TimeField.tsx` (texto libre normalizado y lista cada media hora). Mover el inicio mueve el fin y conserva la duración | M |
| 9.11 | Eventos repetidos: diaria, semanal (días), mensual y anual, con fin por fecha o por número; editar o borrar «este» o «toda la serie» | **Hecha (20/10/2026).** Cambio de formato compatible registrado en el diseño y en `formato-almacen.md` §2.5.1 (clave opcional `recurrence`, sin subir `schemaVersion`); esquema JSON regenerado. Dominio puro y probado en `domain/calendar.ts` (`occurrencesBetween`, `expandEvents`, `withException`, `editSeries`); las vistas despliegan solo el intervalo visible | L |
| 9.12 | Hoja de «hoy», semana que empiece el domingo (preferencia) y búsqueda de eventos en el buscador del calendario | **Hecha (20/10/2026).** Hoja de «hoy» desde `brand/calendar/hoja-hoy.svg`, buscador de eventos en la barra lateral del calendario y «La semana empieza el» en Configuración → Idioma (preferencia de este navegador). Revisión del propietario (20/10/2026): la hoja de «hoy» pasa a un panel derecho plegable con «Próximos» (7 días por día), cada calendario elige su color (menú ⋯ → «Cambiar color») y la cabecera muestra la semana y la hora actual | S |

**Etapa E — Lienzo**

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 9.13 | Nota adhesiva: elegir el color (los del calendario) y texto arriba a la izquierda | **Hecha (20/10/2026).** Área de texto en la nota (rectángulo sin borde del color de la nota, márgenes de §3.5) y `features/canvas/stickyText.ts` alinea arriba a la izquierda el texto nuevo; color con el relleno de la paleta (recolorea cuerpo, banda, área y doblez) y las notas nuevas salen del último color. Las notas anteriores no cambian | S |
| 9.14 | Selector de color con la paleta del lienzo (DESIGN.md §3.2) en la barra propia | **Hecha (20/10/2026).** `features/canvas/PaletteSlot.tsx`: casilla «Colores» en la barra (solo con el lápiz o con una selección, a petición del propietario) con trazos y rellenos de §3.2 (muestras con el color que se ve en oscuro); se aplica a la selección y a lo siguiente que se dibuje, y muestra el color de la selección | M |
| 9.15 | Stickers en oscuro: respetar el orden de capas y el recorte de los marcos, y exportar en oscuro sin el filtro | **Hecha (20/10/2026).** `stickerLayer.ts` reparte la composición en una pila de capas (stickers sin filtro, lo de encima con filtro) y repite el recorte de los marcos; `stickers.spec.ts` comprueba que una forma delante tapa el sticker y que al mandarla atrás se ve. La exportación no necesitaba cambios (siempre en claro, el motor no filtra imágenes). El recorte de marcos no tiene recorrido e2e | M |

**Etapa F — Interfaz**

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 9.16 | **Punteros propios de «aline»** para toda la interfaz: flecha (normal), mano que señala (enlaces y botones), mano abierta y cerrada (arrastrar filas, mover el lienzo), texto (I), cargando y trabajando (`wait`, `progress`), no permitido, mover, cambiar tamaño (horizontal, vertical y diagonales), cruz y ayuda | **Hecha (20/10/2026).** Segunda versión aprobada por el propietario: estilo adhesivo troquelado (DESIGN.md §7.5), 15 punteros en `brand/cursors/` con su hoja de muestra. `app/cursors.ts` define las variables `--cursor-*` con los SVG (sin PNG: los navegadores admiten SVG y no hace falta un rasterizador) y el CSS usa `var(--cursor-…, palabra)`, también en la interfaz del motor | M |
| 9.17 | Punteros en el lienzo: los mismos para la mano, la selección y el texto; las herramientas de dibujo conservan los del motor (cruz, borrador, lápiz) | **Hecha (20/10/2026).** `features/canvas/canvasCursors.ts`: un `MutationObserver` cambia en el canvas interactivo las palabras clave del motor por las variables; la cruz, el lápiz y el borrador siguen siendo los del motor | S |
| 9.18 | Preferencia «Puntero»: «aline» o «del sistema» en Configuración → Apariencia | **Hecha (20/10/2026).** «Puntero: aline / Del sistema» en Configuración → Apariencia (`mindnote.cursors`); con «Del sistema» se quitan las variables. Recorrido en `navegacion.spec.ts` | S |
| 9.19 | **Barra lateral compacta**: en Configuración → Apariencia, «Al plegar la barra lateral»: «Ocultarla» (como ahora) o «Dejar solo los iconos», con dos vistas previas seleccionables como las de los esquemas | **Hecha (20/10/2026).** `app/sidebarPref.ts` (preferencia), `features/library/LibraryRail.tsx` (columna de 56 px: desplegar, secciones, Nuevo con lo de la sección, Buscar que despliega y enfoca el buscador, Perfil) y `ProfileMenu.tsx` compartido; en Configuración → Apariencia, «Al plegar la barra lateral» con dos vistas previas dibujadas con los tokens. En pantallas estrechas sigue el panel superpuesto | M |

**Etapa G — Mantenimiento y mapa mental** (adelanta parte de la fase 6)

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 9.20 | Espacio de las versiones y poda explícita (= 6.6) | **Hecha (20/10/2026).** `pruneRevisions` en el repositorio (nunca una cabeza; objetos huérfanos borrados; control `VersionPrune`) y `versionSpace` (espacio total y lo que liberaría cada versión, sin contar lo compartido). En el historial: espacio, tamaño liberable de cada versión, «Eliminar esta versión» y «Eliminar las anteriores», con confirmación. Pruebas en `podaVersiones.test.ts` y `fase2.spec.ts` | M |
| 9.21 | Barra lateral virtualizada para miles de documentos | **Hecha (20/10/2026).** En lugar de virtualizar (rompería el árbol anidado y el arrastre), cada lista pinta 150 filas y más al desplazarse cerca del final o con «Mostrar más» (`LoadMore.tsx`); el documento abierto siempre se pinta. Con 2 500 documentos el lienzo aparece en unos 0,64 s (antes 2,8 s), un solo proceso de prueba | M |
| 9.22 | Crear un hijo conectado con atajo (= 6.1) | **Hecha (20/10/2026).** Tab con un nodo seleccionado: hijo a la derecha (los siguientes, debajo), flecha anclada y texto listo para escribir; un solo paso de deshacer. `domain/mindMap.ts` y `features/canvas/mindMapCanvas.ts` | M |
| 9.23 | Ramas colapsables con proyección visible (= 6.2) | **Hecha (20/10/2026).** Estrategia B (opacidad 0 y bloqueados, originales en `mindMap.hidden`), proyección idempotente que reaplica lo oculto (también tras «Desbloquear todo»), contador «+N» generado, despliegue al llegar a un elemento oculto, exportación visual sin lo oculto (el .excalidraw lo conserva). Probados: guardar y reabrir plegado, 12 deshacer y rehacer con la rama plegada, posiciones al desplegar | L |
| 9.24 | Tarjetas de nota incrustadas en el lienzo (= 6.3) | **Hecha (20/10/2026).** «Tarjeta de nota»: rectángulo con enlace a la nota y texto ligado con título y extracto (texto mostrado, sin el encabezado si repite el título), registrado en `noteEmbeds`; se actualiza al abrir el lienzo y cuando la nota cambia | L |
| 9.25 | Deshacer coordinado para los comandos propios (= 6.8) | **Hecha (20/10/2026).** Decisión registrada en el diseño §9.2: una sola pila (la del motor), comandos propios como un paso, proyecciones fuera del historial y sidecar derivado de la escena. Prueba de deshacer y rehacer un hijo con su relación | M |

El modo «Solo lápiz» y los bloques manuscritos (6.7) siguen esperando la prueba 0.4 en el iPad y no entran en la 0.2.0.

**Cierre de la versión**

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 9.26 | `version` 0.2.0 en `package.json`, README (versión, verificación y tabla de pendientes) y etiqueta `v0.2.0`; `pnpm verify` y e2e en Chromium y Edge; publicar en Cloudflare | **Hecha (21/10/2026).** `version` 0.2.0, aviso en el README de actualizar todos los dispositivos antes de usar eventos repetidos y ramas plegadas, `pnpm verify` (273 pruebas) y e2e en Chromium y Edge con Node 24.22.1; etiqueta `v0.2.0` publicada en Cloudflare. La CI reintenta una vez los recorridos intermitentes | S |

**Del propietario para esta fase:** revisar la consola para 9.1; probar el modo cifrado y dos equipos con Google real; aprobar la hoja de punteros (9.16) antes de aplicarlos; decidir si la etapa G entra entera o pasa a la 0.3.0.

### Fase 10 — Versión 1.0 (propuesta el 23/10/2026, pendiente de aprobar)

Punto de partida: la 0.2.0 publicada (21/10/2026). Lista del propietario analizada contra el código; cada punto lleva su plan, salvo lo que espera una decisión (marcado **Decisión**). La fase 6 ya llamaba «1.0» a la entrega «Debería»: de ella solo queda 6.7 (lápiz), que sigue esperando la prueba 0.4 y no entra aquí. Etapas en este orden; cada una cierra con `pnpm verify` y sus recorridos e2e y puede publicarse sola.

**Etapa A — Correcciones y configuración**

| # | Tarea | Análisis y plan | Tamaño |
| --- | --- | --- | --- |
| 10.1 | Al seguir un enlace de un documento a un lienzo se abre «Cambiar nombre» en la barra lateral | **Hecha (23/10/2026).** Reproducido con un recorrido e2e (fallaba exactamente así) y corregido en `RenameableTitle`: la petición de edición con la que se monta una fila cuenta como ya atendida, así que vale para las cuatro listas que usan el patrón sin tocarlas. Recorrido en `enlaces.spec.ts`. Análisis previo: **Causa probable (por reproducir primero con un e2e):** hay un solo `LibrarySidebar` para las secciones Notas y Documentos, y su estado `renaming` (`{ id, seq }`) sobrevive al cambio de sección. `RenameableTitle` abre la edición en un efecto cuando `editRequest ≠ 0`, también **al montarse**: si esa fila se renombró antes desde «⋯», al volver a montarse (cambio de sección, carpeta que se despliega para mostrar el documento, «Mostrar más») hereda la petición vieja y abre la edición. Arreglo: que la petición se consuma una vez (el efecto ignora el valor con el que se monta, con un `useRef` del último `editRequest` atendido) y vaciar `renaming` al terminar o cancelar y al cambiar de sección; lo mismo en `CalendarSidebar`, `TemplatesPanel` y `DocTabsPanel`, que usan el mismo patrón. Prueba e2e: renombrar un lienzo, ir a Documentos, seguir un enlace al lienzo → no hay `library-title-input`. Si el recorrido no lo reproduce, hace falta el caso exacto del propietario | S |
| 10.2 | Configuración: «Apariencia» pasa a «Preferencias e idioma» | **Hecha (23/10/2026).** Sección `preferences` con los grupos Apariencia, Idioma y región y Documentos (`data-testid` `preferences-*`); en Perfil, «Preferencias e idioma» (`settings-preferences`, icono `ajustes`). Análisis previo: `SETTINGS_SECTIONS` queda `storage, preferences, archive, trash`: la sección `preferences` junta lo de Apariencia (esquemas, puntero, barra plegada) con Idioma y «La semana empieza el», en grupos con su título (Apariencia · Idioma y región · Documentos, este último de 10.3). En el menú de Perfil, `settings-appearance` y `settings-language` se sustituyen por un `settings-preferences` (actualizar `ProfileMenu.tsx`, las claves es/en y los e2e que abren esas secciones; `accesibilidad.test.ts` exige la paridad). **Interpretación:** «preferencias e idioma» como una sola opción; si el propietario prefería «Preferencias» con Idioma aparte, solo cambia el título | S |
| 10.3 | Quitar «Continuo · Hoja» de los documentos: con formato siempre en hoja, Markdown siempre continuo, editable solo en Configuración | **Hecha (23/10/2026).** `useDocLayout(kind)` con `setDocLayout`; selectores `doc-layout-doc` y `doc-layout-mddoc` en Preferencias e idioma → Documentos; quitados `LayoutToggle` y su CSS. Análisis previo: `features/docs/layout.tsx`: `useDocLayout(kind)` lee dos preferencias de este navegador (`mindnote.docLayout.doc`, por defecto `page`; `mindnote.docLayout.mddoc`, por defecto `continuous`), notificadas como `useCursorPreference` para que un documento abierto cambie al momento; se borra `LayoutToggle` de `DocView` y `MarkdownDocView` y la clave vieja `mindnote.docLayout` se ignora. En Preferencias → Documentos, dos selectores «Documentos con formato» y «Documentos Markdown». La paginación sigue solo en «Hoja» y en pantallas anchas. Sigue siendo presentación: ni revisiones ni formato. Actualizar los e2e que usan `doc-layout-*` y la guía de uso | S |
| 10.4 | Vista previa del puntero en Configuración | **Hecha (23/10/2026)**, pendiente de que el propietario apruebe los dibujos de `brand/cursors/sistema/`. `CURSOR_PREVIEW` en `app/cursors.ts`; tarjetas `cursor-preference-aline`/`-system`. Plan: Decidido por el propietario (23/10/2026): **vista previa estática**, sin efecto al pasar el ratón, que compare los punteros de «aline» con los del sistema, y **solo los básicos**: flecha, mano (enlace), texto, mover y cargando (mover en vez de mano abierta: una mano abierta genérica no se distingue bien de la del enlace a 32 px). Plan: en cada opción del selector «Puntero» (9.18), una fila con esas cinco imágenes, al estilo de las vistas previas de los esquemas y de la barra plegada (dos tarjetas seleccionables «aline» y «Del sistema» que sustituyen al `select`, con el mismo `data-testid`). Las de «aline» son los SVG de `brand/cursors/` tomados por la misma importación que `app/cursors.ts`. **Límite:** una página web no puede leer las imágenes de los punteros del sistema operativo, y copiar las de Windows o macOS no está permitido; las de «Del sistema» serán dibujos genéricos propios de las formas estándar (flecha blanca con borde negro, mano, I, cruz de flechas, reloj), rotulados como orientativos, en `brand/cursors/sistema/` (nivel de marca, DP-09) | S |

**Etapa B — Enlaces**

| # | Tarea | Análisis y plan | Tamaño |
| --- | --- | --- | --- |
| 10.5 | Lista de enlaces de un documento, a dónde lleva cada uno, con vista previa | **Hecha (24/10/2026).** Botón de enlace en la barra de los dos tipos de documento y panel `LinksPanel` a la derecha: lista sacada del editor abierto (`docLinks.ts`, la pestaña activa con posiciones y las demás de su JSON), estado del índice, «Ir al texto» (también en otra pestaña), abrir el destino y `LinkPreview` al pasar o enfocar (extracto con la cita marcada, miniatura del lienzo con el elemento resaltado, evento, o la dirección web sin cargarla). `VaultService.readCalendar` y `readCanvas` leen sin sesión de edición (el selector de eventos también). Recorridos en `enlaces.spec.ts`. Los `[[Título]]` escritos a mano en Markdown no son enlaces del documento y no salen en la lista. Análisis previo: Ya existe `KnowledgeService.outgoing()` (lo usa `DetailsPanel`) con destino, ancla, contexto y estado (`approximate`/`anchor-lost`/roto). Plan: panel «Enlaces» en los documentos (con formato: una pestaña más del panel lateral de `docPanels.tsx`, junto a Pestañas/Capítulos; Markdown: el mismo panel plegable a la derecha), con cada enlace: texto del enlace, icono y título del destino (o la dirección web), estado, y «Ir al texto» (selecciona el enlace en el editor) y «Abrir destino» (`navigate`). Vista previa al pasar o enfocar: nota, documento o Markdown → título y extracto del `SearchDocument.text` (o del bloque o la cita anclada); lienzo → miniatura con `exportToSvg` como `TemplateThumb` (encuadrada en el elemento si el enlace lleva `elementId`); evento → fecha, hora y título; web → solo la dirección (nunca se pide nada a la red, diseño §13). El orden de la lista sale del documento abierto (recorrer las marcas de enlace de todas las pestañas, `docTabs`), no del índice, para seguir lo que se ve aunque el índice vaya un paso por detrás; el índice da el estado. Componente común `LinkPreview` reutilizable después en backlinks | M |
| 10.6 | Enlazar con un elemento concreto de un lienzo | **Hecha (24/10/2026).** `application/canvasTargets.ts` (puro, probado en `enlacesLienzo.test.ts`), paso `CanvasStep` en el selector con `CanvasPreview` (dibujo del motor y una capa con el mismo `viewBox`: pasar resalta, pulsar elige) y diálogo ancho; `KNOWLEDGE_INDEX_FORMAT` 3 con los `elementIds` de cada lienzo para el estado «fragmento perdido» (se reconstruye el índice una vez). Desde el propio lienzo no se ofrecen sus elementos (el lienzo de origen no es destino, como antes). Recorrido en `fase3.spec.ts`. Análisis previo: **Viable sin cambiar el formato:** el fragmento de elemento `aline://document/<id>#<elementId>` ya existe (`internalLink(id, { elementId })`, formato §2.3.1), `CanvasView` ya enfoca un elemento al llegar (y despliega una rama plegada, 9.23) y el índice ya guarda los elementos con texto del lienzo (`SearchDocument.elements`). Solo falta elegirlo en el selector. Plan: en `LinkPicker`, elegir un lienzo abre un segundo paso como el de los eventos (`EventStep`) con «Todo el lienzo» y una vista dividida: a la izquierda la lista buscable de elementos (textos, marcos por nombre, formas con etiqueta, tarjetas de nota y stickers; los textos ligados se muestran por su contenedor; sin los ocultos por una rama plegada como destino directo, sí su nodo visible), a la derecha una vista previa del lienzo (`exportToSvg` de la escena abierta con `VaultService.openCanvas`) donde al pasar por un elemento de la lista se resalta, y se puede pulsar un elemento en la vista previa para elegirlo (mapeo de coordenadas con los límites de la escena). El diálogo pasa a ancho medio en este paso y a pantalla completa en pantallas estrechas. Funciona igual desde notas, documentos, lienzos y eventos, porque todos usan `LinkPicker`. Si el elemento se borra, el enlace abre el lienzo sin foco: añadir el estado «elemento no encontrado» al cálculo de anclas con los `elements` indexados (sin reindexar a quien enlaza). Pruebas: unidad del listado de elementos (pura, sobre el JSON de la escena) y e2e «enlazar un párrafo con un rectángulo y seguirlo» | M |

**Etapa C — Documentos y tipografía**

| # | Tarea | Análisis y plan | Tamaño |
| --- | --- | --- | --- |
| 10.7 | Arial, Times New Roman y Georgia | **Hecha (24/10/2026).** `@fontsource/arimo`, `tinos` y `gelasio` 5.3.0 (OFL-1.1) con `canvasId` 2025–2027 y `similarTo` (la barra muestra «similar a Arial» y buscar «Arial» la encuentra); interlineado 1,15 en Arimo y Tinos, como sus originales. Recorrido en `fuentes.spec.ts` (también en el lienzo). Análisis previo: **No se pueden usar gratis en el sistema:** las tres son de Monotype/Microsoft y su licencia no permite redistribuirlas, y la aplicación sirve sus fuentes desde su origen (8.2), así que se **descartan tal cual**. Decidido por el propietario (23/10/2026): se añaden sus **equivalentes libres** con las mismas métricas, que se ven casi iguales y no descolocan el texto — **Arimo** (= Arial), **Tinos** (= Times New Roman) y **Gelasio** (= Georgia), las tres OFL-1.1 y en `@fontsource` 5.3.0 como las demás. Plan: tres dependencias directas nuevas (`pnpm licenses:check`, filas en `THIRD-PARTY-NOTICES.md` y `licencias.md`), entradas en `fontCatalog.ts` con `canvasId` 2025–2027 (métricas comprobadas por la prueba de unidad), `pnpm assets` las copia; salen en la barra de los documentos con formato y en el selector de fuentes del lienzo (parche del motor ya genérico); `fuentes.spec.ts` incluye una. En el selector se muestran con una pista («similar a Arial»). Al exportar a Word se escribe el nombre de la equivalente (es la que se ve en la aplicación; Word la sustituye si no la tiene). Se descarta pedir la fuente instalada (`local('Arial')`): el documento se vería distinto en cada equipo y el lienzo cambiaría de medidas | S |
| 10.8 | Editar imágenes en los documentos: agrandar o encoger, girar y recortar | **Hecha (24/10/2026).** `domain/imageEdit.ts` (puro, `imagenesEditar.test.ts`), vista de nodo con tiradores, `ImageBar` y `ImageCropDialog` (`ImageTools.tsx`), `imageBake.ts` para Word y Markdown (también en la exportación por carpetas); el giro es de 90° como se decidió. Corrección del análisis: una versión anterior **no** conserva estos atributos al guardar (ProseMirror descarta los desconocidos); muestra el original. Recorridos en `imagenesEditar.spec.ts`. Plan: Alcance aclarado por el propietario (23/10/2026): «formas» era la forma de la imagen; no hay formas aparte. Hoy `DocImage` (`docImages.ts`) solo pinta la imagen. Plan para los documentos con formato, **sin destruir el original** (el asset del almacén no cambia; lo editado son atributos opcionales del nodo `image`): `width` (px, entre un mínimo y el ancho de la hoja), `rotation` (0/90/180/270, giro en pasos de 90° para que la imagen siga ocupando un rectángulo en el texto; giro libre descartado) y `crop` (rectángulo en fracciones 0–1 de la imagen original). Vista de nodo: tiradores en las esquinas que conservan la proporción; barra flotante al seleccionar la imagen con tamaño 25/50/75/100 %, girar a la izquierda y a la derecha, «Recortar» (modo con un marco de 8 tiradores sobre la imagen entera, Intro aplica, Escape cancela, «Quitar recorte» vuelve al original) y «Restablecer»; teclado para tamaño y giro. La imagen se pinta con un contenedor `overflow: hidden` y la imagen desplazada (recorte) y `rotate` en CSS; el zoom de la hoja usa CSS `zoom`, así que las medidas de los tiradores se dividen por el zoom; la paginación se vuelve a medir al cambiar. Exportar: Word, PDF y Markdown reciben la imagen ya recortada y girada, generada al exportar con un `OffscreenCanvas` (como ya se hace con WebP en `exportDocx.ts`), con el ancho elegido en Word; el Markdown exportado no lleva tamaño. Cambio de formato compatible: atributos opcionales en el JSON de `doc` (registrar en `formato-almacen.md` §2.5.3, sin subir `schemaVersion`; una prueba comprueba que se conservan al abrir y guardar, y que una 0.2.0 los ignora sin perderlos). **Documentos Markdown:** Markdown no puede guardar tamaño, giro ni recorte (haría falta HTML, desactivado por privacidad); en ellos solo se ofrece «Recortar o girar como copia», que crea un asset nuevo con la imagen editada y cambia la referencia (el original queda en las versiones anteriores) | M |

**Etapa D — Lienzo**

| # | Tarea | Análisis y plan | Tamaño |
| --- | --- | --- | --- |
| 10.9 | Estilos de fondo del lienzo: liso, puntos, renglones, cuadrícula (cajas)… | El motor solo trae la cuadrícula de líneas (`gridModeEnabled`, que además activa el ajuste) y no admite otros dibujos de fondo. Plan: una capa propia detrás del canvas estático (como las capas de `stickerLayer.ts`, pero sin parchear el dibujo): un `div` con el color del esquema y el patrón en CSS (`radial-gradient` para puntos, `linear-gradient` para renglones y cuadrícula), con tamaño y desplazamiento sincronizados con `scrollX`/`scrollY`/`zoom` del motor en `onScrollChange`/`onChange`; con un patrón activo, el color mostrado del motor pasa a transparente (solo el mostrado: el guardado sigue en `backgroundRef`, como manda CLAUDE.md). En oscuro la capa queda fuera del filtro del motor y usa los tokens del esquema. El ajuste a la cuadrícula del motor se ofrece aparte («Ajustar a la cuadrícula»). Elegirlo: en el menú del lienzo o en la barra propia (`ToolTray`), con vistas previas pequeñas. Decidido por el propietario (23/10/2026): (1) **el estilo es de cada lienzo**, se guarda y se sincroniza en una clave opcional nueva del sidecar (`background: { pattern: 'plain' | 'dots' | 'lines' | 'grid', step }`, llevada adelante como el resto del sidecar). Es un cambio de formato: registrarlo en la cabecera del diseño y en `formato-almacen.md`, regenerar los esquemas (`pnpm schemas`); cambiarlo crea una revisión del lienzo (un paso de deshacer no hace falta: no es de la escena). Los lienzos nuevos salen lisos. (2) **Exportar:** casilla «Incluir el fondo» en `ExportDialog`, desmarcada; en PNG y PDF se dibuja el patrón en el canvas de exportación antes de los elementos, en SVG como `<pattern>`; el `.excalidraw` nunca lo lleva (otros programas no lo entienden). Rendimiento: el patrón CSS no cuesta al dibujar; comprobar el desplazamiento con `pnpm test:rendimiento` | M |

**Cierre de la versión**

| # | Tarea | Notas | Tamaño |
| --- | --- | --- | --- |
| 10.10 | `version` 1.0.0, README (versión, verificación y tabla de pendientes), guía de uso con lo nuevo, etiqueta `v1.0.0`; `pnpm verify` y e2e en Chromium y Edge; publicar en Cloudflare | Antes de la 1.0, lo que la definición del §2 pide del propietario: la matriz del iPad (`pruebas-ipad.md`) y el uso real | S |

**Del propietario para esta fase:** confirmar la interpretación de 10.2; aprobar los dibujos genéricos de los punteros del sistema (10.4) antes de aplicarlos. Decididos el 23/10/2026: 10.4 (estática, básicos), 10.7 (equivalentes libres), 10.8 (tamaño, giro y recorte) y 10.9 (por lienzo, exportación opcional).

## 4. Dependencias y ruta crítica

```text
Fase 0 ──────────────► 3.2, 3.5 (enlace de elementos) ──► 6.2, 6.7
Fase 1 ─► 2.1 serializador ─┬─► 2.3 ZIP ──► 5.2, 5.3
                            ├─► 4.2 carpeta ─► 4.3 ediciones externas
                            └─► 4.5 Drive ─► 4.6 SyncEngine ─► 4.7
2.2 varios almacenes ─► 2.3 restauración, 4.1 conectar almacén
2.6 conflictos (UI) ─► 4.6 (los conflictos remotos usan la misma UI)
3.4 índice de enlaces ─► 3.7 backlinks ─► 3.8 búsqueda
Propietario: alojamiento + Google Cloud ─► 4.4 ─► 4.5
```

La ruta crítica hasta la beta es: **serializador (2.1) → Drive (4.5) → SyncEngine (4.6) → pruebas entre equipos (4.7)**. Conviene que el propietario prepare el alojamiento y Google Cloud durante las fases 2 y 3, para que la fase 4 no espere.

## 5. Tareas que solo puede hacer el propietario

| Tarea | Necesaria para | Cuándo pedirla |
| --- | --- | --- |
| Pruebas con el iPad y el Apple Pencil | 0.4, 5.4, 6.7 | Fase 0 |
| Confirmar el volumen real: notas, lienzos, tamaño de las imágenes (S-04) | Benchmarks 0.1, 3.8, 5.6; límite de ZIP en el iPad | Fase 0 |
| Crear la cuenta de alojamiento (Cloudflare Pages propuesto) y fijar el origen de producción | PWA en el iPad, 4.x | Durante las fases 2–3 |
| Crear el proyecto de Google Cloud, Drive API, cliente OAuth web y pantalla de consentimiento en pruebas | 4.4–4.7 | Durante las fases 2–3 |
| Cuenta o carpeta de Drive de prueba, separada del contenido personal | 4.7 | Fase 4 |
| ~~Decidir la licencia del código~~ | Hecho: MIT, `Copyright (c) 2026 F. C.`; revisada el 17/10/2026: código GNU AGPLv3, marca y recursos de `brand/` con todos los derechos reservados (`TRADEMARKS_AND_ASSETS.md`) | — |
| Dedicación disponible (D-09) | Calcular fechas | Cuando se quiera un calendario |

Ninguna de estas acciones se ejecuta de forma automática: crear cuentas, publicar o modificar una cuenta de Google requiere la decisión del propietario (diseño §1.1).

## 6. Riesgos del plan

| Riesgo | Efecto en el plan | Mitigación |
| --- | --- | --- |
| R-19: el motor no admite enlaces o proyección | Rehacer 3.5 o 6.2, o cambiar de motor | Fase 0 antes de invertir en las funciones del sidecar |
| R-02: el alcance crece | La beta se retrasa | La beta se limita a los «Debe»; todo lo demás entra por decisión explícita |
| R-14: la infraestructura de Google no está lista | La fase 4 se bloquea | Preparar Google Cloud en paralelo; la alfa local no depende de Drive |
| R-13: Safari borra el almacenamiento | Pérdida en el iPad | PWA instalada, `persist`, estado visible de lo no sincronizado y copias ZIP desde la alfa |
| Sincronización más costosa de lo previsto | La fase 4 es la más grande | Protocolo probado primero con el almacén remoto en memoria (4.7) antes de tocar Drive |
| Avisos de compatibilidad entre React 19 y Radix | Fallos de la interfaz del motor | Vigilar en la fase 0; volver a React 18 es un cambio pequeño si hiciera falta |

## 7. Incoherencias entre los documentos

Hay que resolverlas o anotarlas antes de dar por cerrados los criterios afectados:

1. **Modelo de lápiz — resuelta.** El propietario confirmó el Apple Pencil (USB-C). El documento de requisitos ya está actualizado (DP-10, S-08, RNF-14).
2. **CA-33 frente a CA-01 y FA-01a — resuelta.** CA-33 está reformulado en el documento de requisitos: el almacén empieza en el navegador sin configurar nada; al elegir después carpeta o Drive, queda conectado allí con el mismo identificador, se reabre desde allí y el origen no se borra.
3. **RF-23 «actualizar los enlaces entrantes».** Con enlaces por UUID no hay que reescribir nada (diseño §5.1). El criterio que vale es CA-07.
4. **R-13 «7 días».** El diseño (§1.2) aclara que no es una regla universal. Hay que mantener la mitigación sin prometer un plazo.
5. **RNF-04 «escritura atómica de archivos».** En el navegador solo hay atomicidad por transacción de IndexedDB y por archivo individual en una carpeta. CA-10 se valida ante el cierre del proceso; ante un corte eléctrico hacen falta pruebas adicionales (diseño §1.2 y §7.1).
