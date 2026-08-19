import type { PlanConfiguration } from '@tutu-plan-b/domain';
import { formatPrice } from '@tutu-plan-b/domain';
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
    <div role="radiogroup" aria-label="Варианты маршрута" className="flex gap-2 overflow-x-auto pb-1">
      {configurations.map((configuration) => {
        const active = configuration.id === activeId;

        return (
          <button
            key={configuration.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(configuration.id)}
            className={cn(
              'tap-target flex min-w-[9.5rem] shrink-0 flex-col items-start gap-0.5 rounded-[18px] border px-4 py-2.5 text-left transition-colors',
              active
                ? 'border-violet bg-info-soft text-navy'
                : 'border-line bg-white text-ink hover:bg-surface',
            )}
            style={{ transitionDuration: 'var(--duration-micro)' }}
          >
            <span className="text-sm font-semibold">{describeLabels(configuration.labels)}</span>
            <span className="text-sm text-muted tabular">{formatPrice(configuration.totals.price)}</span>
          </button>
        );
      })}
    </div>
  );
}
