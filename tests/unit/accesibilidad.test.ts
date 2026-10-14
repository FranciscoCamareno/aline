import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Endurecimiento (plan 5.5, RNF-08, RNF-11): contraste de los colores del tema según WCAG 2.1 y
 * paridad de las traducciones. Se mide sobre los archivos reales, no sobre una copia.
 */
const css = readFileSync('src/app/styles.css', 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!]),
  );
}
const light = tokens(/:root\s*\{([\s\S]*?)\n\}/.exec(css)![1]!);
const dark = {
  ...light,
  ...tokens(/:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/.exec(css)![1]!),
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
/** Pares texto/fondo de los tokens (docs/DESIGN.md §2): todo texto ≥ 4,5:1. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['text-primary', 'bg-canvas'],
  ['text-primary', 'bg-panel'],
  ['text-primary', 'bg-popover'],
  ['text-primary', 'selection-soft'],
  ['text-primary', 'warning-bg'],
  ['text-primary', 'danger-bg'],
  ['text-secondary', 'bg-canvas'],
  ['text-secondary', 'bg-panel'],
  ['text-secondary', 'bg-popover'],
  ['text-secondary', 'selection-soft'],
  ['text-accent', 'bg-canvas'],
  ['link', 'bg-canvas'],
  ['link', 'bg-panel'],
  ['link', 'bg-popover'],
  ['on-brand', 'brand'],
  ['on-brand', 'brand-hover'],
  ['on-selection-soft', 'selection-soft'],
  ['on-secondary', 'secondary-soft'],
  ['on-secondary', 'secondary'],
  ['success', 'success-bg'],
  ['warning', 'warning-bg'],
  ['danger', 'danger-bg'],
  ['danger', 'bg-panel'],
  ['danger', 'bg-popover'],
];
/** Iconos, bordes de controles y anillo de foco: ≥ 3:1 (WCAG 1.4.11). */
const UI_PAIRS: Array<[string, string]> = [
  ['focus', 'bg-canvas'],
  ['focus', 'bg-panel'],
  ['border-ink', 'bg-canvas'],
  ['border-ink', 'bg-panel'],
];

describe('contraste del tema (WCAG 2.1 AA, RNF-08)', () => {
  for (const [name, t] of [
    ['claro', light],
    ['oscuro', dark],
  ] as const) {
    const failing = (pairs: Array<[string, string]>, min: number) =>
      pairs
        .map(
          ([fg, bg]) =>
            [`${fg} / ${bg}`, Math.round(contrast(t[fg]!, t[bg]!) * 100) / 100] as const,
        )
        .filter(([, ratio]) => !(ratio >= min));

    it(`tema ${name}: todos los textos alcanzan 4,5:1`, () => {
      expect(failing(TEXT_PAIRS, 4.5)).toEqual([]);
    });
    it(`tema ${name}: iconos, bordes y foco alcanzan 3:1`, () => {
      expect(failing(UI_PAIRS, 3)).toEqual([]);
    });
  }
});

describe('traducciones (RNF-11)', () => {
  const es = JSON.parse(readFileSync('src/locales/es/translation.json', 'utf8')) as object;
  const en = JSON.parse(readFileSync('src/locales/en/translation.json', 'utf8')) as object;
  const keys = (o: object, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  it('español e inglés tienen exactamente las mismas claves', () => {
    const a = new Set(keys(es));
    const b = new Set(keys(en));
    expect([...a].filter((k) => !b.has(k))).toEqual([]);
    expect([...b].filter((k) => !a.has(k))).toEqual([]);
  });

  it('toda clave literal usada en el código existe', () => {
    const all = new Set(keys(es).map((k) => k.replace(/_(one|other)$/, '')));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk('src');
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
        if (!all.has(m[1]!)) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
