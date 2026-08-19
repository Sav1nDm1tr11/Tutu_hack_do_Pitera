import type { CandidateOption, CandidatePool, Money } from '@tutu-plan-b/domain';
import {
  formatDuration,
  formatPrice,
  formatTransfers,
  formatWallClockTime,
  isHotelOption,
  isTransportOption,
} from '@tutu-plan-b/domain';
import { Badge } from '../../components/ui/Badge';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';

export interface OptionListSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly optionIds: readonly string[];
  readonly pool: CandidatePool;
  readonly selectedOptionId: string | undefined;
  readonly selectedPrice: Money | undefined;
  readonly busy: boolean;
  readonly caveat?: string | undefined;
  readonly onPick: (optionId: string) => void;
}

export function OptionListSheet({
  open,
  onOpenChange,
  title,
  description,
  optionIds,
  pool,
  selectedOptionId,
  selectedPrice,
  busy,
  caveat,
  onPick,
}: OptionListSheetProps): React.JSX.Element {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {caveat !== undefined && (
        <p className="mb-3 rounded-2xl border-2 border-dashed border-[var(--color-accent-line)] bg-[var(--color-accent-soft)] px-3.5 py-3 text-[12.5px] text-muted">
          {caveat}
        </p>
      )}

      {optionIds.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-[var(--color-input)] p-4">
          <p className="m-0 text-[15px] font-extrabold">Запасных вариантов в этот день нет</p>
          <p className="mt-1.5 text-[12.5px] leading-normal text-muted">
            Это результат проверки, а не ошибка. Готовых замен в найденном инвентаре нет.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {optionIds.map((optionId) => {
            const option = pool[optionId];
            if (option === undefined) return null;
            const isSelected = optionId === selectedOptionId;
            const diff = priceDiff(selectedPrice, option.price);

            return (
              <li key={optionId}>
                <div
                  className={cn(
                    'flex flex-col gap-2 rounded-[14px] border p-3.5',
                    isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-accent-soft)]'
                      : 'border-line bg-[var(--color-input)]',
                  )}
                >
                  <OptionSummary option={option} />
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="tabular text-base font-extrabold">{formatPrice(option.price)}</p>
                      {diff !== undefined && (
                        <p className="mt-px text-[11.5px] text-muted tabular">{diff}</p>
                      )}
                    </div>
                    {isSelected ? (
                      <Badge tone="info">Выбрано</Badge>
                    ) : (
                      <Button size="sm" loading={busy} disabled={busy} onClick={() => onPick(optionId)}>
                        Выбрать
                      </Button>
                    )}
                  </div>
                  {option.riskSignals.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {option.riskSignals.map((signal) => (
                        <li key={signal.code}>
                          <Badge tone={signal.severity === 'critical' ? 'danger' : 'warning'}>
                            {signal.message}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}

function priceDiff(current: Money | undefined, next: Money | undefined): string | undefined {
  if (current === undefined || next === undefined) return undefined;
  const delta = next.amount - current.amount;
  if (delta === 0) return 'та же цена';
  const formatted = formatPrice({ amount: Math.abs(delta), currency: 'RUB' });
  return delta > 0 ? `+${formatted}` : `−${formatted}`;
}

function OptionSummary({ option }: { readonly option: CandidateOption }): React.JSX.Element {
  if (isTransportOption(option)) {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-extrabold tabular">
          {formatWallClockTime(option.departure.at)} — {formatWallClockTime(option.arrival.at)}
        </p>
        <p className="text-xs text-muted">
          {formatDuration(option.durationMinutes)} · {formatTransfers(option.transferCount)}
          {option.operator === undefined ? '' : ` · ${option.operator}`}
        </p>
      </div>
    );
  }
  if (isHotelOption(option)) {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-extrabold">{option.name}</p>
        <p className="text-xs text-muted">
          {option.nights} ноч. {option.rating === undefined ? '' : `· рейтинг ${option.rating.toFixed(1)}`}
        </p>
      </div>
    );
  }
  return <p className="text-sm text-ink">{formatDuration(option.durationMinutes)}</p>;
}
