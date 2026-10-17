import { describe, expect, it } from 'vitest';
import { linkFocus, useUiStore } from '../../src/app/store.ts';
import { internalLink, parseInternalLink } from '../../src/domain/links.ts';
import { isLinkableKind, type DocumentRecord } from '../../src/domain/revision.ts';
import { markdownLinkChange } from '../../src/features/notes/markdownLinks.ts';

const DOC = '8b53f815-9d38-4313-a1ad-cb690fabf23c';
const EVENT = '0b8f6a8e-6a4f-4c7e-9c55-0e8d36b2c111';
const url = internalLink(DOC);
const pick = { url, title: 'Plan [beta]' };

/** Aplica el cambio al texto, como haría el editor. */
function apply(source: string, from: number, to: number, p = pick): string {
  const change = markdownLinkChange(source, { from, to }, p);
  return source.slice(0, change.from) + change.insert + source.slice(change.to);
}

describe('enlazar una selección en Markdown (fase 7.B)', () => {
  it('envuelve la selección y conserva su Markdown', () => {
    const source = 'Una **idea** clave.';
    expect(apply(source, 4, 12)).toBe(`Una [**idea**](${url}) clave.`);
  });

  it('deja fuera los espacios de los extremos de la selección', () => {
    expect(apply('Una idea clave', 3, 9)).toBe(`Una [idea](${url}) clave`);
  });

  it('escapa los corchetes sueltos de la selección, no los ya escapados', () => {
    expect(apply('ver [a] y \\[b\\]', 0, 15)).toBe(`[ver \\[a\\] y \\[b\\]](${url})`);
  });

  it('sin selección, o si cruza párrafos, inserta el título escapado al final', () => {
    expect(apply('Texto', 5, 5)).toBe(`Texto[Plan \\[beta\\]](${url})`);
    expect(apply('uno\n\ndos', 0, 8)).toBe(`uno\n\ndos[Plan \\[beta\\]](${url})`);
  });

  it('una dirección web con paréntesis o espacios va entre <>', () => {
    const web = { url: 'https://es.wikipedia.org/wiki/Mapa_(desambiguaci%C3%B3n)', title: 'w' };
    expect(apply('mapa', 0, 4, web)).toBe(
      '[mapa](<https://es.wikipedia.org/wiki/Mapa_(desambiguaci%C3%B3n)>)',
    );
  });

  it('las citas con paréntesis no rompen el destino de un enlace Markdown', () => {
    const link = internalLink(DOC, {
      text: { prefix: '', start: 'texto (con paréntesis)', end: '', suffix: '' },
    });
    expect(link).not.toMatch(/[()]/);
    expect(parseInternalLink(link)?.text?.start).toBe('texto (con paréntesis)');
  });
});

describe('todo enlazable', () => {
  it('notas, lienzos, documentos y calendarios; no carpetas ni plantillas', () => {
    expect(
      ['note', 'canvas', 'doc', 'mddoc', 'calendar'].every((k) => isLinkableKind(k as never)),
    ).toBe(true);
    expect(['folder', 'docfolder', 'template'].some((k) => isLinkableKind(k as never))).toBe(false);
  });

  it('seguir un enlace a un evento lleva a la sección del calendario sin cambiar el abierto', () => {
    const doc = (id: string, kind: DocumentRecord['kind']) =>
      ({ id, kind, title: id, deleted: false }) as unknown as DocumentRecord;
    useUiStore.setState({
      documents: [doc(DOC, 'calendar'), doc('nota', 'note')],
      activeId: 'nota',
      section: 'library',
    });
    const target = parseInternalLink(internalLink(DOC, { eventId: EVENT }))!;
    useUiStore.getState().navigate(linkFocus(target));
    const state = useUiStore.getState();
    expect(state.section).toBe('calendar');
    expect(state.activeId).toBe('nota');
    expect(state.focus).toEqual({
      documentId: DOC,
      elementId: null,
      eventId: EVENT,
      blockId: null,
      quote: null,
    });
  });
});
