import type { Mascot, Mood } from '../../domain/pomodoro.ts';

/** Ilustraciones de las mascotas (DESIGN.md §2.3.1), servidas como archivos propios. */
const files = import.meta.glob<string>('../../../brand/mascotas/*-*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

const urls = new Map(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
);

/** Nombres propios: no se traducen. */
export const MASCOT_NAMES: Record<Mascot, string> = { tofu: 'Tofu', tomi: 'Tomi', pico: 'Pico' };

export function mascotUrl(mascot: Mascot, mood: Mood): string {
  const url = urls.get(`${mascot}-${mood}`);
  if (!url) throw new Error(`Mascota desconocida: ${mascot}-${mood}`);
  return url;
}
