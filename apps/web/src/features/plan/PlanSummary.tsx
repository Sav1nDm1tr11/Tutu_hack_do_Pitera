import type { PlanConfiguration } from '@tutu-plan-b/domain';
import { formatDuration, formatPrice, formatTransfers } from '@tutu-plan-b/domain';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/cn';

export interface PlanSummaryProps {
  readonly configuration: PlanConfiguration;
  readonly compact?: boolean;
}

/**
 * Сводка по конфигурации (§6.3).
 *
 * Показывает не только оценку, но и `confidence`: балл, посчитанный по половине данных,
 * и балл по полным данным — разные утверждения, и скрывать эту разницу значило бы
 * выдавать догадку за расчёт (§9.2).
 */
export function PlanSummary({ configuration, compact = false }: PlanSummaryProps): React.JSX.Element {
  const { totals, score } = configuration;

  return (
    <div className={cn('flex flex-col gap-3', compact && 'gap-2')}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold text-ink tabular">{formatPrice(totals.price)}</p>
        {totals.budgetDelta !== undefined && totals.budgetDelta > 0 && (
          <Badge tone="danger" icon={<AlertIcon />}>
            Дороже бюджета на {Math.round(totals.budgetDelta).toLocaleString('ru-RU')} ₽
          </Badge>
        )}
        {totals.priceCompleteness < 1 && (
          <Badge tone="warning" icon={<AlertIcon />}>
            Цена не по всем этапам
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Metric label="В дороге" value={formatDuration(totals.travelMinutes)} />
        <Metric label="Пересадки" value={formatTransfers(totals.transferCount)} />
        <Metric
          label="Устойчивость"
          value={`${Math.round(dimension(configuration, 'resilience') * 100)}%`}
        />
        <Metric label="Уверенность в оценке" value={`${Math.round(score.confidence * 100)}%`} />
      </dl>

      {score.needsVerification && (
        <p className="flex items-start gap-1.5 text-sm text-warning">
          <AlertIcon />
          <span>Часть ограничений не удалось проверить по данным инвентаря</span>
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-[15px] font-medium text-ink tabular">{value}</dd>
    </div>
  );
}

function dimension(configuration: PlanConfiguration, key: string): number {
  return configuration.score.dimensions.find((item) => item.key === key)?.score ?? 0;
}

function AlertIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none">
      <path d="M8 2.5l6 11H2l6-11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.4v3M8 11.6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
