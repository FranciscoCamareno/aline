import { describe, expect, it } from 'vitest';
import { renderMarkdownPreview } from '../../src/features/notes/markdown.ts';

describe('vista previa Markdown', () => {
  it('presenta formato básico y GFM', () => {
    const html = renderMarkdownPreview(
      '# Título\n\n- [x] hecho\n\n| a | b |\n|---|---|\n| 1 | 2 |',
    );
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<table>');
  });

  it('desactiva HTML crudo y esquemas peligrosos', () => {
    const html = renderMarkdownPreview(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('conserva enlaces internos mindnote://', () => {
    const html = renderMarkdownPreview(
      '[Mapa](mindnote://document/8b53f815-9d38-4313-a1ad-cb690fabf23c)',
    );
    expect(html).toContain('href="mindnote://document/8b53f815-9d38-4313-a1ad-cb690fabf23c"');
  });

  it('no carga imágenes externas: las muestra como referencia', () => {
    const html = renderMarkdownPreview('![logo](https://example.com/logo.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('href="https://example.com/logo.png"');
  });
});
