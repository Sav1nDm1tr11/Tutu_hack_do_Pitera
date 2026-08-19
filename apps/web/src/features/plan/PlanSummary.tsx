import type { CandidatePool, PlanConfiguration } from '@tutu-plan-b/domain';
import { formatPrice } from '@tutu-plan-b/domain';
import { Button } from '../../components/ui/Button';
import { reliabilityGrade } from '../../lib/reliability';
import { budgetCaption, summaryMetrics } from './plan-metrics';

export interface PlanSummaryProps {
  readonly configuration: PlanConfiguration;
  readonly pool: CandidatePool;
  readonly budgetAmount: number | undefined;
  readonly checkoutBlocked: boolean;
  readonly checkoutNote: string;
  readonly compact?: boolean;
  readonly onOpenScore: () => void;
  readonly onCheckout: () => void;
}

export function PlanSummary({
  configuration,
  pool,
  budgetAmount,
  checkoutBlocked,
  checkoutNote,
  compact = false,
  onOpenScore,
  onCheckout,
}: PlanSummaryProps): React.JSX.Element {
  const { totals, score } = configuration;
  const grade = reliabilityGrade(score.total);
  const index = Math.round(score.total);

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-end gap-2">
          <span className="tabular text-[28px] leading-none font-extrabold tracking-[-0.04em]">
            {index}
          </span>
          <span
            className="grade-badge mb-0.5 size-[22px] text-[11px]"
            style={{ background: grade.color }}
          >
            {grade.letter}
          </span>
        </div>
        <p className="tabular text-lg font-extrabold">{formatPrice(totals.price)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <p className="mb-1 text-[11px] font-bold tracking-[0.07em] text-muted uppercase">
        Индекс структурной надёжности
      </p>
      <div className="flex items-end gap-2.5">
        <span className="tabular text-[46px] leading-[0.9] font-extrabold tracking-[-0.05em] lg:text-[56px]">
          {index}
        </span>
        <span className="grade-badge mb-1.5 size-[30px] text-[15px]" style={{ background: grade.color }}>
          {grade.letter}
        </span>
      </div>
      <div className="mt-2.5 mb-1 h-2 overflow-hidden rounded-full bg-[var(--color-track)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${String(index)}%`, background: grade.color }}
        />
      </div>
      <p className="mb-3.5 text-[11.5px] text-muted">{grade.caption}</p>

      <dl className="m-0 grid grid-cols-2 gap-x-2.5 gap-y-3">
        {summaryMetrics(configuration, pool).map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="text-[11.5px] text-muted">{metric.label}</dt>
            <dd className="mt-0.5 text-[14.5px] font-bold tabular">{metric.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3.5 text-[11px] font-bold tracking-[0.07em] text-muted uppercase">
        Ориентировочная цена
      </p>
      <p className="mt-0.5 tabular text-[30px] font-extrabold tracking-[-0.04em]">
        {formatPrice(totals.price)}
      </p>
      {budgetCaption(budgetAmount) !== undefined && (
        <p className="mt-0.5 text-[11.5px] text-muted">{budgetCaption(budgetAmount)}</p>
      )}
      {totals.priceCompleteness < 1 && (
        <p className="mt-1 text-[11.5px] text-warning">Цена не по всем этапам — Туту не вернул часть полей.</p>
      )}
      {score.needsVerification && (
        <p className="mt-1 text-[11.5px] text-warning">
          Часть ограничений не удалось проверить по данным инвентаря.
        </p>
      )}

      <Button variant="ghost" className="mt-3 w-full" onClick={onOpenScore}>
        Из чего сложился балл
      </Button>
      <Button className="mt-2 w-full" disabled={checkoutBlocked} onClick={onCheckout}>
        Перейти к оформлению
      </Button>
      <p className="mt-2 text-[11px] leading-snug text-muted">{checkoutNote}</p>
    </div>
  );
}
