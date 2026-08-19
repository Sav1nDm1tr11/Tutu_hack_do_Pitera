import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PlanStreamEvent, RoutePlan, SelectionPatch } from '@tutu-plan-b/domain';
import { planStreamEventSchema } from '@tutu-plan-b/domain';
import { demoRequest } from '@tutu-plan-b/test-fixtures';
import { buildApp } from '../../app';
import { loadEnv } from '../../config/env';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp(loadEnv({ LOG_LEVEL: 'silent', RATE_LIMIT_MAX: '100' }));
});

afterEach(async () => {
  await app.close();
});

/** NDJSON парсится построчно — так же, как это делает клиент. */
function parseStream(body: string): PlanStreamEvent[] {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => planStreamEventSchema.parse(JSON.parse(line)));
}

async function createPlan(): Promise<{ events: PlanStreamEvent[]; plan: RoutePlan }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/plan',
    payload: demoRequest(),
  });

  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toContain('application/x-ndjson');

  const events = parseStream(response.body);
  const ready = events.find((event) => event.type === 'plan.ready');
  if (ready === undefined || ready.type !== 'plan.ready') {
    throw new Error('Поток не содержит plan.ready');
  }

  return { events, plan: ready.plan };
}

describe('POST /api/plan', () => {
  it('стримит NDJSON-события, каждое из которых валидно по схеме', async () => {
    const { events } = await createPlan();

    expect(events[0]?.type).toBe('plan.started');
    expect(events.at(-1)?.type).toBe('plan.ready');
  });

  it('отклоняет некорректный запрос с описанием полей, но без внутренних деталей', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/plan',
      payload: { ...demoRequest(), departDate: '12.09.2026' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: { code: string; details?: { issues: unknown[] } } }>();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details?.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('отклоняет поездку туда-обратно без даты возвращения', async () => {
    const { returnDate: _returnDate, ...withoutReturn } = demoRequest();

    const response = await app.inject({
      method: 'POST',
      url: '/api/plan',
      payload: { ...withoutReturn, tripType: 'roundTrip' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('ограничивает частоту запросов', async () => {
    const limited = await buildApp(loadEnv({ LOG_LEVEL: 'silent', RATE_LIMIT_MAX: '1' }));

    try {
      const first = await limited.inject({ method: 'POST', url: '/api/plan', payload: demoRequest() });
      const second = await limited.inject({ method: 'POST', url: '/api/plan', payload: demoRequest() });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
      expect(second.headers['retry-after']).toBeDefined();
    } finally {
      await limited.close();
    }
  });
});

describe('GET /api/plan/:planId', () => {
  it('возвращает сохранённый план', async () => {
    const { plan } = await createPlan();

    const response = await app.inject({ method: 'GET', url: `/api/plan/${plan.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ plan: RoutePlan }>().plan.id).toBe(plan.id);
  });

  it('отвечает PLAN_NOT_FOUND для неизвестного плана', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/plan/plan_missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('PLAN_NOT_FOUND');
  });
});

describe('PATCH /api/plan/:planId/selection', () => {
  async function firstAlternative(plan: RoutePlan): Promise<SelectionPatch> {
    for (const configuration of plan.configurations) {
      for (const stage of configuration.stages) {
        const alternative = stage.alternativeOptionIds[0];
        if (alternative !== undefined) {
          return {
            configurationId: configuration.id,
            stageId: stage.id,
            selectedOptionId: alternative,
            expectedRevision: plan.revision,
          };
        }
      }
    }
    throw new Error('В демо-плане нет альтернатив для замены');
  }

  it('заменяет вариант и повышает ревизию плана', async () => {
    const { plan } = await createPlan();
    const patch = await firstAlternative(plan);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/plan/${plan.id}/selection`,
      payload: patch,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ plan: RoutePlan; changedStageId: string }>();
    expect(body.plan.revision).toBe(plan.revision + 1);
    expect(body.changedStageId).toBe(patch.stageId);

    const changed = body.plan.configurations
      .find((item) => item.id === patch.configurationId)
      ?.stages.find((item) => item.id === patch.stageId);
    expect(changed?.selectedOptionId).toBe(patch.selectedOptionId);
  });

  it('отклоняет вторую правку с устаревшей ревизией', async () => {
    const { plan } = await createPlan();
    const patch = await firstAlternative(plan);

    const first = await app.inject({
      method: 'PATCH',
      url: `/api/plan/${plan.id}/selection`,
      payload: patch,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'PATCH',
      url: `/api/plan/${plan.id}/selection`,
      payload: patch,
    });

    expect(second.statusCode).toBe(409);
    expect(second.json<{ error: { code: string } }>().error.code).toBe('REVISION_CONFLICT');
  });

  it('не принимает вариант, который не предлагался для этапа', async () => {
    const { plan } = await createPlan();
    const configuration = plan.configurations[0];
    const stage = configuration?.stages[0];
    if (configuration === undefined || stage === undefined) throw new Error('Пустой план');

    // Настоящий id из pool, но не из списка альтернатив этого этапа: иначе можно было бы
    // собрать несогласованный маршрут через API.
    const foreignId = Object.keys(plan.candidatePool).find(
      (id) => id !== stage.selectedOptionId && !stage.alternativeOptionIds.includes(id),
    );
    expect(foreignId).toBeDefined();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/plan/${plan.id}/selection`,
      payload: {
        configurationId: configuration.id,
        stageId: stage.id,
        selectedOptionId: foreignId,
        expectedRevision: plan.revision,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
  });
});

describe('метаданные', () => {
  it('health отвечает без обращения к инвентарю', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe('ok');
  });

  it('capabilities сообщает источник данных и режим планировщика', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/capabilities' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      capabilities: { source: string };
      plannerMode: string;
    }>();
    expect(body.capabilities.source).toBe('fixture');
    expect(body.plannerMode).toBe('deterministic');
  });

  it('places подсказывает города и игнорирует слишком короткий запрос', async () => {
    const short = await app.inject({ method: 'GET', url: '/api/places?q=м' });
    expect(short.json<{ places: unknown[] }>().places).toEqual([]);

    const found = await app.inject({ method: 'GET', url: '/api/places?q=мос' });
    const places = found.json<{ places: { name: string }[] }>().places;
    expect(places.length).toBeGreaterThan(0);
    expect(places[0]?.name).toBe('Москва');
  });

  it('ставит заголовки безопасности на ответы', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
  });
});

/**
 * Регрессия на «поток отдаёт 0 байт».
 *
 * `app.inject()` этот класс ошибок не ловит: он не создаёт настоящих сокетов, поэтому
 * подписка на `close` у `request.raw` там не срабатывала. Нужен реальный listen и реальный
 * HTTP-клиент.
 */
describe('POST /api/plan по реальному сокету', () => {
  it('отдаёт непустой NDJSON-поток, а не пустое тело', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const response = await fetch(`${address}/api/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(demoRequest()),
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);

    const events = parseStream(body);
    expect(events.length).toBeGreaterThan(1);
    expect(events[0]?.type).toBe('plan.started');
    expect(events.at(-1)?.type).toBe('plan.ready');
  });
});
