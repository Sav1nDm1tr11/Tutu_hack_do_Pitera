import type {
  CandidatePool,
  ItineraryStage,
  RouteAssembly,
  RoutePlan,
  SelectionPatch,
} from '@tutu-plan-b/domain';
import {
  buildFallbackPlans,
  isHotelOption,
  isTransportOption,
  recomputeConfiguration,
} from '@tutu-plan-b/domain';
import type { PlanRepository } from '../repositories/plan-repository';
import type { AgentBudgets } from './budgets';

export type SelectionOutcome =
  | { readonly ok: true; readonly plan: RoutePlan; readonly changedStageId: string }
  | {
      readonly ok: false;
      readonly code: 'PLAN_NOT_FOUND' | 'REVISION_CONFLICT' | 'VALIDATION_FAILED';
      readonly message: string;
    };

export interface SelectionServiceDeps {
  readonly repository: PlanRepository;
  readonly budgets: AgentBudgets;
  readonly now: () => string;
}

/**
 * Замена варианта на этапе (§13.3).
 *
 * Пересчёт идёт по сохранённому снимку инвентаря, без повторного обращения к MCP:
 * пользователь меняет выбор внутри уже показанного ему набора данных, поэтому цены и
 * расписания не должны «поехать» под руками. Обратная сторона — снимок стареет, и за
 * это отвечает TTL плана вместе с индикатором свежести.
 */
export class SelectionService {
  constructor(private readonly deps: SelectionServiceDeps) {}

  apply(planId: string, patch: SelectionPatch): SelectionOutcome {
    const stored = this.deps.repository.get(planId);
    if (stored === undefined) {
      return {
        ok: false,
        code: 'PLAN_NOT_FOUND',
        message: 'План устарел или не найден. Запустите поиск заново.',
      };
    }

    const { plan, grouped, context } = stored;

    // Optimistic concurrency: иначе две быстрые правки молча затирали бы друг друга.
    if (patch.expectedRevision !== plan.revision) {
      return {
        ok: false,
        code: 'REVISION_CONFLICT',
        message: 'План изменился в другой вкладке. Обновите его и повторите выбор.',
      };
    }

    const configuration = plan.configurations.find((item) => item.id === patch.configurationId);
    if (configuration === undefined) {
      return { ok: false, code: 'VALIDATION_FAILED', message: 'Конфигурация не найдена в плане.' };
    }

    const stage = configuration.stages.find((item) => item.id === patch.stageId);
    if (stage === undefined) {
      return { ok: false, code: 'VALIDATION_FAILED', message: 'Этап не найден в конфигурации.' };
    }

    // Выбор ограничен альтернативами, которые сервер сам предложил для этого этапа:
    // произвольный option ID из другой части плана дал бы несогласованный маршрут.
    const allowed = stage.selectedOptionId === patch.selectedOptionId
      ? true
      : stage.alternativeOptionIds.includes(patch.selectedOptionId);
    if (!allowed) {
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        message: 'Этот вариант не предлагался как альтернатива для данного этапа.',
      };
    }

    const assembly = buildAssemblyFrom(configuration.stages, plan.candidatePool, {
      stageId: patch.stageId,
      optionId: patch.selectedOptionId,
    });
    if (assembly === undefined) {
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        message: 'Не удалось собрать маршрут с выбранным вариантом.',
      };
    }

    const now = this.deps.now();
    const recomputed = recomputeConfiguration({
      configuration,
      assembly,
      request: plan.request,
      grouped,
      context,
      now,
    });

    const candidatePool: CandidatePool = { ...plan.candidatePool };
    for (const option of recomputed.calculatedOptions) {
      candidatePool[option.id] = option;
    }

    const configurations = plan.configurations.map((item) =>
      item.id === recomputed.configuration.id ? recomputed.configuration : item,
    );

    // План Б пересобирается для изменённой конфигурации: замены, рассчитанные для
    // прежнего рейса, к новому этапу отношения не имеют.
    const fallbackPlans = [
      ...plan.fallbackPlans.filter((item) => item.configurationId !== configuration.id),
      ...buildFallbackPlans({
        configuration: recomputed.configuration,
        pool: candidatePool,
        request: plan.request,
        grouped,
        alternativesByOptionId: context.alternativesByOptionId,
        now,
        maxStages: this.deps.budgets.maxFallbackStages,
        maxOptionsPerStage: this.deps.budgets.maxFallbackOptionsPerStage,
      }),
    ];

    const updated: RoutePlan = {
      ...plan,
      revision: plan.revision + 1,
      configurations,
      candidatePool,
      fallbackPlans,
      validAt: now,
    };

    this.deps.repository.replace(updated);
    return { ok: true, plan: updated, changedStageId: patch.stageId };
  }
}

/**
 * Собирает `RouteAssembly` из этапов конфигурации, подменив выбор на одном из них.
 * Возвращает `undefined`, если обязательный этап «туда» не восстанавливается — это
 * означает рассинхронизацию плана и pool, и молча продолжать здесь нельзя.
 */
function buildAssemblyFrom(
  stages: readonly ItineraryStage[],
  pool: CandidatePool,
  override: { stageId: string; optionId: string },
): RouteAssembly | undefined {
  let outbound: RouteAssembly['outbound'] | undefined;
  let inbound: RouteAssembly['inbound'];
  let hotel: RouteAssembly['hotel'];

  for (const stage of stages) {
    const optionId = stage.id === override.stageId ? override.optionId : stage.selectedOptionId;
    const option = pool[optionId];
    if (option === undefined) continue;

    if (isTransportOption(option)) {
      if (option.direction === 'outbound') outbound = option;
      else inbound = option;
      continue;
    }

    if (isHotelOption(option)) hotel = option;
  }

  if (outbound === undefined) return undefined;
  return { outbound, inbound, hotel };
}
