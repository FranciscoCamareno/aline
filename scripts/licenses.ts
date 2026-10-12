// Inventario de licencias de las dependencias de producción (RNF-12, diseño §3).
// Uso: node scripts/licenses.ts [--check]
//   Escribe docs/licencias.md. Con --check termina con error si aparece una licencia no admitida.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageEntry {
  name: string;
  versions: string[];
  license: string;
  homepage?: string;
}

/** Licencias permisivas compatibles con publicar y, si se decide, vender (DP-09). */
const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'Zlib',
  '(MIT AND Zlib)',
  '(MPL-2.0 OR Apache-2.0)',
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Orden fija sin datos externos: no hay argumentos que escapar.
const raw = execSync('pnpm licenses list --prod --json', {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const byLicense = JSON.parse(raw) as Record<string, PackageEntry[]>;

const rows = Object.entries(byLicense)
  .flatMap(([license, packages]) => packages.map((p) => ({ ...p, license })))
  .sort((a, b) => a.name.localeCompare(b.name));
const rejected = rows.filter((r) => !ALLOWED.has(r.license));
const summary = Object.entries(byLicense)
  .map(([license, packages]) => [license, packages.length] as const)
  .sort((a, b) => b[1] - a[1]);

const md = [
  '# Inventario de licencias',
  '',
  `Generado con \`node scripts/licenses.ts\` el ${new Date().toISOString().slice(0, 10)} a partir de \`pnpm licenses list --prod\`. No editar a mano.`,
  '',
  'Requisito RNF-12: toda dependencia tiene una licencia compatible con el uso previsto. Se admiten las licencias permisivas de la lista del script; cualquier otra aparece en «Por revisar» y hace fallar `--check`.',
  '',
  '## Resumen',
  '',
  '| Licencia | Paquetes |',
  '| --- | --- |',
  ...summary.map(([license, n]) => `| ${license} | ${n} |`),
  '',
  '## Por revisar',
  '',
  rejected.length
    ? rejected.map((r) => `- ${r.name} ${r.versions.join(', ')}: ${r.license}`).join('\n')
    : 'Ninguna dependencia de producción tiene una licencia fuera de la lista admitida.',
  '',
  '## Recursos que no son paquetes',
  '',
  'El inventario de paquetes no cubre los recursos incluidos dentro de ellos. El diseño (§3) exige no suponer que la licencia del motor cubre sus fuentes e iconos.',
  '',
  '| Recurso | Origen | Licencia | Estado |',
  '| --- | --- | --- | --- |',
  '| Fuentes del lienzo (Virgil, Excalifont, Cascadia, Assistant, Nunito, Lilita, Comic Shanns, Liberation, Xiaolai) | `@excalidraw/excalidraw/dist/prod/fonts`, copiadas a `public/fonts` | No incluida en el paquete | **Pendiente de verificar** en los repositorios de origen de cada fuente antes de publicar |',
  '| Icono de la aplicación (`public/icon.svg` y PNG derivados) | Propio | La del código propio (MIT propuesta, DP-09) | Pendiente de la decisión de licencia |',
  '| Iconos de la interfaz del motor | Incluidos en el código de `@excalidraw/excalidraw` | MIT (licencia del paquete) | Cubiertos por el paquete |',
  '',
  '## Paquetes',
  '',
  '| Paquete | Versión | Licencia |',
  '| --- | --- | --- |',
  ...rows.map((r) => `| ${r.name} | ${r.versions.join(', ')} | ${r.license} |`),
  '',
].join('\n');

writeFileSync(join(root, 'docs', 'licencias.md'), md);
console.log(`docs/licencias.md: ${rows.length} paquetes, ${rejected.length} por revisar`);
if (process.argv.includes('--check') && rejected.length) process.exit(1);
