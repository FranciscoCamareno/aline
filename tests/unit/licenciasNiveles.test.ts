import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Licencia en tres niveles (DP-09, revisada el 17/10/2026): código propio AGPLv3, terceros con su
// licencia (THIRD-PARTY-NOTICES.md) y marca con todos los derechos reservados (brand/,
// TRADEMARKS_AND_ASSETS.md). Estas pruebas hacen que un recurso o un motor nuevo no pueda entrar
// sin quedar en su nivel.

const root = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const GRAPHIC = /\.(svg|png|webp|jpe?g|gif|ico|avif|excalidrawlib)$/i;
/** Carpetas con código o documentación propios: ningún recurso gráfico puede vivir en ellas. */
const CODE_DIRS = ['src', 'tests', 'scripts', 'spikes', 'docs', 'licenses', 'patches'];
/** Copias en `public/` de recursos de `brand/` (TRADEMARKS_AND_ASSETS.md §1.3). */
const PUBLIC_BRAND_COPY = /^(aline-icon[\w-]*|favicon[\w-]*|apple-touch-icon[\w-]*)\.(png|svg)$/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(root, path).replace(/\\/g, '/')];
  });
}

describe('licencia en tres niveles', () => {
  it('el código propio está bajo la GNU AGPLv3', () => {
    expect(read('LICENSE').trimStart()).toMatch(/^GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/);
    expect((JSON.parse(read('package.json')) as { license: string }).license).toBe('AGPL-3.0-only');
  });

  it('los recursos gráficos viven en brand/ y no en carpetas de código', () => {
    const misplaced = CODE_DIRS.flatMap((d) => walk(join(root, d))).filter((f) => GRAPHIC.test(f));
    expect(misplaced).toEqual([]);
    expect(existsSync(join(root, 'brand', 'LICENSE.md'))).toBe(true);
    expect(read('TRADEMARKS_AND_ASSETS.md')).toContain('brand/');
  });

  it('public/ solo contiene copias de la marca declaradas', () => {
    const images = readdirSync(join(root, 'public')).filter((f) => GRAPHIC.test(f));
    expect(images.filter((f) => !PUBLIC_BRAND_COPY.test(f))).toEqual([]);
  });

  it('cada dependencia directa de producción figura en THIRD-PARTY-NOTICES.md', () => {
    const notices = read('THIRD-PARTY-NOTICES.md');
    const deps = Object.keys(
      (JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies,
    );
    const missing = deps.filter((name) => {
      if (notices.includes(`\`${name}\``)) return false;
      const [scope, bare] = name.startsWith('@') ? name.split('/') : [];
      if (scope === undefined || bare === undefined || !notices.includes(scope)) return true;
      return !notices.includes(`\`${scope}/*\``) && !notices.includes(`\`${bare}\``);
    });
    expect(missing).toEqual([]);
  });
});
