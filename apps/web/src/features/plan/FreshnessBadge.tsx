import type { FreshnessState } from '@tutu-plan-b/domain';
import { deriveFreshness, formatWallClockTime } from '@tutu-plan-b/domain';
import { Badge, type BadgeTone } from '../../components/ui/Badge';

const TONE: Record<FreshnessState, BadgeTone> = {
  fresh: 'success',
  aging: 'neutral',
  stale: 'warning',
  offline: 'danger',
};

const LABEL: Record<FreshnessState, string> = {
  fresh: 'Актуально',
  aging: 'Стоит обновить',
  stale: 'Данные могут быть устаревшими',
  offline: 'Оффлайн-копия',
};

export interface FreshnessBadgeProps {
  readonly fetchedAt: string;
  readonly expiresAt?: string | undefined;
  readonly now: string;
  readonly offline: boolean;
}

/**
 * Индикатор свежести (§14.3).
 *
 * Состояние не выбирается компонентом: его считает доменная функция по тем же правилам,
 * что и сервер. Иначе клиент мог бы назвать «актуальной» цену, которую сервер считает
 * устаревшей, — а это ровно тот случай, который §14.3 запрещает.
 */
export function FreshnessBadge({
  fetchedAt,
  expiresAt,
  now,
  offline,
}: FreshnessBadgeProps): React.JSX.Element {
  const state = deriveFreshness({ fetchedAt, expiresAt, now, isOffline: offline });

  return (
    <Badge tone={TONE[state]} icon={<ClockIcon />} title={`Данные получены в ${formatWallClockTime(fetchedAt)}`}>
      {LABEL[state]}
    </Badge>
  );
}

function ClockIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.8V8l2.4 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
