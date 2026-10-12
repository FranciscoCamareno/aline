// Inventario de licencias de las dependencias de producción (RNF-12, diseño §3).
// Uso: node scripts/licenses.ts [--check]
//   Escribe docs/licencias.md. Con --check termina con error si aparece una licencia no admitida.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pnpmCommand } from './pnpm.ts';

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
const raw = execSync(pnpmCommand('licenses list --prod --json'), {
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
  '## Licencia del código propio',
  '',
  'MIT, `Copyright (c) 2026 F. C.` (archivo `LICENSE` del repositorio; decisión DP-09). Se distribuye con la aplicación como `LICENSE.txt`.',
  '',
  '## Cumplimiento en la aplicación compilada',
  '',
  'Las licencias MIT, BSD, Apache-2.0 y OFL-1.1 exigen que los avisos de copyright y de permiso acompañen a cada copia distribuida. El repositorio no contiene código de terceros (`node_modules` y `public/fonts` no se versionan), pero `dist/` sí. Por eso `pnpm assets` (antes de `dev` y `build`) genera:',
  '',
  '- `THIRD-PARTY-NOTICES.txt`: licencia de cada dependencia de producción y del código de Workbox y Vite incluido en el Service Worker y el cargador. Si un paquete npm no trae archivo de licencia, se usa la del repositorio de origen (`licenses/`) o la sección de licencia de su README. También incluye el aviso de copyright de cada fuente, leído de su propio archivo WOFF2, con su licencia.',
  '- `LICENSE.txt`: la licencia MIT de la aplicación.',
  '',
  'Ambos se enlazan desde «Estado y diagnóstico → Licencias» y se precachean para el uso sin conexión.',
  '',
  '## Fuentes del lienzo',
  '',
  'Licencias comprobadas el 12/10/2026 en los metadatos de cada archivo WOFF2 (`scripts/font-metadata.ts`) y, cuando el archivo no la declara, en la fuente oficial.',
  '',
  '| Fuente | Versión | Licencia | Evidencia | ¿Se distribuye? |',
  '| --- | --- | --- | --- | --- |',
  '| Virgil | 001.001 | OFL-1.1 | Texto OFL en el archivo | Sí |',
  '| Excalifont | 1.000 | OFL-1.1 | El archivo solo dice «All rights reserved»; la página oficial de Excalidraw la publica bajo OFL-1.1 | Sí |',
  '| Assistant | 3.000 | OFL-1.1 | Texto OFL en el archivo | Sí |',
  '| Cascadia Code | 2005.150 | OFL-1.1 | URL de la OFL en el archivo; repositorio de Microsoft bajo OFL-1.1 | Sí |',
  '| Nunito | 3.602 | OFL-1.1 | URL de la OFL en el archivo | Sí |',
  '| Lilita One | 1.002 | OFL-1.1 (nombre reservado «Lilita One») | URL de la OFL en el archivo | Sí, sin modificar |',
  '| Comic Shanns | 1.3.0 | MIT | Texto MIT completo en el archivo | Sí |',
  '| Xiaolai SC | 3.11 | OFL-1.1 | El archivo no la declara; el paquete LXGW en CTAN la publica bajo OFL-1.1 | Sí |',
  '| Liberation Sans | 1.05 | GPLv2 con excepción de fuentes y cláusulas añadidas de Red Hat (serie 1.x) | Remite a «the license agreement»; la serie 2.x, bajo OFL, es otra versión | **No**: se excluye de la copia y de `dist/` |',
  '',
  '**Liberation Sans 1.05.** El motor la usa para el estilo de letra antiguo «Normal» (Helvetica). Su licencia no encaja con un proyecto MIT que podría venderse. Debian llegó a considerarla no redistribuible. No se distribuye: los textos con ese estilo se muestran con la fuente sin serifa del sistema. Si hiciera falta, la alternativa es la serie 2.x (OFL), sustituyendo el archivo.',
  '',
  '## Otros recursos',
  '',
  '| Recurso | Origen | Licencia |',
  '| --- | --- | --- |',
  '| Icono de la aplicación (`public/icon.svg` y PNG derivados) | Propio | MIT (la del código propio) |',
  '| Iconos de la interfaz del motor | Incluidos en el código de `@excalidraw/excalidraw` | MIT (licencia del paquete) |',
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
