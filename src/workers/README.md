# Trabajadores (pendiente)

Previstos por el diseño (§4, §10.1, §12.2). Ninguno está implementado en esta entrega:

- `search.worker.ts`: índice MiniSearch reconstruible desde las revisiones activas.
- `hash.worker.ts`: SHA-256 fuera del hilo principal. Hoy `src/shared/hash.ts` calcula el hash
  con `crypto.subtle` en el hilo principal, de forma asíncrona y fuera del callback de dibujo.
- `zip.worker.ts`: copia completa del almacén con fflate y `backup-manifest.json`.
