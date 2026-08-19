import type {
  CapabilitySnapshot,
  ExplanationBlock,
  PlanConfiguration,
  Preset,
  ScoreBreakdown,
  TransportMode,
  TravelRequest,
} from '@tutu-plan-b/domain';

/**
 * Что именно спрашивать у инвентаря. LLM может влиять только на это —
 * на выбор категорий и окон поиска, но не на итоговый score и не на жёсткие
 * ограничения (§7.1, §11.2).
 */
export interface SearchPlan {
  readonly transportModes: readonly TransportMode[];
  readonly includeHotels: boolean;
  /** Короткие пояснения к решению планировщика. Идут в логи, не в интерфейс. */
  readonly notes: readonly string[];
}

export interface ExplainInput {
  readonly request: TravelRequest;
  readonly preset: Preset;
  readonly configuration: PlanConfiguration;
  readonly score: ScoreBreakdown;
}

export interface LlmPlanner {
  readonly mode: 'llm' | 'deterministic';

  buildSearchPlan(input: {
    readonly request: TravelRequest;
    readonly capabilities: CapabilitySnapshot;
  }): Promise<SearchPlan>;

  /**
   * Переписывает уже посчитанные причины человеческим языком.
   * Новых утверждений добавлять нельзя: каждый пункт обязан ссылаться на `reasonCode`,
   * существующий в `ScoreBreakdown` (§11.4).
   */
  explainConfiguration(input: ExplainInput): Promise<ExplanationBlock>;
}

/**
 * Категории для поиска по возможностям инвентаря и ограничениям пользователя.
 *
 * Общая для обеих реализаций: и детерминированной, и LLM. Модель не должна
 * «придумывать» доступность категории, которой нет в snapshot.
 */
export function deriveSearchableModes(
  request: TravelRequest,
  capabilities: CapabilitySnapshot,
): TransportMode[] {
  const allModes: readonly TransportMode[] = ['flight', 'train', 'bus', 'suburbanTrain'];
  const allowed = request.hardConstraints.allowedModes;

  return allModes.filter((mode) => {
    if (allowed !== undefined && !allowed.includes(mode)) return false;
    return capabilities.capabilities[mode]?.status !== 'unavailable';
  });
}

export function hotelsSearchable(
  request: TravelRequest,
  capabilities: CapabilitySnapshot,
): boolean {
  if (request.tripType !== 'roundTrip' || request.returnDate === undefined) return false;
  return capabilities.capabilities.hotel?.status !== 'unavailable';
}
