import type { ScoreReason, ScoreSignal } from '../contracts/score';
import type { TravelRequest } from '../contracts/travel-request';
import type { PlanTotals } from '../contracts/plan';
import type { TransportOption } from '../contracts/candidate';
import { formatDuration, formatPrice } from '../time/format';
import { overlapsNight } from '../time/wall-clock';
import {
  MODE_COMFORT,
  MODE_LABELS,
  NIGHT_PENALTY,
  NIGHT_WINDOW,
  alternativesScore,
  transferCountScore,
} from './risk-policy';
import { analyzeTransfers, type TransferAnalysis } from './transfers';
import { invertedNormalize, type PoolRange, type RouteAssembly } from './assemble';

export interface ScoringContext {
  readonly request: TravelRequest;
  readonly priceRange: PoolRange | undefined;
  readonly durationRange: PoolRange | undefined;
  /** Число реальных замен в pool по id транспортного варианта. */
  readonly alternativesByOptionId: ReadonlyMap<string, number>;
}

const reason = (
  code: ScoreReason['code'],
  severity: ScoreReason['severity'],
  message: string,
): ScoreReason => ({ code, severity, message, evidence: [] });

/**
 * Сигналы цены.
 *
 * Неизвестная цена не считается ни хорошей, ни плохой: сигналы возвращают `undefined`,
 * а пользователь видит явную причину `priceUnknown`.
 */
export function priceSignals(totals: PlanTotals, context: ScoringContext): ScoreSignal[] {
  const price = totals.price?.amount;

  if (price === undefined) {
    return [
      {
        key: 'relativePrice',
        value: undefined,
        weight: 2,
        reasons: [
          reason('priceUnknown', 'warning', 'Итоговая цена известна не полностью'),
        ],
      },
      { key: 'budgetHeadroom', value: undefined, weight: 1, reasons: [] },
    ];
  }

  const budget = context.request.budget.amount;
  const withinBudget = price <= budget;
  const relative = invertedNormalize(price, context.priceRange);
  const isCheapest =
    context.priceRange !== undefined && Math.abs(price - context.priceRange.min) < 1e-9;

  const budgetReasons: ScoreReason[] = withinBudget
    ? [
        reason(
          'withinBudget',
          'positive',
          `Укладывается в бюджет: ${formatPrice(totals.price)} из ${formatPrice({ amount: budget, currency: 'RUB' })}`,
        ),
      ]
    : [
        reason(
          'overBudget',
          'critical',
          `Дороже бюджета на ${formatPrice({ amount: price - budget, currency: 'RUB' })}`,
        ),
      ];

  return [
    {
      key: 'relativePrice',
      value: relative,
      weight: 2,
      reasons: isCheapest
        ? [reason('cheapestInPool', 'positive', 'Самый дешёвый из найденных вариантов')]
        : [],
    },
    {
      key: 'budgetHeadroom',
      value: withinBudget ? 0.5 + 0.5 * ((budget - price) / Math.max(budget, 1)) : 0,
      weight: 1,
      reasons: budgetReasons,
    },
  ];
}

export function durationSignals(totals: PlanTotals, context: ScoringContext): ScoreSignal[] {
  if (totals.travelMinutes === undefined) {
    return [
      {
        key: 'relativeDuration',
        value: undefined,
        weight: 1,
        reasons: [reason('durationUnknown', 'warning', 'Длительность известна не полностью')],
      },
    ];
  }

  const relative = invertedNormalize(totals.travelMinutes, context.durationRange);
  const isFastest =
    context.durationRange !== undefined &&
    Math.abs(totals.travelMinutes - context.durationRange.min) < 1e-9;

  const reasons: ScoreReason[] = isFastest
    ? [reason('fastestInPool', 'positive', 'Самый быстрый из найденных вариантов')]
    : relative < 0.25
      ? [
          reason(
            'longTotalDuration',
            'warning',
            `Дорога занимает ${formatDuration(totals.travelMinutes)} — заметно дольше остальных вариантов`,
          ),
        ]
      : [];

  return [{ key: 'relativeDuration', value: relative, weight: 1, reasons }];
}

/**
 * Сигналы устойчивости (§9.4). Это структурная способность маршрута выдержать потерю
 * одного этапа, а не обещание пунктуальности.
 */
export function resilienceSignals(
  assembly: RouteAssembly,
  context: ScoringContext,
): ScoreSignal[] {
  const policy = context.request.hardConstraints.minimumTransferPolicy;
  const legs = [assembly.outbound, assembly.inbound].filter(
    (option): option is TransportOption => option !== undefined,
  );
  const analyses = legs.map((leg) => analyzeTransfers(leg, policy));

  return [
    transferCountSignal(analyses),
    bufferSignal(analyses),
    stationChangeSignal(analyses),
    alternativesSignal(legs, context),
    nightSignal(legs, context, 'resilience'),
    dataCompletenessSignal(assembly),
  ];
}

function transferCountSignal(analyses: readonly TransferAnalysis[]): ScoreSignal {
  const counts = analyses.map((analysis) => analysis.count);
  if (counts.some((count) => count === undefined)) {
    return {
      key: 'transferCount',
      value: undefined,
      weight: 2,
      reasons: [
        reason('transferCountUnknown', 'warning', 'Количество пересадок не подтверждено данными'),
      ],
    };
  }

  const total = counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
  const reasons: ScoreReason[] =
    total === 0
      ? [reason('noTransfers', 'positive', 'Без пересадок — нечего пропустить')]
      : total <= 2
        ? [reason('transfersWithinLimit', 'neutral', `Пересадок: ${total}`)]
        : [
            reason(
              'manyTransfers',
              'warning',
              `Пересадок: ${total}. Каждая добавляет точку, где маршрут может развалиться`,
            ),
          ];

  return { key: 'transferCount', value: transferCountScore(total), weight: 2, reasons };
}

function bufferSignal(analyses: readonly TransferAnalysis[]): ScoreSignal {
  const ratios = analyses
    .map((analysis) => analysis.bufferRatio)
    .filter((ratio): ratio is number => ratio !== undefined);

  if (ratios.length !== analyses.length) {
    return {
      key: 'transferBuffer',
      value: undefined,
      weight: 3,
      reasons: [
        reason('bufferUnknown', 'warning', 'Запас времени на пересадку определить не удалось'),
      ],
    };
  }

  const worst = Math.min(...ratios);
  const tightest = analyses
    .flatMap((analysis) => analysis.details)
    .filter((detail) => !detail.satisfied)
    .sort((left, right) => left.waitMinutes - right.waitMinutes)[0];

  const reasons: ScoreReason[] =
    tightest !== undefined
      ? [
          reason(
            'tightBuffer',
            'critical',
            `На пересадку в ${tightest.arrivalPlace.name} остаётся ${formatDuration(tightest.waitMinutes)} при рекомендуемых ${formatDuration(tightest.requiredMinutes)}`,
          ),
        ]
      : worst >= 1
        ? [reason('comfortableBuffer', 'positive', 'Запас времени на пересадках достаточный')]
        : [];

  return { key: 'transferBuffer', value: worst, weight: 3, reasons };
}

function stationChangeSignal(analyses: readonly TransferAnalysis[]): ScoreSignal {
  const flags = analyses.map((analysis) => analysis.hasStationChange);

  // Пересадок нет вовсе — менять точку негде, сигнал положительный и известный.
  if (analyses.every((analysis) => analysis.count === 0)) {
    return { key: 'stationChange', value: 1, weight: 1, reasons: [] };
  }

  if (flags.some((flag) => flag === undefined)) {
    return { key: 'stationChange', value: undefined, weight: 1, reasons: [] };
  }

  const hasChange = flags.some((flag) => flag === true);
  const changed = analyses
    .flatMap((analysis) => analysis.details)
    .find((detail) => detail.sameStation === false);

  return {
    key: 'stationChange',
    value: hasChange ? 0.4 : 1,
    weight: 1,
    reasons: hasChange && changed !== undefined
      ? [
          reason(
            'stationChange',
            'warning',
            `Нужно перебраться из ${changed.arrivalPlace.name} в ${changed.departurePlace.name}`,
          ),
        ]
      : [],
  };
}

function alternativesSignal(
  legs: readonly TransportOption[],
  context: ScoringContext,
): ScoreSignal {
  const counts = legs.map((leg) => context.alternativesByOptionId.get(leg.id) ?? 0);
  const worst = counts.length === 0 ? 0 : Math.min(...counts);

  const reasons: ScoreReason[] =
    worst === 0
      ? [
          reason(
            'noAlternatives',
            'critical',
            'Готовой замены в подходящее время не нашлось — этап критичен',
          ),
        ]
      : [
          reason(
            'alternativesAvailable',
            'positive',
            `Рядом по времени есть ${worst} подходящих замен на случай сбоя`,
          ),
        ];

  return { key: 'alternatives', value: alternativesScore(worst), weight: 3, reasons };
}

function nightSignal(
  legs: readonly TransportOption[],
  context: ScoringContext,
  dimension: 'resilience' | 'comfort',
): ScoreSignal {
  const flags = legs.map((leg) => overlapsNight(leg.departure.at, leg.arrival.at, NIGHT_WINDOW));

  if (flags.some((flag) => flag === undefined)) {
    return { key: `${dimension}:night`, value: undefined, weight: 1, reasons: [] };
  }

  const hasNight = flags.some((flag) => flag === true);
  const hasChildren = context.request.travelers.children.length > 0;
  const penalty = hasChildren ? NIGHT_PENALTY.withChildren : NIGHT_PENALTY.withoutChildren;

  return {
    key: `${dimension}:night`,
    value: hasNight ? penalty : 1,
    weight: 1,
    reasons: hasNight
      ? [
          reason(
            'nightSegment',
            'warning',
            hasChildren
              ? 'Часть пути приходится на ночь — с ребёнком это тяжелее и хуже переносит сбои'
              : 'Часть пути приходится на ночь: меньше вариантов, если что-то пойдёт не так',
          ),
        ]
      : [reason('noNightSegments', 'positive', 'Весь путь проходит в дневные часы')],
  };
}

function dataCompletenessSignal(assembly: RouteAssembly): ScoreSignal {
  const options = [assembly.outbound, assembly.inbound, assembly.hotel].filter(
    (option): option is NonNullable<typeof option> => option !== undefined,
  );
  const worst = Math.min(...options.map((option) => option.dataCompleteness));

  return {
    key: 'dataCompleteness',
    value: worst,
    weight: 1,
    reasons:
      worst < 0.7
        ? [
            reason(
              'incompleteData',
              'warning',
              'Часть характеристик этого варианта инвентарь не вернул',
            ),
          ]
        : [],
  };
}

export function comfortSignals(assembly: RouteAssembly, context: ScoringContext): ScoreSignal[] {
  const legs = [assembly.outbound, assembly.inbound].filter(
    (option): option is TransportOption => option !== undefined,
  );

  const modeComfort =
    legs.length === 0 ? undefined : Math.min(...legs.map((leg) => MODE_COMFORT[leg.mode]));

  const directLeg = legs.find(
    (leg) => leg.transferCount === 0 && (leg.mode === 'flight' || leg.mode === 'train'),
  );

  const signals: ScoreSignal[] = [
    {
      key: 'modeComfort',
      value: modeComfort,
      weight: 2,
      reasons:
        directLeg === undefined
          ? []
          : [
              reason(
                'directFlightOrTrain',
                'positive',
                `${MODE_LABELS[directLeg.mode]} без пересадок`,
              ),
            ],
    },
    nightSignal(legs, context, 'comfort'),
    hotelRatingSignal(assembly),
    hotelRedFlagsSignal(assembly),
  ];

  return signals;
}

function hotelRatingSignal(assembly: RouteAssembly): ScoreSignal {
  const hotel = assembly.hotel;

  // Отеля в маршруте нет — размерность про него ничего не утверждает и не должна
  // ни повышать, ни понижать оценку. Нулевой вес исключает сигнал из confidence.
  if (hotel === undefined) {
    return { key: 'hotelRating', value: undefined, weight: 0, reasons: [] };
  }

  if (hotel.rating === undefined) {
    return {
      key: 'hotelRating',
      value: undefined,
      weight: 2,
      reasons: [reason('hotelRatingUnknown', 'neutral', 'Рейтинг отеля не указан')],
    };
  }

  return {
    key: 'hotelRating',
    value: hotel.rating / 10,
    weight: 2,
    reasons:
      hotel.rating >= 8
        ? [reason('highHotelRating', 'positive', `Высокий рейтинг отеля: ${hotel.rating}/10`)]
        : [],
  };
}

/**
 * Red flags показываются только если их вернул анализ отзывов (§6.5).
 * Отсутствие анализа — это не «нет проблем», поэтому сигнал становится неизвестным.
 */
function hotelRedFlagsSignal(assembly: RouteAssembly): ScoreSignal {
  const hotel = assembly.hotel;
  if (hotel === undefined) {
    return { key: 'hotelRedFlags', value: undefined, weight: 0, reasons: [] };
  }

  if (hotel.reviewSummary === undefined) {
    return { key: 'hotelRedFlags', value: undefined, weight: 1, reasons: [] };
  }

  const flags = hotel.reviewRedFlags;
  return {
    key: 'hotelRedFlags',
    value: flags.length === 0 ? 1 : Math.max(0.15, 1 - flags.length * 0.35),
    weight: 1,
    reasons:
      flags.length > 0
        ? [
            reason(
              'hotelReviewRedFlags',
              'warning',
              `В отзывах повторяются жалобы: ${flags.join('; ')}`,
            ),
          ]
        : [],
  };
}
