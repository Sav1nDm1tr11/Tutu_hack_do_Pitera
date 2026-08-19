import type {
  CalculatedOption,
  CandidateOption,
  CandidatePool,
  FreshnessState,
  HotelOption,
  ItineraryStage,
  RiskSignal,
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
import { Badge, type BadgeTone } from '../../components/ui/Badge';
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

const RISK_TONE: Record<RiskSignal['severity'], BadgeTone> = {
  info: 'neutral',
  warning: 'warning',
  critical: 'danger',
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

/**
 * Карточка этапа маршрута (§6.5).
 *
 * Порядок полей задан спецификацией и не переставляется по вкусу: пользователь
 * сравнивает варианты глазами, и стабильное расположение цены и времени важнее
 * компактности. Отсутствующие поля не показываются вовсе — «нет данных» появляется
 * только там, где отсутствие само по себе значимо (§3.3).
 */
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

  return (
    <li
      className={cn(
        'route-stage-card relative flex flex-col gap-3 p-4 transition-colors',
        selected && 'route-stage-card--selected',
        busy && 'opacity-60',
      )}
      style={{ transitionDuration: 'var(--duration-card)' }}
      aria-current={selected ? 'step' : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="stage-mode-icon">
            <TransportIcon mode={iconMode(option)} />
          </span>
          <div className="min-w-0">
            <h3 className="text-navy text-[15px] font-extrabold">{stage.title}</h3>
            {option !== undefined && <Subtitle option={option} />}
          </div>
        </div>

        {stage.temporarilyUnavailable ? (
          <Badge tone="warning" icon={<AlertIcon />}>
            Временно недоступно
          </Badge>
        ) : (
          option !== undefined && (
            <FreshnessBadge
              fetchedAt={option.fetchedAt}
              expiresAt={option.expiresAt}
              now={now}
              offline={offline}
            />
          )
        )}
      </div>

      {stage.temporarilyUnavailable ? (
        <p className="text-muted text-sm">
          Категория недоступна в этом поиске. Остальной маршрут собран и остаётся в силе.
        </p>
      ) : option === undefined ? (
        <p className="text-muted text-sm">нет данных</p>
      ) : isTransportOption(option) ? (
        <TransportBody option={option} freshness={freshness} />
      ) : isHotelOption(option) ? (
        <HotelBody option={option} freshness={freshness} />
      ) : (
        <CalculatedBody option={option} />
      )}

      {option !== undefined && option.riskSignals.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {option.riskSignals.map((signal) => (
            <li key={signal.code}>
              <Badge tone={RISK_TONE[signal.severity]} icon={<AlertIcon />}>
                {signal.message}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {!stage.temporarilyUnavailable && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={onSelect}>
            {selected ? 'Скрыть на глобусе' : 'Показать на глобусе'}
          </Button>

          {alternativesCount > 0 && (
            <Button size="sm" variant="ghost" onClick={onOpenAlternatives}>
              {alternativesCount}{' '}
              {pluralizeRu(alternativesCount, 'вариант', 'варианта', 'вариантов')}
            </Button>
          )}

          {fallbackCount > 0 && (
            <Button size="sm" variant="ghost" onClick={onOpenFallback} icon={<ShieldIcon />}>
              План Б
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function iconMode(option: CandidateOption | undefined): TransportIconMode {
  if (option === undefined) return 'train';
  if (isHotelOption(option)) return 'hotel';
  if (isTransportOption(option)) return option.mode;
  return 'suburbanTrain';
}

function Subtitle({ option }: { readonly option: CandidateOption }): React.JSX.Element | null {
  if (isTransportOption(option)) {
    const parts = [MODE_LABELS[option.mode], option.operator].filter(
      (part): part is string => part !== undefined && part !== '',
    );
    return <p className="text-muted mt-0.5 text-sm">{parts.join(' · ')}</p>;
  }

  if (isHotelOption(option)) {
    return <p className="text-muted mt-0.5 text-sm">{option.name}</p>;
  }

  return null;
}

function TransportBody({
  option,
  freshness,
}: {
  readonly option: TransportOption;
  readonly freshness: FreshnessState;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <TimePoint at={option.departure.at} place={option.departure.place.name} align="start" />
        <div className="mt-2 flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-muted tabular text-xs">
            {formatDuration(option.durationMinutes)}
          </span>
          <span aria-hidden="true" className="bg-line h-px w-full" />
          <span className="text-muted text-xs">{formatTransfers(option.transferCount)}</span>
        </div>
        <TimePoint at={option.arrival.at} place={option.arrival.place.name} align="end" />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ink tabular text-lg font-semibold">{formatPrice(option.price)}</p>
        {option.serviceClass !== undefined && (
          <span className="text-muted text-sm">{option.serviceClass}</span>
        )}
      </div>

      {option.segments !== undefined && option.segments.length > 1 && (
        <ol className="border-line flex flex-col gap-1 border-l pl-3">
          {option.segments.map((segment) => (
            <li key={segment.id} className="text-muted text-xs">
              {MODE_LABELS[segment.mode]}: {segment.departure.place.name} →{' '}
              {segment.arrival.place.name}, {formatWallClockTime(segment.departure.at)}–
              {formatWallClockTime(segment.arrival.at)}
            </li>
          ))}
        </ol>
      )}

      <Checkout option={option} freshness={freshness} />
    </div>
  );
}

function HotelBody({
  option,
  freshness,
}: {
  readonly option: HotelOption;
  readonly freshness: FreshnessState;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted text-sm">
        {formatWallClockDate(option.checkIn)} — {formatWallClockDate(option.checkOut)},{' '}
        {option.nights} {pluralizeRu(option.nights, 'ночь', 'ночи', 'ночей')}
      </p>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-ink tabular text-lg font-semibold">{formatPrice(option.price)}</p>
        {option.pricePerNight !== undefined && (
          <span className="text-muted tabular text-sm">
            {formatPrice(option.pricePerNight)} за ночь
          </span>
        )}
      </div>

      {option.rating !== undefined && (
        <p className="text-ink text-sm">
          Рейтинг <span className="tabular font-semibold">{option.rating.toFixed(1)}</span> из 10
        </p>
      )}

      {option.reviewSummary !== undefined && (
        <p className="text-muted text-sm">{option.reviewSummary.text}</p>
      )}

      {option.reviewRedFlags.length > 0 && (
        <ul className="flex flex-col gap-1">
          {option.reviewRedFlags.map((flag) => (
            <li key={flag} className="text-warning flex items-start gap-1.5 text-sm">
              <AlertIcon />
              <span>{flag}</span>
            </li>
          ))}
        </ul>
      )}

      {option.distanceToCenterKm !== undefined && (
        <p className="text-muted tabular text-sm">
          {option.distanceToCenterKm.toFixed(1)} км до центра
        </p>
      )}

      <Checkout option={option} freshness={freshness} />
    </div>
  );
}

function CalculatedBody({ option }: { readonly option: CalculatedOption }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-ink tabular text-[15px] font-medium">
          {formatDuration(option.durationMinutes)}
        </p>
        {/* §6.5: вычисленный блок всегда помечен — иначе он читался бы как данные из инвентаря. */}
        <Badge tone="info" icon={<CalcIcon />}>
          Рассчитано нами
        </Badge>
      </div>

      {option.sameStation === false && (
        <p className="text-warning text-sm">Переход между разными точками отправления</p>
      )}
      {option.sameStation === undefined && (
        <p className="text-muted text-sm">Не удалось определить, меняется ли точка пересадки</p>
      )}

      {!option.bufferSatisfied && (
        <p className="text-warning flex items-start gap-1.5 text-sm">
          <AlertIcon />
          <span>
            Запас меньше рекомендуемых {option.minimumBufferMinutes} мин — при задержке пересадка
            под угрозой
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Оформление всегда уводит на ТуТу и всегда в новой вкладке: покупка совершается
 * человеком на стороне сервиса (§2.1, human-in-the-loop). URL уже проверен по allowlist
 * при нормализации, поэтому здесь достаточно его наличия.
 *
 * При устаревших данных ссылка не показывается вовсе (§14.3): отправить человека
 * оформлять цену, которую мы сами считаем неактуальной, — худший из возможных исходов.
 */
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
      <p className="text-muted text-sm">
        Оформление недоступно, пока данные не обновлены — цена могла измениться.
      </p>
    );
  }

  return (
    <a
      href={option.checkoutUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-target text-navy decoration-violet/40 hover:decoration-violet inline-flex w-fit items-center gap-1.5 text-sm font-medium underline underline-offset-4"
    >
      Перейти к оформлению на ТуТу
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
        <path
          d="M6 3h7v7M13 3L4 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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
      <span className="text-ink tabular text-lg leading-tight font-semibold">
        {formatWallClockTime(at)}
      </span>
      <span className="text-muted text-xs">{formatWallClockDate(at)}</span>
      <span className="text-ink mt-0.5 truncate text-sm">{place}</span>
    </div>
  );
}

function AlertIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none">
      <path
        d="M8 2.5l6 11H2l6-11z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6.4v3M8 11.6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CalcIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
      <rect x="3" y="2" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.6 5.4h4.8M5.6 8.4h1.2M8 8.4h1.2M10.4 8.4h.01M5.6 11h1.2M8 11h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M8 1.8l5 1.8v4.2c0 3-2.1 5.2-5 6.4-2.9-1.2-5-3.4-5-6.4V3.6l5-1.8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5.8 8l1.7 1.7 3-3.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
