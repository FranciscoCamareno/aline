import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en/translation.json';
import es from '../locales/es/translation.json';

export type AppLanguage = 'es' | 'en';
export const LANGUAGES: readonly AppLanguage[] = ['es', 'en'];
const STORAGE_KEY = 'mindnote.language';

function initialLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    // Almacenamiento no disponible: se usa el idioma del navegador.
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es';
}

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: AppLanguage): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Preferencia no persistida; no afecta al contenido.
  }
}

/** Código de idioma de Excalidraw correspondiente. */
export function excalidrawLangCode(lang: string): string {
  return lang.startsWith('en') ? 'en' : 'es-ES';
}

export default i18n;
