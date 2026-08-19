import type { PlanConfiguration } from '@tutu-plan-b/domain';
import { formatDuration, formatPrice } from '@tutu-plan-b/domain';
import { cn } from '../../lib/cn';
import { describeLabels } from '../../store/plan-store';

export interface ConfigurationSwitcherProps {
  readonly configurations: readonly PlanConfiguration[];
  readonly activeId: string | undefined;
  readonly onChange: (configurationId: string) => void;
}

/**
 * Переключатель конфигураций (§6.3).
 *
 * Реализован как `radiogroup`, а не как таб-бар: выбор конфигурации — это выбор одного
 * значения из набора, а не навигация между независимыми панелями. Стрелки на клавиатуре
 * при этом работают ожидаемо для пользователя скринридера.
 */
export function ConfigurationSwitcher({
  configurations,
  activeId,
  onChange,
}: ConfigurationSwitcherProps): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="Варианты маршрута" className="configuration-switcher">
      {configurations.map((configuration) => {
        const active = configuration.id === activeId;

        return (
          <button
            key={configuration.id}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(configuration.id)}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
              const currentIndex = configurations.findIndex((item) => item.id === configuration.id);
              const next =
                configurations[
                  (currentIndex + direction + configurations.length) % configurations.length
                ];
              if (next === undefined) return;
              const group = event.currentTarget.parentElement;
              onChange(next.id);
              requestAnimationFrame(() => {
                group?.querySelector<HTMLElement>(`[data-configuration-id="${next.id}"]`)?.focus();
              });
            }}
            data-configuration-id={configuration.id}
            className={cn(
              'configuration-option tap-target',
              active ? 'configuration-option--active' : 'configuration-option--idle',
            )}
            style={{ transitionDuration: 'var(--duration-micro)' }}
          >
            <span className="configuration-option__head">
              <strong>{describeLabels(configuration.labels)}</strong>
              <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                {active && <circle cx="8" cy="8" r="2.5" fill="currentColor" />}
              </svg>
            </span>
            <span className="configuration-option__price tabular">
              {formatPrice(configuration.totals.price)}
            </span>
            <span className="configuration-option__meta">
              <span>{formatDuration(configuration.totals.travelMinutes)}</span>
              <span>{Math.round(resilience(configuration) * 100)}% устойчивости</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function resilience(configuration: PlanConfiguration): number {
  return configuration.score.dimensions.find((item) => item.key === 'resilience')?.score ?? 0;
}
