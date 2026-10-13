# Formato abierto del almacén — versión 1

Versión del formato: **1** | 12 de octubre de 2026 | Diseño: §5, §6, §7 | Requisitos: RF-30, RN-05, RN-11, RNF-09

Este documento especifica cómo se representa un almacén fuera de la aplicación: en una copia ZIP, en una carpeta local o en Google Drive. Sirve para leer el contenido **sin ejecutar la aplicación**.

Los esquemas JSON publicados están en [formato/schemas/v1](formato/schemas/v1/) y se generan desde `src/domain/format.ts` con `pnpm schemas`. Una prueba unitaria impide que el código y los esquemas publicados se desincronicen.

> **Estado de implementación (12/10/2026).** Esta especificación está vigente. El serializador y el lector están en `src/application/vaultFormat.ts`, y la copia ZIP ya los usa: la raíz del ZIP es este directorio, más `backup-manifest.json`. La carpeta local y Google Drive escriben el mismo árbol (fase 4); en Drive, véase §6.

## 1. Estructura

```text
vault/
  vault.json                   identidad y versión del formato
  README.md                    este resumen de lectura, copiado en cada almacén
  revisions/<revisionId>.json  metadatos y referencias de contenido (inmutable)
  objects/<sha256>.md          instantáneas de notas (inmutable)
  objects/<sha256>.excalidraw  instantáneas de escenas (inmutable)
  objects/<sha256>.json        extensiones propias del lienzo (sidecar, inmutable)
  assets/<sha256>.<extensión>  imágenes y adjuntos (inmutable)
  heads/<deviceId>.json        índice acelerador de cabezas, reconstruible
  readable/<docId>/<revId>.md  copia legible y editable de cada versión de nota
  controls/<operationId>.json  órdenes explícitas de eliminación de versiones
  catalog.json                 catálogo derivado de títulos y cabezas
```

**Regla de integridad.** Los archivos de `revisions/`, `objects/` y `assets/` se crean una vez y nunca se sobrescriben; su nombre es su identidad.

- Un escritor guarda primero los objetos y al final la revisión.
- Un lector ignora una revisión mientras le falte algún objeto o algún hash no coincida.

`catalog.json` y `heads/` son ayudas y nunca deciden qué cambio gana.

## 2. Archivos

### 2.1 `vault.json` — [esquema](formato/schemas/v1/vault.schema.json)

```json
{ "formatVersion": 1, "id": "UUID", "name": "Mi almacén", "createdAt": "2026-10-12T10:00:00.000Z" }
```

`id` identifica el almacén entre equipos. Conectar un almacén a otro sitio compara este identificador (diseño §8.4).

### 2.2 `revisions/<id>.json` — [esquema](formato/schemas/v1/revision.schema.json)

Una revisión es una instantánea inmutable de un documento:

```json
{
  "schemaVersion": 1,
  "id": "UUID de la revisión",
  "documentId": "UUID del documento",
  "parentIds": ["revisiones que el dispositivo conocía al editar"],
  "deviceId": "UUID del dispositivo",
  "createdAt": "ISO 8601 UTC (informativa, no decide precedencia)",
  "operation": "save | delete | restore | resolve | external",
  "metadata": { "kind": "note | canvas | folder", "title": "…", "folderId": null, "tags": [], "deleted": false },
  "contentRefs": { "body": "sha256 | null", "extensions": "sha256 | null", "assets": ["sha256"] }
}
```

- `body` es una nota (`objects/<hash>.md`) o una escena (`objects/<hash>.excalidraw`), según `metadata.kind`.
- `extensions` es el sidecar del lienzo (`objects/<hash>.json`).
- `assets` son los archivos de `assets/`.
- `operation: "delete"` envía el documento a la papelera y conserva el contenido.

### 2.3 Notas Markdown (`objects/<hash>.md` y `readable/…`)

Texto UTF-8 con frontmatter. El hash se calcula sobre los bytes exactos, sin normalizar.

```markdown
---
schema_version: 1
id: 8b53f815-9d38-4313-a1ad-cb690fabf23c
title: "Ideas de arquitectura"
tags: ["idea", "sistema"]
---
# Ideas de arquitectura

Ver [Mapa principal](mindnote://document/UUID-del-mapa).
```

- **Frontmatter.** Es un subconjunto de YAML: claves simples, valores de texto escritos como cadenas JSON y listas en línea. Las claves desconocidas se conservan textualmente al volver a guardar.
- **Enlaces internos.** Usan `mindnote://document/<UUID>[#elemento]` y apuntan siempre al identificador, nunca al título (RN-01, RN-02).
- **Títulos.** Cambiar el título crea una revisión nueva con el frontmatter actualizado; el cuerpo no cambia.

### 2.4 Escenas (`objects/<hash>.excalidraw`)

Son el JSON `.excalidraw` del motor fijado (`"type": "excalidraw", "version": 2`), con una única diferencia: el `dataURL` de cada archivo de `files` se sustituye por `mindnote-asset:<sha256>`, y los bytes están en `assets/<sha256>.<extensión>`.

Para abrir la escena en Excalidraw hay que volver a incrustar cada archivo como `data:<mimeType>;base64,…`. La exportación `.excalidraw` autocontenida (plan 5.2) lo hará de forma automática.

### 2.5 Sidecar del lienzo (`objects/<hash>.json`) — [esquema](formato/schemas/v1/canvas-extensions.schema.json)

Es la autoridad para enlaces de elementos, ramas, notas incrustadas y conectores sueltos. Está indexado por el id de elemento del motor.

La aplicación lo vuelve a derivar en cada guardado del lienzo:

- `elementLinks` recoge los enlaces `mindnote://document/<UUID>[#elemento]` de los elementos vivos.
- `danglingConnectorIds` recoge las flechas que perdieron un extremo porque su nodo se borró.
- `mindMap` y `noteEmbeds` se conservan tal cual.

Las carpetas son revisiones con `metadata.kind: "folder"` y sin contenido (`contentRefs.body: null`). Un documento las referencia con `metadata.folderId`.

El `customData` del motor no es una fuente fiable: el motor lo copia al duplicar y al pegar (fase 0, prueba 0.3).

### 2.6 `heads/<deviceId>.json` — [esquema](formato/schemas/v1/heads.schema.json)

Guarda las cabezas vigentes por documento según un dispositivo. Es reconstruible: una revisión es cabeza si ninguna otra revisión del mismo documento la incluye en `parentIds` y no ha sido retirada por un control. **Dos cabezas o más indican un conflicto.** Ambas versiones se conservan hasta que el propietario lo resuelve.

### 2.7 `catalog.json` — [esquema](formato/schemas/v1/catalog.schema.json)

Recoge el título, el tipo, la carpeta, las etiquetas y las cabezas de cada documento, para listar el almacén sin leer todas las revisiones. Lo genera cada dispositivo; si no hay un único escritor, lleva el nombre del dispositivo.

### 2.8 `controls/<id>.json` — [esquema](formato/schemas/v1/version-prune.schema.json)

Órdenes explícitas `VersionPrune` para retirar versiones (diseño §7.2). Un equipo las aplica antes de subir revisiones antiguas, para no resucitar una versión eliminada. La aplicación nunca borra versiones de forma automática (RN-13).

### 2.9 `backup-manifest.json` — [esquema](formato/schemas/v1/backup-manifest.schema.json)

Solo existe en la copia completa (ZIP). Lista la ruta, el tamaño y el SHA-256 de cada archivo, para verificar la restauración (diseño §12.2).

## 3. Cómo leer un almacén sin la aplicación

1. Leer `vault.json` y comprobar que `formatVersion` es 1.
2. Leer todas las revisiones de `revisions/`. Descartar las que tengan un objeto ausente o un hash distinto y las retiradas por `controls/`.
3. Para cada `documentId`, quedarse con las cabezas (§2.6). Si hay una sola, esa es la versión vigente. Si hay varias, todas son vigentes y están en conflicto.
4. El contenido vigente de una nota está en `objects/<contentRefs.body>.md`, o en la copia legible `readable/<docId>/<revId>.md`. El de un lienzo está en `objects/<contentRefs.body>.excalidraw` y sus `assets/`.
5. Un documento cuya cabeza tiene `metadata.deleted: true` está en la papelera, no borrado.

## 4. Versiones y compatibilidad

Cada archivo lleva su propia versión: `formatVersion` en `vault.json`, `schemaVersion` en las revisiones y el sidecar, `schema_version` en el frontmatter y `version` en la escena.

| Situación al leer | Comportamiento de la aplicación |
| --- | --- |
| Versión conocida y contenido válido | Edición normal |
| Versión posterior a la soportada (revisión, frontmatter, sidecar o escena) | Se abre en **solo lectura** con aviso; nada se guarda encima |
| Contenido que no cumple su esquema | Solo lectura con aviso «contenido inválido» y entrada en el diagnóstico |
| `formatVersion` del almacén desconocida | El almacén no se abre; se ofrece un almacén temporal sin tocar el original |

- **Migraciones.** Son versionadas, idempotentes y verificables. Antes de migrar se conservan los bytes originales (diseño §14.4).
- **Independencia.** La versión de la app, la del formato, la del sidecar y la del esquema Excalidraw son independientes.

## 5. Lo que no forma parte del formato

Las tablas operativas de IndexedDB no se exportan ni deciden nada sobre el contenido:

- índices de búsqueda, enlaces e historial;
- cola de salida;
- estado del dispositivo y diagnóstico.

Tampoco se incluyen nunca tokens ni permisos del navegador.

## 6. Representación en Google Drive

En Drive el árbol es el mismo, dentro de una carpeta de «Mi unidad» llamada `Aline - <nombre del almacén>`. Drive admite nombres repetidos, así que la aplicación no localiza los archivos por su ruta. Los localiza por sus `appProperties` (propiedades privadas de la aplicación):

| Archivo | `mindnote` | Otras propiedades |
| --- | --- | --- |
| Carpeta raíz | `vault` | `vaultId` |
| `vault.json` | `vault-json` | `vaultId` |
| Subcarpetas (`revisions`, `readable/<doc>`…) | `dir` | `vaultId`, `path` |
| `revisions/<id>.json` | `revision` | `vaultId`, `revisionId`, `documentId`, `operationId` |
| `objects/…` y `assets/…` | `object` | `vaultId`, `hash`, `operationId` |
| `controls/<id>.json` | `control` | `vaultId`, `controlId` |
| `readable/<doc>/<rev>.md` | `readable` | `vaultId`, `documentId`, `revisionId` |
| `heads/…`, `catalog.json`, `README.md` | `index` | `vaultId`, `path` |

- Un mismo objeto o revisión puede aparecer duplicado si dos equipos lo suben a la vez. Las copias son idénticas, porque el nombre es el hash o el id, y cualquiera vale.
- Los archivos descargados de Drive (o con Google Drive para ordenador) forman un almacén legible según §3, igual que una carpeta local.
- La aplicación solo tiene el permiso `drive.file`: ve los archivos que creó ella. Un archivo añadido a mano en la carpeta no se lee.

## 7. Almacén cifrado en Google Drive

Opcional (diseño §13.1). Mismo árbol que §6, con estas diferencias:

- La carpeta raíz se llama `Aline - <nombre> (cifrado)` y lleva `appProperties.encrypted = "true"`.
- `vault.json` y `README.md` quedan sin cifrar.
- `encryption.json` ([esquema](formato/schemas/v1/encryption.schema.json)) guarda la clave del almacén (32 bytes) envuelta dos veces, una con la contraseña (`kind: "password"`) y otra con el código de recuperación (`kind: "recovery"`). Para cada ranura:
  1. clave de envoltura = PBKDF2-SHA256(secreto en UTF-8, `salt`, `iterations`), 256 bits. El código de recuperación se normaliza antes: mayúsculas, sin espacios ni guiones, O→0 e I/L→1;
  2. clave del almacén = AES-256-GCM-descifrar(`wrappedKey`, IV = `iv`, datos autenticados = `mindnote-key|<vaultId>|<kind>`).
- Claves derivadas, con HKDF-SHA256, sal de 32 bytes a cero y la clave del almacén como material:
  - contenido: `info = "mindnote-content-aes-gcm-v1"` (AES-256-GCM);
  - nombres de objetos: `info = "mindnote-object-id-hmac-v1"` (HMAC-SHA256).
- Cada archivo cifrado (`.bin`) es: `MNE1` (4 bytes) + IV (12 bytes) + texto cifrado AES-256-GCM con su etiqueta de 16 bytes. Los datos autenticados son `<vaultId>|<ámbito>|<id>`:

| Archivo | Ámbito | id | Contenido descifrado |
| --- | --- | --- | --- |
| `revisions/<revisionId>.bin` | `revision` | id de la revisión | JSON de la revisión (§2.2) |
| `objects/<HMAC(hash)>.bin` | `object` | SHA-256 del contenido | 2 bytes (longitud del tipo MIME, big-endian) + tipo MIME + bytes del objeto |
| `controls/<id>.bin` | `control` | id del control | JSON del control (§2.8) |
| `heads/<deviceId>.bin`, `catalog.bin` | `index` | ruta `heads/<deviceId>.json` o `catalog.json` | JSON del índice (§2.6, §2.7) |

- No hay `readable/` ni `assets/`: los adjuntos son objetos.
- Para leerlo sin la aplicación: descifrar cada archivo con las reglas anteriores y seguir §3. El SHA-256 de cada objeto descifrado debe coincidir con el hash que cita la revisión.
