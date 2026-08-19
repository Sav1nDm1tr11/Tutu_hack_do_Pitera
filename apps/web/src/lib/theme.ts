export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'plan-b-theme';

export function readStoredTheme(): ThemeName {
  if (typeof window === 'undefined') return 'light';
  return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset['theme'] = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta !== null) {
    meta.setAttribute('content', theme === 'dark' ? '#14101F' : '#6D28D9');
  }
}

export function persistTheme(theme: ThemeName): void {
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}
