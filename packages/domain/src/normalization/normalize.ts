import type { EvidenceRef, PlaceRef, TransportMode } from '../contracts/common';
import type {
  HotelOption,
  TransportOption,
  TransportSegment,
} from '../contracts/candidate';
import { isoDateTimeSchema, transportModeSchema } from '../contracts/common';
import { safeCheckoutUrl } from '../checkout/allowlist';
import { minutesBetween } from '../time/wall-clock';
import type { RawHotelOffer, RawPlace, RawTransportOffer, RawTransportSegment } from './raw';

/** Тексты из инвентаря — untrusted data (§16.3), поэтому обрезаются по длине. */
const MAX_REVIEW_TEXT_LENGTH = 600;
const MAX_RED_FLAG_LENGTH = 200;
const MAX_RED_FLAGS = 6;

export type QuarantineReason =
  | 'missingId'
  | 'unknownMode'
  | 'missingPlaces'
  | 'missingTimes'
  | 'invalidTimes'
  | 'negativeDuration'
  | 'missingHotelName'
  | 'missingHotelDates';

export interface QuarantinedRecord {
  readonly rawId: string | undefined;
  readonly kind: 'transport' | 'hotel';
  readonly reason: QuarantineReason;
  readonly detail: string;
}

export type NormalizationResult<T> =
  | { readonly ok: true; readonly option: T }
  | { readonly ok: false; readonly quarantined: QuarantinedRecord };

export interface NormalizationContext {
  readonly fetchedAt: string;
  readonly toolCallId?: string | undefined;
  /** `false` для fixture-режима: происхождение отражается в EvidenceRef. */
  readonly live: boolean;
}

/**
 * Поля, которые мы ожидаем от полноценного транспортного предложения.
 * `dataCompleteness` считается по ним, чтобы «неполнота» была измеримой величиной,
 * а не впечатлением.
 */
const EXPECTED_TRANSPORT_FIELDS = [
  'operator',
  'durationMinutes',
  'transferCount',
  'priceAmount',
  'serviceClass',
  'checkoutUrl',
  'departurePlaceCoordinates',
  'arrivalPlaceCoordinates',
] as const;

const EXPECTED_HOTEL_FIELDS = [
  'rating',
  'reviewSummaryText',
  'priceAmount',
  'placeCoordinates',
  'distanceToCenterKm',
  'checkoutUrl',
] as const;

function evidence(
  context: NormalizationContext,
  fieldPath: string,
  label: string,
): EvidenceRef {
  return {
    sourceType: context.live ? 'tutuMcp' : 'calculation',
    ...(context.toolCallId === undefined ? {} : { toolCallId: context.toolCallId }),
    fieldPath,
    label,
  };
}

function normalizePlace(raw: RawPlace | undefined, fallbackId: string): PlaceRef | undefined {
  if (raw === undefined) return undefined;

  const name = raw.name?.trim();
  if (name === undefined || name === '') return undefined;

  const hasCoordinates =
    typeof raw.lat === 'number' &&
    typeof raw.lon === 'number' &&
    Number.isFinite(raw.lat) &&
    Number.isFinite(raw.lon) &&
    Math.abs(raw.lat) <= 90 &&
    Math.abs(raw.lon) <= 180;

  const kind = normalizePlaceKind(raw.kind);

  return {
    id: raw.id?.trim() ?? fallbackId,
    name,
    kind,
    // Координаты не достраиваются геокодером: без них глобус деградирует до схемы (§15.3).
    ...(hasCoordinates ? { point: { lat: raw.lat!, lon: raw.lon! } } : {}),
    ...(raw.timezone === undefined ? {} : { timezone: raw.timezone }),
  };
}

function normalizePlaceKind(kind: string | undefined): PlaceRef['kind'] {
  switch (kind) {
    case 'city':
    case 'station':
    case 'airport':
    case 'busStation':
    case 'hotel':
      return kind;
    default:
      return 'unknown';
  }
}

function normalizeMode(mode: string | undefined): TransportMode | undefined {
  const parsed = transportModeSchema.safeParse(mode);
  return parsed.success ? parsed.data : undefined;
}

function isValidDateTime(value: string | undefined): value is string {
  return value !== undefined && isoDateTimeSchema.safeParse(value).success;
}

/**
 * Raw предложение → каноничный `TransportOption`.
 *
 * Запись отправляется в quarantine, а не «починяется», если не хватает того, без чего
 * вариант нельзя показать: идентификатора, вида транспорта, мест или времён. Всё
 * остальное остаётся `undefined` и снижает `dataCompleteness`.
 */
export function normalizeTransportOffer(
  raw: RawTransportOffer,
  context: NormalizationContext,
): NormalizationResult<TransportOption> {
  const id = raw.id?.trim();
  if (id === undefined || id === '') {
    return quarantine(raw.id, 'transport', 'missingId', 'У предложения нет идентификатора');
  }

  const mode = normalizeMode(raw.mode);
  if (mode === undefined) {
    return quarantine(id, 'transport', 'unknownMode', `Неизвестный вид транспорта: ${String(raw.mode)}`);
  }

  const departurePlace = normalizePlace(raw.departurePlace, `${id}:from`);
  const arrivalPlace = normalizePlace(raw.arrivalPlace, `${id}:to`);
  if (departurePlace === undefined || arrivalPlace === undefined) {
    return quarantine(id, 'transport', 'missingPlaces', 'Не указаны места отправления или прибытия');
  }

  if (!isValidDateTime(raw.departureAt) || !isValidDateTime(raw.arrivalAt)) {
    return quarantine(id, 'transport', 'missingTimes', 'Не указаны корректные дата и время');
  }

  const span = minutesBetween(raw.departureAt, raw.arrivalAt);
  if (span === undefined) {
    return quarantine(id, 'transport', 'invalidTimes', 'Время не удалось разобрать');
  }
  if (span < 0) {
    return quarantine(id, 'transport', 'negativeDuration', 'Прибытие раньше отправления');
  }

  const segments = normalizeSegments(raw.segments, id, mode);
  const price =
    typeof raw.priceAmount === 'number' && raw.priceAmount >= 0 && raw.currency === 'RUB'
      ? { amount: raw.priceAmount, currency: 'RUB' as const }
      : undefined;

  const present = new Set<string>();
  if (raw.operator !== undefined) present.add('operator');
  if (typeof raw.durationMinutes === 'number') present.add('durationMinutes');
  if (typeof raw.transferCount === 'number' || segments !== undefined) present.add('transferCount');
  if (price !== undefined) present.add('priceAmount');
  if (raw.serviceClass !== undefined) present.add('serviceClass');
  if (safeCheckoutUrl(raw.checkoutUrl) !== undefined) present.add('checkoutUrl');
  if (departurePlace.point !== undefined) present.add('departurePlaceCoordinates');
  if (arrivalPlace.point !== undefined) present.add('arrivalPlaceCoordinates');

  const transferCount =
    segments !== undefined
      ? segments.length - 1
      : typeof raw.transferCount === 'number' && raw.transferCount >= 0
        ? Math.trunc(raw.transferCount)
        : undefined;

  const option: TransportOption = {
    id,
    kind: 'transport',
    direction: raw.direction === 'inbound' ? 'inbound' : 'outbound',
    mode,
    ...(raw.operator === undefined ? {} : { operator: raw.operator }),
    departure: { place: departurePlace, at: raw.departureAt },
    arrival: { place: arrivalPlace, at: raw.arrivalAt },
    ...(typeof raw.durationMinutes === 'number' && raw.durationMinutes >= 0
      ? { durationMinutes: Math.trunc(raw.durationMinutes) }
      : {}),
    ...(transferCount === undefined ? {} : { transferCount }),
    ...(segments === undefined ? {} : { segments }),
    ...(raw.serviceClass === undefined ? {} : { serviceClass: raw.serviceClass }),
    ...(typeof raw.seatsAvailable === 'number' && raw.seatsAvailable >= 0
      ? { seatsAvailable: Math.trunc(raw.seatsAvailable) }
      : {}),
    ...(typeof raw.refundable === 'boolean' ? { refundable: raw.refundable } : {}),
    ...(price === undefined ? {} : { price }),
    // Посторонний хост не показывается вовсе (§16.5), а не «показывается с предупреждением».
    ...(safeCheckoutUrl(raw.checkoutUrl) === undefined
      ? {}
      : { checkoutUrl: safeCheckoutUrl(raw.checkoutUrl)! }),
    source: buildTransportEvidence(context, present),
    fetchedAt: context.fetchedAt,
    ...(isValidDateTime(raw.expiresAt) ? { expiresAt: raw.expiresAt } : {}),
    dataCompleteness: present.size / EXPECTED_TRANSPORT_FIELDS.length,
    riskSignals: [],
  };

  return { ok: true, option };
}

function normalizeSegments(
  raw: readonly RawTransportSegment[] | undefined,
  offerId: string,
  fallbackMode: TransportMode,
): TransportSegment[] | undefined {
  if (raw === undefined || raw.length === 0) return undefined;

  const segments: TransportSegment[] = [];
  for (const [index, item] of raw.entries()) {
    const departurePlace = normalizePlace(item.departurePlace, `${offerId}:seg${index}:from`);
    const arrivalPlace = normalizePlace(item.arrivalPlace, `${offerId}:seg${index}:to`);

    if (
      departurePlace === undefined ||
      arrivalPlace === undefined ||
      !isValidDateTime(item.departureAt) ||
      !isValidDateTime(item.arrivalAt)
    ) {
      // Частичная детализация хуже отсутствующей: она даёт ложную уверенность в буферах.
      return undefined;
    }

    segments.push({
      id: item.id?.trim() ?? `${offerId}:seg${index}`,
      mode: normalizeMode(item.mode) ?? fallbackMode,
      ...(item.operator === undefined ? {} : { operator: item.operator }),
      departure: { place: departurePlace, at: item.departureAt },
      arrival: { place: arrivalPlace, at: item.arrivalAt },
      ...(item.serviceClass === undefined ? {} : { serviceClass: item.serviceClass }),
    });
  }

  return segments;
}

function buildTransportEvidence(
  context: NormalizationContext,
  present: ReadonlySet<string>,
): EvidenceRef[] {
  const refs: EvidenceRef[] = [
    evidence(context, 'departure.at', 'Время отправления из инвентаря'),
    evidence(context, 'arrival.at', 'Время прибытия из инвентаря'),
  ];

  if (present.has('priceAmount')) {
    refs.push(evidence(context, 'price.amount', 'Цена из инвентаря'));
  }
  if (present.has('transferCount')) {
    refs.push(evidence(context, 'transferCount', 'Число пересадок из инвентаря'));
  }
  if (present.has('checkoutUrl')) {
    refs.push(evidence(context, 'checkoutUrl', 'Ссылка на оформление ТуТу'));
  }

  return refs;
}

export function normalizeHotelOffer(
  raw: RawHotelOffer,
  context: NormalizationContext,
): NormalizationResult<HotelOption> {
  const id = raw.id?.trim();
  if (id === undefined || id === '') {
    return quarantine(raw.id, 'hotel', 'missingId', 'У предложения нет идентификатора');
  }

  const name = raw.name?.trim();
  if (name === undefined || name === '') {
    return quarantine(id, 'hotel', 'missingHotelName', 'У отеля нет названия');
  }

  if (!isValidDateTime(raw.checkIn) || !isValidDateTime(raw.checkOut)) {
    return quarantine(id, 'hotel', 'missingHotelDates', 'Не указаны корректные даты проживания');
  }

  const stayMinutes = minutesBetween(raw.checkIn, raw.checkOut);
  if (stayMinutes === undefined || stayMinutes <= 0) {
    return quarantine(id, 'hotel', 'invalidTimes', 'Выезд не позже заезда');
  }

  const place = normalizePlace(raw.place, `${id}:place`);
  const price =
    typeof raw.priceAmount === 'number' && raw.priceAmount >= 0 && raw.currency === 'RUB'
      ? { amount: raw.priceAmount, currency: 'RUB' as const }
      : undefined;
  const pricePerNight =
    typeof raw.pricePerNightAmount === 'number' &&
    raw.pricePerNightAmount >= 0 &&
    raw.currency === 'RUB'
      ? { amount: raw.pricePerNightAmount, currency: 'RUB' as const }
      : undefined;

  const nights =
    typeof raw.nights === 'number' && raw.nights >= 1
      ? Math.trunc(raw.nights)
      : Math.max(1, Math.round(stayMinutes / 1440));

  const reviewText = raw.reviewSummaryText?.trim();
  const reviewSummary =
    reviewText === undefined || reviewText === ''
      ? undefined
      : {
          text: reviewText.slice(0, MAX_REVIEW_TEXT_LENGTH),
          ...(typeof raw.reviewPositiveCount === 'number'
            ? { positiveCount: Math.trunc(raw.reviewPositiveCount) }
            : {}),
          ...(typeof raw.reviewNegativeCount === 'number'
            ? { negativeCount: Math.trunc(raw.reviewNegativeCount) }
            : {}),
        };

  const present = new Set<string>();
  if (typeof raw.rating === 'number') present.add('rating');
  if (reviewSummary !== undefined) present.add('reviewSummaryText');
  if (price !== undefined) present.add('priceAmount');
  if (place?.point !== undefined) present.add('placeCoordinates');
  if (typeof raw.distanceToCenterKm === 'number') present.add('distanceToCenterKm');
  if (safeCheckoutUrl(raw.checkoutUrl) !== undefined) present.add('checkoutUrl');

  const source: EvidenceRef[] = [evidence(context, 'name', 'Название отеля из инвентаря')];
  if (price !== undefined) source.push(evidence(context, 'price.amount', 'Цена из инвентаря'));
  if (typeof raw.rating === 'number') {
    source.push(evidence(context, 'rating', 'Рейтинг из инвентаря'));
  }
  if (reviewSummary !== undefined) {
    source.push(evidence(context, 'reviewSummary.text', 'Анализ отзывов из инвентаря'));
  }

  const option: HotelOption = {
    id,
    kind: 'hotel',
    name,
    ...(place === undefined ? {} : { place }),
    checkIn: raw.checkIn,
    checkOut: raw.checkOut,
    nights,
    ...(price === undefined ? {} : { price }),
    ...(pricePerNight === undefined ? {} : { pricePerNight }),
    ...(typeof raw.rating === 'number' && raw.rating >= 0 && raw.rating <= 10
      ? { rating: raw.rating }
      : {}),
    ...(reviewSummary === undefined ? {} : { reviewSummary }),
    // Red flags показываются только если их вернул анализ инвентаря (§6.5).
    reviewRedFlags: (raw.reviewRedFlags ?? [])
      .map((flag) => flag.trim().slice(0, MAX_RED_FLAG_LENGTH))
      .filter((flag) => flag !== '')
      .slice(0, MAX_RED_FLAGS),
    ...(typeof raw.distanceToCenterKm === 'number' && raw.distanceToCenterKm >= 0
      ? { distanceToCenterKm: raw.distanceToCenterKm }
      : {}),
    ...(safeCheckoutUrl(raw.checkoutUrl) === undefined
      ? {}
      : { checkoutUrl: safeCheckoutUrl(raw.checkoutUrl)! }),
    source,
    fetchedAt: context.fetchedAt,
    ...(isValidDateTime(raw.expiresAt) ? { expiresAt: raw.expiresAt } : {}),
    dataCompleteness: present.size / EXPECTED_HOTEL_FIELDS.length,
    riskSignals: [],
  };

  return { ok: true, option };
}

function quarantine(
  rawId: string | undefined,
  kind: 'transport' | 'hotel',
  reason: QuarantineReason,
  detail: string,
): { ok: false; quarantined: QuarantinedRecord } {
  return { ok: false, quarantined: { rawId, kind, reason, detail } };
}
