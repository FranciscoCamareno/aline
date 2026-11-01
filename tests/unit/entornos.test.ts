import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import {
  foreignMembers,
  guardPackage,
  packageContent,
  packageFiles,
  planImport,
  readPackageFiles,
} from '../../src/application/workspacePackage.ts';
import { mergeWorkspaces, withMembers, withoutMembers } from '../../src/domain/workspace.ts';
import { openWithPassword, sealWithPassword } from '../../src/shared/crypto.ts';
import { sha256Hex, utf8Encode } from '../../src/shared/hash.ts';

async function fresh() {
  const db = new VaultDatabase(`entornos-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  const { device } = await repo.init();
  return { repo, service: new VaultService(repo), deviceId: device.deviceId };
}

async function writeNote(service: VaultService, id: string, body: string) {
  const opened = await service.openNote(id);
  await service.saveNote(opened.session, body);
}

async function noteBody(service: VaultService, id: string) {
  return (await service.openNote(id)).body;
}

/** Paquete del entorno de `from`, leído como lo leería otro aline. */
async function share(
  from: Awaited<ReturnType<typeof fresh>>,
  workspaceId: string,
  history = false,
) {
  const content = await from.service.exportContent();
  const { workspace } = await from.service.readWorkspace(workspaceId);
  const subset = packageContent(content, workspaceId, workspace.members, { history });
  const files = packageFiles(
    subset,
    {
      workspaceId,
      title: 'Proyecto',
      createdAt: new Date().toISOString(),
      appVersion: 'test',
      history,
    },
    { deviceId: from.deviceId },
  );
  return readPackageFiles(files);
}

describe('entornos de trabajo (plan 12)', () => {
  it('miembros sin repetidos, quitar y unir dos versiones a la vez', () => {
    const base = {
      schemaVersion: 1 as const,
      color: 'agua' as const,
      description: '',
      members: [],
    };
    const a = withMembers(base, ['1', '2', '1']);
    expect(a.members).toEqual(['1', '2']);
    expect(withoutMembers(a, ['1']).members).toEqual(['2']);
    expect(mergeWorkspaces(a, withMembers(base, ['3', '2'])).members).toEqual(['1', '2', '3']);
  });

  it('crear, añadir y, con dos cabezas, unirlas al siguiente cambio', async () => {
    const { repo, service } = await fresh();
    const ws = await service.createWorkspace('Proyecto', 'brote');
    const note = await service.createDocument('note', 'Apunte');
    const canvas = await service.createDocument('canvas', 'Mapa');
    await service.updateWorkspace(ws.id, (w) => withMembers(w, [note.id]));
    // Otro dispositivo añadió el lienzo a la vez: una segunda cabeza.
    const [head] = await repo.getHeads(ws.id);
    const { workspace } = await service.readWorkspace(ws.id);
    const body = utf8Encode(
      JSON.stringify(withMembers({ ...workspace, members: [] }, [canvas.id])),
    );
    const hash = await sha256Hex(body);
    await repo.commit({
      documentId: ws.id,
      kind: 'workspace',
      operation: 'save',
      knownHeads: head!.parentIds,
      metadata: head!.metadata,
      contentRefs: { body: hash, extensions: null, assets: [] },
      blobs: [{ hash, mimeType: 'application/json', byteLength: body.byteLength, bytes: body }],
    });
    expect((await repo.getHeads(ws.id)).length).toBe(2);
    expect((await service.readWorkspace(ws.id)).workspace.members.sort()).toEqual(
      [note.id, canvas.id].sort(),
    );
    await service.updateWorkspace(ws.id, (w) => ({ ...w, description: 'Para el equipo' }));
    expect((await repo.getHeads(ws.id)).length).toBe(1);
    const after = await service.readWorkspace(ws.id);
    expect(after.workspace.members.sort()).toEqual([note.id, canvas.id].sort());
    expect(after.workspace.description).toBe('Para el equipo');
  });

  it('el paquete lleva el entorno, sus documentos y sus carpetas; por defecto, sin historial', async () => {
    const a = await fresh();
    const folder = await a.service.createFolder('Ideas', null, 'folder');
    const note = await a.service.createDocument('note', 'Apunte', folder.id);
    await writeNote(a.service, note.id, 'uno');
    await writeNote(a.service, note.id, 'dos');
    const fuera = await a.service.createDocument('note', 'Privada');
    const ws = await a.service.createWorkspace('Proyecto', 'agua');
    await a.service.updateWorkspace(ws.id, (w) => withMembers(w, [note.id]));

    const pkg = await share(a, ws.id);
    expect(pkg.problems).toEqual([]);
    const ids = pkg.content.documents.map((d) => d.id);
    expect(ids.sort()).toEqual([ws.id, note.id, folder.id].sort());
    expect(ids).not.toContain(fuera.id);
    // Una versión por documento.
    expect(pkg.content.revisions.filter((r) => r.documentId === note.id)).toHaveLength(1);
    const full = await share(a, ws.id, true);
    expect(full.content.revisions.filter((r) => r.documentId === note.id).length).toBeGreaterThan(
      2,
    );
  });

  it('importar, actualizar con un paquete nuevo y quedar en conflicto si se cambió aquí', async () => {
    const a = await fresh();
    const note = await a.service.createDocument('note', 'Apunte');
    await writeNote(a.service, note.id, 'versión 1');
    const ws = await a.service.createWorkspace('Proyecto', 'agua');
    await a.service.updateWorkspace(ws.id, (w) => withMembers(w, [note.id]));

    const b = await fresh();
    const first = await share(a, ws.id);
    expect(
      planImport(await b.service.listDocuments(), first.content, new Map(), new Set()).map(
        (p) => p.action,
      ),
    ).toEqual(['new', 'new']);
    expect(await b.service.importPackageVersions(first.content)).toEqual({
      created: 2,
      updated: 0,
      conflicts: 0,
      same: 0,
    });
    expect(await noteBody(b.service, note.id)).toBe('versión 1');
    expect((await b.service.readWorkspace(ws.id)).workspace.members).toEqual([note.id]);

    // El mismo paquete otra vez no cambia nada; uno nuevo actualiza encima.
    expect((await b.service.importPackageVersions(first.content)).same).toBe(2);
    await writeNote(a.service, note.id, 'versión 2');
    expect(await b.service.importPackageVersions((await share(a, ws.id)).content)).toEqual({
      created: 0,
      updated: 1,
      conflicts: 0,
      same: 1,
    });
    expect(await noteBody(b.service, note.id)).toBe('versión 2');
    expect(
      (await b.service.listDocuments()).find((d) => d.id === note.id)!.headRevisionIds,
    ).toHaveLength(1);

    // Cambiado aquí y allí: conflicto, sin perder ninguna de las dos.
    await writeNote(b.service, note.id, 'cambio de B');
    await writeNote(a.service, note.id, 'versión 3');
    expect((await b.service.importPackageVersions((await share(a, ws.id)).content)).conflicts).toBe(
      1,
    );
    expect(
      (await b.service.listDocuments()).find((d) => d.id === note.id)!.headRevisionIds,
    ).toHaveLength(2);
  });

  it('un paquete no cambia el tipo de un documento de aquí ni trae otros entornos (seguridad)', async () => {
    const a = await fresh();
    const note = await a.service.createDocument('note', 'Apunte');
    await writeNote(a.service, note.id, 'hola');
    const ws = await a.service.createWorkspace('Proyecto', 'agua');
    await a.service.updateWorkspace(ws.id, (w) => withMembers(w, [note.id]));
    const pkg = await share(a, ws.id, true);
    const noteRecord = pkg.content.documents.find((d) => d.id === note.id)!;

    // Aquí ese id es un lienzo: la nota del paquete no entra, ni sus revisiones.
    const local = [{ ...noteRecord, kind: 'canvas' as const }];
    const guarded = guardPackage(local, pkg.content, ws.id);
    expect(guarded.rejected.map((d) => d.id)).toEqual([note.id]);
    expect(guarded.content.revisions.some((r) => r.documentId === note.id)).toBe(false);
    expect(guarded.content.documents.map((d) => d.id)).toEqual([ws.id]);

    // Un entorno que no es el del paquete, o revisiones sueltas de otro documento, tampoco.
    const other = crypto.randomUUID();
    const stray = { ...pkg.content.revisions[0]!, id: crypto.randomUUID(), documentId: other };
    const forged = guardPackage(
      [],
      { ...pkg.content, revisions: [...pkg.content.revisions, stray] },
      other,
    );
    expect(forged.rejected.map((d) => d.id)).toEqual([ws.id]);
    expect(forged.content.revisions.some((r) => r.documentId === other)).toBe(false);
  });

  it('un paquete no mete en el entorno documentos de aquí que no trae (seguridad)', () => {
    const [shared, privada, nueva, ajena] = [1, 2, 3, 4].map(() => crypto.randomUUID());
    expect(
      foreignMembers(
        [shared!, privada!, nueva!, ajena!],
        { members: new Set([shared!]), localIds: new Set([shared!, privada!]) },
        new Set([nueva!]),
      ),
    ).toEqual([privada]);
  });

  it('cifrado con contraseña: ida y vuelta, y otra contraseña falla', async () => {
    const plain = utf8Encode('contenido del paquete');
    const sealed = await sealWithPassword(plain, 'secreto', 'aline-package', 1000);
    expect(
      new TextDecoder().decode(await openWithPassword(sealed, 'secreto', 'aline-package')),
    ).toBe('contenido del paquete');
    await expect(openWithPassword(sealed, 'otra', 'aline-package')).rejects.toThrow();
  });
});
