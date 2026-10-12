import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseNoteMarkdown, serializeNoteMarkdown } from '../../src/domain/frontmatter.ts';
import { isUuid, newId } from '../../src/domain/ids.ts';
import { dedupeTags, tagKey } from '../../src/domain/tags.ts';
import { createCoalescer } from '../../src/shared/coalesce.ts';

describe('identificadores', () => {
  it('genera UUID válidos', () => {
    expect(isUuid(newId())).toBe(true);
    expect(isUuid('no-es-uuid')).toBe(false);
  });
});

describe('etiquetas', () => {
  it('normaliza NFC, trim y minúsculas para unicidad conservando la visible', () => {
    const composed = 'Ideá'; // "Ideá" con acento combinable
    expect(tagKey(` ${composed} `)).toBe('ideá'.normalize('NFC'));
    expect(dedupeTags(['Idea', ' idea ', 'IDEA', '', 'Sistema'])).toEqual(['Idea', 'Sistema']);
  });
});

describe('frontmatter', () => {
  const id = '8b53f815-9d38-4313-a1ad-cb690fabf23c';

  it('hace ida y vuelta conservando el cuerpo exacto', () => {
    const body =
      '# Ideas\n\nTexto con "comillas", dos puntos: y [enlace](mindnote://document/x).\n';
    const md = serializeNoteMarkdown(
      { schemaVersion: 1, id, title: 'Ideas: "arquitectura"', tags: ['idea', 'sistema'] },
      body,
    );
    const parsed = parseNoteMarkdown(md);
    expect(parsed.invalid).toBe(false);
    expect(parsed.body).toBe(body);
    expect(parsed.frontmatter).toMatchObject({
      id,
      title: 'Ideas: "arquitectura"',
      tags: ['idea', 'sistema'],
      schemaVersion: 1,
    });
  });

  it('lee el formato del diseño con listas sin comillas', () => {
    const md = `---\nschema_version: 1\nid: ${id}\ntitle: Ideas de arquitectura\ntags: [idea, sistema]\n---\n\n# Ideas`;
    const parsed = parseNoteMarkdown(md);
    expect(parsed.frontmatter?.title).toBe('Ideas de arquitectura');
    expect(parsed.frontmatter?.tags).toEqual(['idea', 'sistema']);
    expect(parsed.body).toBe('# Ideas');
  });

  it('conserva claves desconocidas al volver a serializar', () => {
    const md = `---\nschema_version: 1\nid: ${id}\ntitle: "T"\ntags: []\naliases: [a, b]\n---\nCuerpo`;
    const parsed = parseNoteMarkdown(md);
    expect(parsed.frontmatter?.extra).toEqual([['aliases', '[a, b]']]);
    const again = serializeNoteMarkdown(parsed.frontmatter!, parsed.body);
    expect(again).toContain('aliases: [a, b]');
  });

  it('marca un frontmatter inválido y conserva todo el texto', () => {
    const md = '---\n  sangría: rara\n---\nCuerpo';
    const parsed = parseNoteMarkdown(md);
    expect(parsed.invalid).toBe(true);
    expect(parsed.body).toBe(md);
  });

  it('acepta Markdown sin frontmatter', () => {
    expect(parseNoteMarkdown('Hola')).toEqual({ frontmatter: null, body: 'Hola', invalid: false });
  });
});

describe('agrupación de guardados', () => {
  afterEach(() => vi.useRealTimers());

  it('espera 500 ms y guarda solo el último valor', async () => {
    vi.useFakeTimers();
    const saved: number[] = [];
    const c = createCoalescer<number>(async (v) => void saved.push(v));
    c.push(1);
    c.push(2);
    await vi.advanceTimersByTimeAsync(499);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual([2]);
  });

  it('no supera 2 s durante edición continua', async () => {
    vi.useFakeTimers();
    const saved: number[] = [];
    const c = createCoalescer<number>(async (v) => void saved.push(v));
    for (let i = 0; i < 10; i++) {
      c.push(i);
      await vi.advanceTimersByTimeAsync(300);
    }
    // 3 s de pulsaciones cada 300 ms: el límite de 2 s fuerza al menos un guardado intermedio.
    expect(saved.length).toBeGreaterThanOrEqual(1);
    expect(saved[0]).toBeLessThan(9);
  });

  it('flush guarda de inmediato lo pendiente', async () => {
    const saved: string[] = [];
    const c = createCoalescer<string>(async (v) => void saved.push(v));
    c.push('a');
    expect(c.pending).toBe(true);
    await c.flush();
    expect(saved).toEqual(['a']);
    expect(c.pending).toBe(false);
  });
});
