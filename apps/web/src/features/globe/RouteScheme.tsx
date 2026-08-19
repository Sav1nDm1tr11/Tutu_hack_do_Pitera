import type { CandidatePool, PlanConfiguration } from '@tutu-plan-b/domain';
import { formatWallClockTime, isHotelOption, isTransportOption } from '@tutu-plan-b/domain';

export interface RouteSchemeProps {
  readonly configuration: PlanConfiguration;
  readonly pool: CandidatePool;
  readonly onSelectStage: (stageId: string | undefined) => void;
}

/**
 * Текстовая схема маршрута.
 *
 * Это не «упрощённая версия для слабых устройств», а полноценный эквивалент глобуса:
 * §15.5 требует его при отсутствии WebGL или координат, а §19 — как текстовую
 * альтернативу карте в любом случае. Поэтому здесь есть всё, что нужно для понимания
 * маршрута, и ни одна функция не спрятана за визуализацией.
 */
export function RouteScheme({
  configuration,
  pool,
  onSelectStage,
}: RouteSchemeProps): React.JSX.Element {
  return (
    <ol className="flex flex-col gap-2">
      {configuration.stages.map((stage) => {
        const option = pool[stage.selectedOptionId];

        return (
          <li key={stage.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[var(--color-primary)]"
            />
            <button
              type="button"
              onClick={() => onSelectStage(stage.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block text-sm font-medium text-ink">{stage.title}</span>
              <span className="block text-xs text-muted">
                {option === undefined
                  ? 'нет данных'
                  : isTransportOption(option)
                    ? `${option.departure.place.name} → ${option.arrival.place.name}, ${formatWallClockTime(option.departure.at)}`
                    : isHotelOption(option)
                      ? option.name
                      : 'Рассчитанный этап'}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
