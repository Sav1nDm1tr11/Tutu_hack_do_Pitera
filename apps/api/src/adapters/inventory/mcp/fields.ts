import { isRecord } from './session';

/**
 * Поиск полей по псевдонимам.
 *
 * Схемы Tutu MCP не подтверждены (`docs/MCP_SPIKE_REPORT.md`), поэтому адаптер не может
 * обращаться к полям по точным именам. Вместо этого он ищет имя среди известных
 * псевдонимов — и, не найдя, оставляет поле пустым. Правило «нет поля — нет показателя»
 * (§2.1.5 системного дизайна) здесь важнее полноты: домен умеет работать с пропусками,
 * но не умеет отличить выдуманное значение от настоящего.
 */

/** Приводит имя поля к сравнимой форме: `departure_date`, `departureDate`, `DepartureDate` → `departuredate`. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9а-яё]/gu, '');
}

/** Индекс `нормализованное имя → оригинальное имя`. Первое вхождение выигрывает. */
export function indexKeys(keys: readonly string[]): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (!index.has(normalized)) index.set(normalized, key);
  }
  return index;
}

/**
 * Возвращает первое имя из `aliases`, присутствующее в объекте.
 *
 * Порядок псевдонимов значим: он выражает приоритет от самого точного к самому общему,
 * поэтому `durationMinutes` находится раньше, чем `duration`.
 */
export function findKey(
  index: ReadonlyMap<string, string>,
  aliases: readonly string[],
): string | undefined {
  for (const alias of aliases) {
    const found = index.get(alias);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function pick(record: Record<string, unknown>, aliases: readonly string[]): unknown {
  const key = findKey(indexKeys(Object.keys(record)), aliases);
  return key === undefined ? undefined : record[key];
}

export function pickString(
  record: Record<string, unknown>,
  aliases: readonly string[],
): string | undefined {
  const value = pick(record, aliases);
  if (typeof value === 'string' && value.trim() !== '') return value;
  return undefined;
}

export function pickNumber(
  record: Record<string, unknown>,
  aliases: readonly string[],
): number | undefined {
  const value = pick(record, aliases);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Числа, приехавшие строкой, — обычная практика JSON-API; это не догадка о значении.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function pickBoolean(
  record: Record<string, unknown>,
  aliases: readonly string[],
): boolean | undefined {
  const value = pick(record, aliases);
  return typeof value === 'boolean' ? value : undefined;
}

export function pickRecord(
  record: Record<string, unknown>,
  aliases: readonly string[],
): Record<string, unknown> | undefined {
  const value = pick(record, aliases);
  return isRecord(value) ? value : undefined;
}

export function pickArray(
  record: Record<string, unknown>,
  aliases: readonly string[],
): readonly unknown[] | undefined {
  const value = pick(record, aliases);
  return Array.isArray(value) ? value : undefined;
}

export function pickStringArray(
  record: Record<string, unknown>,
  aliases: readonly string[],
): readonly string[] | undefined {
  const value = pickArray(record, aliases);
  if (value === undefined) return undefined;
  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  return strings.length === 0 ? undefined : strings;
}

/** Опциональное поле добавляется только когда значение есть: `exactOptionalPropertyTypes`. */
export function optional<K extends string, V>(
  key: K,
  value: V | undefined,
): { readonly [P in K]?: V } {
  if (value === undefined) return {};
  const result: { [P in K]?: V } = {};
  result[key] = value;
  return result;
}
