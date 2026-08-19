/**
 * MCP не подтверждает, что вернёт таймзоны станций (§3.2). Пересчитывать локальное время
 * через выдуманную зону запрещено, поэтому «ночной сегмент» и «прибытие до времени»
 * считаются по настенным часам той строки, которую вернул инвентарь: 23:40 в ответе
 * означает 23:40 в точке события.
 *
 * Здесь нет обращения к системным часам — «сейчас» всегда приходит параметром.
 */

const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

export interface WallClock {
  /** Минуты от 1970-01-01 00:00 по настенным часам, без пересчёта зон. */
  readonly totalMinutes: number;
  /** Номер суток от 1970-01-01. */
  readonly dayIndex: number;
  /** Минуты от полуночи, 0..1439. */
  readonly minuteOfDay: number;
}

export function parseWallClock(iso: string): WallClock | undefined {
  const match = ISO_PATTERN.exec(iso.trim());
  if (!match) return undefined;

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = hourRaw === undefined ? 0 : Number(hourRaw);
  const minute = minuteRaw === undefined ? 0 : Number(minuteRaw);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return undefined;
  }

  const epochMs = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(epochMs)) return undefined;

  const totalMinutes = Math.round(epochMs / 60_000);
  const dayIndex = Math.floor(totalMinutes / 1440);

  return { totalMinutes, dayIndex, minuteOfDay: totalMinutes - dayIndex * 1440 };
}

/** Разница в минутах, или `undefined` если хотя бы одна метка не разобрана. */
export function minutesBetween(fromIso: string, toIso: string): number | undefined {
  const from = parseWallClock(fromIso);
  const to = parseWallClock(toIso);
  if (from === undefined || to === undefined) return undefined;
  return to.totalMinutes - from.totalMinutes;
}

export function parseLocalTimeToMinutes(localTime: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface NightWindow {
  /** Минута начала ночи, например 23:00 → 1380. */
  readonly startMinuteOfDay: number;
  /** Минута конца ночи следующих суток, например 06:00 → 360. */
  readonly endMinuteOfDay: number;
}

/**
 * Пересекается ли поездка с ночным окном хотя бы в одни сутки.
 * `undefined` означает «не удалось определить» и обрабатывается вызывающим кодом
 * как отсутствие данных, а не как «ночи нет».
 */
export function overlapsNight(
  departureIso: string,
  arrivalIso: string,
  window: NightWindow,
): boolean | undefined {
  const departure = parseWallClock(departureIso);
  const arrival = parseWallClock(arrivalIso);
  if (departure === undefined || arrival === undefined) return undefined;
  if (arrival.totalMinutes < departure.totalMinutes) return undefined;

  for (let day = departure.dayIndex - 1; day <= arrival.dayIndex + 1; day += 1) {
    const nightStart = day * 1440 + window.startMinuteOfDay;
    const nightEnd = (day + 1) * 1440 + window.endMinuteOfDay;
    if (departure.totalMinutes < nightEnd && arrival.totalMinutes > nightStart) {
      return true;
    }
  }

  return false;
}

/** Прибывает ли рейс не позже дедлайна по настенным часам точки прибытия. */
export function arrivesBefore(arrivalIso: string, deadlineLocalTime: string): boolean | undefined {
  const arrival = parseWallClock(arrivalIso);
  const deadline = parseLocalTimeToMinutes(deadlineLocalTime);
  if (arrival === undefined || deadline === undefined) return undefined;
  return arrival.minuteOfDay <= deadline;
}

export function dateOf(iso: string): string | undefined {
  const match = ISO_PATTERN.exec(iso.trim());
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}
