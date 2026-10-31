import type { TFunction } from 'i18next';

/** «25 min», «1 h 30», «2 h». */
export function durationLabel(minutes: number, t: TFunction): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t('pomodoro.durationMin', { m });
  return m === 0 ? t('pomodoro.durationH', { h }) : t('pomodoro.durationHMin', { h, m });
}

/** Hora del día en el idioma de la interfaz («11:47»). */
export function clockTime(ms: number, lang: string): string {
  return new Date(ms).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
}
