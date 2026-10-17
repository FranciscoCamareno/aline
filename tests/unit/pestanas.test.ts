import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { extractRichDoc } from '../../src/application/knowledge.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import {
  assembleRichDoc,
  docTabs,
  MAIN_TAB_ID,
  parseRichDoc,
  richDocProjection,
  type RichDocData,
} from '../../src/domain/richDoc.ts';
import { buildDocx } from '../../src/features/docs/exportDocx.ts';
import { commentIdsIn, withoutCommentsAndAnchors } from '../../src/features/docs/comments.ts';
import { sha256Hex } from '../../src/shared/hash.ts';

const paragraph = (
  text: string,
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>,
) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] }],
});

describe('pestañas de los documentos con formato (formato §2.5.3)', () => {
  it('un documento sin pestañas tiene una sola, la principal, con el contenido raíz', () => {
    const doc: RichDocData = { schemaVersion: 1, content: paragraph('Uno') };
    expect(docTabs(doc)).toEqual([
      { id: MAIN_TAB_ID, title: '', content: doc.content, main: true },
    ]);
    // Al guardarlo igual, no aparece la clave `tabs`.
    expect('tabs' in assembleRichDoc(doc, docTabs(doc), MAIN_TAB_ID, [])).toBe(false);
  });

  it('la principal va al contenido raíz y las demás llevan el suyo; la ida y vuelta conserva todo', () => {
    const base: RichDocData = { schemaVersion: 1, content: paragraph('vacío'), extra: 'x' };
    const assembled = assembleRichDoc(
      base,
      [
        { id: 'a', title: 'Notas', content: paragraph('Segunda') },
        { id: 'b', title: 'Guion', content: paragraph('Principal') },
      ],
      'b',
      [],
    );
    expect(assembled.content).toEqual(paragraph('Principal'));
    expect(assembled.tabs).toEqual([
      { id: 'a', title: 'Notas', content: paragraph('Segunda') },
      { id: 'b', title: 'Guion' },
    ]);
    expect(assembled['extra']).toBe('x');
    const parsed = parseRichDoc(assembled);
    expect(parsed.readOnly).toBeNull();
    expect(docTabs(parsed.doc).map((t) => [t.id, t.main])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('sin una única principal o con ids repetidos, el documento es inválido (solo lectura)', () => {
    const base = { schemaVersion: 1, content: paragraph('x') };
    expect(
      parseRichDoc({
        ...base,
        tabs: [
          { id: 'a', title: '' },
          { id: 'b', title: '' },
        ],
      }).readOnly,
    ).toBe('invalid-content');
    expect(
      parseRichDoc({
        ...base,
        tabs: [
          { id: 'a', title: '' },
          { id: 'a', title: '', content: paragraph('y') },
        ],
      }).readOnly,
    ).toBe('invalid-content');
  });

  it('el índice ve el texto y los enlaces de todas las pestañas', () => {
    const target = '8b53f815-9d38-4313-a1ad-cb690fabf23c';
    const doc = assembleRichDoc(
      { schemaVersion: 1, content: paragraph('') },
      [
        { id: 'main', title: 'Uno', content: paragraph('Primera pestaña') },
        {
          id: 't2',
          title: 'Dos',
          content: paragraph('enlace', [
            { type: 'link', attrs: { href: `aline://document/${target}` } },
          ]),
        },
      ],
      'main',
      [],
    );
    expect(richDocProjection(doc).text).toBe('Primera pestaña\nenlace');
    const extracted = extractRichDoc(JSON.stringify(doc));
    expect(extracted.links.map((l) => l.targetDocumentId)).toEqual([target]);
  });

  it('duplicar una pestaña no se lleva sus comentarios ni sus anclas', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { anchor: 'p1', textAlign: null },
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'comment', attrs: { id: 'c1' } }, { type: 'bold' }],
            },
          ],
        },
      ],
    };
    expect(commentIdsIn(content)).toEqual(new Set(['c1']));
    const copy = withoutCommentsAndAnchors(content);
    expect(commentIdsIn(copy).size).toBe(0);
    expect(JSON.stringify(copy)).not.toContain('anchor');
    expect(JSON.stringify(copy)).toContain('"bold"');
  });

  it('las imágenes de cualquier pestaña se guardan con el documento', async () => {
    const db = new VaultDatabase(`pestanas-${crypto.randomUUID()}`);
    const repo = new DexieVaultRepository(db);
    await repo.init();
    const service = new VaultService(repo);
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const hash = await sha256Hex(bytes);
    const created = await service.createRichDoc('Guion');
    const opened = await service.openRichDoc(created.id);
    const doc = assembleRichDoc(
      opened.doc,
      [
        { id: 'main', title: '', content: paragraph('Uno') },
        {
          id: 't2',
          title: 'Imágenes',
          content: {
            type: 'doc',
            content: [{ type: 'image', attrs: { src: `mindnote-asset:${hash}` } }],
          },
        },
      ],
      'main',
      [],
    );
    const saved = await service.saveRichDoc(opened.session, doc.content, doc, [
      { hash, mimeType: 'image/png', bytes },
    ]);
    expect(saved.revision.contentRefs.assets).toEqual([hash]);
    const back = await service.openRichDoc(created.id);
    expect(docTabs(back.doc).map((t) => t.title)).toEqual(['', 'Imágenes']);
  });

  it('a Word: cada pestaña empieza en página nueva con su título', async () => {
    const doc = assembleRichDoc(
      { schemaVersion: 1, content: paragraph('') },
      [
        { id: 'main', title: '', content: paragraph('Texto uno') },
        { id: 't2', title: 'Anexo', content: paragraph('Texto dos') },
      ],
      'main',
      [],
    );
    const { Packer } = await import('docx');
    const built = await buildDocx(doc, {
      title: 'Guion',
      tabLabel: (n) => `Pestaña ${n}`,
      image: async () => null,
    });
    const xml = strFromU8(
      unzipSync(new Uint8Array(await Packer.toBuffer(built)))['word/document.xml']!,
    );
    expect(xml).toContain('Pestaña 1');
    expect(xml).toContain('Anexo');
    expect(xml).toContain('<w:pageBreakBefore/>');
    expect(xml.indexOf('Texto uno')).toBeLessThan(xml.indexOf('Texto dos'));
  });
});
