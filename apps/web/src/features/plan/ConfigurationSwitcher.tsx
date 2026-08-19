import type { PlanConfiguration } from '@tutu-plan-b/domain';
import { formatDuration, formatPrice, formatTransfers } from '@tutu-plan-b/domain';
import { cn } from '../../lib/cn';
import { describeLabels } from '../../store/plan-store';
import { reliabilityGrade } from '../../lib/reliability';

export interface ConfigurationSwitcherProps {
  readonly configurations: readonly PlanConfiguration[];
  readonly activeId: string | undefined;
  readonly onChange: (configurationId: string) => void;
}

export function ConfigurationSwitcher({
  configurations,
  activeId,
  onChange,
}: ConfigurationSwitcherProps): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Варианты маршрута"
      className="flex gap-2.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible"
    >
      {configurations.map((configuration) => {
        const active = configuration.id === activeId;
        const grade = reliabilityGrade(configuration.score.total);

        return (
          <button
            key={configuration.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(configuration.id)}
            className={cn(
              'flex min-w-[180px] shrink-0 flex-col items-stretch gap-1 rounded-[14px] border p-3 text-left lg:min-w-0 lg:w-full',
              active
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-[var(--shadow-cta)]'
                : 'border-line bg-[var(--color-surface)] text-ink',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <strong className="text-[13.5px] font-extrabold">
                {describeLabels(configuration.labels)}
              </strong>
              <span
                className="grade-badge size-[22px] text-[11px]"
                style={{ background: grade.color }}
              >
                {grade.letter}
              </span>
            </span>
            <span className="tabular text-xl font-extrabold tracking-[-0.03em]">
              {formatPrice(configuration.totals.price)}
            </span>
            <span
              className={cn(
                'flex flex-wrap gap-x-2 gap-y-0.5 text-[11.5px] tabular',
                active ? 'opacity-75' : 'text-muted',
              )}
            >
              <span>{formatDuration(configuration.totals.travelMinutes)}</span>
              <span>{formatTransfers(configuration.totals.transferCount)}</span>
              <span>{Math.round(configuration.score.total)}% надёжности</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
