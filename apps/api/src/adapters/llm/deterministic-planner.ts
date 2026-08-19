import type { ExplanationBlock } from '@tutu-plan-b/domain';
import { buildTemplateExplanation } from '@tutu-plan-b/domain';
import {
  deriveSearchableModes,
  hotelsSearchable,
  type ExplainInput,
  type LlmPlanner,
  type SearchPlan,
} from './planner';

/**
 * Детерминированный планировщик.
 *
 * Это не заглушка на время отсутствия ключа, а полноценная реализация того же
 * интерфейса: §17 требует, чтобы приложение оставалось полезным без LLM, а демо
 * проходило целиком в детерминированном режиме. Отсюда следует и полезное свойство —
 * весь happy path покрывается тестами без обращения к внешней модели.
 */
export class DeterministicPlanner implements LlmPlanner {
  readonly mode = 'deterministic' as const;

  async buildSearchPlan(input: Parameters<LlmPlanner['buildSearchPlan']>[0]): Promise<SearchPlan> {
    const transportModes = deriveSearchableModes(input.request, input.capabilities);
    const includeHotels = hotelsSearchable(input.request, input.capabilities);

    const notes: string[] = [
      `Категории транспорта: ${transportModes.join(', ') || 'нет доступных'}`,
      includeHotels ? 'Проживание включено в поиск' : 'Проживание не запрашивается',
    ];

    return { transportModes, includeHotels, notes };
  }

  async explainConfiguration(input: ExplainInput): Promise<ExplanationBlock> {
    // Причины и оговорки берутся из уже посчитанного ScoreBreakdown, поэтому текст
    // не может утверждать больше, чем известно расчёту.
    return buildTemplateExplanation(input.preset, {
      score: input.score,
      totals: input.configuration.totals,
    });
  }
}
