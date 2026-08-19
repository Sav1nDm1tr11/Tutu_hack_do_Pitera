import type {
  CalculatedOption,
  CandidateOption,
  CandidatePool,
  FreshnessState,
  HotelOption,
  ItineraryStage,
  TransportOption,
} from '@tutu-plan-b/domain';
import {
  deriveFreshness,
  isCheckoutAllowedForFreshness,
  formatDuration,
  formatPrice,
  formatTransfers,
  formatWallClockDate,
  formatWallClockTime,
  isHotelOption,
  isTransportOption,
  pluralizeRu,
} from '@tutu-plan-b/domain';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { FreshnessBadge } from './FreshnessBadge';
import { TransportIcon, type TransportIconMode } from '../../components/brand/TransportIcon';

const MODE_LABELS: Record<TransportOption['mode'], string> = {
  flight: 'Самолёт',
  train: 'Поезд',
  bus: 'Автобус',
  suburbanTrain: 'Электричка',
};

export interface StageCardProps {
  readonly stage: ItineraryStage;
  readonly pool: CandidatePool;
  readonly selected: boolean;
  readonly busy: boolean;
  readonly offline: boolean;
  readonly now: string;
  readonly alternativesCount: number;
  readonly fallbackCount: number;
  readonly onSelect: () => void;
  readonly onOpenAlternatives: () => void;
  readonly onOpenFallback: () => void;
}

export function StageCard({
  stage,
  pool,
  selected,
  busy,
  offline,
  now,
  alternativesCount,
  fallbackCount,
  onSelect,
  onOpenAlternatives,
  onOpenFallback,
}: StageCardProps): React.JSX.Element {
  const option = pool[stage.selectedOptionId];
  const freshness: FreshnessState =
    option === undefined
      ? 'stale'
      : deriveFreshness({
          fetchedAt: option.fetchedAt,
          expiresAt: option.expiresAt,
          now,
          isOffline: offline,
        });
  const hasRisk = option !== undefined && option.riskSignals.some((signal) => signal.severity !== 'info');

  return (
    <li
      className={cn(
        'relative flex w-full shrink-0 flex-col rounded-[15px] border bg-[var(--color-surface)] p-3.5 lg:w-[272px]',
        selected ? 'border-[var(--color-primary)]' : hasRisk ? 'border-[var(--color-grade-c)]' : 'border-line',
        busy && 'opacity-60',
      )}
      aria-current={selected ? 'step' : undefined}
    >
      <button type="button" onClick={onSelect} className="flex w-full items-start gap-2.5 text-left">
        <span
          className={cn(
            'grid size-[34px] shrink-0 place-items-center rounded-[10px]',
            stage.kind === 'transfer' || stage.kind === 'wait'
              ? 'bg-warning-soft text-warning'
              : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
          )}
        >
          <TransportIcon mode={iconMode(option, stage.kind)} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-sm font-extrabold tracking-[-0.01em]">{stage.title}</h3>
          {option !== undefined && <Subtitle option={option} />}
        </div>
      </button>

      {stage.temporarilyUnavailable ? (
        <p className="mt-2.5 text-sm text-muted">
          Категория недоступна в этом поиске. Остальной маршрут собран и остаётся в силе.
        </p>
      ) : option === undefined ? (
        <p className="mt-2.5 text-sm text-muted">нет данных</p>
      ) : isTransportOption(option) ? (
        <TransportBody option={option} freshness={freshness} now={now} offline={offline} />
      ) : isHotelOption(option) ? (
        <HotelBody option={option} freshness={freshness} now={now} offline={offline} />
      ) : (
        <CalculatedBody option={option} />
      )}

      {option !== undefined && option.riskSignals.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {option.riskSignals.map((signal) => (
            <li
              key={signal.code}
              className="flex gap-1.5 rounded-[11px] bg-warning-soft px-2.5 py-2.5 text-[12.5px] leading-snug font-semibold text-warning"
            >
              <AlertIcon />
              <span>{signal.message}</span>
            </li>
          ))}
        </ul>
      )}

      {!stage.temporarilyUnavailable && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {alternativesCount > 0 && (
            <Button size="sm" variant="ghost" onClick={onOpenAlternatives}>
              {alternativesCount} {pluralizeRu(alternativesCount, 'вариант', 'варианта', 'вариантов')}
            </Button>
          )}
          {fallbackCount > 0 && (
            <Button size="sm" variant="secondary" onClick={onOpenFallback} icon={<ShieldIcon />}>
              План Б
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function iconMode(
  option: CandidateOption | undefined,
  kind: ItineraryStage['kind'],
): TransportIconMode {
  if (kind === 'transfer' || kind === 'wait') return 'transfer';
  if (option === undefined) return 'train';
  if (isHotelOption(option)) return 'hotel';
  if (isTransportOption(option)) return option.mode;
  return 'transfer';
}

function Subtitle({ option }: { readonly option: CandidateOption }): React.JSX.Element | null {
  if (isTransportOption(option)) {
    const parts = [MODE_LABELS[option.mode], option.operator].filter(
      (part): part is string => part !== undefined && part !== '',
    );
    return <p className="mt-0.5 text-xs text-muted">{parts.join(' · ')}</p>;
  }
  if (isHotelOption(option)) {
    return <p className="mt-0.5 text-xs text-muted">{option.name}</p>;
  }
  return <p className="mt-0.5 text-xs text-muted">Рассчитано нами</p>;
}

function TransportBody({
  option,
  freshness,
  now,
  offline,
}: {
  readonly option: TransportOption;
  readonly freshness: FreshnessState;
  readonly now: string;
  readonly offline: boolean;
}): React.JSX.Element {
  return (
    <div className="mt-2.5 flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <TimePoint at={option.departure.at} place={option.departure.place.name} align="start" />
        <div className="mt-1 flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[11px] text-muted tabular">{formatDuration(option.durationMinutes)}</span>
          <span aria-hidden="true" className="h-px w-full bg-line" />
          <span className="text-[11px] text-muted">{formatTransfers(option.transferCount)}</span>
        </div>
        <TimePoint at={option.arrival.at} place={option.arrival.place.name} align="end" />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="tabular text-base font-extrabold">{formatPrice(option.price)}</p>
        <FreshnessBadge
          fetchedAt={option.fetchedAt}
          expiresAt={option.expiresAt}
          now={now}
          offline={offline}
        />
      </div>
      <Checkout option={option} freshness={freshness} />
    </div>
  );
}

function HotelBody({
  option,
  freshness,
  now,
  offline,
}: {
  readonly option: HotelOption;
  readonly freshness: FreshnessState;
  readonly now: string;
  readonly offline: boolean;
}): React.JSX.Element {
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <p className="text-sm text-muted">
        {formatWallClockDate(option.checkIn)} — {formatWallClockDate(option.checkOut)}, {option.nights}{' '}
        {pluralizeRu(option.nights, 'ночь', 'ночи', 'ночей')}
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="tabular text-base font-extrabold">{formatPrice(option.price)}</p>
        <FreshnessBadge
          fetchedAt={option.fetchedAt}
          expiresAt={option.expiresAt}
          now={now}
          offline={offline}
        />
      </div>
      {option.rating !== undefined && (
        <p className="text-sm text-ink">
          Рейтинг <span className="tabular font-bold">{option.rating.toFixed(1)}</span> из 10
        </p>
      )}
      {option.reviewSummary !== undefined && (
        <p className="text-sm text-muted">{option.reviewSummary.text}</p>
      )}
      {option.reviewRedFlags.length > 0 && (
        <ul className="flex flex-col gap-1">
          {option.reviewRedFlags.map((flag) => (
            <li key={flag} className="flex items-start gap-1.5 text-sm text-warning">
              <AlertIcon />
              <span>{flag}</span>
            </li>
          ))}
        </ul>
      )}
      <Checkout option={option} freshness={freshness} />
    </div>
  );
}

function CalculatedBody({ option }: { readonly option: CalculatedOption }): React.JSX.Element {
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tabular text-[15px] font-medium">{formatDuration(option.durationMinutes)}</p>
        <Badge tone="info">Рассчитано нами</Badge>
      </div>
      {option.sameStation === false && (
        <p className="text-sm text-warning">Переход между разными точками отправления</p>
      )}
      {option.sameStation === undefined && (
        <p className="text-sm text-muted">Не удалось определить, меняется ли точка пересадки</p>
      )}
      {!option.bufferSatisfied && (
        <p className="flex items-start gap-1.5 text-sm text-warning">
          <AlertIcon />
          <span>
            Запас меньше рекомендуемых {option.minimumBufferMinutes} мин — при задержке пересадка под
            угрозой
          </span>
        </p>
      )}
    </div>
  );
}

function Checkout({
  option,
  freshness,
}: {
  readonly option: CandidateOption;
  readonly freshness: FreshnessState;
}): React.JSX.Element | null {
  if (option.checkoutUrl === undefined) return null;
  if (!isCheckoutAllowedForFreshness(freshness)) {
    return (
      <p className="text-sm text-muted">
        Оформление недоступно, пока данные не обновлены — цена могла измениться.
      </p>
    );
  }
  return (
    <a
      href={option.checkoutUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-target inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--color-accent)] underline underline-offset-4"
    >
      Открыть на Туту
      <span className="visually-hidden">Откроется в новой вкладке</span>
    </a>
  );
}

function TimePoint({
  at,
  place,
  align,
}: {
  readonly at: string;
  readonly place: string;
  readonly align: 'start' | 'end';
}): React.JSX.Element {
  return (
    <div className={cn('flex min-w-0 flex-col', align === 'end' && 'items-end text-right')}>
      <span className="tabular text-[17px] leading-tight font-extrabold">{formatWallClockTime(at)}</span>
      <span className="text-[11px] text-muted">{formatWallClockDate(at)}</span>
      <span className="mt-0.5 truncate text-xs">{place}</span>
    </div>
  );
}

function AlertIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 size-[13px] shrink-0" fill="none">
      <path d="M8 2.5l6 11H2l6-11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.4v3M8 11.6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
      <path
        d="M8 1.8l5 1.8v4.2c0 3-2.1 5.2-5 6.4-2.9-1.2-5-3.4-5-6.4V3.6l5-1.8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M5.8 8l1.7 1.7 3-3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
