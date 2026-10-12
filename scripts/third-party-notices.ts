// Genera public/THIRD-PARTY-NOTICES.txt y public/LICENSE.txt para la aplicación compilada.
// Las licencias MIT, BSD, Apache y OFL exigen que los avisos de copyright y de permiso
// acompañen a cada copia distribuida; dist/ incluye código y fuentes de terceros.
// Uso: node scripts/third-party-notices.ts   (lo ejecuta `pnpm assets` antes de dev y build)
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pnpmCommand } from './pnpm.ts';
import { readWoff2Metadata } from './font-metadata.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

interface PackageEntry {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
  author?: string;
  homepage?: string;
}

/**
 * Fuentes del lienzo que se distribuyen. Liberation queda fuera: su versión 1.05 está bajo
 * GPLv2 con excepción de fuentes y cláusulas añadidas de Red Hat (ver docs/licencias.md).
 */
const FONT_LICENSES: Record<string, { license: 'OFL-1.1' | 'MIT'; source: string }> = {
  Assistant: { license: 'OFL-1.1', source: 'https://github.com/hafontia/Assistant' },
  Cascadia: { license: 'OFL-1.1', source: 'https://github.com/microsoft/cascadia-code' },
  ComicShanns: { license: 'MIT', source: 'https://github.com/shannpersand/comic-shanns' },
  Excalifont: { license: 'OFL-1.1', source: 'https://plus.excalidraw.com/excalifont' },
  Lilita: { license: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Lilita+One' },
  Nunito: { license: 'OFL-1.1', source: 'https://github.com/googlefonts/nunito' },
  Virgil: { license: 'OFL-1.1', source: 'https://github.com/excalidraw/virgil' },
  Xiaolai: { license: 'OFL-1.1', source: 'https://ctan.org/pkg/lxgw-fonts' },
};
export const EXCLUDED_FONTS = ['Liberation'];

/** Paquetes de desarrollo cuyo código acaba dentro de dist/ (Service Worker y cargador). */
const BUNDLED_DEV_PREFIXES = ['workbox-', 'vite@', 'rolldown@'];

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

function licenseText(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f));
  if (!files.length) return null;
  return files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n');
}

function productionPackages(): PackageEntry[] {
  const raw = execSync(pnpmCommand('licenses list --prod --json'), {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return Object.entries(JSON.parse(raw) as Record<string, PackageEntry[]>).flatMap(
    ([license, packages]) => packages.map((p) => ({ ...p, license })),
  );
}

function bundledDevPackages(): PackageEntry[] {
  const store = join(root, 'node_modules', '.pnpm');
  return readdirSync(store)
    .filter((d) => BUNDLED_DEV_PREFIXES.some((p) => d.startsWith(p)))
    .map((d) => {
      // Carpeta del almacén de pnpm: <nombre>@<versión>[_<pares>]; estos nombres no tienen ámbito.
      const name = d.slice(0, d.indexOf('@'));
      const dir = join(store, d, 'node_modules', name);
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        version: string;
        license?: string;
      };
      return { name, versions: [pkg.version], paths: [dir], license: pkg.license ?? 'desconocida' };
    });
}

/** Licencias tomadas del repositorio de origen cuando el paquete npm no las incluye. */
function vendoredLicense(name: string): string | null {
  const file =
    name === '@excalidraw/excalidraw'
      ? join(root, 'licenses', 'excalidraw.LICENSE.txt')
      : name.startsWith('@radix-ui/')
        ? join(root, 'licenses', 'upstream', 'radix-ui.txt')
        : join(root, 'licenses', 'upstream', `${name.replaceAll('/', '__')}.txt`);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
}

/** Sección «License» del README, donde algunos paquetes publican el texto completo. */
function readmeLicense(dir: string): string | null {
  const readme = existsSync(dir)
    ? readdirSync(dir).find((f) => /^readme(\.md)?$/i.test(f))
    : undefined;
  if (!readme) return null;
  const text = readFileSync(join(dir, readme), 'utf8');
  const heading = /^#+\s*licen[cs]e\s*$/im.exec(text);
  if (!heading) return null;
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^#{1,6}\s/m.exec(rest);
  const body = (next ? rest.slice(0, next.index) : rest).trim();
  return /copyright/i.test(body) ? body : null;
}

function resolveLicense(p: PackageEntry): string | null {
  return (
    p.paths.map(licenseText).find((t) => t !== null) ??
    vendoredLicense(p.name) ??
    p.paths.map(readmeLicense).find((t) => t !== null) ??
    null
  );
}

function packageSection(p: PackageEntry): string {
  const text = resolveLicense(p);
  const header = `${p.name} ${p.versions.join(', ')} — ${p.license}`;
  const body =
    text ??
    `El paquete no incluye archivo de licencia. Licencia declarada en package.json: ${p.license}` +
      (p.author ? `; autor: ${p.author}` : '') +
      (p.homepage ? `; ${p.homepage}` : '') +
      '.';
  return `${'='.repeat(78)}\n${header}\n${'='.repeat(78)}\n\n${body}\n`;
}

function fontSections(): string[] {
  const fontsDir = join(publicDir, 'fonts');
  const ofl = readFileSync(join(root, 'licenses', 'OFL-1.1.txt'), 'utf8').trim();
  const sections: string[] = [];
  for (const family of readdirSync(fontsDir).sort()) {
    if (EXCLUDED_FONTS.includes(family)) continue;
    const policy = FONT_LICENSES[family];
    if (!policy) throw new Error(`Fuente sin licencia registrada: ${family}`);
    const file = readdirSync(join(fontsDir, family)).find((f) => f.endsWith('.woff2'));
    const meta = file ? readWoff2Metadata(join(fontsDir, family, file)) : null;
    const copyright = meta?.copyright ?? '(sin aviso de copyright en el archivo)';
    const body =
      policy.license === 'MIT'
        ? copyright // Comic Shanns incluye el texto MIT completo en su aviso de copyright.
        : `${copyright}\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n\n${ofl}`;
    sections.push(
      `${'='.repeat(78)}\nFuente ${meta?.family ?? family} (${meta?.version ?? 'versión desconocida'}) — ${policy.license}\nOrigen: ${policy.source}\n${'='.repeat(78)}\n\n${body}\n`,
    );
  }
  return sections;
}

const packages = [...productionPackages(), ...bundledDevPackages()].sort((a, b) =>
  a.name.localeCompare(b.name),
);
const notices = [
  'AVISOS DE TERCEROS',
  '',
  'Esta aplicación incluye software y fuentes de terceros. A continuación se reproducen sus',
  'avisos de copyright y sus licencias, como exigen esas licencias.',
  'El código propio de la aplicación se distribuye bajo la licencia MIT (ver LICENSE.txt).',
  '',
  ...packages.map(packageSection),
  ...fontSections(),
].join('\n');

writeFileSync(join(publicDir, 'THIRD-PARTY-NOTICES.txt'), notices);
copyFileSync(join(root, 'LICENSE'), join(publicDir, 'LICENSE.txt'));
const withoutFile = packages.filter((p) => resolveLicense(p) === null);
console.log(
  `THIRD-PARTY-NOTICES.txt: ${packages.length} paquetes, ${withoutFile.length} sin texto de licencia (${withoutFile.map((p) => p.name).join(', ') || 'ninguno'}); fuentes excluidas: ${EXCLUDED_FONTS.join(', ')}`,
);
