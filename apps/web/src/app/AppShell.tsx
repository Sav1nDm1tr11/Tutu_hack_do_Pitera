import { NavLink, Outlet } from 'react-router';
import { useEffect, useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { BrandMark } from '../components/brand/BrandMark';
import { fetchCapabilities } from '../lib/api-client';
import { applyTheme, persistTheme, readStoredTheme, type ThemeName } from '../lib/theme';
import { useOnlineStatus } from '../lib/use-online-status';
import { usePlanStore } from '../store/plan-store';

export function AppShell(): React.JSX.Element {
  const online = useOnlineStatus();
  const announcement = usePlanStore((state) => state.announcement);
  const [source, setSource] = useState<'live' | 'fixture' | undefined>(undefined);
  const [theme, setTheme] = useState<ThemeName>(() =>
    typeof document === 'undefined' ? 'light' : readStoredTheme(),
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCapabilities(controller.signal)
      .then((result) => setSource(result.capabilities.source))
      .catch(() => setSource(undefined));

    return (): void => {
      controller.abort();
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)]">
      <a
        href="#main"
        className="visually-hidden focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[var(--color-primary)] focus:px-3 focus:py-2 focus:text-white"
      >
        Перейти к основному содержимому
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-[var(--color-header)] backdrop-blur-[16px]">
        <div className="mx-auto flex w-full max-w-[1280px] items-center gap-2.5 px-4 py-2.5">
          <NavLink to="/" className="rounded-[10px]" aria-label="План Б — на главную">
            <BrandMark />
          </NavLink>

          <div className="ml-auto flex items-center gap-2">
            {source === 'fixture' && (
              <Badge
                tone="warning"
                icon={<FlaskIcon />}
                title="Сейчас используются демо-данные, а не live Tutu MCP"
              >
                Демо-данные
              </Badge>
            )}
            {source === 'live' && (
              <Badge tone="info" icon={<FlaskIcon />}>
                Данные Туту
              </Badge>
            )}
            {!online && (
              <Badge tone="danger" icon={<OfflineIcon />}>
                Офлайн
              </Badge>
            )}
            <button
              type="button"
              aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
              onClick={() => {
                const next = theme === 'dark' ? 'light' : 'dark';
                persistTheme(next);
                setTheme(next);
              }}
              className="grid size-9 place-items-center rounded-[10px] border border-line bg-[var(--color-surface)] text-muted"
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <NavLink
              to="/about-data"
              className="tap-target grid place-items-center rounded-[10px] px-3 text-sm font-semibold text-muted hover:text-ink"
            >
              О данных
            </NavLink>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-4 sm:py-5">
        <Outlet />
      </main>

      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {announcement}
      </div>
    </div>
  );
}

function FlaskIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
      <path
        d="M6.2 2h3.6v3.4l3 6.4c.4.9-.2 1.9-1.2 1.9H4.4c-1 0-1.6-1-1.2-1.9l3-6.4V2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OfflineIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M3.4 6.6a7 7 0 019.2-.6M5.6 9.2a4 4 0 014.3-.5M8 12.2h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SunIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M10 2v2M10 16v2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M2 10h2M16 10h2M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="10" cy="10" r="3.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function MoonIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M16.5 11.2A6.5 6.5 0 018.8 3.5 6.8 6.8 0 0010 17a6.8 6.8 0 006.5-5.8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
