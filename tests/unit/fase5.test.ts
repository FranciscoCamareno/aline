import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import type { ImportError } from '../../src/application/portability.ts';
import {
  analyzeExcalidraw,
  EXPORT_PIXEL_BUDGET,
  excalidrawExportLosses,
  fitsBudget,
  folderPaths,
  markdownToNote,
  markdownTree,
  maxScale,
  MAX_IMPORT_ELEMENTS,
  planPdf,
  rasterSize,
  safeFilename,
} from '../../src/application/portability.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { parseNoteMarkdown } from '../../src/domain/frontmatter.ts';
import type { DocumentRecord } from '../../src/domain/revision.ts';

async function freshService() {
  const repo = new DexieVaultRepository(new VaultDatabase(`f5-${crypto.randomUUID()}`));
  await repo.init();
  return { repo, service: new VaultService(repo) };
}

describe('exportación (RF-33, FA-05a, diseño §12.1)', () => {
  it('calcula el raster y nunca acepta uno que no quepa en memoria', () => {
    const bounds = { width: 1000, height: 500 };
    expect(rasterSize(bounds, 2)).toEqual({ width: 2040, height: 1040 });
    expect(fitsBudget(bounds, 2)).toBe(true);
    const huge = { width: 20_000, height: 10_000 };
    expect(fitsBudget(huge, 1)).toBe(false);
    const max = maxScale(huge);
    expect(max).toBeGreaterThan(0);
    expect(fitsBudget(huge, max)).toBe(true);
    const r = rasterSize(huge, max);
    expect(r.width * r.height).toBeLessThanOrEqual(EXPORT_PIXEL_BUDGET);
  });

  it('el PDF encaja en una página o pagina sin perder ninguna franja', () => {
    const fit = planPdf({ width: 3000, height: 1000 }, 'fit');
    expect(fit.orientation).toBe('landscape');
    expect(fit.pages).toHaveLength(1);
    const page = fit.pages[0]!;
    expect(page.x).toBeGreaterThanOrEqual(10);
    expect(page.x + page.w).toBeLessThanOrEqual(fit.pageWidth - 10 + 1e-9);

    const tall = planPdf({ width: 800, height: 10_000 }, 'paginate');
    expect(tall.orientation).toBe('portrait');
    expect(tall.pages.length).toBeGreaterThan(1);
    // Las franjas son contiguas y cubren todo el alto.
    let y = 0;
    for (const tile of tall.pages) {
      expect(tile.sy).toBe(y);
      expect(tile.h).toBeLessThanOrEqual(tall.pageHeight - 20 + 1e-9);
      y += tile.sh;
    }
    expect(y).toBe(10_000);
  });

  it('nombres de archivo válidos en Windows e iPad', () => {
    expect(safeFilename('Plan: fase 5 / beta?', 'png')).toBe('Plan_ fase 5 _ beta_.png');
    expect(safeFilename('con', 'md')).toBe('_con.md');
    expect(safeFilename('  ...  ', 'pdf')).toBe('sin-titulo.pdf');
    expect(safeFilename('Mapa ñandú. ', 'svg')).toBe('Mapa ñandú.svg');
  });

  it('lista lo que .excalidraw no conserva (RF-45, CA-30)', () => {
    const losses = excalidrawExportLosses([
      { link: 'mindnote://document/0b8f6a8e-6a4f-4c7e-9c55-0e8d36b2c111' },
      { link: 'https://example.com' },
      { link: 'mindnote://document/0b8f6a8e-6a4f-4c7e-9c55-0e8d36b2c111', isDeleted: true },
      { link: null },
    ]);
    expect(losses).toEqual([
      { loss: 'internal-links', count: 1 },
      { loss: 'product-semantics', count: 0 },
    ]);
  });
});

describe('importar .excalidraw (RF-34, CA-18)', () => {
  const scene = (elements: unknown[], files: Record<string, unknown> = {}, type = 'excalidraw') =>
    JSON.stringify({
      type,
      version: 2,
      elements,
      appState: { viewBackgroundColor: '#fff' },
      files,
    });

  it('importa lo soportado y lista lo que no, con su motivo', () => {
    const text = scene(
      [
        { id: 'a', type: 'rectangle' },
        { id: 'b', type: 'text', text: 'hola' },
        { id: 'c', type: 'arrow' },
        { id: 'd', type: 'embeddable', link: 'https://youtube.com/x' },
        { id: 'e', type: 'iframe' },
        { id: 'f', type: 'hologram' },
        { id: 'g', type: 'image', fileId: 'ok' },
        { id: 'h', type: 'image', fileId: 'remote' },
        { id: 'i', type: 'ellipse', isDeleted: true },
      ],
      {
        ok: { mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA', created: 1 },
        remote: { mimeType: 'image/png', dataURL: 'https://example.com/a.png', created: 1 },
      },
    );
    const result = analyzeExcalidraw(text, text.length);
    expect(result.elements.map((e) => e['id'])).toEqual(['a', 'b', 'c', 'g', 'h']);
    expect(Object.keys(result.files)).toEqual(['ok']);
    expect(result.issues).toEqual([
      { issue: 'embedded-web-content', count: 2, types: ['embeddable', 'iframe'] },
      { issue: 'unknown-element', count: 1, types: ['hologram'] },
      { issue: 'missing-image', count: 1 },
      { issue: 'remote-image', count: 1 },
      { issue: 'deleted-elements', count: 1 },
    ]);
  });

  it('rechaza lo que no es un lienzo o supera los límites', () => {
    const reason = (text: string, size = text.length) => {
      try {
        analyzeExcalidraw(text, size);
        return null;
      } catch (e) {
        return (e as ImportError).reason;
      }
    };
    expect(reason('no es json')).toBe('not-excalidraw');
    expect(reason(JSON.stringify({ type: 'otra cosa', elements: [] }))).toBe('not-excalidraw');
    expect(reason(scene([], {}, 'excalidrawlib'))).toBe('library');
    expect(reason(scene([]), 200 * 1024 * 1024)).toBe('too-large');
    const many = Array.from({ length: MAX_IMPORT_ELEMENTS + 1 }, (_, i) => ({
      id: `${i}`,
      type: 'line',
    }));
    expect(reason(scene(many))).toBe('too-many-elements');
  });
});

describe('Markdown (RF-35)', () => {
  it('convierte archivos Markdown en notas con título, etiquetas y avisos', () => {
    const own = markdownToNote(
      'otra.md',
      '---\nschema_version: 1\nid: 11111111-1111-4111-8111-111111111111\ntitle: "Mi nota"\ntags: ["a", "b"]\n---\n\nCuerpo [[Otra]]\n',
    );
    expect(own).toMatchObject({ title: 'Mi nota', tags: ['a', 'b'], droppedKeys: [] });
    expect(own.body).toBe('Cuerpo [[Otra]]\n');

    const obsidian = markdownToNote('Idea suelta.md', '---\ntags: [x]\naliases: [y]\n---\nTexto');
    expect(obsidian).toMatchObject({ title: 'Idea suelta', tags: ['x'], droppedKeys: ['aliases'] });

    const plain = markdownToNote('﻿sin frontmatter.markdown', '﻿# Hola\n');
    expect(plain.body).toBe('# Hola\n');

    const broken = markdownToNote('rota.md', '---\ntags:\n  - a\n---\nTexto');
    expect(broken.frontmatterAsText).toBe(true);
    expect(broken.body).toContain('tags:'); // nada se pierde
  });

  it('crea las carpetas de una importación en orden padre → hijo', () => {
    expect(folderPaths(['a.md', 'x/b.md', 'x/y/c.md', 'z/y/d.md'])).toEqual([
      'x',
      'z',
      'x/y',
      'z/y',
    ]);
  });

  it('exporta el árbol de carpetas con nombres únicos y lo huérfano en «Recuperados»', () => {
    const doc = (
      id: string,
      kind: DocumentRecord['kind'],
      title: string,
      folderId: string | null,
      deleted = false,
    ): DocumentRecord =>
      ({
        id,
        kind,
        title,
        folderId,
        deleted,
        tags: [],
        headRevisionIds: [],
        updatedAt: '',
      }) as unknown as DocumentRecord;
    const docs = [
      doc('f1', 'folder', 'Proyectos', null),
      doc('f2', 'folder', 'Beta', 'f1'),
      doc('f3', 'folder', 'Borrada', null, true),
      doc('n1', 'note', 'Plan', 'f1'),
      doc('n2', 'note', 'Plan', 'f1'),
      doc('n3', 'note', 'Tareas: hoy', 'f2'),
      doc('n4', 'note', 'Suelta', null),
      doc('n5', 'note', 'Huérfana', 'f3'),
      doc('c1', 'canvas', 'Mapa', 'f1'),
      doc('n6', 'note', 'En papelera', null, true),
      // Sección «Documentos» (plan 9.9): sus carpetas y sus dos tipos de documento.
      doc('df1', 'docfolder', 'Informes', null),
      doc('d1', 'doc', 'Anual', 'df1'),
      doc('m1', 'mddoc', 'Notas sueltas', null),
      doc('d2', 'doc', 'Huérfano', 'f1'), // carpeta de la otra sección: no vale
    ];
    const note = (id: string) => ({ id, kind: 'note' });
    expect([...markdownTree(docs, null)]).toEqual([
      ['Suelta.md', note('n4')],
      ['Proyectos/Plan.md', note('n1')],
      ['Proyectos/Plan (2).md', note('n2')],
      ['Proyectos/Beta/Tareas_ hoy.md', note('n3')],
      ['Recuperados/Huérfana.md', note('n5')],
      ['Documentos/Notas sueltas.md', { id: 'm1', kind: 'mddoc' }],
      ['Documentos/Informes/Anual.md', { id: 'd1', kind: 'doc' }],
      ['Documentos/Recuperados/Huérfano.md', { id: 'd2', kind: 'doc' }],
    ]);
    expect([...markdownTree(docs, 'df1')]).toEqual([['Anual.md', { id: 'd1', kind: 'doc' }]]);
    expect([...markdownTree(docs, 'f1').keys()]).toEqual([
      'Plan.md',
      'Plan (2).md',
      'Beta/Tareas_ hoy.md',
    ]);
  });

  it('importar crea una sola revisión, avisa a los oyentes y exporta lo mismo que guarda', async () => {
    const { repo, service } = await freshService();
    const commits: string[] = [];
    service.onCommit((r) => commits.push(r.document.id));
    const folder = await service.createFolder('Importadas');
    const note = await service.importNote({
      title: 'Importada',
      body: 'Texto con ñ\n',
      tags: ['Tema', 'tema'],
      folderId: folder.id,
    });
    expect(commits).toContain(note.id);
    expect(note).toMatchObject({ folderId: folder.id, tags: ['Tema'] });
    expect(await service.listHistory(note.id)).toHaveLength(1);

    const markdown = await service.exportNoteMarkdown(note.id);
    const parsed = parseNoteMarkdown(markdown);
    expect(parsed.frontmatter).toMatchObject({ id: note.id, title: 'Importada', tags: ['Tema'] });
    expect(parsed.body).toBe('Texto con ñ\n');

    const canvas = await service
      .importCanvas({
        title: 'Lienzo importado',
        canvas: {
          sceneJson: JSON.stringify({ type: 'excalidraw', version: 2, elements: [], files: {} }),
          assets: [{ hash: 'a'.repeat(64), mimeType: 'image/png', bytes: new Uint8Array([1]) }],
        },
      })
      .catch((e: unknown) => e);
    // El repositorio verifica el hash de cada objeto: un asset con hash falso no entra.
    expect(canvas).toBeInstanceOf(Error);
    void repo;
  });
});
