import type { CandidatePool, TransportOption } from '../contracts/candidate';
import type { FallbackPlan } from '../contracts/fallback';
import type { PlanConfiguration } from '../contracts/plan';
import type { TravelRequest } from '../contracts/travel-request';
import { FALLBACK_CAVEAT } from '../contracts/fallback';
import { isTransportOption } from '../contracts/candidate';
import { minutesBetween } from '../time/wall-clock';
import type { GroupedInventory } from '../scoring/assemble';
import {
  FALLBACK_RESILIENCE_THRESHOLD,
  FALLBACK_TIME_WINDOW_MINUTES,
} from '../scoring/risk-policy';
import { analyzeTransfers } from '../scoring/transfers';
import { rankVulnerableStages } from './vulnerability';

export interface BuildFallbackInput {
  readonly configuration: PlanConfiguration;
  readonly pool: CandidatePool;
  readonly request: TravelRequest;
  readonly grouped: GroupedInventory;
  readonly alternativesByOptionId: ReadonlyMap<string, number>;
  readonly now: string;
  readonly maxStages: number;
  readonly maxOptionsPerStage: number;
}

/**
 * Ограниченное планирование «Плана Б» (§10.1).
 *
 * Границы здесь — не оптимизация, а условие корректности: без них перебор ветвей растёт
 * комбинаторно, а бюджет вызовов инвентаря конечен. Поэтому максимум два этапа,
 * максимум две альтернативы на этап и ни одного дополнительного обращения к LLM.
 */
export function buildFallbackPlans(input: BuildFallbackInput): FallbackPlan[] {
  const ranked = rankVulnerableStages(
    input.configuration,
    input.pool,
    input.request,
    input.alternativesByOptionId,
  );

  const targets = ranked
    .filter((candidate) => candidate.score >= 1 - FALLBACK_RESILIENCE_THRESHOLD)
    .slice(0, input.maxStages);

  // Уязвимых этапов не нашлось — это хорошая новость, но её тоже нужно показать честно,
  // а не выдавать пустой блок «План Б».
  if (targets.length === 0) {
    const firstTransport = ranked[0];
    if (firstTransport === undefined) return [];

    return [
      {
        id: `fb_${input.configuration.id}_${firstTransport.stageId}`,
        targetStageId: firstTransport.stageId,
        configurationId: input.configuration.id,
        trigger: 'segmentUnavailable',
        optionIds: [],
        generatedAt: input.now,
        validAt: input.now,
        caveat: FALLBACK_CAVEAT,
        status: 'notAvailable',
        unavailableReason: 'noAlternativesInPool',
      },
    ];
  }

  return targets.map((target) => {
    const stage = input.configuration.stages.find((item) => item.id === target.stageId);
    const selected = input.pool[target.optionId];

    if (stage === undefined || selected === undefined || !isTransportOption(selected)) {
      return notAvailable(input, target.stageId, 'insufficientData');
    }

    const alternatives = pickAlternatives(
      selected,
      stage.alternativeOptionIds,
      input.pool,
      input.request,
      input.maxOptionsPerStage,
    );

    if (alternatives.length === 0) {
      return notAvailable(input, target.stageId, 'noAlternativesInPool');
    }

    return {
      id: `fb_${input.configuration.id}_${target.stageId}`,
      targetStageId: target.stageId,
      configurationId: input.configuration.id,
      trigger: 'segmentUnavailable',
      optionIds: alternatives.map((option) => option.id),
      generatedAt: input.now,
      validAt: input.now,
      caveat: FALLBACK_CAVEAT,
      status: 'available',
    };
  });
}

function notAvailable(
  input: BuildFallbackInput,
  stageId: string,
  reason: NonNullable<FallbackPlan['unavailableReason']>,
): FallbackPlan {
  return {
    id: `fb_${input.configuration.id}_${stageId}`,
    targetStageId: stageId,
    configurationId: input.configuration.id,
    trigger: 'segmentUnavailable',
    optionIds: [],
    generatedAt: input.now,
    validAt: input.now,
    caveat: FALLBACK_CAVEAT,
    status: 'notAvailable',
    unavailableReason: reason,
  };
}

/**
 * Выбирает замены из уже полученного pool: «План Б» ссылается только на реальные
 * option ID, существующие в candidate pool (инвариант eval, §22.3).
 *
 * Приоритет отдаётся вариантам без тесных пересадок и близким по времени: замена,
 * уезжающая через сутки, формально существует, но задачу пользователя не решает.
 */
function pickAlternatives(
  selected: TransportOption,
  alternativeIds: readonly string[],
  pool: CandidatePool,
  request: TravelRequest,
  limit: number,
): TransportOption[] {
  const candidates: Array<{ option: TransportOption; rank: number }> = [];

  for (const id of alternativeIds) {
    const option = pool[id];
    if (option === undefined || !isTransportOption(option)) continue;
    if (option.direction !== selected.direction) continue;

    const delta = minutesBetween(selected.departure.at, option.departure.at);
    if (delta === undefined || Math.abs(delta) > FALLBACK_TIME_WINDOW_MINUTES) continue;

    const analysis = analyzeTransfers(option, request.hardConstraints.minimumTransferPolicy);
    const tightPenalty = analysis.hasTightTransfer ? 1 : 0;
    const proximity = Math.abs(delta) / FALLBACK_TIME_WINDOW_MINUTES;

    candidates.push({ option, rank: tightPenalty * 2 + proximity });
  }

  return candidates
    .sort((left, right) => {
      if (Math.abs(left.rank - right.rank) > 1e-9) return left.rank - right.rank;
      return left.option.id.localeCompare(right.option.id);
    })
    .slice(0, limit)
    .map((candidate) => candidate.option);
}
