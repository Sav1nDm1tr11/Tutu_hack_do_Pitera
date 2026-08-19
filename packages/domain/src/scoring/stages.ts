import type { CalculatedOption, HotelOption } from '../contracts/candidate';
import type { ItineraryStage } from '../contracts/plan';
import type { TravelRequest } from '../contracts/travel-request';
import { formatDuration } from '../time/format';
import { minutesBetween } from '../time/wall-clock';
import type { GroupedInventory, RouteAssembly } from './assemble';

/** Ожидание дольше этого порога показывается как отдельный риск-сигнал. */
const LONG_WAIT_MINUTES = 4 * 60;

export interface BuiltStages {
  readonly stages: ItineraryStage[];
  /** Вычисленные варианты, которые нужно добавить в candidate pool. */
  readonly calculatedOptions: CalculatedOption[];
}

/**
 * Собирает линейную цепочку этапов. Основной путь всегда линеен, альтернативы —
 * это ветви конкретного этапа, а не отдельные узлы (§6.4).
 *
 * Внутренние пересадки бокируемого варианта НЕ выносятся в отдельные этапы: их нельзя
 * заменить независимо, и отдельная карточка создавала бы ложное впечатление, что можно.
 * Они показываются внутри транспортной карточки и учитываются в resilience.
 */
export function buildStages(
  assembly: RouteAssembly,
  request: TravelRequest,
  grouped: GroupedInventory,
  configurationId: string,
  fetchedAt: string,
): BuiltStages {
  const stages: ItineraryStage[] = [];
  const calculatedOptions: CalculatedOption[] = [];

  const outboundAlternatives = grouped.outbound
    .map((entry) => entry.option.id)
    .filter((id) => id !== assembly.outbound.id);

  stages.push({
    id: `${configurationId}:outbound`,
    kind: 'transport',
    selectedOptionId: assembly.outbound.id,
    alternativeOptionIds: outboundAlternatives,
    startAt: assembly.outbound.departure.at,
    endAt: assembly.outbound.arrival.at,
    origin: assembly.outbound.departure.place,
    destination: assembly.outbound.arrival.place,
    temporarilyUnavailable: false,
    title: 'Дорога туда',
  });

  if (assembly.hotel !== undefined) {
    const waitBeforeCheckIn = buildWaitStage({
      configurationId,
      slot: 'beforeCheckIn',
      fromIso: assembly.outbound.arrival.at,
      toIso: assembly.hotel.checkIn,
      place: assembly.hotel.place ?? assembly.outbound.arrival.place,
      fetchedAt,
      title: 'Ожидание заселения',
    });
    if (waitBeforeCheckIn !== undefined) {
      calculatedOptions.push(waitBeforeCheckIn.option);
      stages.push(waitBeforeCheckIn.stage);
    }

    stages.push({
      id: `${configurationId}:hotel`,
      kind: 'hotel',
      selectedOptionId: assembly.hotel.id,
      alternativeOptionIds: grouped.hotels
        .map((hotel) => hotel.id)
        .filter((id) => id !== assembly.hotel?.id),
      startAt: assembly.hotel.checkIn,
      endAt: assembly.hotel.checkOut,
      ...(assembly.hotel.place === undefined ? {} : { destination: assembly.hotel.place }),
      temporarilyUnavailable: false,
      title: 'Проживание',
    });
  } else if (request.tripType === 'roundTrip' && grouped.hotels.length === 0) {
    // Категория отелей недоступна: этап остаётся видимым и помеченным, а не исчезает (§5.2).
    stages.push({
      id: `${configurationId}:hotel`,
      kind: 'hotel',
      selectedOptionId: HOTEL_UNAVAILABLE_OPTION_ID,
      alternativeOptionIds: [],
      temporarilyUnavailable: true,
      title: 'Проживание',
    });
  }

  if (assembly.inbound !== undefined) {
    if (assembly.hotel !== undefined) {
      const waitAfterCheckOut = buildWaitStage({
        configurationId,
        slot: 'afterCheckOut',
        fromIso: assembly.hotel.checkOut,
        toIso: assembly.inbound.departure.at,
        place: assembly.hotel.place ?? assembly.inbound.departure.place,
        fetchedAt,
        title: 'Время до отъезда',
      });
      if (waitAfterCheckOut !== undefined) {
        calculatedOptions.push(waitAfterCheckOut.option);
        stages.push(waitAfterCheckOut.stage);
      }
    }

    stages.push({
      id: `${configurationId}:inbound`,
      kind: 'transport',
      selectedOptionId: assembly.inbound.id,
      alternativeOptionIds: grouped.inbound
        .map((entry) => entry.option.id)
        .filter((id) => id !== assembly.inbound?.id),
      startAt: assembly.inbound.departure.at,
      endAt: assembly.inbound.arrival.at,
      origin: assembly.inbound.departure.place,
      destination: assembly.inbound.arrival.place,
      temporarilyUnavailable: false,
      title: 'Дорога обратно',
    });
  }

  return { stages, calculatedOptions };
}

/** Псевдо-id для недоступной категории. В pool не существует — этап помечен как недоступный. */
export const HOTEL_UNAVAILABLE_OPTION_ID = 'unavailable:hotel';

interface WaitStageInput {
  readonly configurationId: string;
  readonly slot: 'beforeCheckIn' | 'afterCheckOut';
  readonly fromIso: string;
  readonly toIso: string;
  readonly place: HotelOption['place'] | undefined;
  readonly fetchedAt: string;
  readonly title: string;
}

/**
 * Ожидание — всегда вычисленная величина и всегда маркируется `calculated` (§6.5).
 * Возвращает `undefined`, если ждать нечего или время разобрать не удалось: пустая
 * карточка «0 минут» только шумит.
 */
function buildWaitStage(
  input: WaitStageInput,
): { stage: ItineraryStage; option: CalculatedOption } | undefined {
  const waitMinutes = minutesBetween(input.fromIso, input.toIso);
  if (waitMinutes === undefined || waitMinutes <= 0) return undefined;

  const optionId = `calc:${input.configurationId}:${input.slot}`;

  const option: CalculatedOption = {
    id: optionId,
    kind: 'calculated',
    calculationKind: 'wait',
    durationMinutes: waitMinutes,
    ...(input.place === undefined ? {} : { place: input.place }),
    minimumBufferMinutes: 0,
    bufferSatisfied: true,
    source: [
      {
        sourceType: 'calculation',
        fieldPath: 'durationMinutes',
        label: 'Рассчитано по времени соседних этапов',
      },
    ],
    fetchedAt: input.fetchedAt,
    dataCompleteness: 1,
    riskSignals:
      waitMinutes >= LONG_WAIT_MINUTES
        ? [
            {
              code: 'longWait',
              severity: 'warning',
              message: `Ожидание ${formatDuration(waitMinutes)} — стоит заранее решить, где провести это время`,
            },
          ]
        : [],
  };

  const stage: ItineraryStage = {
    id: `${input.configurationId}:${input.slot}`,
    kind: 'wait',
    selectedOptionId: optionId,
    alternativeOptionIds: [],
    startAt: input.fromIso,
    endAt: input.toIso,
    ...(input.place === undefined ? {} : { destination: input.place }),
    temporarilyUnavailable: false,
    title: input.title,
  };

  return { stage, option };
}
