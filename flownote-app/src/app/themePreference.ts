export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'flownote-theme';

export function nextThemePreference(value: ThemePreference): ThemePreference {
  return value === 'system' ? 'light' : value === 'light' ? 'dark' : 'system';
}

export function resolvedTheme(value: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return value === 'system' ? (systemDark ? 'dark' : 'light') : value;
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePreference(value: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* localStorage may be unavailable */ }
}
