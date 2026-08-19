import type {
  RawPlace,
  RawTransportOffer,
  RawTransportSegment,
  TransportMode,
  TravelRequest,
} from '@tutu-plan-b/domain';
import { haversineKm } from '@tutu-plan-b/domain';
import { findCity, pickHub, type FixtureCity, type FixtureTerminal } from './places';
import { addMinutes, arrivalLocalIso, localIso } from './local-time';
import { createRng, type Rng } from './seed';

export interface RouteContext {
  readonly origin: FixtureCity;
  readonly destination: FixtureCity;
  readonly distanceKm: number;
  readonly hub: FixtureCity | undefined;
}

interface ModeProfile {
  readonly cruiseKmh: number;
  readonly fixedMinutes: number;
  readonly basePrice: number;
  readonly pricePerKm: number;
  readonly minDistanceKm: number;
  readonly maxDistanceKm: number;
  /**
   * Электрички в Tutu MCP заявлены как расписание, без оформления (§3.1),
   * поэтому у них не бывает цены. Это не пробел генератора, а моделирование реальности.
   */
  readonly hasPrice: boolean;
}

const MODE_PROFILES: Record<TransportMode, ModeProfile> = {
  flight: {
    cruiseKmh: 780,
    fixedMinutes: 75,
    basePrice: 2400,
    pricePerKm: 4.6,
    minDistanceKm: 500,
    maxDistanceKm: 12000,
    hasPrice: true,
  },
  train: {
    cruiseKmh: 68,
    fixedMinutes: 15,
    basePrice: 800,
    pricePerKm: 2.0,
    minDistanceKm: 80,
    maxDistanceKm: 9000,
    hasPrice: true,
  },
  bus: {
    cruiseKmh: 55,
    fixedMinutes: 20,
    basePrice: 350,
    pricePerKm: 1.5,
    minDistanceKm: 40,
    maxDistanceKm: 1000,
    hasPrice: true,
  },
  suburbanTrain: {
    cruiseKmh: 42,
    fixedMinutes: 5,
    basePrice: 0,
    pricePerKm: 0,
    minDistanceKm: 15,
    maxDistanceKm: 200,
    hasPrice: false,
  },
};

const OPERATORS: Record<TransportMode, readonly string[]> = {
  flight: ['Аэрофлот', 'S7 Airlines', 'Уральские авиалинии', 'Победа', 'Россия'],
  train: ['РЖД, фирменный', 'РЖД, скорый', 'РЖД, Сапсан'],
  bus: ['Автовокзалы России', 'Межрегион-Транс'],
  suburbanTrain: ['Пригородная пассажирская компания'],
};

const SERVICE_CLASSES: Record<TransportMode, readonly string[]> = {
  flight: ['Эконом', 'Эконом Basic', 'Комфорт'],
  train: ['Плацкарт', 'Купе', 'СВ'],
  bus: ['Стандарт'],
  suburbanTrain: ['Общий'],
};

export function resolveRouteContext(request: TravelRequest): RouteContext | undefined {
  const origin = findCity(request.origin.id) ?? findCity(request.origin.name);
  const destination = findCity(request.destination.id) ?? findCity(request.destination.name);
  if (origin === undefined || destination === undefined) return undefined;

  return {
    origin,
    destination,
    distanceKm: haversineKm(origin.point, destination.point),
    hub: pickHub(origin.id, destination.id),
  };
}

function availableModes(distanceKm: number): TransportMode[] {
  return (Object.keys(MODE_PROFILES) as TransportMode[]).filter((mode) => {
    const profile = MODE_PROFILES[mode];
    return distanceKm >= profile.minDistanceKm && distanceKm <= profile.maxDistanceKm;
  });
}

function durationFor(mode: TransportMode, distanceKm: number, rng: Rng): number {
  const profile = MODE_PROFILES[mode];
  const pure = (distanceKm / profile.cruiseKmh) * 60;
  return Math.round((profile.fixedMinutes + pure) * rng.jitter(0.08));
}

/** Цена на всю группу: ребёнок считается за 0.75 взрослого. */
function priceFor(
  mode: TransportMode,
  distanceKm: number,
  request: TravelRequest,
  rng: Rng,
  discount = 1,
): number | undefined {
  const profile = MODE_PROFILES[mode];
  if (!profile.hasPrice) return undefined;

  const perPerson = (profile.basePrice + profile.pricePerKm * distanceKm) * rng.jitter(0.1) * discount;
  const payingUnits = request.travelers.adults + request.travelers.children.length * 0.75;
  return Math.round((perPerson * payingUnits) / 50) * 50;
}

function terminalFor(city: FixtureCity, mode: TransportMode, rng: Rng): FixtureTerminal {
  switch (mode) {
    case 'flight':
      return rng.pick(city.airports);
    case 'bus':
      return rng.pick(city.busStations);
    case 'train':
    case 'suburbanTrain':
      return rng.pick(city.railStations);
  }
}

function rawPlace(terminal: FixtureTerminal, city: FixtureCity, mode: TransportMode): RawPlace {
  return {
    id: terminal.id,
    name: `${city.name}, ${terminal.name}`,
    kind: mode === 'flight' ? 'airport' : mode === 'bus' ? 'busStation' : 'station',
    lat: terminal.point.lat,
    lon: terminal.point.lon,
    timezone: `UTC${city.utcOffsetMinutes >= 0 ? '+' : '-'}${Math.abs(city.utcOffsetMinutes / 60)}`,
  };
}

function checkoutUrlFor(mode: TransportMode, id: string): string {
  const host =
    mode === 'flight'
      ? 'avia.tutu.ru'
      : mode === 'train'
        ? 'poezd.tutu.ru'
        : mode === 'bus'
          ? 'bus.tutu.ru'
          : 'suburban.tutu.ru';
  return `https://${host}/offers/${encodeURIComponent(id)}`;
}

interface DirectOfferInput {
  readonly context: RouteContext;
  readonly request: TravelRequest;
  readonly direction: 'outbound' | 'inbound';
  readonly date: string;
  readonly mode: TransportMode;
  readonly departureMinuteOfDay: number;
  readonly slug: string;
  readonly priceDiscount?: number;
  readonly rng: Rng;
}

function buildDirectOffer(input: DirectOfferInput): RawTransportOffer {
  const { context, request, direction, mode, rng } = input;
  const from = direction === 'outbound' ? context.origin : context.destination;
  const to = direction === 'outbound' ? context.destination : context.origin;

  const fromTerminal = terminalFor(from, mode, rng);
  const toTerminal = terminalFor(to, mode, rng);

  const duration = durationFor(mode, context.distanceKm, rng);
  const departureAt = localIso(input.date, input.departureMinuteOfDay);
  const arrivalAt = arrivalLocalIso(
    departureAt,
    duration,
    from.utcOffsetMinutes,
    to.utcOffsetMinutes,
  );

  const id = `${direction}_${mode}_${input.slug}`;
  const price = priceFor(mode, context.distanceKm, request, rng, input.priceDiscount ?? 1);

  return {
    id,
    direction,
    mode,
    operator: rng.pick(OPERATORS[mode]),
    departurePlace: rawPlace(fromTerminal, from, mode),
    departureAt,
    arrivalPlace: rawPlace(toTerminal, to, mode),
    arrivalAt,
    durationMinutes: duration,
    transferCount: 0,
    ...(price === undefined ? {} : { priceAmount: price, currency: 'RUB' }),
    serviceClass: rng.pick(SERVICE_CLASSES[mode]),
    seatsAvailable: rng.int(2, 28),
    refundable: rng.next() > 0.55,
    checkoutUrl: checkoutUrlFor(mode, id),
  };
}

interface ConnectingOfferInput {
  readonly context: RouteContext;
  readonly request: TravelRequest;
  readonly direction: 'outbound' | 'inbound';
  readonly date: string;
  readonly departureMinuteOfDay: number;
  readonly layoverMinutes: number;
  readonly slug: string;
  /** Прилёт и вылет из разных терминалов хаба: даёт смену точки и более строгий буфер. */
  readonly changeTerminal: boolean;
  readonly priceDiscount?: number;
  readonly rng: Rng;
}

/**
 * Рейс с пересадкой через хаб.
 *
 * Такие варианты нужны не для полноты каталога, а потому что именно на них видна
 * ценность продукта: короткий буфер и смена аэропорта — это структурный риск,
 * который обычный поиск показывает как «дешевле на 4 000 ₽».
 */
function buildConnectingOffer(input: ConnectingOfferInput): RawTransportOffer | undefined {
  const { context, request, direction, rng } = input;
  const hub = context.hub;
  if (hub === undefined) return undefined;

  const from = direction === 'outbound' ? context.origin : context.destination;
  const to = direction === 'outbound' ? context.destination : context.origin;

  const legOneKm = haversineKm(from.point, hub.point);
  const legTwoKm = haversineKm(hub.point, to.point);
  if (legOneKm < 200 || legTwoKm < 200) return undefined;

  const fromTerminal = terminalFor(from, 'flight', rng);
  const toTerminal = terminalFor(to, 'flight', rng);
  const hubArrival = hub.airports[0]!;
  const hubDeparture =
    input.changeTerminal && hub.airports.length > 1 ? hub.airports[1]! : hubArrival;

  const legOneDuration = durationFor('flight', legOneKm, rng);
  const legTwoDuration = durationFor('flight', legTwoKm, rng);

  const departureAt = localIso(input.date, input.departureMinuteOfDay);
  const hubArrivalAt = arrivalLocalIso(
    departureAt,
    legOneDuration,
    from.utcOffsetMinutes,
    hub.utcOffsetMinutes,
  );
  const hubDepartureAt = addMinutes(hubArrivalAt, input.layoverMinutes);
  const arrivalAt = arrivalLocalIso(
    hubDepartureAt,
    legTwoDuration,
    hub.utcOffsetMinutes,
    to.utcOffsetMinutes,
  );

  const id = `${direction}_flight_${input.slug}`;
  const price = priceFor(
    'flight',
    legOneKm + legTwoKm,
    request,
    rng,
    input.priceDiscount ?? 0.82,
  );

  const segments: RawTransportSegment[] = [
    {
      id: `${id}:s1`,
      mode: 'flight',
      operator: rng.pick(OPERATORS.flight),
      departurePlace: rawPlace(fromTerminal, from, 'flight'),
      departureAt,
      arrivalPlace: rawPlace(hubArrival, hub, 'flight'),
      arrivalAt: hubArrivalAt,
      serviceClass: 'Эконом',
    },
    {
      id: `${id}:s2`,
      mode: 'flight',
      operator: rng.pick(OPERATORS.flight),
      departurePlace: rawPlace(hubDeparture, hub, 'flight'),
      departureAt: hubDepartureAt,
      arrivalPlace: rawPlace(toTerminal, to, 'flight'),
      arrivalAt,
      serviceClass: 'Эконом',
    },
  ];

  return {
    id,
    direction,
    mode: 'flight',
    operator: segments[0]!.operator,
    departurePlace: segments[0]!.departurePlace,
    departureAt,
    arrivalPlace: segments[1]!.arrivalPlace,
    arrivalAt,
    durationMinutes: legOneDuration + input.layoverMinutes + legTwoDuration,
    transferCount: 1,
    segments,
    ...(price === undefined ? {} : { priceAmount: price, currency: 'RUB' }),
    serviceClass: 'Эконом',
    seatsAvailable: rng.int(1, 14),
    refundable: false,
    checkoutUrl: checkoutUrlFor('flight', id),
  };
}

/**
 * Набор вариантов на одно направление.
 *
 * Состав подобран так, чтобы в пуле всегда были: спокойный дневной прямой вариант,
 * дешёвый ночной, вариант с рискованной пересадкой и вариант другого вида транспорта.
 * Без этого «надёжный / сбалансированный / бюджетный» выродились бы в один и тот же маршрут.
 */
export function generateDirectionOffers(
  context: RouteContext,
  request: TravelRequest,
  direction: 'outbound' | 'inbound',
  date: string,
): RawTransportOffer[] {
  const rng = createRng(`${request.origin.id}|${request.destination.id}|${date}|${direction}`);
  const modes = availableModes(context.distanceKm);
  const offers: RawTransportOffer[] = [];

  const push = (offer: RawTransportOffer | undefined): void => {
    if (offer !== undefined) offers.push(offer);
  };

  if (modes.includes('flight')) {
    push(
      buildDirectOffer({
        context,
        request,
        direction,
        date,
        mode: 'flight',
        departureMinuteOfDay: 8 * 60 + 40 + rng.int(-25, 25),
        slug: 'morning',
        rng,
      }),
    );
    push(
      buildDirectOffer({
        context,
        request,
        direction,
        date,
        mode: 'flight',
        departureMinuteOfDay: 15 * 60 + 10 + rng.int(-30, 30),
        slug: 'afternoon',
        rng,
      }),
    );
    push(
      buildDirectOffer({
        context,
        request,
        direction,
        date,
        mode: 'flight',
        departureMinuteOfDay: 23 * 60 + 40,
        slug: 'redeye',
        priceDiscount: 0.72,
        rng,
      }),
    );
    push(
      buildConnectingOffer({
        context,
        request,
        direction,
        date,
        departureMinuteOfDay: 6 * 60 + 20,
        layoverMinutes: 165,
        slug: 'hub_relaxed',
        changeTerminal: false,
        rng,
      }),
    );
    push(
      buildConnectingOffer({
        context,
        request,
        direction,
        date,
        departureMinuteOfDay: 7 * 60 + 5,
        layoverMinutes: 85,
        slug: 'hub_tight',
        changeTerminal: true,
        priceDiscount: 0.7,
        rng,
      }),
    );
  }

  if (modes.includes('train')) {
    push(
      buildDirectOffer({
        context,
        request,
        direction,
        date,
        mode: 'train',
        departureMinuteOfDay: 16 * 60 + 42,
        slug: 'evening',
        rng,
      }),
    );
    push(
      buildDirectOffer({
        context,
        request,
        direction,
        date,
        mode: 'train',
        departureMinuteOfDay: 7 * 60 + 25,
        slug: 'morning',
        rng,
      }),
    );
  }

  if (modes.includes('bus')) {
    push(
      buildDirectOffer({
        context,
        request,
        direction,
        date,
        mode: 'bus',
        departureMinuteOfDay: 9 * 60 + 15,
        slug: 'day',
        priceDiscount: 0.9,
        rng,
      }),
    );
  }

  if (modes.includes('suburbanTrain')) {
    push(
      buildDirectOffer({
        context,
        request,
        direction,
        date,
        mode: 'suburbanTrain',
        departureMinuteOfDay: 8 * 60 + 5,
        slug: 'schedule',
        rng,
      }),
    );
  }

  return offers;
}
