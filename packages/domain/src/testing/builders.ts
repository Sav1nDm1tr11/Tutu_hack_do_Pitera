import type { HotelOption, TransportOption, TransportSegment } from '../contracts/candidate';
import type { PlaceRef, TransportMode } from '../contracts/common';
import type { TravelRequest } from '../contracts/travel-request';

/**
 * Минимальные builders для unit-тестов домена.
 *
 * Домен не может зависеть от `@tutu-plan-b/test-fixtures` (правило границ §4.1),
 * поэтому маленькие объекты собираются здесь. Полноценные сценарии инвентаря живут
 * в fixtures и проверяются на уровне API.
 */

export function place(id: string, name: string, lon?: number, lat?: number): PlaceRef {
  return {
    id,
    name,
    kind: 'station',
    ...(lon !== undefined && lat !== undefined ? { point: { lon, lat } } : {}),
  };
}

export interface TransportOverrides {
  readonly id?: string;
  readonly direction?: 'outbound' | 'inbound';
  readonly mode?: TransportMode;
  readonly departureAt?: string;
  readonly arrivalAt?: string;
  readonly from?: PlaceRef;
  readonly to?: PlaceRef;
  readonly durationMinutes?: number | undefined;
  readonly transferCount?: number | undefined;
  readonly segments?: readonly TransportSegment[] | undefined;
  readonly price?: number | undefined;
  readonly dataCompleteness?: number;
}

export function transport(overrides: TransportOverrides = {}): TransportOption {
  const departureAt = overrides.departureAt ?? '2026-09-12T08:40';
  const arrivalAt = overrides.arrivalAt ?? '2026-09-12T11:50';

  return {
    id: overrides.id ?? 'out_1',
    kind: 'transport',
    direction: overrides.direction ?? 'outbound',
    mode: overrides.mode ?? 'flight',
    departure: { place: overrides.from ?? place('a', 'Кольцово', 60.8027, 56.7431), at: departureAt },
    arrival: { place: overrides.to ?? place('b', 'Пулково', 30.2625, 59.8003), at: arrivalAt },
    ...('durationMinutes' in overrides
      ? overrides.durationMinutes === undefined
        ? {}
        : { durationMinutes: overrides.durationMinutes }
      : { durationMinutes: 190 }),
    ...('transferCount' in overrides
      ? overrides.transferCount === undefined
        ? {}
        : { transferCount: overrides.transferCount }
      : { transferCount: 0 }),
    ...(overrides.segments === undefined ? {} : { segments: [...overrides.segments] }),
    ...('price' in overrides
      ? overrides.price === undefined
        ? {}
        : { price: { amount: overrides.price, currency: 'RUB' as const } }
      : { price: { amount: 18_600, currency: 'RUB' as const } }),
    source: [{ sourceType: 'tutuMcp', fieldPath: 'departure.at', label: 'Из инвентаря' }],
    fetchedAt: '2026-08-19T12:00',
    dataCompleteness: overrides.dataCompleteness ?? 1,
    riskSignals: [],
  };
}

export function segment(
  id: string,
  departureAt: string,
  arrivalAt: string,
  from: PlaceRef,
  to: PlaceRef,
): TransportSegment {
  return {
    id,
    mode: 'flight',
    departure: { place: from, at: departureAt },
    arrival: { place: to, at: arrivalAt },
  };
}

export function hotel(overrides: Partial<HotelOption> = {}): HotelOption {
  return {
    id: 'hotel_1',
    kind: 'hotel',
    name: 'Отель у вокзала',
    place: place('h', 'Отель у вокзала', 30.3626, 59.9296),
    checkIn: '2026-09-12T14:00',
    checkOut: '2026-09-15T12:00',
    nights: 3,
    price: { amount: 18_900, currency: 'RUB' },
    rating: 8.1,
    reviewSummary: { text: 'Чисто и близко к вокзалу' },
    reviewRedFlags: [],
    source: [{ sourceType: 'tutuMcp', fieldPath: 'name', label: 'Из инвентаря' }],
    fetchedAt: '2026-08-19T12:00',
    dataCompleteness: 1,
    riskSignals: [],
    ...overrides,
  };
}

export function request(overrides: Partial<TravelRequest> = {}): TravelRequest {
  return {
    requestId: 'req_test',
    origin: place('ekb', 'Екатеринбург', 60.5975, 56.8389),
    destination: place('spb', 'Санкт-Петербург', 30.3141, 59.9386),
    tripType: 'roundTrip',
    departDate: '2026-09-12',
    returnDate: '2026-09-15',
    travelers: { adults: 1, children: [] },
    budget: { amount: 90_000, currency: 'RUB', scope: 'totalTrip' },
    hardConstraints: {
      noNightSegments: false,
      minimumTransferPolicy: 'standard',
      budgetIsHard: true,
    },
    preferences: { price: 0.5, duration: 0.5, resilience: 0.5, comfort: 0.5 },
    locale: 'ru-RU',
    ...overrides,
  };
}
