import type { TransportMode, TravelRequest } from '@tutu-plan-b/domain';
import type { DiscoveredTool, JsonSchemaProperty } from './session';
import { indexKeys, normalizeKey } from './fields';

/**
 * Сборка аргументов tool'а по его собственной input schema.
 *
 * Аргументы не могут быть захардкожены: имена полей принадлежат серверу. Поэтому адаптер
 * идёт от схемы — берёт объявленные свойства и заполняет те, для которых у нас есть
 * осмысленное значение. Если обязательное свойство заполнить нечем, вызов **не
 * выполняется**: отправить наугад придуманное значение в поиск хуже, чем честно показать
 * категорию недоступной (§7.2 системного дизайна).
 */

export interface ArgumentPlan {
  readonly args: Readonly<Record<string, unknown>>;
  /** Обязательные свойства схемы, для которых у нас нет значения. */
  readonly missingRequired: readonly string[];
}

interface Slot {
  /** Псевдонимы имени свойства, от точного к общему. */
  readonly aliases: readonly string[];
  readonly value: string | number | boolean;
}

const PLACE_ORIGIN = [
  'origin',
  'from',
  'fromcity',
  'fromplace',
  'frompoint',
  'fromstation',
  'departurecity',
  'departureplace',
  'departurepoint',
  'departurestation',
  'source',
  'wherefrom',
  'откуда',
] as const;

const PLACE_DESTINATION = [
  'destination',
  'to',
  'tocity',
  'toplace',
  'topoint',
  'tostation',
  'arrivalcity',
  'arrivalplace',
  'arrivalpoint',
  'arrivalstation',
  'target',
  'whereto',
  'куда',
] as const;

const DEPART_DATE = [
  'departuredate',
  'departdate',
  'outbounddate',
  'datefrom',
  'startdate',
  'date',
  'when',
  'дата',
  'датаотправления',
] as const;

const RETURN_DATE = [
  'returndate',
  'inbounddate',
  'backdate',
  'dateto',
  'enddate',
  'датавозвращения',
] as const;

const CHECK_IN = ['checkin', 'checkindate', 'arrivaldate', 'datefrom', 'startdate', 'заезд'] as const;
const CHECK_OUT = ['checkout', 'checkoutdate', 'departuredate', 'dateto', 'enddate', 'выезд'] as const;

const ADULTS = [
  'adults',
  'adultcount',
  'adultscount',
  'passengers',
  'passengercount',
  'passengerscount',
  'guests',
  'guestcount',
  'people',
  'seats',
  'взрослые',
] as const;

const CHILDREN = ['children', 'childrencount', 'childcount', 'kids', 'дети'] as const;
const CITY = ['city', 'location', 'place', 'destination', 'where', 'город'] as const;
const CURRENCY = ['currency', 'валюта'] as const;
const LOCALE = ['locale', 'lang', 'language', 'язык'] as const;
const LIMIT = ['limit', 'count', 'maxresults', 'pagesize', 'take', 'perpage'] as const;
const MODE = ['mode', 'transport', 'transporttype', 'type', 'kind', 'вид', 'транспорт'] as const;

/** Сколько вариантов запрашиваем: домен всё равно дедуплицирует и оставляет топ. */
const RESULT_LIMIT = 25;

export function planTransportArguments(
  tool: DiscoveredTool,
  request: TravelRequest,
  direction: 'outbound' | 'inbound',
  mode: TransportMode,
): ArgumentPlan {
  const outbound = direction === 'outbound';
  const origin = outbound ? request.origin : request.destination;
  const destination = outbound ? request.destination : request.origin;
  const date = outbound ? request.departDate : (request.returnDate ?? request.departDate);

  const slots: Slot[] = [
    { aliases: PLACE_ORIGIN, value: origin.name },
    { aliases: PLACE_DESTINATION, value: destination.name },
    { aliases: DEPART_DATE, value: date },
    { aliases: ADULTS, value: request.travelers.adults },
    { aliases: CHILDREN, value: request.travelers.children.length },
    { aliases: CURRENCY, value: 'RUB' },
    { aliases: LOCALE, value: 'ru' },
    { aliases: LIMIT, value: RESULT_LIMIT },
  ];

  // Обратную дату отправляем только для обратного плеча: tool с одним `date` уже получил
  // нужное значение выше, и дублировать его в `returnDate` значило бы исказить запрос.
  if (outbound && request.returnDate !== undefined) {
    slots.push({ aliases: RETURN_DATE, value: request.returnDate });
  }

  return buildPlan(tool, slots, [{ aliases: MODE, mode }]);
}

export function planHotelArguments(
  tool: DiscoveredTool,
  request: TravelRequest,
  checkIn: string,
  checkOut: string,
): ArgumentPlan {
  const slots: Slot[] = [
    { aliases: CITY, value: request.destination.name },
    { aliases: PLACE_DESTINATION, value: request.destination.name },
    { aliases: CHECK_IN, value: checkIn },
    { aliases: CHECK_OUT, value: checkOut },
    { aliases: ADULTS, value: request.travelers.adults },
    { aliases: CHILDREN, value: request.travelers.children.length },
    { aliases: CURRENCY, value: 'RUB' },
    { aliases: LOCALE, value: 'ru' },
    { aliases: LIMIT, value: RESULT_LIMIT },
  ];

  return buildPlan(tool, slots, []);
}

interface EnumSlot {
  readonly aliases: readonly string[];
  readonly mode: TransportMode;
}

function buildPlan(
  tool: DiscoveredTool,
  slots: readonly Slot[],
  enumSlots: readonly EnumSlot[],
): ArgumentPlan {
  const properties = tool.inputSchema.properties;
  const index = indexKeys(Object.keys(properties));
  const args: Record<string, unknown> = {};

  for (const slot of slots) {
    const key = firstUnfilledKey(index, slot.aliases, args);
    if (key === undefined) continue;

    const property = properties[key];
    if (property === undefined) continue;

    const coerced = coerce(slot.value, property);
    if (coerced !== undefined) args[key] = coerced;
  }

  for (const slot of enumSlots) {
    const key = firstUnfilledKey(index, slot.aliases, args);
    if (key === undefined) continue;

    const property = properties[key];
    if (property === undefined) continue;

    const value = matchEnumValue(property, slot.mode);
    if (value !== undefined) args[key] = value;
  }

  const missingRequired = tool.inputSchema.required.filter((name) => {
    if (name in args) return false;
    return properties[name]?.hasDefault !== true;
  });

  return { args, missingRequired };
}

function firstUnfilledKey(
  index: ReadonlyMap<string, string>,
  aliases: readonly string[],
  args: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const alias of aliases) {
    const key = index.get(alias);
    // Один и тот же псевдоним встречается в нескольких слотах (`dateFrom` — и дата
    // отправления, и дата заезда). Первый слот, дошедший до свойства, его и занимает.
    if (key !== undefined && !(key in args)) return key;
  }
  return undefined;
}

/**
 * Приводит значение к объявленному типу свойства.
 *
 * Несовместимость типов — не повод «постараться»: если схема ждёт объект, а у нас строка,
 * свойство остаётся незаполненным и, если оно обязательное, категория объявляется
 * недоступной.
 */
function coerce(value: string | number | boolean, property: JsonSchemaProperty): unknown {
  const type = property.type;

  if (type === undefined) return value;
  if (type === 'string') return typeof value === 'string' ? value : String(value);
  if (type === 'number' || type === 'integer') {
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (type === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (type === 'array') return [value];

  return undefined;
}

/**
 * Ищет литерал перечисления, соответствующий виду транспорта. Синонимы перечислены явно,
 * потому что серверы называют одно и то же по-разному (`avia`, `flight`, `самолет`).
 */
const MODE_SYNONYMS: Record<TransportMode, readonly string[]> = {
  flight: ['flight', 'avia', 'air', 'plane', 'самолет', 'авиа'],
  train: ['train', 'rail', 'поезд', 'жд'],
  bus: ['bus', 'coach', 'автобус'],
  suburbanTrain: ['suburban', 'electrichka', 'commuter', 'электричка', 'пригород'],
};

function matchEnumValue(property: JsonSchemaProperty, mode: TransportMode): string | undefined {
  const values = property.enumValues;
  if (values === undefined || values.length === 0) return undefined;

  const synonyms = MODE_SYNONYMS[mode];
  for (const value of values) {
    const normalized = normalizeKey(value);
    if (synonyms.some((synonym) => normalized.includes(normalizeKey(synonym)))) return value;
  }
  return undefined;
}
