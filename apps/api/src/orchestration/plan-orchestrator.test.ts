import { describe, expect, it } from 'vitest';
import type {
  CapabilitySnapshot,
  InventoryResponse,
  PlanStreamEvent,
  RawHotelOffer,
  RawTransportOffer,
  RoutePlan,
  TravelInventoryGateway,
} from '@tutu-plan-b/domain';
import { emptyInventoryResponse, isTransportOption } from '@tutu-plan-b/domain';
import { demoRequest } from '@tutu-plan-b/test-fixtures';
import { FixtureInventoryGateway } from '../adapters/inventory/fixture-gateway';
import { DeterministicPlanner } from '../adapters/llm/deterministic-planner';
import { InMemoryPlanRepository } from '../repositories/plan-repository';
import { budgetsFromEnv } from './budgets';
import { PlanOrchestrator } from './plan-orchestrator';
import { loadEnv } from '../config/env';

const NOW = '2026-09-01T10:00:00+05:00';

function makeOrchestrator(
  gateway: TravelInventoryGateway,
  overrides: Partial<ReturnType<typeof budgetsFromEnv>> = {},
): { orchestrator: PlanOrchestrator; repository: InMemoryPlanRepository } {
  const env = loadEnv({});
  const repository = new InMemoryPlanRepository(env.PLAN_TTL_MS, () => 0);

  const orchestrator = new PlanOrchestrator({
    gateway,
    planner: new DeterministicPlanner(),
    repository,
    budgets: { ...budgetsFromEnv(env), ...overrides },
    now: () => NOW,
    nowMs: () => Date.now(),
    newId: (prefix) => `${prefix}_test`,
    log: () => undefined,
  });

  return { orchestrator, repository };
}

async function collect(stream: AsyncGenerator<PlanStreamEvent>): Promise<PlanStreamEvent[]> {
  const events: PlanStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function readyPlan(events: readonly PlanStreamEvent[]): RoutePlan {
  const ready = events.find((event) => event.type === 'plan.ready');
  if (ready === undefined || ready.type !== 'plan.ready') {
    throw new Error(`Поток не содержит plan.ready: ${JSON.stringify(events)}`);
  }
  return ready.plan;
}

describe('PlanOrchestrator', () => {
  it('выдаёт события в порядке фаз и завершается готовым планом', async () => {
    const { orchestrator } = makeOrchestrator(new FixtureInventoryGateway({ now: () => NOW }));

    const events = await collect(orchestrator.createPlanStream(demoRequest()));

    expect(events[0]).toMatchObject({ type: 'plan.started' });
    expect(events.at(-1)?.type).toBe('plan.ready');

    const phases = events
      .filter((event) => event.type === 'plan.progress')
      .map((event) => (event.type === 'plan.progress' ? event.phase : ''));
    expect(phases).toEqual([
      'planning',
      'searchingTransport',
      'searchingHotels',
      'normalizing',
      'scoring',
      'buildingFallback',
      'explaining',
    ]);
  });

  // Инвариант §22.3: интерфейс рендерит этапы по pool, поэтому ссылка в пустоту — это
  // либо пропавшая карточка, либо падение. Исключение только у помеченных недоступных.
  it.each(['default', 'noHotels', 'missingCoordinates', 'brokenRecords', 'sparseData'] as const)(
    'сценарий %s: каждый доступный этап ссылается на существующий вариант',
    async (scenario) => {
      const { orchestrator } = makeOrchestrator(
        new FixtureInventoryGateway({ scenario, now: () => NOW }),
      );

      const plan = readyPlan(await collect(orchestrator.createPlanStream(demoRequest())));

      for (const configuration of plan.configurations) {
        for (const stage of configuration.stages) {
          if (stage.temporarilyUnavailable) continue;
          expect(plan.candidatePool[stage.selectedOptionId]).toBeDefined();
        }
      }
    },
  );

  it('план Б ссылается только на существующие варианты того же направления', async () => {
    const { orchestrator } = makeOrchestrator(new FixtureInventoryGateway({ now: () => NOW }));

    const plan = readyPlan(await collect(orchestrator.createPlanStream(demoRequest())));

    for (const fallback of plan.fallbackPlans) {
      for (const optionId of fallback.optionIds) {
        const option = plan.candidatePool[optionId];
        expect(option).toBeDefined();
        expect(option !== undefined && isTransportOption(option)).toBe(true);
      }
      expect(fallback.caveat.length).toBeGreaterThan(0);
    }
  });

  it('в демо-режиме всегда предупреждает про синтетические данные', async () => {
    const { orchestrator } = makeOrchestrator(new FixtureInventoryGateway({ now: () => NOW }));

    const plan = readyPlan(await collect(orchestrator.createPlanStream(demoRequest())));

    expect(plan.warnings.map((warning) => warning.code)).toContain('fixtureMode');
  });

  it('сохраняет план в репозиторий для последующей замены варианта', async () => {
    const { orchestrator, repository } = makeOrchestrator(
      new FixtureInventoryGateway({ now: () => NOW }),
    );

    const plan = readyPlan(await collect(orchestrator.createPlanStream(demoRequest())));

    expect(repository.get(plan.id)?.plan.id).toBe(plan.id);
    expect(repository.get(plan.id)?.context.request.requestId).toBe('req_demo');
  });

  it('показывает этап проживания помеченным, а не скрывает его, когда отели недоступны', async () => {
    const { orchestrator } = makeOrchestrator(
      new FixtureInventoryGateway({ scenario: 'noHotels', now: () => NOW }),
    );

    const plan = readyPlan(await collect(orchestrator.createPlanStream(demoRequest())));

    expect(plan.configurations.length).toBeGreaterThan(0);
    for (const configuration of plan.configurations) {
      const hotelStage = configuration.stages.find((stage) => stage.kind === 'hotel');
      // §5.2: пропавший из маршрута этап читался бы как «жильё не нужно».
      expect(hotelStage?.temporarilyUnavailable).toBe(true);
    }
    expect(plan.warnings.map((warning) => warning.code)).toContain('hotelsUnavailable');
  });

  it('отдаёт маршрут «туда», когда обратное направление отвалилось', async () => {
    const gateway = new PartialGateway();
    const { orchestrator } = makeOrchestrator(gateway);

    const events = await collect(orchestrator.createPlanStream(demoRequest({ returnDate: null })));
    const plan = readyPlan(events);

    expect(plan.status).toBe('partial');
    expect(plan.warnings.map((warning) => warning.code)).toContain('partialInventory');
    expect(events.some((event) => event.type === 'plan.partial')).toBe(true);
  });

  it('возвращает plan.ready со статусом failed, когда вариантов нет', async () => {
    const { orchestrator } = makeOrchestrator(new EmptyGateway());

    const events = await collect(orchestrator.createPlanStream(demoRequest()));
    const plan = readyPlan(events);

    // Пустой результат — это информативный экран, а не ошибка инфраструктуры.
    expect(events.some((event) => event.type === 'plan.error')).toBe(false);
    expect(plan.status).toBe('failed');
    expect(plan.configurations).toEqual([]);
    expect(plan.warnings.some((warning) => warning.severity === 'critical')).toBe(true);
  });

  it('сообщает о таймауте, когда инвентарь не отвечает', async () => {
    const { orchestrator } = makeOrchestrator(new HangingGateway(), {
      toolCallTimeoutMs: 20,
      totalTimeoutMs: 40,
    });

    const events = await collect(orchestrator.createPlanStream(demoRequest()));

    expect(events.at(-1)).toMatchObject({ type: 'plan.error', retryable: true });
  });

  it('детерминирован: два прогона дают идентичный план', async () => {
    const first = makeOrchestrator(new FixtureInventoryGateway({ now: () => NOW }));
    const second = makeOrchestrator(new FixtureInventoryGateway({ now: () => NOW }));

    const planA = readyPlan(await collect(first.orchestrator.createPlanStream(demoRequest())));
    const planB = readyPlan(await collect(second.orchestrator.createPlanStream(demoRequest())));

    expect(JSON.stringify(planA)).toBe(JSON.stringify(planB));
  });
});

const CAPABILITIES: CapabilitySnapshot = {
  source: 'fixture',
  checkedAt: NOW,
  capabilities: {
    flight: { status: 'available' },
    train: { status: 'available' },
    bus: { status: 'available' },
    suburbanTrain: { status: 'available' },
    hotel: { status: 'available' },
    hotelReviews: { status: 'available' },
  },
};

/** Транспорт «туда» есть, отели падают с исключением. */
class PartialGateway implements TravelInventoryGateway {
  readonly source = 'fixture' as const;
  private readonly inner = new FixtureInventoryGateway({ now: () => NOW });

  async describeCapabilities(): Promise<CapabilitySnapshot> {
    return CAPABILITIES;
  }

  async searchTransport(
    query: Parameters<TravelInventoryGateway['searchTransport']>[0],
  ): Promise<InventoryResponse<RawTransportOffer>> {
    const response = await this.inner.searchTransport(query);
    return { ...response, status: 'partial', failedCapabilities: ['bus'] };
  }

  async searchHotels(): Promise<InventoryResponse<RawHotelOffer>> {
    throw new Error('Категория отелей недоступна');
  }
}

class EmptyGateway implements TravelInventoryGateway {
  readonly source = 'fixture' as const;

  async describeCapabilities(): Promise<CapabilitySnapshot> {
    return CAPABILITIES;
  }

  async searchTransport(): Promise<InventoryResponse<RawTransportOffer>> {
    return { offers: [], toolCallIds: [], status: 'ok', failedCapabilities: [] };
  }

  async searchHotels(): Promise<InventoryResponse<RawHotelOffer>> {
    return emptyInventoryResponse('ok');
  }
}

class HangingGateway implements TravelInventoryGateway {
  readonly source = 'fixture' as const;

  async describeCapabilities(): Promise<CapabilitySnapshot> {
    return CAPABILITIES;
  }

  async searchTransport(): Promise<InventoryResponse<RawTransportOffer>> {
    return new Promise(() => undefined);
  }

  async searchHotels(): Promise<InventoryResponse<RawHotelOffer>> {
    return new Promise(() => undefined);
  }
}
