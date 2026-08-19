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
  return extractRecords(payload).map((record, index) =>
    mapTransportOffer(record, direction, index),
  );
}

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
  const mappedSegments = segments?.flatMap((item, segmentIndex) => {
    if (!isRecord(item)) return [];
    return [mapSegment(item, `${syntheticId(record, index)}:s${segmentIndex}`)];
  });

  const firstSegment = mappedSegments?.[0];
  const lastSegment = mappedSegments?.[mappedSegments.length - 1];

  return {
    ...optional('id', pickString(record, ['id', 'offerid', 'uid', 'hash']) ?? `mcp:t:${index}`),
    direction,
    ...optional(
      'mode',
      normalizeSourceMode(pickString(record, ['mode', 'transport', 'type', 'kind', 'vehicle'])),
    ),
    ...optional('operator', pickString(record, ['operator', 'carrier', 'company', 'airline', 'перевозчик'])),
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
      pickNumber(record, ['durationminutes', 'duration', 'traveltime', 'времявпути']),
    ),
    ...optional(
      'transferCount',
      pickNumber(record, ['transfercount', 'transfers', 'stops', 'пересадки']),
    ),
    ...optional('segments', mappedSegments),
    ...optional('priceAmount', pickNumber(record, PRICE_AMOUNT)),
    ...optional('currency', pickString(record, ['currency', 'валюта'])),
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
    ...optional('operator', pickString(record, ['operator', 'carrier'])),
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

  return {
    ...optional('id', pickString(record, ['id', 'hotelid', 'uid']) ?? `mcp:h:${index}`),
    ...optional('name', pickString(record, ['name', 'title', 'hotelname', 'название'])),
    ...optional('place', place),
    ...optional('checkIn', pickString(record, ['checkin', 'checkindate']) ?? checkIn),
    ...optional('checkOut', pickString(record, ['checkout', 'checkoutdate']) ?? checkOut),
    ...optional('nights', pickNumber(record, ['nights', 'ночей'])),
    ...optional('priceAmount', pickNumber(record, PRICE_AMOUNT)),
    ...optional('pricePerNightAmount', pickNumber(record, PRICE_PER_NIGHT)),
    ...optional('currency', pickString(record, ['currency', 'валюта'])),
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
