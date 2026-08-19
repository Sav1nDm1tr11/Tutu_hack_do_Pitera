import type { RawHotelOffer, RawPlace, RawTransportOffer, RawTransportSegment } from '@tutu-plan-b/domain';
import { isRecord } from './session';
import {
  optional,
  pick,
  pickArray,
  pickBoolean,
  pickNumber,
  pickRecord,
  pickString,
  pickStringArray,
} from './fields';

/**
 * Проекция произвольного JSON на raw-форму домена.
 *
 * Каждое поле берётся только если оно реально присутствует. Отсутствующие значения не
 * заполняются «разумными» дефолтами: нормализатор и скоринг умеют работать с пропусками
 * и обязаны явно показать, чего не хватает (§2.1.5 системного дизайна).
 */

const PLACE_ALIASES = [
  'place',
  'city',
  'station',
  'airport',
  'location',
  'point',
  'geo',
  'from',
  'to',
] as const;

const DEPARTURE_PLACE = [
  'departureplace',
  'fromplace',
  'from',
  'origin',
  'departure',
  'departurestation',
  'departurecity',
  'fromstation',
  'fromcity',
  'откуда',
] as const;

const ARRIVAL_PLACE = [
  'arrivalplace',
  'toplace',
  'to',
  'destination',
  'arrival',
  'arrivalstation',
  'arrivalcity',
  'tostation',
  'tocity',
  'куда',
] as const;

const DEPARTURE_AT = [
  'departureat',
  'departuretime',
  'departuredatetime',
  'departsat',
  'startat',
  'fromtime',
  'отправление',
] as const;

const ARRIVAL_AT = [
  'arrivalat',
  'arrivaltime',
  'arrivaldatetime',
  'arrivesat',
  'endat',
  'totime',
  'прибытие',
] as const;

const PRICE_AMOUNT = [
  'priceamount',
  'price',
  'amount',
  'cost',
  'totalprice',
  'fare',
  'minprice',
  'цена',
] as const;

const PRICE_PER_NIGHT = ['pricepernight', 'pricepernightamount', 'nightlyprice', 'заночь'] as const;

/** Объекты, внутри которых цена лежит как `{ amount, currency }` (Tutu MCP) или `{ price_from }` (тарифы ЖД). */
const PRICE_RECORD = ['price', 'totalprice', 'priceamount', 'cost', 'fares', 'цена'] as const;

/** Имена суммы внутри такого объекта. Порядок — от точного к запасному. */
const NESTED_AMOUNT = ['amount', 'value', 'total', 'price', 'pricefrom', 'minprice'] as const;

const CURRENCY = ['currency', 'валюта'] as const;

const CARRIERS = ['carriers', 'carrierlist', 'airlines', 'перевозчики'] as const;

/**
 * Цена и валюта, включая вложенную форму.
 *
 * `pick()` ищет точное имя, поэтому на `price: { amount, currency }` плоский `pickNumber`
 * возвращает undefined — вариант остаётся без цены. Здесь плоское значение пробуется
 * первым, а вложенный объект — вторым; ничего не достраивается, если нет ни того, ни другого.
 */
function pickMoney(
  record: Record<string, unknown>,
  amountAliases: readonly string[],
): { readonly amount: number | undefined; readonly currency: string | undefined } {
  const nested = pickRecord(record, PRICE_RECORD);
  const amount =
    pickNumber(record, amountAliases) ??
    (nested === undefined ? undefined : pickNumber(nested, NESTED_AMOUNT));
  const currency =
    pickString(record, CURRENCY) ??
    (nested === undefined ? undefined : pickString(nested, CURRENCY));

  return { amount, currency };
}

/** `carriers: ['ФПК']` — массив, который `pickString` пропускает. Несколько перевозчиков склеиваются. */
function pickOperator(
  record: Record<string, unknown>,
  aliases: readonly string[],
): string | undefined {
  const flat = pickString(record, aliases);
  if (flat !== undefined) return flat;

  const list = pickStringArray(record, CARRIERS);
  if (list === undefined) return undefined;
  const unique = [...new Set(list.map((entry) => entry.trim()).filter((entry) => entry !== ''))];
  return unique.length === 0 ? undefined : unique.join(', ');
}

const CHECKOUT_URL = [
  'checkouturl',
  'deeplink',
  'deeplinkurl',
  'bookingurl',
  'url',
  'link',
  'href',
  'tutuurl',
] as const;

/**
 * Словарь видов транспорта источника → доменный `TransportMode`.
 *
 * Tutu MCP отдаёт `railway`/`avia`/`etrain`, домен знает `train`/`flight`/`suburbanTrain`
 * (`transportModeSchema`). Перевод — работа адаптера: доменный enum остаётся неизменным,
 * а незнакомое значение сознательно проходит как есть, чтобы нормализатор честно отправил
 * запись в карантин, а не получил подставленный вид транспорта.
 */
const SOURCE_MODES: Readonly<Record<string, string>> = {
  railway: 'train',
  rail: 'train',
  train: 'train',
  avia: 'flight',
  flight: 'flight',
  etrain: 'suburbanTrain',
  suburbantrain: 'suburbanTrain',
  bus: 'bus',
};

export function normalizeSourceMode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return SOURCE_MODES[value.trim().toLowerCase()] ?? value;
}

export function mapTransportOffers(
  payload: unknown,
  direction: 'outbound' | 'inbound',
): readonly RawTransportOffer[] {
  return mapTransportOffersWithRefs(payload, direction).map((entry) => entry.offer);
}

/**
 * Вариант вместе с исходным `checkout_ref`.
 *
 * `checkout_ref` не проецируется в доменную модель: это непрозрачный набор идентификаторов
 * конкретного продукта Туту, который целиком передаётся обратно в `create_checkout_link`.
 * Домену он не нужен, адаптеру — нужен, поэтому и живёт рядом с raw-вариантом.
 */
export interface MappedTransportOffer {
  readonly offer: RawTransportOffer;
  readonly checkoutRef: Record<string, unknown> | undefined;
}

export function mapTransportOffersWithRefs(
  payload: unknown,
  direction: 'outbound' | 'inbound',
): readonly MappedTransportOffer[] {
  return extractRecords(payload).map((record, index) => ({
    offer: mapTransportOffer(record, direction, index),
    checkoutRef: pickRecord(record, CHECKOUT_REF),
  }));
}

const CHECKOUT_REF = ['checkoutref'] as const;

export function mapHotelOffers(
  payload: unknown,
  checkIn: string,
  checkOut: string,
): readonly RawHotelOffer[] {
  return extractRecords(payload).map((record, index) =>
    mapHotelOffer(record, checkIn, checkOut, index),
  );
}

function mapTransportOffer(
  record: Record<string, unknown>,
  direction: 'outbound' | 'inbound',
  index: number,
): RawTransportOffer {
  const segments = pickArray(record, ['segments', 'legs', 'hops', 'trips', 'пересадки']);
  // Tutu MCP отдаёт `legs[].segments[]`: сама нога — это направление, а пересадки считаются
  // по вложенным сегментам. Разворачиваем их, иначе число пересадок всегда получалось 0.
  const flatSegments = segments?.flatMap((item) => {
    if (!isRecord(item)) return [];
    const nested = pickArray(item, ['segments']);
    return nested === undefined ? [item] : nested.filter(isRecord);
  });
  const mappedSegments = flatSegments?.map((item, segmentIndex) =>
    mapSegment(item, `${syntheticId(record, index)}:s${segmentIndex}`),
  );

  const money = pickMoney(record, PRICE_AMOUNT);
  // `segments_count` — число сегментов, пересадок на единицу меньше.
  const segmentsCount = pickNumber(record, ['segmentscount', 'segmentcount']);
  const transferCount =
    pickNumber(record, ['transfercount', 'transfers', 'stops', 'пересадки']) ??
    (segmentsCount === undefined ? undefined : Math.max(0, Math.trunc(segmentsCount) - 1));

  const firstSegment = mappedSegments?.[0];
  const lastSegment = mappedSegments?.[mappedSegments.length - 1];

  return {
    ...optional('id', pickString(record, ['id', 'offerid', 'uid', 'hash']) ?? `mcp:t:${index}`),
    direction,
    ...optional(
      'mode',
      normalizeSourceMode(pickString(record, ['mode', 'transport', 'type', 'kind', 'vehicle'])),
    ),
    ...optional(
      'operator',
      pickOperator(record, ['operator', 'carrier', 'company', 'airline', 'перевозчик']),
    ),
    ...optional(
      'departurePlace',
      mapPlace(pick(record, DEPARTURE_PLACE)) ?? firstSegment?.departurePlace,
    ),
    ...optional(
      'departureAt',
      pickString(record, DEPARTURE_AT) ?? firstSegment?.departureAt,
    ),
    ...optional(
      'arrivalPlace',
      mapPlace(pick(record, ARRIVAL_PLACE)) ?? lastSegment?.arrivalPlace,
    ),
    ...optional('arrivalAt', pickString(record, ARRIVAL_AT) ?? lastSegment?.arrivalAt),
    ...optional(
      'durationMinutes',
      pickNumber(record, ['durationminutes', 'durationmin', 'duration', 'traveltime', 'времявпути']),
    ),
    ...optional('transferCount', transferCount),
    ...optional('segments', mappedSegments),
    ...optional('priceAmount', money.amount),
    ...optional('currency', money.currency),
    ...optional('serviceClass', pickString(record, ['serviceclass', 'class', 'cabin', 'класс'])),
    ...optional('seatsAvailable', pickNumber(record, ['seatsavailable', 'seats', 'available', 'места'])),
    ...optional('refundable', pickBoolean(record, ['refundable', 'возвратный'])),
    ...optional('checkoutUrl', pickString(record, CHECKOUT_URL)),
    ...optional('expiresAt', pickString(record, ['expiresat', 'expireat', 'validuntil', 'ttl'])),
  };
}

function mapSegment(record: Record<string, unknown>, fallbackId: string): RawTransportSegment {
  return {
    ...optional('id', pickString(record, ['id', 'segmentid']) ?? fallbackId),
    ...optional('mode', normalizeSourceMode(pickString(record, ['mode', 'transport', 'type']))),
    ...optional('operator', pickOperator(record, ['operator', 'carrier'])),
    ...optional('departurePlace', mapPlace(pick(record, DEPARTURE_PLACE))),
    ...optional('departureAt', pickString(record, DEPARTURE_AT)),
    ...optional('arrivalPlace', mapPlace(pick(record, ARRIVAL_PLACE))),
    ...optional('arrivalAt', pickString(record, ARRIVAL_AT)),
    ...optional('serviceClass', pickString(record, ['serviceclass', 'class'])),
  };
}

function mapHotelOffer(
  record: Record<string, unknown>,
  checkIn: string,
  checkOut: string,
  index: number,
): RawHotelOffer {
  const place = mapPlace(pick(record, PLACE_ALIASES)) ?? mapPlace(record);
  const hotelMoney = pickMoney(record, PRICE_AMOUNT);

  return {
    ...optional('id', pickString(record, ['id', 'hotelid', 'uid']) ?? `mcp:h:${index}`),
    ...optional('name', pickString(record, ['name', 'title', 'hotelname', 'название'])),
    ...optional('place', place),
    ...optional('checkIn', pickString(record, ['checkin', 'checkindate']) ?? checkIn),
    ...optional('checkOut', pickString(record, ['checkout', 'checkoutdate']) ?? checkOut),
    ...optional('nights', pickNumber(record, ['nights', 'ночей'])),
    ...optional('priceAmount', hotelMoney.amount),
    ...optional('pricePerNightAmount', pickNumber(record, PRICE_PER_NIGHT)),
    ...optional('currency', hotelMoney.currency),
    ...optional('rating', pickNumber(record, ['rating', 'stars', 'score', 'рейтинг'])),
    ...optional(
      'reviewSummaryText',
      pickString(record, ['reviewsummary', 'reviewsummarytext', 'summary', 'описание']),
    ),
    ...optional(
      'reviewPositiveCount',
      pickNumber(record, ['reviewpositivecount', 'positive', 'positives']),
    ),
    ...optional(
      'reviewNegativeCount',
      pickNumber(record, ['reviewnegativecount', 'negative', 'negatives']),
    ),
    ...optional('reviewRedFlags', pickStringArray(record, ['reviewredflags', 'redflags', 'warnings'])),
    ...optional(
      'distanceToCenterKm',
      pickNumber(record, ['distancetocenterkm', 'distancetocenter', 'distance', 'доцентра']),
    ),
    ...optional('checkoutUrl', pickString(record, CHECKOUT_URL)),
    ...optional('expiresAt', pickString(record, ['expiresat', 'expireat', 'validuntil'])),
  };
}

function mapPlace(value: unknown): RawPlace | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return { name: value };
  }
  if (!isRecord(value)) return undefined;

  const nested = pickRecord(value, ['geo', 'point', 'coordinates', 'location']);
  const lat = pickNumber(value, ['lat', 'latitude']) ?? (nested === undefined ? undefined : pickNumber(nested, ['lat', 'latitude']));
  const lon =
    pickNumber(value, ['lon', 'lng', 'longitude']) ??
    (nested === undefined ? undefined : pickNumber(nested, ['lon', 'lng', 'longitude']));

  const place: RawPlace = {
    ...optional('id', pickString(value, ['id', 'code', 'iata', 'stationid', 'placeid'])),
    ...optional('name', pickString(value, ['name', 'title', 'city', 'label'])),
    ...optional('kind', pickString(value, ['kind', 'type'])),
    ...optional('lat', lat),
    ...optional('lon', lon),
    ...optional('timezone', pickString(value, ['timezone', 'tz'])),
  };

  return Object.keys(place).length === 0 ? undefined : place;
}

function syntheticId(record: Record<string, unknown>, index: number): string {
  return pickString(record, ['id', 'offerid', 'uid']) ?? `mcp:t:${index}`;
}

/**
 * MCP-ответ может быть массивом, `{ offers: [...] }`, `{ data: { items: [...] } }`
 * или одиночным объектом. Рекурсия ограничена тремя уровнями: глубже — это уже
 * вложенные сущности, а не список результатов поиска.
 */
function extractRecords(payload: unknown, depth = 0): readonly Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload) || depth >= 3) {
    return isRecord(payload) ? [payload] : [];
  }

  const nested = pickArray(payload, [
    'offers',
    'results',
    'items',
    'data',
    'hotels',
    'flights',
    'trains',
    'buses',
    'trips',
    'routes',
    'variants',
    'варианты',
  ]);

  if (nested !== undefined) return extractRecords(nested, depth + 1);

  const data = payload['data'];
  if (data !== undefined) return extractRecords(data, depth + 1);

  return [payload];
}
