import type { DimensionKey, ScoreBreakdown } from '../contracts/score';
import type { PlanTotals } from '../contracts/plan';
import type { TravelRequest } from '../contracts/travel-request';
import { aggregateDimensions, scoreDimension } from './dimension';
import {
  checkBudget,
  checkTransportHardConstraints,
  mergeVerdicts,
  type HardFilterVerdict,
} from './hard-filters';
import { comfortSignals, durationSignals, priceSignals, resilienceSignals } from './signals';
import type { ScoringContext } from './signals';
import { computeTotals } from './totals';
import type { RouteAssembly } from './assemble';

export interface ScoredAssembly {
  readonly assembly: RouteAssembly;
  readonly totals: PlanTotals;
  readonly score: ScoreBreakdown;
  readonly verdict: HardFilterVerdict;
}

/**
 * Считает конфигурацию по весам одного preset.
 *
 * Порядок важен: сначала жёсткие ограничения (они бинарны и не участвуют в рейтинге),
 * затем сигналы по размерностям, затем агрегат. LLM в этом пути не участвует —
 * итоговый score принадлежит коду (§7.1).
 */
export function scoreAssembly(
  assembly: RouteAssembly,
  context: ScoringContext,
  weights: Record<DimensionKey, number>,
): ScoredAssembly {
  const request = context.request;
  const totals = computeTotals(assembly, request);

  const transportVerdicts = [assembly.outbound, assembly.inbound]
    .filter((option): option is NonNullable<typeof option> => option !== undefined)
    .map((option) => checkTransportHardConstraints(option, request));

  const verdict = mergeVerdicts(
    ...transportVerdicts,
    checkBudget(totals.price?.amount, request),
  );

  const dimensions = [
    scoreDimension('price', priceSignals(totals, context), weights.price),
    scoreDimension('duration', durationSignals(totals, context), weights.duration),
    scoreDimension('resilience', resilienceSignals(assembly, context), weights.resilience),
    scoreDimension('comfort', comfortSignals(assembly, context), weights.comfort),
  ];

  const { total, confidence } = aggregateDimensions(dimensions);

  return {
    assembly,
    totals,
    verdict,
    score: {
      total,
      confidence,
      hardConstraintPassed: verdict.status !== 'rejected',
      needsVerification: verdict.status === 'needsVerification',
      dimensions,
    },
  };
}

/**
 * Порядок выбора лучшего варианта.
 *
 * Подтверждённый вариант идёт впереди непроверенного даже при более низком score:
 * §9.1 запрещает выдавать вариант с недостающими данными как полностью подходящий.
 * Дальше — сам score, затем confidence, и только потом стабильный tie-break по id,
 * чтобы результат не «плавал» между прогонами.
 */
export function compareScored(left: ScoredAssembly, right: ScoredAssembly): number {
  if (left.score.needsVerification !== right.score.needsVerification) {
    return left.score.needsVerification ? 1 : -1;
  }
  if (Math.abs(right.score.total - left.score.total) > 1e-9) {
    return right.score.total - left.score.total;
  }
  if (Math.abs(right.score.confidence - left.score.confidence) > 1e-9) {
    return right.score.confidence - left.score.confidence;
  }
  return assemblyKey(left.assembly).localeCompare(assemblyKey(right.assembly));
}

export function assemblyKey(assembly: RouteAssembly): string {
  return [assembly.outbound.id, assembly.inbound?.id ?? '-', assembly.hotel?.id ?? '-'].join('|');
}

export function selectedOptionIds(assembly: RouteAssembly): string[] {
  const ids = [assembly.outbound.id];
  if (assembly.hotel !== undefined) ids.push(assembly.hotel.id);
  if (assembly.inbound !== undefined) ids.push(assembly.inbound.id);
  return ids;
}

export function hasBlockingBudgetViolation(
  scored: ScoredAssembly,
  request: TravelRequest,
): boolean {
  return (
    request.hardConstraints.budgetIsHard &&
    scored.verdict.violations.some((violation) => violation.code === 'budgetExceeded')
  );
}
