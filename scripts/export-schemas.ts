// Escribe los JSON Schema del formato v1 en docs/formato/schemas/v1 a partir de src/domain/format.ts.
// Uso: node scripts/export-schemas.ts  (Node 22.18+ ejecuta TypeScript sin compilar)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatJsonSchemas } from '../src/domain/format.ts';

const outDir = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  'docs',
  'formato',
  'schemas',
  'v1',
);
mkdirSync(outDir, { recursive: true });
for (const [name, schema] of Object.entries(formatJsonSchemas())) {
  writeFileSync(join(outDir, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`Escrito ${name}.schema.json`);
}
