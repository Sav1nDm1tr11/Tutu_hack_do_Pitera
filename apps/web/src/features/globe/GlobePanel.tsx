import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { CandidatePool, PlanConfiguration } from '@tutu-plan-b/domain';
import { buildRouteGeometry } from '@tutu-plan-b/domain';
import { Button } from '../../components/ui/Button';
import { usePrefersReducedMotion } from '../../lib/use-prefers-reduced-motion';
import { RouteScheme } from './RouteScheme';
import { cn } from '../../lib/cn';

const RouteGlobe = lazy(async () => import('./RouteGlobe'));

export interface GlobePanelProps {
  readonly configuration: PlanConfiguration;
  readonly pool: CandidatePool;
  readonly selectedStageId: string | undefined;
  readonly onSelectStage: (stageId: string | undefined) => void;
}

export function GlobePanel({
  configuration,
  pool,
  selectedStageId,
  onSelectStage,
}: GlobePanelProps): React.JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const webglAvailable = useWebglAvailable();
  const [mode, setMode] = useState<'globe' | 'scheme'>('globe');

  const geometry = useMemo(
    () => buildRouteGeometry(configuration, pool),
    [configuration, pool],
  );

  const forceScheme =
    !geometry.hasCompleteCoordinates ||
    geometry.segments.length === 0 ||
    webglAvailable === false ||
    reducedMotion;

  const showGlobe = mode === 'globe' && !forceScheme && webglAvailable === true;
  const globePending = mode === 'globe' && !forceScheme && webglAvailable === undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <div>
          <p className="m-0 text-[13px] font-extrabold">Схема маршрута</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {showGlobe
              ? 'Потяните, чтобы сдвинуть · колесо для масштаба'
              : 'Текстовая схема — географически точная альтернатива глобусу'}
          </p>
        </div>
        <div className="flex gap-1 rounded-[10px] bg-[var(--color-track)] p-0.5">
          {(
            [
              { key: 'globe', label: 'Глобус' },
              { key: 'scheme', label: 'Схема' },
            ] as const
          ).map((item) => {
            const active = (forceScheme ? 'scheme' : mode) === item.key;
            return (
              <button
                key={item.key}
                type="button"
                disabled={item.key === 'globe' && forceScheme}
                onClick={() => setMode(item.key)}
                className={cn(
                  'min-h-[30px] rounded-lg px-2.5 text-[11.5px] font-bold',
                  active
                    ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-[0_2px_6px_rgba(76,29,149,.14)]'
                    : 'text-muted',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {globePending ? (
        <div className="skeleton m-3.5 h-[var(--globe-height-mobile)] lg:h-[var(--globe-height-desktop)]" />
      ) : showGlobe ? (
        <div
          className="relative mt-2 h-[var(--globe-height-mobile)] overflow-hidden bg-[var(--color-ocean)] lg:h-[var(--globe-height-desktop)]"
        >
          <Suspense fallback={<div className="skeleton size-full min-h-[320px]" />}>
            <RouteGlobe
              geometry={geometry}
              selectedStageId={selectedStageId}
              onSelectStage={onSelectStage}
              reducedMotion={reducedMotion}
            />
          </Suspense>
          {selectedStageId !== undefined && (
            <div className="absolute bottom-3 left-3">
              <Button size="sm" variant="secondary" onClick={() => onSelectStage(undefined)}>
                Весь маршрут
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3.5">
          {forceScheme && webglAvailable === false && (
            <p className="mb-3 text-sm text-muted">
              Ваш браузер не поддерживает WebGL — маршрут показан схемой.
            </p>
          )}
          {forceScheme && !geometry.hasCompleteCoordinates && (
            <p className="mb-3 text-sm text-muted">
              Не для всех этапов известны координаты, поэтому показываем текстовую схему маршрута.
            </p>
          )}
          <RouteScheme configuration={configuration} pool={pool} onSelectStage={onSelectStage} />
        </div>
      )}
    </div>
  );
}

function useWebglAvailable(): boolean | undefined {
  const [available, setAvailable] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      setAvailable(context !== null);
    } catch {
      setAvailable(false);
    }
  }, []);

  return available;
}
