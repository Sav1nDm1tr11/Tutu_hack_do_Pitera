import type { CandidateOption, CandidatePool } from '@tutu-plan-b/domain';
import {
  FALLBACK_CAVEAT,
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
  readonly busy: boolean;
  /** Оговорка «Плана Б» (§10.3). Отсутствует для обычного списка альтернатив. */
  readonly caveat?: string | undefined;
  readonly onPick: (optionId: string) => void;
}

/**
 * Список альтернатив и «План Б» в одном компоненте.
 *
 * Различие между ними — не в устройстве списка, а в обещании: альтернативы можно выбрать
 * прямо сейчас, а «План Б» был доступен на момент поиска и требует проверки перед
 * оформлением. Поэтому оговорка передаётся параметром и показывается до списка, а не
 * прячется под ним.
 */
export function OptionListSheet({
  open,
  onOpenChange,
  title,
  description,
  optionIds,
  pool,
  selectedOptionId,
  busy,
  caveat,
  onPick,
}: OptionListSheetProps): React.JSX.Element {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {caveat !== undefined && (
        <p className="mb-3 rounded-[16px] bg-warning-soft px-3 py-2.5 text-sm text-warning">
          {caveat}
        </p>
      )}

      {optionIds.length === 0 ? (
        <p className="text-sm text-muted">
          Готовых замен в найденном инвентаре нет. Мы не показываем варианты, которых не нашли.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {optionIds.map((optionId) => {
            const option = pool[optionId];
            if (option === undefined) return null;

            const isSelected = optionId === selectedOptionId;

            return (
              <li key={optionId}>
                <div
                  className={cn(
                    'flex flex-col gap-2 rounded-[18px] border p-3',
                    isSelected ? 'border-violet bg-info-soft' : 'border-line bg-white',
                  )}
                >
                  <OptionSummary option={option} />

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold text-ink tabular">
                      {formatPrice(option.price)}
                    </p>

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

function OptionSummary({ option }: { readonly option: CandidateOption }): React.JSX.Element {
  if (isTransportOption(option)) {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-ink tabular">
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
        <p className="text-sm font-medium text-ink">{option.name}</p>
        <p className="text-xs text-muted">
          {option.nights} ноч. {option.rating === undefined ? '' : `· рейтинг ${option.rating.toFixed(1)}`}
        </p>
      </div>
    );
  }

  return <p className="text-sm text-ink">{formatDuration(option.durationMinutes)}</p>;
}

export { FALLBACK_CAVEAT };
