import type { CalculatedOption, CandidatePool } from '../contracts/candidate';
import type { PlanConfiguration, PlanWarning } from '../contracts/plan';
import type { Preset, TravelRequest } from '../contracts/travel-request';
import { isTransportOption } from '../contracts/candidate';
import {
  buildAssemblies,
  countAlternatives,
  groupInventory,
  rangeOf,
  type GroupedInventory,
  type RouteAssembly,
} from './assemble';
import { buildTemplateExplanation } from './explanation';
import { MAX_CONFIGURATIONS, PRESET_LABELS, PRESET_WEIGHTS } from './risk-policy';
import { deriveTransportRiskSignals } from './risk-signals';
import { assemblyKey, compareScored, scoreAssembly, selectedOptionIds, type ScoredAssembly } from './score';
import type { ScoringContext } from './signals';
import { buildStages } from './stages';
import { computeTotals } from './totals';

export interface BuildConfigurationsInput {
  readonly pool: CandidatePool;
  readonly request: TravelRequest;
  /** «Сейчас» приходит параметром: домен не читает системные часы. */
  readonly now: string;
}

export interface BuildConfigurationsResult {
  readonly configurations: PlanConfiguration[];
  /** Pool, дополненный вычисленными вариантами и риск-сигналами. */
  readonly pool: CandidatePool;
  readonly warnings: PlanWarning[];
  readonly grouped: GroupedInventory;
  readonly scoredByConfigurationId: ReadonlyMap<string, ScoredAssembly>;
  /**
   * Контекст нормализации оценок. Отдаётся наружу, чтобы пересчёт после замены варианта
   * (§13.3) шёл по тем же диапазонам цен и длительностей. Иначе смена одного этапа
   * сдвигала бы нормализацию и незаметно переоценивала все остальные варианты.
   */
  readonly context: ScoringContext;
}

const PRESET_ORDER: readonly Preset[] = ['reliable', 'balanced', 'budget'];

/**
 * Создаёт до трёх конфигураций по алгоритму §9.5.
 *
 * Главное, чего здесь нет: искусственного добивания результата до трёх вариантов.
 * Если инвентаря хватает на один честный маршрут, вернётся один и предупреждение —
 * три почти одинаковых карточки выглядели бы как выбор, которого нет.
 */
export function buildConfigurations(
  input: BuildConfigurationsInput,
): BuildConfigurationsResult {
  const { request, now } = input;
  const grouped = groupInventory(input.pool, request);
  const assemblies = buildAssemblies(grouped, request);

  const alternativesByOptionId = new Map<string, number>();
  for (const entry of [...grouped.outbound, ...grouped.inbound]) {
    alternativesByOptionId.set(entry.option.id, countAlternatives(entry.option, grouped));
  }

  const enrichedPool = enrichRiskSignals(input.pool, request, alternativesByOptionId);
  const warnings: PlanWarning[] = [];

  const emptyContext: ScoringContext = {
    request,
    priceRange: undefined,
    durationRange: undefined,
    alternativesByOptionId,
  };

  if (assemblies.length === 0) {
    warnings.push({
      code: 'partialInventory',
      severity: 'critical',
      message:
        grouped.rejected.length > 0
          ? 'Все найденные варианты нарушают заданные ограничения. Попробуйте ослабить одно из них.'
          : 'Подходящих вариантов транспорта не найдено.',
    });
    return {
      configurations: [],
      pool: enrichedPool,
      warnings,
      grouped,
      scoredByConfigurationId: new Map(),
      context: emptyContext,
    };
  }

  const totalsByKey = new Map(
    assemblies.map((assembly) => [assemblyKey(assembly), computeTotals(assembly, request)]),
  );

  const context: ScoringContext = {
    request,
    priceRange: rangeOf([...totalsByKey.values()].map((totals) => totals.price?.amount)),
    durationRange: rangeOf([...totalsByKey.values()].map((totals) => totals.travelMinutes)),
    alternativesByOptionId,
  };

  const bestByPreset = new Map<Preset, ScoredAssembly>();
  for (const preset of PRESET_ORDER) {
    const scored = assemblies
      .map((assembly) => scoreAssembly(assembly, context, PRESET_WEIGHTS[preset]))
      .filter((candidate) => candidate.score.hardConstraintPassed)
      .sort(compareScored);

    const best = scored[0];
    if (best !== undefined) bestByPreset.set(preset, best);
  }

  const deduped = dedupeBySelection(bestByPreset);
  const configurations: PlanConfiguration[] = [];
  const calculatedOptions: CalculatedOption[] = [];
  const scoredByConfigurationId = new Map<string, ScoredAssembly>();

  for (const group of deduped) {
    const configurationId = `cfg_${group.preset}`;
    const built = buildStages(group.scored.assembly, request, grouped, configurationId, now);
    calculatedOptions.push(...built.calculatedOptions);

    configurations.push({
      id: configurationId,
      preset: group.preset,
      labels: group.labels,
      stages: built.stages,
      totals: group.scored.totals,
      score: group.scored.score,
      explanation: buildTemplateExplanation(group.preset, group.scored),
    });
    scoredByConfigurationId.set(configurationId, group.scored);
  }

  if (configurations.length < MAX_CONFIGURATIONS) {
    warnings.push({
      code: 'fewerConfigurationsThanRequested',
      severity: 'info',
      message:
        configurations.length === 1
          ? 'Инвентаря хватило на один честный вариант. Мы не показываем копии одного маршрута под разными названиями.'
          : `Найдено ${configurations.length} действительно разных варианта из трёх возможных.`,
    });
  }

  if (grouped.hotels.length === 0 && request.tripType === 'roundTrip') {
    warnings.push({
      code: 'hotelsUnavailable',
      severity: 'warning',
      message: 'Варианты проживания получить не удалось. Транспортная часть маршрута готова.',
    });
  }

  const poolWithCalculated: CandidatePool = { ...enrichedPool };
  for (const option of calculatedOptions) {
    poolWithCalculated[option.id] = option;
  }

  return {
    configurations,
    pool: poolWithCalculated,
    warnings,
    grouped,
    scoredByConfigurationId,
    context,
  };
}

interface DedupedGroup {
  readonly preset: Preset;
  readonly labels: Preset[];
  readonly scored: ScoredAssembly;
}

/**
 * §9.5.5: если две конфигурации совпадают по всем выбранным option ID, остаётся одна,
 * а labels объединяются. Пользователь должен видеть «Надёжный и сбалансированный —
 * это один и тот же маршрут», а не два одинаковых блока.
 */
function dedupeBySelection(bestByPreset: ReadonlyMap<Preset, ScoredAssembly>): DedupedGroup[] {
  const groups = new Map<string, DedupedGroup>();

  for (const preset of PRESET_ORDER) {
    const scored = bestByPreset.get(preset);
    if (scored === undefined) continue;

    const key = selectedOptionIds(scored.assembly).join('|');
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, { preset, labels: [preset], scored });
    } else {
      existing.labels.push(preset);
    }
  }

  return [...groups.values()];
}

/**
 * Риск-сигналы зависят от запроса, поэтому проставляются здесь, а не при нормализации:
 * нормализатор не должен знать про политику буферов и ночные часы пользователя.
 */
function enrichRiskSignals(
  pool: CandidatePool,
  request: TravelRequest,
  alternativesByOptionId: ReadonlyMap<string, number>,
): CandidatePool {
  const enriched: CandidatePool = {};

  for (const [id, option] of Object.entries(pool)) {
    if (!isTransportOption(option)) {
      enriched[id] = option;
      continue;
    }

    enriched[id] = {
      ...option,
      riskSignals: deriveTransportRiskSignals(
        option,
        request,
        alternativesByOptionId.get(option.id) ?? 0,
      ),
    };
  }

  return enriched;
}

export { PRESET_LABELS };

/** Пересборка одной конфигурации после замены варианта на этапе (§13.3). */
export interface RecomputeInput {
  readonly configuration: PlanConfiguration;
  readonly assembly: RouteAssembly;
  readonly request: TravelRequest;
  readonly grouped: GroupedInventory;
  readonly context: ScoringContext;
  readonly now: string;
}

export function recomputeConfiguration(input: RecomputeInput): {
  configuration: PlanConfiguration;
  scored: ScoredAssembly;
  calculatedOptions: CalculatedOption[];
} {
  const scored = scoreAssembly(input.assembly, input.context, PRESET_WEIGHTS[input.configuration.preset]);
  const built = buildStages(
    input.assembly,
    input.request,
    input.grouped,
    input.configuration.id,
    input.now,
  );

  return {
    configuration: {
      ...input.configuration,
      stages: built.stages,
      totals: scored.totals,
      score: scored.score,
      explanation: buildTemplateExplanation(input.configuration.preset, scored),
    },
    scored,
    calculatedOptions: built.calculatedOptions,
  };
}
