// Copia las fuentes de Excalidraw a public/fonts para servirlas desde el mismo origen
// (diseño §13: fuentes y recursos del motor se sirven desde el origen propio, sin CDN).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
// La condición "default" del paquete apunta a dist/prod/index.js.
const prodDir = dirname(require.resolve('@excalidraw/excalidraw'));
const source = join(prodDir, 'fonts');
const target = join(root, 'public', 'fonts');

if (!existsSync(source)) {
  console.error(`No se encontraron las fuentes de Excalidraw en ${source}`);
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
// Liberation 1.05 (GPLv2 con excepción y cláusulas de Red Hat) no se distribuye: ver docs/licencias.md.
const EXCLUDED = ['Liberation'];
cpSync(source, target, {
  recursive: true,
  filter: (src) => !EXCLUDED.some((name) => src.includes(join('fonts', name))),
});
console.log(`Fuentes de Excalidraw copiadas a ${target}`);
