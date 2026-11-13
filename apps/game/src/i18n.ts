import { en, type MessageKey } from './locales/en.ts';
import { ptBR } from './locales/pt-BR.ts';

export type Locale = 'en' | 'pt-BR';
export const LOCALES: Locale[] = ['en', 'pt-BR'];
const STORAGE_KEY = 'void-frontier.locale';
const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, 'pt-BR': ptBR };

/** Saved choice first, then the browser language; Portuguese speakers get pt-BR. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'pt-BR') return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the browser language.
  }
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language?.toLowerCase().startsWith('pt')) ? 'pt-BR' : 'en';
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not critical: the game still runs in the chosen language for this session.
  }
}

export type Translate = (key: MessageKey) => string;

/**
 * Strings for the chosen language. With a gamepad in use, a key that has a `pad.`
 * twin (a prompt naming a key) reads the twin, which names the button instead.
 */
export const translator = (locale: Locale, device: 'keyboard' | 'gamepad' = 'keyboard'): Translate => (key) => {
  if (device === 'gamepad') {
    const pad = `pad.${key}` as MessageKey;
    const text = dictionaries[locale][pad] ?? en[pad];
    if (text !== undefined) return text;
  }
  return dictionaries[locale][key] ?? en[key];
};

export type { MessageKey };
