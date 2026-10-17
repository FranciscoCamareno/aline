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

**1.1:** repositorio publicado en https://github.com/FranciscoCamareno/aline (rama `main`, licencia MIT). El CI se ejecuta en cada envío.

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

### Fase 4 — Almacenamiento externo y sincronización (implementada el 13/10/2026; falta la prueba con Google real)

**Estado:**

- **Hechas y probadas:** 4.1, 4.2, 4.3, 4.6 y 4.7 contra la carpeta local, en Chromium y Edge y con las pruebas del protocolo.
- **Hechas y probadas contra una simulación de Google:** 4.4 y 4.5. Hay pruebas unitarias del protocolo y recorridos en Chromium y Edge con GIS falso y la Drive API simulada.
- **4.8:** CSP con los endpoints exactos de Google, todavía en modo informe.
- **Pendiente del propietario:** probar con Google real y, si no hay violaciones de CSP, pasarla a obligatoria (pasos más abajo).
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
  - prueba con Google real;
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
   - tipo **Externo**, en modo **Pruebas**;
   - tu cuenta como usuario de prueba;
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
| ~~Decidir la licencia del código~~ | Hecho: MIT, `Copyright (c) 2026 F. C.` | — |
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
