// Copia las fuentes del catálogo (src/app/fontCatalog.ts) desde los paquetes @fontsource a
// public/fonts-extra, para servirlas desde el mismo origen (diseño §13: sin CDN). Solo los
// archivos que usa la aplicación: latín y latín extendido, regular, negrita y cursivas.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_CATALOG, fontFiles } from '../src/app/fontCatalog.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'fonts-extra');

rmSync(target, { recursive: true, force: true });
let copied = 0;
for (const font of FONT_CATALOG) {
  const source = join(root, 'node_modules', '@fontsource', font.id, 'files');
  mkdirSync(join(target, font.id), { recursive: true });
  for (const { file } of fontFiles(font)) {
    const from = join(source, file);
    if (!existsSync(from)) {
      console.error(`Falta ${file} en @fontsource/${font.id}`);
      process.exit(1);
    }
    copyFileSync(from, join(target, font.id, file));
    copied++;
  }
}
console.log(`${copied} archivos de ${FONT_CATALOG.length} fuentes copiados a ${target}`);
