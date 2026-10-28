import type { Locale } from './i18n.ts';

export interface Settings {
  quality: 'auto' | 'high' | 'medium' | 'low';
  masterVolume: number;
  effectsVolume: number;
  musicVolume: number;
  cameraShake: boolean;
  mouseSteering: boolean;
  locale: Locale | null;
}

const KEY = 'void-frontier.settings';

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  masterVolume: 0.8,
  effectsVolume: 0.9,
  musicVolume: 0.5,
  cameraShake: true,
  mouseSteering: true,
  locale: null,
};

export function loadSettings(): Settings {
  try {
    const text = localStorage.getItem(KEY);
    return text ? { ...DEFAULT_SETTINGS, ...(JSON.parse(text) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not critical: settings last for this session.
  }
}
