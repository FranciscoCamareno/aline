import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import { parseRichDoc } from '../../src/domain/richDoc.ts';
import { CommentMark, commentRanges } from '../../src/features/docs/comments.ts';
import { PAGE, planPages } from '../../src/features/docs/pagination.ts';

describe('paginación de la vista «Hoja» (fase 8.3)', () => {
  const block = (pos: number, top: number, height = 20) => ({ pos, top, height });

  it('pasa a la página siguiente el primer bloque que no cabe, con su relleno', () => {
    const plan = planPages([block(0, 0), block(10, 30), block(20, 90)], 100);
    expect(plan.pages).toBe(2);
    expect(plan.breaks).toEqual([
      { pos: 20, fill: 10, page: 1, height: 10 + PAGE.marginBottom + PAGE.gap + PAGE.marginTop },
    ]);
    // La segunda página empieza en el bloque movido: su final está a 90 + 100.
    expect(plan.endFill).toBe(190 - 110);
  });

  it('un bloque más alto que una página no se parte ni se mueve: ocupa varias', () => {
    // Ocupa tres páginas (hasta 300); lo que cabe detrás sigue en la tercera.
    expect(planPages([block(0, 0, 250), block(10, 260)], 100)).toMatchObject({
      breaks: [],
      pages: 3,
    });
    // Lo que ya no cabe pasa a la cuarta.
    const plan = planPages([block(0, 0, 250), block(10, 290)], 100);
    expect(plan.breaks.map((b) => b.pos)).toEqual([10]);
    expect(plan.pages).toBe(4);
  });

  it('un documento que cabe en una página no tiene saltos', () => {
    const plan = planPages([block(0, 0), block(10, 40)], 100);
    expect(plan).toEqual({ breaks: [], endFill: 40, pages: 1 });
  });
});

describe('comentarios de los documentos con formato (fase 8.3)', () => {
  const schema = getSchema([StarterKit, CommentMark]);
  const doc = Node.fromJSON(schema, {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hola ' },
          { type: 'text', text: 'mundo', marks: [{ type: 'comment', attrs: { id: 'c1' } }] },
          {
            type: 'text',
            text: ' feliz',
            marks: [
              { type: 'bold' },
              { type: 'comment', attrs: { id: 'c1' } },
              { type: 'comment', attrs: { id: 'c2' } },
            ],
          },
          { type: 'text', text: ' y más' },
        ],
      },
    ],
  });

  it('agrupa el texto contiguo de un hilo y admite comentarios solapados', () => {
    const ranges = commentRanges(doc);
    const text = (r: { from: number; to: number }) => doc.textBetween(r.from, r.to);
    expect(ranges.map((r) => [r.id, text(r)])).toEqual([
      ['c1', 'mundo feliz'],
      ['c2', ' feliz'],
    ]);
  });

  it('el esquema valida los hilos y un id raro deja el documento en solo lectura', () => {
    const base = { schemaVersion: 1, content: { type: 'doc', content: [] } };
    const comment = { id: 'c1', text: 'Revisar', createdAt: '2026-10-17T10:00:00.000Z' };
    expect(parseRichDoc({ ...base, comments: [comment] }).readOnly).toBeNull();
    expect(parseRichDoc({ ...base, comments: [{ ...comment, id: 'con espacio' }] }).readOnly).toBe(
      'invalid-content',
    );
  });

  it('los hilos se guardan con el documento y desaparecen del JSON cuando no quedan', async () => {
    const db = new VaultDatabase(`docs-avanzados-${crypto.randomUUID()}`);
    const repo = new DexieVaultRepository(db);
    await repo.init();
    const service = new VaultService(repo);
    const created = await service.createRichDoc('Guion');
    const opened = await service.openRichDoc(created.id);
    const comments = [
      {
        id: 'c1',
        text: 'Revisar',
        createdAt: '2026-10-17T10:00:00.000Z',
        replies: [{ id: 'r1', text: 'Hecho', createdAt: '2026-10-17T11:00:00.000Z' }],
      },
    ];
    await service.saveRichDoc(opened.session, opened.doc.content, { ...opened.doc, comments });
    expect((await service.openRichDoc(created.id)).doc.comments).toEqual(comments);
    const again = await service.openRichDoc(created.id);
    const withoutComments = { ...again.doc };
    delete withoutComments.comments;
    await service.saveRichDoc(again.session, again.doc.content, withoutComments);
    expect('comments' in (await service.openRichDoc(created.id)).doc).toBe(false);
  });
});
