# Historial, papelera y conflictos (pendiente)

El núcleo ya registra cada revisión (`revisions`, `historyIndex`) y conserva varias cabezas
cuando hay conflicto. `DexieVaultRepository.restore` crea una revisión `restore` sin borrar la
reemplazada. Falta la interfaz:

- Lista de versiones desde `historyIndex` sin cargar cuerpos.
- Papelera (`TrashDocument`, `RestoreDocument`).
- Resolución de conflictos (`ResolveConflict`, `VaultRepository.resolve` lanza `not-implemented`).
- Poda explícita de versiones (`PruneVersions`, controles `VersionPrune`).
