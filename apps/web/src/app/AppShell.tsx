import { NavLink, Outlet } from 'react-router';
import { useEffect, useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { fetchCapabilities } from '../lib/api-client';
import { useOnlineStatus } from '../lib/use-online-status';
import { usePlanStore } from '../store/plan-store';

export function AppShell(): React.JSX.Element {
  const online = useOnlineStatus();
  const announcement = usePlanStore((state) => state.announcement);
  const [source, setSource] = useState<'live' | 'fixture' | undefined>(undefined);

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
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="visually-hidden focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-navy focus:px-3 focus:py-2 focus:text-white"
      >
        Перейти к основному содержимому
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold text-navy">
            <Logo />
            ТуТу План Б
          </NavLink>

          <div className="ml-auto flex items-center gap-2">
            {/* Демо-режим виден постоянно (§11.1): подменять источник данных молча нельзя. */}
            {source === 'fixture' && (
              <Badge tone="warning" icon={<FlaskIcon />} title="Live Tutu MCP недоступен из этой среды">
                Демо-данные
              </Badge>
            )}
            {!online && (
              <Badge tone="danger" icon={<OfflineIcon />}>
                Оффлайн
              </Badge>
            )}
            <NavLink
              to="/about-data"
              className="tap-target grid place-items-center rounded-full px-3 text-sm text-muted hover:text-navy"
            >
              О данных
            </NavLink>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      {/* Единая точка объявлений: изменения цены и оценки сообщаются неинтрузивно (§19). */}
      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {announcement}
      </div>
    </div>
  );
}

function Logo(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.4 10.2h17.2M5 16h14M12 2.9c2.6 2.6 2.6 15.6 0 18.2M12 2.9c-2.6 2.6-2.6 15.6 0 18.2"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <path d="M4.6 15.2l14-7.4" stroke="#ed6436" strokeWidth="2" strokeLinecap="round" />
    </svg>
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
