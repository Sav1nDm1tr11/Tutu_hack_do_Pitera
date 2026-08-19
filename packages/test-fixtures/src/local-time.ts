/**
 * Арифметика настенных часов для генератора демо-данных.
 *
 * Времена в fixture должны быть локальными для своей точки, иначе «ночной сегмент»
 * и «прибытие до 18:00» посчитаются неправильно: между Екатеринбургом и Петербургом
 * два часа разницы, и игнорировать их означало бы сломать ровно тот сценарий,
 * который продукт демонстрирует.
 */

export function localIso(date: string, minuteOfDay: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = Date.UTC(year!, month! - 1, day!, 0, 0) + minuteOfDay * 60_000;
  return formatIso(base);
}

export function addMinutes(iso: string, minutes: number): string {
  return formatIso(parseIso(iso) + minutes * 60_000);
}

/**
 * Локальное время прибытия: длительность в пути плюс разница часовых поясов.
 * Именно поэтому перелёт из Екатеринбурга в 08:40 садится в Петербурге в 09:50,
 * а не в 11:50.
 */
export function arrivalLocalIso(
  departureLocalIso: string,
  durationMinutes: number,
  originUtcOffsetMinutes: number,
  destinationUtcOffsetMinutes: number,
): string {
  const shift = destinationUtcOffsetMinutes - originUtcOffsetMinutes;
  return addMinutes(departureLocalIso, durationMinutes + shift);
}

export function minuteOfDay(iso: string): number {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (match === null) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

function parseIso(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso);
  if (match === null) throw new Error(`Неожидаемый формат локального времени: ${iso}`);
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}

function formatIso(epochMs: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = new Date(epochMs);
  return [
    date.getUTCFullYear(),
    '-',
    pad(date.getUTCMonth() + 1),
    '-',
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    ':',
    pad(date.getUTCMinutes()),
  ].join('');
}
