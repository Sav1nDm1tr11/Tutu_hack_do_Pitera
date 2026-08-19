import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
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
  const webglAvailable = useWebglAvailable();

  const geometry = useMemo(
    () => buildRouteGeometry(configuration, pool),
    [configuration, pool],
  );

  // Каждая ветка ниже — не «на всякий случай», а описанный в §15.5 режим: без координат,
  // без WebGL и при недоступном рендере пользователь всё равно должен видеть маршрут.
  if (!geometry.hasCompleteCoordinates || geometry.segments.length === 0) {
    return (
      <FallbackFrame
        note="Не для всех этапов известны координаты, поэтому показываем текстовую схему маршрута."
      >
        <RouteScheme configuration={configuration} pool={pool} onSelectStage={onSelectStage} />
      </FallbackFrame>
    );
  }

  if (webglAvailable === false) {
    return (
      <FallbackFrame note="Ваш браузер не поддерживает WebGL — маршрут показан схемой.">
        <RouteScheme configuration={configuration} pool={pool} onSelectStage={onSelectStage} />
      </FallbackFrame>
    );
  }

  return (
    <div className="relative size-full overflow-hidden rounded-[24px] bg-[#dfe6fb]">
      <Suspense fallback={<div className="skeleton size-full" />}>
        {webglAvailable === true && (
          <RouteGlobe
            geometry={geometry}
            selectedStageId={selectedStageId}
            onSelectStage={onSelectStage}
            reducedMotion={reducedMotion}
          />
        )}
      </Suspense>

      {selectedStageId !== undefined && (
        <div className="absolute bottom-3 left-3">
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
    <div className="flex size-full flex-col gap-3 overflow-auto rounded-[24px] border border-line bg-white/70 p-4">
      <p className="text-sm text-muted">{note}</p>
      {children}
    </div>
  );
}

/**
 * `undefined` — проверка ещё не выполнена. Три состояния вместо двух нужны, чтобы не
 * мигнуть fallback-схемой до того, как стало известно о поддержке WebGL.
 */
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
