import type { RawInventoryBatch, RawPlace, RawTransportOffer, TravelRequest } from '@tutu-plan-b/domain';
import { generateDirectionOffers, resolveRouteContext } from './generate-transport';
import { generateHotelOffers } from './generate-hotels';
import { minuteOfDay } from './local-time';

export const FIXTURE_SCENARIO_IDS = [
  'default',
  'noHotels',
  'nightSegmentsOnly',
  'noValidRoute',
  'missingCoordinates',
  'brokenRecords',
  'sparseData',
] as const;

export type FixtureScenarioId = (typeof FIXTURE_SCENARIO_IDS)[number];

export const FIXTURE_SCENARIO_LABELS: Record<FixtureScenarioId, string> = {
  default: 'Полный набор вариантов',
  noHotels: 'Отели недоступны',
  nightSegmentsOnly: 'Только ночные варианты',
  noValidRoute: 'Подходящих вариантов нет',
  missingCoordinates: 'Инвентарь без координат',
  brokenRecords: 'Битые записи в ответе',
  sparseData: 'Неполные данные по вариантам',
};

export function isFixtureScenarioId(value: string): value is FixtureScenarioId {
  return (FIXTURE_SCENARIO_IDS as readonly string[]).includes(value);
}

/**
 * Собирает raw-пачку демо-инвентаря под конкретный запрос.
 *
 * Генерация, а не статический дамп: судья на демо может ввести любой город, и показывать
 * ему Екатеринбург → Петербург в ответ на «Казань → Сочи» было бы прямым обманом.
 * Детерминированность обеспечивается seed, выведенным из самого запроса.
 */
export function buildFixtureBatch(
  request: TravelRequest,
  scenario: FixtureScenarioId = 'default',
): RawInventoryBatch {
  const context = resolveRouteContext(request);

  // Города нет в демо-каталоге: честнее вернуть пустой инвентарь, чем подставить чужой маршрут.
  if (context === undefined) {
    return { transport: [], hotels: [] };
  }

  const transport = [
    ...generateDirectionOffers(context, request, 'outbound', request.departDate),
    ...(request.returnDate === undefined
      ? []
      : generateDirectionOffers(context, request, 'inbound', request.returnDate)),
  ];

  const hotels = generateHotelOffers(context.destination, request);

  return applyScenario({ transport, hotels }, scenario);
}

function applyScenario(batch: RawInventoryBatch, scenario: FixtureScenarioId): RawInventoryBatch {
  switch (scenario) {
    case 'default':
      return batch;

    case 'noHotels':
      return { transport: batch.transport, hotels: [] };

    case 'noValidRoute':
      return { transport: [], hotels: batch.hotels };

    case 'nightSegmentsOnly':
      return {
        transport: batch.transport.filter((offer) => isNightDeparture(offer)),
        hotels: batch.hotels,
      };

    case 'missingCoordinates':
      return {
        transport: batch.transport.map(stripCoordinates),
        hotels: batch.hotels.map((hotel) => {
          const { place: _place, ...rest } = hotel;
          return rest;
        }),
      };

    case 'sparseData':
      return {
        transport: batch.transport.map((offer, index) =>
          index % 2 === 0 ? stripOptionalFields(offer) : offer,
        ),
        hotels: batch.hotels,
      };

    case 'brokenRecords':
      return {
        transport: [...batch.transport, ...BROKEN_TRANSPORT_RECORDS],
        hotels: batch.hotels,
      };
  }
}

function isNightDeparture(offer: RawTransportOffer): boolean {
  if (offer.departureAt === undefined) return false;
  const minute = minuteOfDay(offer.departureAt);
  return minute >= 23 * 60 || minute <= 6 * 60;
}

function stripCoordinates(offer: RawTransportOffer): RawTransportOffer {
  const withoutPoint = (place: RawPlace | undefined): RawPlace | undefined => {
    if (place === undefined) return undefined;
    const { lat: _lat, lon: _lon, ...rest } = place;
    return rest;
  };

  return {
    ...offer,
    departurePlace: withoutPoint(offer.departurePlace),
    arrivalPlace: withoutPoint(offer.arrivalPlace),
    ...(offer.segments === undefined
      ? {}
      : {
          segments: offer.segments.map((segment) => ({
            ...segment,
            departurePlace: withoutPoint(segment.departurePlace),
            arrivalPlace: withoutPoint(segment.arrivalPlace),
          })),
        }),
  };
}

/** Убирает необязательные поля: проверяет, что UI скрывает показатель, а не показывает ноль. */
function stripOptionalFields(offer: RawTransportOffer): RawTransportOffer {
  const {
    priceAmount: _price,
    currency: _currency,
    durationMinutes: _duration,
    transferCount: _transfers,
    serviceClass: _serviceClass,
    operator: _operator,
    seatsAvailable: _seats,
    ...rest
  } = offer;
  return rest;
}

/**
 * Записи, которые обязаны попасть в quarantine, а не «починиться».
 * Каждая ломает ровно одно инвариантное требование нормализатора.
 */
const BROKEN_TRANSPORT_RECORDS: readonly RawTransportOffer[] = [
  {
    // Нет идентификатора: сослаться на такой вариант из stage невозможно.
    direction: 'outbound',
    mode: 'flight',
    departurePlace: { id: 'x', name: 'Городок', lat: 55, lon: 37 },
    departureAt: '2026-09-12T10:00',
    arrivalPlace: { id: 'y', name: 'Другой городок', lat: 59, lon: 30 },
    arrivalAt: '2026-09-12T12:00',
  },
  {
    id: 'broken_unknown_mode',
    direction: 'outbound',
    mode: 'teleport',
    departurePlace: { id: 'x', name: 'Городок', lat: 55, lon: 37 },
    departureAt: '2026-09-12T10:00',
    arrivalPlace: { id: 'y', name: 'Другой городок', lat: 59, lon: 30 },
    arrivalAt: '2026-09-12T12:00',
  },
  {
    id: 'broken_negative_duration',
    direction: 'outbound',
    mode: 'train',
    departurePlace: { id: 'x', name: 'Городок', lat: 55, lon: 37 },
    departureAt: '2026-09-12T18:00',
    arrivalPlace: { id: 'y', name: 'Другой городок', lat: 59, lon: 30 },
    arrivalAt: '2026-09-12T09:00',
  },
  {
    id: 'broken_missing_times',
    direction: 'inbound',
    mode: 'bus',
    departurePlace: { id: 'x', name: 'Городок', lat: 55, lon: 37 },
    arrivalPlace: { id: 'y', name: 'Другой городок', lat: 59, lon: 30 },
  },
  {
    id: 'broken_missing_place',
    direction: 'outbound',
    mode: 'flight',
    departureAt: '2026-09-12T10:00',
    arrivalAt: '2026-09-12T12:00',
  },
];
