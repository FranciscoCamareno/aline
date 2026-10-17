import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { filesToVault, vaultToFiles } from '../../src/application/vaultFormat.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import {
  acceptableDocImage,
  assetHashOf,
  markdownAssetRefs,
  richDocAssetRefs,
} from '../../src/domain/docAssets.ts';
import type { RichDocData } from '../../src/domain/richDoc.ts';
import { buildDocx } from '../../src/features/docs/exportDocx.ts';
import { sha256Hex, utf8Encode } from '../../src/shared/hash.ts';

/** PNG de 1×1 píxel. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

async function fresh() {
  const db = new VaultDatabase(`imagenes-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  return { repo, service: new VaultService(repo) };
}

const imageNode = (hash: string) => ({
  type: 'image',
  attrs: { src: `mindnote-asset:${hash}`, alt: 'portada' },
});

describe('referencias a imágenes de los documentos (fase 8.4)', () => {
  const hash = 'a'.repeat(64);

  it('reconoce las citas válidas y descarta las demás', () => {
    expect(assetHashOf(`mindnote-asset:${hash}`)).toBe(hash);
    expect(assetHashOf('https://example.com/a.png')).toBeNull();
    expect(assetHashOf('mindnote-asset:corto')).toBeNull();
    expect(
      markdownAssetRefs(`![a](mindnote-asset:${hash}) y ![b](mindnote-asset:${hash})`),
    ).toEqual([hash]);
    expect(
      richDocAssetRefs({
        type: 'doc',
        content: [{ type: 'paragraph' }, imageNode(hash), { type: 'image', attrs: { src: 'x' } }],
      }),
    ).toEqual([hash]);
  });

  it('solo admite imágenes PNG, JPEG, GIF o WebP de hasta 10 MB', () => {
    expect(acceptableDocImage({ type: 'image/png', size: 1000 })).toBe(true);
    expect(acceptableDocImage({ type: 'image/svg+xml', size: 1000 })).toBe(false);
    expect(acceptableDocImage({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toBe(false);
  });
});

describe('imágenes guardadas como archivos del almacén', () => {
  it('documento con formato: la nueva se guarda, se conserva sin volver a darla y se suelta al quitarla', async () => {
    const { repo, service } = await fresh();
    const hash = await sha256Hex(PNG);
    const created = await service.createRichDoc('Guion');
    const opened = await service.openRichDoc(created.id);
    const withImage: RichDocData['content'] = { type: 'doc', content: [imageNode(hash)] };
    const first = await service.saveRichDoc(opened.session, withImage, opened.doc, [
      { hash, mimeType: 'image/png', bytes: PNG },
    ]);
    expect(first.revision.contentRefs.assets).toEqual([hash]);
    expect((await service.loadAsset(hash))?.bytes).toEqual(PNG);

    // Otro guardado sin volver a dar los bytes: la imagen sigue citada y se conserva.
    const second = await service.saveRichDoc(
      opened.session,
      { type: 'doc', content: [{ type: 'paragraph' }, imageNode(hash)] },
      opened.doc,
    );
    expect(second.revision.contentRefs.assets).toEqual([hash]);

    // Una cita a una imagen que no existe se ignora en lugar de impedir el guardado.
    const ghost = 'f'.repeat(64);
    const third = await service.saveRichDoc(
      opened.session,
      { type: 'doc', content: [imageNode(ghost)] },
      opened.doc,
    );
    expect(third.revision.contentRefs.assets).toEqual([]);

    // El formato abierto lleva la imagen.
    const files = vaultToFiles(await repo.exportContent(), { deviceId: crypto.randomUUID() });
    expect([...files.keys()].some((name) => name.startsWith(`assets/${hash}`))).toBe(true);
    const back = await filesToVault(files);
    expect(back.problems).toEqual([]);
  });

  it('documento Markdown: guarda las imágenes citadas y una edición externa conserva las que sigue citando', async () => {
    const { service } = await fresh();
    const hash = await sha256Hex(PNG);
    const created = await service.createMarkdownDoc('Escaleta');
    const opened = await service.openNote(created.id);
    const body = `Portada:\n\n![portada](mindnote-asset:${hash})\n`;
    const saved = await service.saveNote(opened.session, body, [
      { hash, mimeType: 'image/png', bytes: PNG },
    ]);
    expect(saved.revision.contentRefs.assets).toEqual([hash]);

    // Renombrar no pierde la imagen.
    const renamed = await service.renameDocument(created.id, 'Escaleta final');
    expect(renamed.revision.contentRefs.assets).toEqual([hash]);

    // Edición externa de la copia legible que mantiene la imagen y añade texto.
    const markdown = await service.exportNoteMarkdown(created.id);
    const id = await service.importExternalNote(
      created.id,
      renamed.revision.id,
      utf8Encode(`${markdown}\nMás texto.\n`),
    );
    expect(id).toBeTruthy();
    const heads = await service.openNote(created.id);
    expect(heads.body).toContain('Más texto.');
    expect((await service.loadAsset(hash))?.mimeType).toBe('image/png');
  });
});

describe('exportar a Word (.docx)', () => {
  it('genera un .docx con títulos, formato, listas, enlaces web e imágenes', async () => {
    const hash = 'b'.repeat(64);
    const doc: RichDocData = {
      schemaVersion: 1,
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Guion' }] },
          {
            type: 'paragraph',
            attrs: { textAlign: 'center' },
            content: [
              { type: 'text', text: 'Escena ' },
              { type: 'text', text: 'uno', marks: [{ type: 'bold' }] },
              { type: 'text', text: ' en ' },
              {
                type: 'text',
                text: 'Lora',
                marks: [
                  { type: 'textStyle', attrs: { fontFamily: '"Lora", serif', fontSize: '20px' } },
                ],
              },
              { type: 'text', text: ' y ' },
              {
                type: 'text',
                text: 'la web',
                marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
              },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punto' }] }],
              },
            ],
          },
          imageNode(hash),
        ],
      },
    };
    const { Packer } = await import('docx');
    const built = await buildDocx(doc, {
      title: 'Guion',
      image: async (h) => (h === hash ? { data: PNG, type: 'png', width: 1, height: 1 } : null),
    });
    const files = unzipSync(new Uint8Array(await Packer.toBuffer(built)));
    const xml = strFromU8(files['word/document.xml']!);
    expect(xml).toContain('Guion');
    expect(xml).toContain('Heading1');
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('w:ascii="Lora"');
    expect(xml).toContain('<w:sz w:val="30"/>');
    expect(xml).toContain('w:hyperlink');
    expect(xml).toContain('<w:numPr>');
    expect(xml).toContain('<w:drawing>');
    expect(Object.keys(files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });
});
