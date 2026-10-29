import { describe, expect, it } from 'vitest';
import { homeItems, homeRecent, moveTargets } from '../../src/application/home.ts';
import type { DocumentRecord } from '../../src/domain/revision.ts';

let n = 0;
function doc(
  partial: Partial<DocumentRecord> & Pick<DocumentRecord, 'kind' | 'title'>,
): DocumentRecord {
  n++;
  return {
    id: partial.id ?? `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    folderId: null,
    tags: [],
    deleted: false,
    headRevisionIds: [],
    generation: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: `2026-10-${String(10 + n).padStart(2, '0')}T00:00:00.000Z`,
    ...partial,
  };
}

const notes = doc({ kind: 'folder', title: 'Ideas' });
const docsFolder = doc({ kind: 'docfolder', title: 'Guiones' });
const canvas = doc({ kind: 'canvas', title: 'Mapa' });
const note = doc({ kind: 'note', title: 'Apunte', folderId: notes.id });
const rich = doc({ kind: 'doc', title: 'Informe', folderId: docsFolder.id });
const md = doc({ kind: 'mddoc', title: 'Borrador' });
const calendar = doc({ kind: 'calendar', title: 'Personal' });
const archived = doc({ kind: 'note', title: 'Viejo', archived: true });
const trashed = doc({ kind: 'canvas', title: 'Borrado', deleted: true });
const template = doc({ kind: 'template', title: 'Plantilla' });
const orphan = doc({
  kind: 'note',
  title: 'Huérfana',
  folderId: '99999999-9999-4999-8999-999999999999',
});
const all = [
  notes,
  docsFolder,
  canvas,
  note,
  rich,
  md,
  calendar,
  archived,
  trashed,
  template,
  orphan,
];

const options = { folderId: null, query: '', filter: 'all', sort: 'modified' } as const;

describe('Inicio (plan 11)', () => {
  it('la raíz junta las carpetas de las dos secciones y lo suelto, carpetas primero', () => {
    expect(homeItems(all, options).map((d) => d.title)).toEqual([
      'Guiones',
      'Ideas',
      'Huérfana',
      'Personal',
      'Borrador',
      'Mapa',
    ]);
  });

  it('dentro de una carpeta, lo suyo; por nombre si se pide', () => {
    expect(homeItems(all, { ...options, folderId: notes.id }).map((d) => d.title)).toEqual([
      'Apunte',
    ]);
    expect(homeItems(all, { ...options, sort: 'name' }).map((d) => d.title)).toEqual([
      'Guiones',
      'Ideas',
      'Borrador',
      'Huérfana',
      'Mapa',
      'Personal',
    ]);
  });

  it('la búsqueda mira todo el almacén por título; el filtro, por tipo', () => {
    expect(homeItems(all, { ...options, query: 'INFOR' }).map((d) => d.title)).toEqual(['Informe']);
    expect(homeItems(all, { ...options, query: 'o', filter: 'docs' }).map((d) => d.title)).toEqual([
      'Borrador',
      'Informe',
    ]);
    expect(homeItems(all, { ...options, filter: 'folders' }).map((d) => d.kind)).toEqual([
      'docfolder',
      'folder',
    ]);
  });

  it('recientes: lo último modificado, sin carpetas ni calendarios', () => {
    expect(homeRecent(all, 3).map((d) => d.title)).toEqual(['Huérfana', 'Borrador', 'Informe']);
  });

  it('mover: solo a carpetas de su sección, sin mezclar secciones ni crear ciclos', () => {
    expect(moveTargets(all, [canvas, note])!.map((d) => d.title)).toEqual(['Ideas']);
    expect(moveTargets(all, [rich])!.map((d) => d.title)).toEqual(['Guiones']);
    expect(moveTargets(all, [canvas, rich])).toBeNull();
    expect(moveTargets(all, [calendar])).toBeNull();
    expect(moveTargets(all, [notes])).toEqual([]);
  });
});
