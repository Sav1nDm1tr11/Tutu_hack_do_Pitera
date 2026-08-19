import { Suspense, lazy, useMemo } from 'react';
import type { CandidatePool, PlanConfiguration } from '@tutu-plan-b/domain';
import { buildRouteGeometry } from '@tutu-plan-b/domain';
import { Button } from '../../components/ui/Button';
import { usePrefersReducedMotion } from '../../lib/use-prefers-reduced-motion';
import { RouteScheme } from './RouteScheme';

// Глобус загружается отдельным чанком после интерактивности shell (§18.2): MapLibre
// весит больше всего остального приложения, и держать его в критическом пути значило бы
// проиграть LCP ради украшения.
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

  const geometry = useMemo(() => buildRouteGeometry(configuration, pool), [configuration, pool]);

  // Каждая ветка ниже — не «на всякий случай», а описанный в §15.5 режим: без координат,
  // без WebGL и при недоступном рендере пользователь всё равно должен видеть маршрут.
  if (!geometry.hasCompleteCoordinates || geometry.segments.length === 0) {
    return (
      <FallbackFrame note="Не для всех этапов известны координаты, поэтому показываем текстовую схему маршрута.">
        <RouteScheme configuration={configuration} pool={pool} onSelectStage={onSelectStage} />
      </FallbackFrame>
    );
  }

  return (
    <div className="globe-panel relative size-full">
      <div className="globe-atmosphere" aria-hidden="true" />
      <div className="globe-map-shell">
        <Suspense fallback={<div className="skeleton size-full" />}>
          <RouteGlobe
            geometry={geometry}
            selectedStageId={selectedStageId}
            onSelectStage={onSelectStage}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </div>

      {selectedStageId !== undefined && (
        <div className="globe-reset absolute bottom-3 left-3">
          <Button size="sm" variant="secondary" onClick={() => onSelectStage(undefined)}>
            Весь маршрут
          </Button>
        </div>
      )}
    </div>
  );
}

function FallbackFrame({
  note,
  children,
}: {
  readonly note: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="border-line flex size-full flex-col gap-3 overflow-auto rounded-[24px] border bg-white/70 p-4">
      <p className="text-muted text-sm">{note}</p>
      {children}
    </div>
  );
}
