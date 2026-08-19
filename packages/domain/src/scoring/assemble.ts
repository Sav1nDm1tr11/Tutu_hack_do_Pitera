import type {
  CandidateOption,
  CandidatePool,
  HotelOption,
  TransportOption,
} from '../contracts/candidate';
import type { TravelRequest } from '../contracts/travel-request';
import { isHotelOption, isTransportOption } from '../contracts/candidate';
import { minutesBetween } from '../time/wall-clock';
import { checkTransportHardConstraints, type HardFilterVerdict } from './hard-filters';
import { MAX_CANDIDATES_PER_CATEGORY, FALLBACK_TIME_WINDOW_MINUTES } from './risk-policy';

/** Одна полная сборка маршрута: туда, обратно (если нужно) и проживание (если найдено). */
export interface RouteAssembly {
  readonly outbound: TransportOption;
  readonly inbound: TransportOption | undefined;
  readonly hotel: HotelOption | undefined;
}

export interface EligibleTransport {
  readonly option: TransportOption;
  readonly verdict: HardFilterVerdict;
}

export interface PoolRange {
  readonly min: number;
  readonly max: number;
}

export interface GroupedInventory {
  readonly outbound: readonly EligibleTransport[];
  readonly inbound: readonly EligibleTransport[];
  readonly hotels: readonly HotelOption[];
  /** Отклонённые жёсткими фильтрами варианты — нужны для честного объяснения «почему пусто». */
  readonly rejected: readonly EligibleTransport[];
}

/**
 * Применяет жёсткие фильтры и раскладывает pool по направлениям.
 *
 * Варианты со статусом `needsVerification` остаются в игре (§9.1): они не подтверждены,
 * но и не нарушают ограничение — скрыть их означало бы соврать, что вариантов нет.
 */
export function groupInventory(pool: CandidatePool, request: TravelRequest): GroupedInventory {
  const outbound: EligibleTransport[] = [];
  const inbound: EligibleTransport[] = [];
  const hotels: HotelOption[] = [];
  const rejected: EligibleTransport[] = [];

  for (const option of Object.values(pool)) {
    if (isHotelOption(option)) {
      hotels.push(option);
      continue;
    }
    if (!isTransportOption(option)) continue;

    const verdict = checkTransportHardConstraints(option, request);
    const entry: EligibleTransport = { option, verdict };

    if (verdict.status === 'rejected') {
      rejected.push(entry);
      continue;
    }

    if (option.direction === 'outbound') outbound.push(entry);
    else inbound.push(entry);
  }

  return {
    outbound: pruneTransport(outbound),
    inbound: pruneTransport(inbound),
    hotels: pruneHotels(hotels),
    rejected,
  };
}

/**
 * Строит сборки маршрута. Отель включается, только если инвентарь его вернул:
 * при недоступности категории маршрут остаётся транспортным (§5.2), а не исчезает.
 */
export function buildAssemblies(
  grouped: GroupedInventory,
  request: TravelRequest,
): RouteAssembly[] {
  const assemblies: RouteAssembly[] = [];
  const needsInbound = request.tripType === 'roundTrip';
  const hotelChoices: readonly (HotelOption | undefined)[] =
    grouped.hotels.length > 0 && needsInbound ? grouped.hotels : [undefined];

  for (const outboundEntry of grouped.outbound) {
    const inboundChoices: readonly (EligibleTransport | undefined)[] = needsInbound
      ? grouped.inbound
      : [undefined];

    for (const inboundEntry of inboundChoices) {
      // Обратный рейс не может отправляться раньше прибытия в пункт назначения.
      if (inboundEntry !== undefined) {
        const gap = minutesBetween(
          outboundEntry.option.arrival.at,
          inboundEntry.option.departure.at,
        );
        if (gap !== undefined && gap <= 0) continue;
      }

      for (const hotel of hotelChoices) {
        assemblies.push({
          outbound: outboundEntry.option,
          inbound: inboundEntry?.option,
          hotel,
        });
      }
    }
  }

  return assemblies;
}

/**
 * Отсечение перебора. Пользователю показываются три конфигурации, поэтому держать
 * весь декартов произведение бессмысленно. Пре-ранг намеренно нейтрален (цена,
 * длительность и пересадки с равным весом), чтобы отсечение не подыгрывало ни одному
 * preset — иначе «бюджетный» отбор незаметно вырезал бы надёжные варианты.
 */
function pruneTransport(entries: readonly EligibleTransport[]): EligibleTransport[] {
  const priceRange = rangeOf(entries.map((entry) => entry.option.price?.amount));
  const durationRange = rangeOf(entries.map((entry) => entry.option.durationMinutes));

  const ranked = [...entries].sort((left, right) => {
    const delta = neutralRank(right, priceRange, durationRange) - neutralRank(left, priceRange, durationRange);
    if (Math.abs(delta) > 1e-9) return delta;
    return left.option.id.localeCompare(right.option.id);
  });

  return ranked.slice(0, MAX_CANDIDATES_PER_CATEGORY);
}

function pruneHotels(hotels: readonly HotelOption[]): HotelOption[] {
  const priceRange = rangeOf(hotels.map((hotel) => hotel.price?.amount));

  const ranked = [...hotels].sort((left, right) => {
    const leftScore =
      invertedNormalize(left.price?.amount, priceRange) + (left.rating ?? 0) / 10;
    const rightScore =
      invertedNormalize(right.price?.amount, priceRange) + (right.rating ?? 0) / 10;
    if (Math.abs(rightScore - leftScore) > 1e-9) return rightScore - leftScore;
    return left.id.localeCompare(right.id);
  });

  return ranked.slice(0, MAX_CANDIDATES_PER_CATEGORY);
}

function neutralRank(
  entry: EligibleTransport,
  priceRange: PoolRange | undefined,
  durationRange: PoolRange | undefined,
): number {
  const price = invertedNormalize(entry.option.price?.amount, priceRange);
  const duration = invertedNormalize(entry.option.durationMinutes, durationRange);
  const transfers =
    entry.option.transferCount === undefined ? 0.5 : 1 / (1 + entry.option.transferCount);
  const verified = entry.verdict.status === 'passed' ? 0.2 : 0;
  return price + duration + transfers + verified;
}

export function rangeOf(values: readonly (number | undefined)[]): PoolRange | undefined {
  const known = values.filter((value): value is number => value !== undefined);
  if (known.length === 0) return undefined;
  return { min: Math.min(...known), max: Math.max(...known) };
}

/** 1 для минимума диапазона, 0 для максимума. Неизвестное значение даёт нейтральные 0.5. */
export function invertedNormalize(
  value: number | undefined,
  range: PoolRange | undefined,
): number {
  if (value === undefined || range === undefined) return 0.5;
  if (range.max - range.min < 1e-9) return 1;
  return Math.min(1, Math.max(0, (range.max - value) / (range.max - range.min)));
}

/**
 * Сколько в pool реальных замен для конкретного транспортного варианта.
 *
 * Замена — это вариант того же направления, прошедший жёсткие фильтры и отправляющийся
 * в разумном временном окне. Это структурный сигнал устойчивости (§9.4), а не обещание,
 * что альтернатива будет доступна в момент сбоя.
 */
export function countAlternatives(
  option: TransportOption,
  grouped: GroupedInventory,
  windowMinutes: number = FALLBACK_TIME_WINDOW_MINUTES,
): number {
  const pool = option.direction === 'outbound' ? grouped.outbound : grouped.inbound;

  return pool.filter((entry) => {
    if (entry.option.id === option.id) return false;
    const delta = minutesBetween(option.departure.at, entry.option.departure.at);
    if (delta === undefined) return false;
    return Math.abs(delta) <= windowMinutes;
  }).length;
}

export function collectAssemblyOptions(assembly: RouteAssembly): CandidateOption[] {
  const options: CandidateOption[] = [assembly.outbound];
  if (assembly.inbound !== undefined) options.push(assembly.inbound);
  if (assembly.hotel !== undefined) options.push(assembly.hotel);
  return options;
}
