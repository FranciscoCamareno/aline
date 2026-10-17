// Lee de un archivo WOFF2 los registros de derechos y licencia de su tabla `name`
// (nameID 0: copyright, 1: familia, 5: versión, 13: licencia, 14: URL de la licencia).
// Sirve para incluir los avisos de las fuentes que distribuye la aplicación.
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

export interface FontMetadata {
  family: string | null;
  version: string | null;
  copyright: string | null;
  license: string | null;
  licenseUrl: string | null;
}

/** Tablas de un WOFF2, descomprimidas (glyf y loca pueden venir transformadas; no se usan). */
function readWoff2Tables(path: string): Map<string, Buffer> {
  const buf = readFileSync(path);
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${path} no es WOFF2`);
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  let pos = 48;

  const base128 = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = buf[pos++]!;
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return value >>> 0;
    }
    throw new Error('UIntBase128 no válido');
  };

  const tables: Array<{ tag: string; length: number }> = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++]!;
    const tagIndex = flags & 0x3f;
    let tag: string;
    if (tagIndex === 63) {
      tag = buf.toString('latin1', pos, pos + 4);
      pos += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex] ?? '????';
    }
    const transform = (flags >> 6) & 0x03;
    const origLength = base128();
    const hasTransformLength = tag === 'glyf' || tag === 'loca' ? transform === 0 : transform !== 0;
    const length = hasTransformLength ? base128() : origLength;
    tables.push({ tag, length });
  }

  const data = brotliDecompressSync(buf.subarray(pos, pos + totalCompressedSize));
  const result = new Map<string, Buffer>();
  let offset = 0;
  for (const t of tables) {
    result.set(t.tag, data.subarray(offset, offset + t.length));
    offset += t.length;
  }
  return result;
}

/**
 * Métricas verticales de una fuente (tablas `head` y `hhea`), las que el lienzo necesita para
 * colocar el texto: unidades por em, ascendente, descendente y separación entre líneas.
 */
export function readWoff2Metrics(path: string): {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
} {
  const tables = readWoff2Tables(path);
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  if (!head || !hhea) throw new Error(`${path}: faltan las tablas head o hhea`);
  return {
    unitsPerEm: head.readUInt16BE(18),
    ascender: hhea.readInt16BE(4),
    descender: hhea.readInt16BE(6),
    lineGap: hhea.readInt16BE(8),
  };
}

export function readWoff2Metadata(path: string): FontMetadata {
  const name = readWoff2Tables(path).get('name');
  if (!name)
    return { family: null, version: null, copyright: null, license: null, licenseUrl: null };

  const count = name.readUInt16BE(2);
  const stringOffset = name.readUInt16BE(4);
  const found = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const platformId = name.readUInt16BE(r);
    const nameId = name.readUInt16BE(r + 6);
    const length = name.readUInt16BE(r + 8);
    const start = stringOffset + name.readUInt16BE(r + 10);
    const raw = name.subarray(start, start + length);
    let text: string;
    if (platformId === 3 || platformId === 0) {
      // UTF-16BE
      const swapped = Buffer.from(raw);
      swapped.swap16();
      text = swapped.toString('utf16le');
    } else {
      text = raw.toString('latin1');
    }
    if (!found.has(nameId) || platformId === 3) found.set(nameId, text.trim());
  }
  return {
    family: found.get(1) ?? null,
    version: found.get(5) ?? null,
    copyright: found.get(0) ?? null,
    license: found.get(13) ?? null,
    licenseUrl: found.get(14) ?? null,
  };
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  for (const path of process.argv.slice(2)) {
    console.log(path, JSON.stringify(readWoff2Metadata(path), null, 2));
  }
}
