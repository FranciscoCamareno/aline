/**
 * Frontmatter de notas (diseño §5.1). Se serializa con un subconjunto de YAML: los valores de
 * texto se escriben como cadenas JSON, que también son escalares YAML válidos entre comillas.
 *
 * Pendiente: un parser YAML completo para frontmatter escrito a mano o importado. Hoy se
 * reconocen pares `clave: valor` simples y listas en línea; si no se reconoce, el texto se
 * conserva íntegro como cuerpo y se marca `invalid` (nunca se descarta contenido).
 */
export interface NoteFrontmatter {
  schemaVersion: number;
  id: string;
  title: string;
  tags: string[];
  /** Claves desconocidas se conservan textualmente al volver a serializar. */
  extra: Array<[key: string, rawValue: string]>;
}

export interface ParsedNote {
  frontmatter: NoteFrontmatter | null;
  body: string;
  invalid: boolean;
}

const KNOWN_KEYS = new Set(['schema_version', 'id', 'title', 'tags']);

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === '') return '';
  try {
    return JSON.parse(value);
  } catch {
    if (value.startsWith('[') && value.endsWith(']')) {
      return value
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
    return value.replace(/^'(.*)'$/, '$1');
  }
}

export function parseNoteMarkdown(text: string): ParsedNote {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { frontmatter: null, body: text, invalid: false };

  const header = match[1] ?? '';
  const body = text.slice(match[0].length).replace(/^\r?\n/, '');
  const fields = new Map<string, string>();
  const extra: Array<[string, string]> = [];

  for (const line of header.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const sep = line.indexOf(':');
    if (sep <= 0 || /^\s/.test(line)) return { frontmatter: null, body: text, invalid: true };
    const key = line.slice(0, sep).trim();
    const raw = line.slice(sep + 1);
    if (KNOWN_KEYS.has(key)) fields.set(key, raw);
    else extra.push([key, raw.trim()]);
  }

  const id = parseScalar(fields.get('id') ?? '');
  const title = parseScalar(fields.get('title') ?? '');
  const tags = parseScalar(fields.get('tags') ?? '[]');
  const schemaVersion = parseScalar(fields.get('schema_version') ?? '1');

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    !Array.isArray(tags) ||
    !tags.every((t) => typeof t === 'string') ||
    typeof schemaVersion !== 'number'
  ) {
    return { frontmatter: null, body: text, invalid: true };
  }

  return {
    frontmatter: { schemaVersion, id, title, tags: tags as string[], extra },
    body,
    invalid: false,
  };
}

export function serializeNoteMarkdown(
  fm: Omit<NoteFrontmatter, 'extra'> & Partial<Pick<NoteFrontmatter, 'extra'>>,
  body: string,
): string {
  const lines = [
    '---',
    `schema_version: ${fm.schemaVersion}`,
    `id: ${fm.id}`,
    `title: ${JSON.stringify(fm.title)}`,
    `tags: [${fm.tags.map((t) => JSON.stringify(t)).join(', ')}]`,
    ...(fm.extra ?? []).map(([key, raw]) => `${key}: ${raw}`),
    '---',
    '',
  ];
  return lines.join('\n') + body;
}
