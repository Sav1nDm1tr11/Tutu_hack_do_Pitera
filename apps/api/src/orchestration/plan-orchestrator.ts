import type {
  CandidatePool,
  CapabilityKey,
  CapabilitySnapshot,
  FallbackPlan,
  GroupedInventory,
  PlanConfiguration,
  PlanStreamEvent,
  PlanWarning,
  RawHotelOffer,
  RawTransportOffer,
  RoutePlan,
  TransportMode,
  TravelInventoryGateway,
  TravelRequest,
} from '@tutu-plan-b/domain';
import {
  buildConfigurations,
  buildFallbackPlans,
  countAlternatives,
  normalizeInventoryBatch,
} from '@tutu-plan-b/domain';
import type { LlmPlanner } from '../adapters/llm/planner';
import type { PlanRepository } from '../repositories/plan-repository';
import { BudgetExceededError, BudgetTracker, withTimeout, type AgentBudgets } from './budgets';

export interface OrchestratorDeps {
  readonly gateway: TravelInventoryGateway;
  readonly planner: LlmPlanner;
  readonly repository: PlanRepository;
  readonly budgets: AgentBudgets;
  /** Часы и генератор ID инжектируются, чтобы поток событий был воспроизводим в тестах. */
  readonly now: () => string;
  readonly nowMs: () => number;
  readonly newId: (prefix: string) => string;
  readonly log: (event: Record<string, unknown>) => void;
}

/**
 * Оркестратор построения плана.
 *
 * Фазы фиксированы (§11.5): планирование → поиск → нормализация → scoring → fallback →
 * объяснение. Между фазами проверяется дедлайн, поэтому медленный инвентарь приводит к
 * частичному результату, а не к неограниченному ожиданию.
 *
 * Возвращает поток событий, а не единый ответ: 10–20 секунд тишины пользователь читает
 * как зависание (§13.1).
 */
export class PlanOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async *createPlanStream(request: TravelRequest): AsyncGenerator<PlanStreamEvent> {
    const planId = this.deps.newId('plan');
    const tracker = new BudgetTracker(this.deps.budgets, this.deps.nowMs);
    const startedMs = this.deps.nowMs();

    yield { type: 'plan.started', requestId: request.requestId, planId };

    try {
      yield { type: 'plan.progress', phase: 'planning', message: 'Разбираем условия поездки' };
      tracker.consumeStep();

      const capabilities = await withTimeout(
        this.deps.gateway.describeCapabilities(),
        tracker.callTimeoutMs(),
        'describeCapabilities',
      );

      const searchPlan = await this.deps.planner.buildSearchPlan({ request, capabilities });
      this.deps.log({
        event: 'searchPlan',
        planId,
        plannerMode: this.deps.planner.mode,
        notes: searchPlan.notes,
      });

      yield { type: 'plan.progress', phase: 'searchingTransport', message: 'Ищем варианты дороги' };
      tracker.consumeStep();

      const transport = await this.searchTransport(request, searchPlan.transportModes, tracker);

      let hotelOffers: readonly RawHotelOffer[] = [];
      let hotelsFailed = false;

      if (searchPlan.includeHotels) {
        yield { type: 'plan.progress', phase: 'searchingHotels', message: 'Подбираем проживание' };
        tracker.consumeStep();

        const hotels = await this.searchHotels(request, tracker);
        hotelOffers = hotels.offers;
        hotelsFailed = hotels.failed;
      }

      yield {
        type: 'plan.progress',
        phase: 'normalizing',
        message: 'Приводим данные к единому виду',
      };

      const normalized = normalizeInventoryBatch(
        { transport: transport.offers, hotels: hotelOffers },
        {
          fetchedAt: this.deps.now(),
          live: this.deps.gateway.source === 'live',
          toolCallId: transport.toolCallIds[0],
        },
      );

      yield { type: 'plan.progress', phase: 'scoring', message: 'Сравниваем варианты' };
      tracker.consumeStep();

      const built = buildConfigurations({
        pool: normalized.pool,
        request,
        now: this.deps.now(),
      });

      const degraded = transport.failed || hotelsFailed;
      if (degraded) {
        // Частичность объявляется до готового плана: пользователь узнаёт про отвалившиеся
        // категории раньше, чем начнёт сравнивать карточки.
        yield {
          type: 'plan.partial',
          availableCapabilities: availableCapabilities(capabilities),
          configurationCount: built.configurations.length,
        };
      }

      const warnings = this.collectWarnings({
        base: built.warnings,
        quarantinedCount: normalized.quarantined.length,
        transportFailed: transport.failed,
      });

      yield {
        type: 'plan.progress',
        phase: 'buildingFallback',
        message: 'Готовим план Б для уязвимых этапов',
      };
      tracker.consumeStep();

      const fallbackPlans = this.buildFallbacks(built.configurations, built.pool, built.grouped, request);
      if (fallbackPlans.length > 0 && fallbackPlans.every((plan) => plan.status !== 'available')) {
        warnings.push({
          code: 'noFallbackAvailable',
          severity: 'info',
          message: 'Готовых замен в найденном инвентаре не нашлось — мы честно об этом сообщаем.',
        });
      }

      yield { type: 'plan.progress', phase: 'explaining', message: 'Формулируем объяснения' };
      const configurations = await this.explainConfigurations(
        request,
        built.configurations,
        tracker,
        warnings,
      );

      const generatedAt = this.deps.now();
      const plan: RoutePlan = {
        id: planId,
        revision: 0,
        request,
        status: configurations.length === 0 ? 'failed' : degraded ? 'partial' : 'ready',
        configurations,
        candidatePool: built.pool,
        fallbackPlans,
        generatedAt,
        validAt: generatedAt,
        capabilities,
        warnings,
      };

      this.deps.repository.save(plan, built.grouped, built.context);
      this.deps.log({
        event: 'planReady',
        planId,
        status: plan.status,
        durationMs: this.deps.nowMs() - startedMs,
        configurations: configurations.length,
        quarantined: normalized.quarantined.length,
        usage: tracker.usage,
      });

      // Даже при нуле конфигураций отдаётся plan.ready со статусом `failed`:
      // экран с причинами и предупреждениями полезнее, чем сообщение об ошибке,
      // а plan.error остаётся зарезервирован под инфраструктурные сбои.
      yield { type: 'plan.ready', plan };
    } catch (error) {
      const timedOut = error instanceof BudgetExceededError && error.kind === 'deadline';
      this.deps.log({
        event: 'planFailed',
        planId,
        reason: error instanceof BudgetExceededError ? error.kind : 'internal',
        message: error instanceof Error ? error.message : String(error),
      });

      yield {
        type: 'plan.error',
        code: timedOut ? 'PLAN_TIMEOUT' : 'INTERNAL_ERROR',
        message: timedOut
          ? 'Не успели собрать план за отведённое время. Попробуйте сузить условия поиска.'
          : 'Не удалось собрать план. Попробуйте повторить поиск.',
        retryable: true,
      };
    }
  }

  /**
   * Поиск транспорта по направлениям.
   *
   * `allSettled`, а не `all`: отказ обратного направления не должен обнулять уже
   * найденную дорогу «туда» (§7.2).
   */
  private async searchTransport(
    request: TravelRequest,
    modes: readonly TransportMode[],
    tracker: BudgetTracker,
  ): Promise<{ offers: RawTransportOffer[]; toolCallIds: string[]; failed: boolean }> {
    if (modes.length === 0) return { offers: [], toolCallIds: [], failed: true };

    const directions: readonly ('outbound' | 'inbound')[] =
      request.tripType === 'roundTrip' && request.returnDate !== undefined
        ? ['outbound', 'inbound']
        : ['outbound'];

    if (!tracker.tryConsumeToolCalls(directions.length)) {
      return { offers: [], toolCallIds: [], failed: true };
    }

    const timeoutMs = tracker.callTimeoutMs();
    const settled = await Promise.allSettled(
      directions.map((direction) =>
        withTimeout(
          this.deps.gateway.searchTransport({ request, direction, modes }),
          timeoutMs,
          `searchTransport:${direction}`,
        ),
      ),
    );

    const offers: RawTransportOffer[] = [];
    const toolCallIds: string[] = [];
    let failed = false;

    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') {
        failed = true;
        this.deps.log({
          event: 'transportSearchFailed',
          direction: directions[index],
          message: String(result.reason),
        });
        continue;
      }

      offers.push(...result.value.offers);
      toolCallIds.push(...result.value.toolCallIds);
      if (result.value.status !== 'ok') failed = true;
    }

    return { offers, toolCallIds, failed };
  }

  private async searchHotels(
    request: TravelRequest,
    tracker: BudgetTracker,
  ): Promise<{ offers: readonly RawHotelOffer[]; failed: boolean }> {
    if (request.returnDate === undefined) return { offers: [], failed: false };
    if (!tracker.tryConsumeToolCalls(1)) return { offers: [], failed: true };

    try {
      const response = await withTimeout(
        this.deps.gateway.searchHotels({
          request,
          checkIn: request.departDate,
          checkOut: request.returnDate,
        }),
        tracker.callTimeoutMs(),
        'searchHotels',
      );

      return { offers: response.offers, failed: response.status !== 'ok' };
    } catch (error) {
      // Проживание — не критичная категория: транспортная часть маршрута остаётся
      // полезной сама по себе (§5.2).
      this.deps.log({ event: 'hotelSearchFailed', message: String(error) });
      return { offers: [], failed: true };
    }
  }

  private buildFallbacks(
    configurations: readonly PlanConfiguration[],
    pool: CandidatePool,
    grouped: GroupedInventory,
    request: TravelRequest,
  ): FallbackPlan[] {
    const alternativesByOptionId = new Map<string, number>();
    for (const entry of [...grouped.outbound, ...grouped.inbound]) {
      alternativesByOptionId.set(entry.option.id, countAlternatives(entry.option, grouped));
    }

    return configurations.flatMap((configuration) =>
      buildFallbackPlans({
        configuration,
        pool,
        request,
        grouped,
        alternativesByOptionId,
        now: this.deps.now(),
        maxStages: this.deps.budgets.maxFallbackStages,
        maxOptionsPerStage: this.deps.budgets.maxFallbackOptionsPerStage,
      }),
    );
  }

  /**
   * Переписывание объяснений моделью.
   *
   * Ошибка, таймаут или исчерпанный бюджет вызовов не отменяют план: шаблонное
   * объяснение уже лежит в конфигурации и самодостаточно (§17).
   */
  private async explainConfigurations(
    request: TravelRequest,
    configurations: readonly PlanConfiguration[],
    tracker: BudgetTracker,
    warnings: PlanWarning[],
  ): Promise<PlanConfiguration[]> {
    if (configurations.length === 0) return [];
    if (this.deps.planner.mode === 'deterministic') return [...configurations];

    const result: PlanConfiguration[] = [];
    let degraded = false;

    for (const configuration of configurations) {
      if (tracker.remainingMs <= 0 || !tracker.tryConsumeLlmCall()) {
        result.push(configuration);
        degraded = true;
        continue;
      }

      try {
        const explanation = await withTimeout(
          this.deps.planner.explainConfiguration({
            request,
            preset: configuration.preset,
            configuration,
            score: configuration.score,
          }),
          Math.min(EXPLAIN_TIMEOUT_MS, tracker.remainingMs),
          'explainConfiguration',
        );
        result.push({ ...configuration, explanation });
      } catch (error) {
        this.deps.log({ event: 'explainFailed', configurationId: configuration.id, message: String(error) });
        result.push(configuration);
        degraded = true;
      }
    }

    if (degraded) {
      warnings.push({
        code: 'llmUnavailable',
        severity: 'info',
        message: 'Пояснения показаны в базовом виде: модель недоступна или бюджет вызовов исчерпан.',
      });
    }

    return result;
  }

  private collectWarnings(input: {
    base: readonly PlanWarning[];
    quarantinedCount: number;
    transportFailed: boolean;
  }): PlanWarning[] {
    const warnings: PlanWarning[] = [...input.base];

    // Демо-режим обязан быть виден в интерфейсе, а не только в логах (§5.4).
    if (this.deps.gateway.source === 'fixture') {
      warnings.push({
        code: 'fixtureMode',
        severity: 'info',
        message:
          'Показаны демо-данные: live Tutu MCP недоступен из этой среды. Цены и расписания синтетические.',
      });
    }

    if (input.quarantinedCount > 0) {
      warnings.push({
        code: 'quarantinedRecords',
        severity: 'info',
        message: `${input.quarantinedCount} записей инвентаря пришли неполными и не показаны.`,
      });
    }

    if (input.transportFailed) {
      warnings.push({
        code: 'partialInventory',
        severity: 'warning',
        message: 'Часть вариантов транспорта получить не удалось. Показано то, что доступно.',
      });
    }

    return warnings;
  }
}

const EXPLAIN_TIMEOUT_MS = 6_000;

function availableCapabilities(snapshot: CapabilitySnapshot): CapabilityKey[] {
  return Object.entries(snapshot.capabilities)
    .filter(([, status]) => status !== undefined && status.status !== 'unavailable')
    .map(([key]) => key as CapabilityKey);
}
