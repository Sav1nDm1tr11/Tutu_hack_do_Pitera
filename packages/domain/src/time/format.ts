import type { Money } from '../contracts/common';
import { parseWallClock } from './wall-clock';

/**
 * Форматтеры живут в домене, потому что одни и те же строки нужны и объяснениям на
 * сервере, и карточкам в браузере. Расхождение формулировок между слоями выглядело бы
 * как расхождение данных.
 *
 * `undefined` на входе всегда даёт «нет данных», а не «0» — §3.3.
 */

const NO_DATA = 'нет данных';

export function formatDuration(minutes: number | undefined): string {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return NO_DATA;

  const totalMinutes = Math.round(minutes);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} д`);
  if (hours > 0) parts.push(`${hours} ч`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins} мин`);

  return parts.join(' ');
}

export function formatPrice(money: Money | undefined): string {
  if (money === undefined) return NO_DATA;
  const rounded = Math.round(money.amount);
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${grouped}\u00a0₽`;
}

export function formatWallClockTime(iso: string | undefined): string {
  if (iso === undefined) return NO_DATA;
  const parsed = parseWallClock(iso);
  if (parsed === undefined) return NO_DATA;

  const hours = Math.floor(parsed.minuteOfDay / 60);
  const minutes = parsed.minuteOfDay % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

export function formatWallClockDate(iso: string | undefined): string {
  if (iso === undefined) return NO_DATA;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return NO_DATA;

  const monthName = MONTHS_GENITIVE[Number(match[2]) - 1];
  if (monthName === undefined) return NO_DATA;

  return `${Number(match[3])} ${monthName}`;
}

/** «2 пересадки» / «без пересадок» / «нет данных» — три разных смысла, не два. */
export function formatTransfers(count: number | undefined): string {
  if (count === undefined) return NO_DATA;
  if (count === 0) return 'без пересадок';

  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? 'пересадок'
      : lastDigit === 1
        ? 'пересадка'
        : lastDigit >= 2 && lastDigit <= 4
          ? 'пересадки'
          : 'пересадок';

  return `${count} ${word}`;
}

export function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}
