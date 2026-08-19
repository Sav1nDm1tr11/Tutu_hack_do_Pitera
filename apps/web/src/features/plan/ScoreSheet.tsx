import type { PlanConfiguration } from '@tutu-plan-b/domain';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { DIMENSION_LABELS, reliabilityGrade } from '../../lib/reliability';
import { describeLabels } from '../../store/plan-store';

export interface ScoreSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly configuration: PlanConfiguration;
}

export function ScoreSheet({
  open,
  onOpenChange,
  configuration,
}: ScoreSheetProps): React.JSX.Element {
  const grade = reliabilityGrade(configuration.score.total);
  const index = Math.round(configuration.score.total);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Из чего сложился балл"
      description={`${describeLabels(configuration.labels)} конфигурация · ${String(configuration.score.dimensions.length)} размерности`}
    >
      <div className="mb-4 flex items-end gap-3">
        <span className="tabular text-[46px] leading-[0.9] font-extrabold tracking-[-0.05em]">
          {index}
        </span>
        <div className="pb-1.5">
          <span className="grade-badge size-[30px] text-[15px]" style={{ background: grade.color }}>
            {grade.letter}
          </span>
          <p className="mt-1.5 text-xs text-muted">
            Уверенность в оценке {Math.round(configuration.score.confidence * 100)}%
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {configuration.score.dimensions.map((dimension) => {
          const value = Math.round(dimension.score * 100);
          const barGrade = reliabilityGrade(value);
          const explanation = dimension.reasons[0]?.message;
          return (
            <div key={dimension.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-extrabold">
                  {DIMENSION_LABELS[dimension.key]}
                </span>
                <span className="text-xs text-muted tabular">
                  вес {dimension.weight} · {value}%
                </span>
              </div>
              <div className="my-1.5 h-[7px] overflow-hidden rounded-full bg-[var(--color-track)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${String(value)}%`, background: barGrade.color }}
                />
              </div>
              {explanation !== undefined ? (
                <p className="m-0 text-[12.5px] leading-normal text-muted">{explanation}</p>
              ) : (
                <p className="m-0 text-[12.5px] leading-normal text-muted">
                  Туту не вернул сигналы для этой размерности.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-[18px] rounded-[12px] bg-[var(--color-accent-soft)] px-3 py-3 text-[12.5px] leading-normal text-ink">
        Считаем структурную устойчивость по данным Туту. О реальных задержках рейсов мы не знаем.
      </p>
    </BottomSheet>
  );
}
