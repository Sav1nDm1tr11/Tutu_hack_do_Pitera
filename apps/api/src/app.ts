import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { TravelInventoryGateway } from '@tutu-plan-b/domain';
import { loadEnv, resolveLlmApiKey, resolveLlmMode, resolveLlmModel, type Env } from './config/env';
import { FixtureInventoryGateway } from './adapters/inventory/fixture-gateway';
import { AutoInventoryGateway } from './adapters/inventory/mcp/auto-gateway';
import { LiveMcpInventoryGateway } from './adapters/inventory/mcp/live-gateway';
import { DeterministicPlanner } from './adapters/llm/deterministic-planner';
import { OpenAiPlanner } from './adapters/llm/openai-planner';
import type { LlmPlanner } from './adapters/llm/planner';
import { budgetsFromEnv } from './orchestration/budgets';
import { PlanOrchestrator } from './orchestration/plan-orchestrator';
import { SelectionService } from './orchestration/selection-service';
import { InMemoryPlanRepository, type PlanRepository } from './repositories/plan-repository';
import { SlidingWindowRateLimiter } from './http/rate-limit';
import { registerMetaRoutes } from './http/routes/meta-routes';
import { registerPlanRoutes } from './http/routes/plan-routes';

export const API_VERSION = '0.1.0';

/**
 * Переопределяемые зависимости. Существуют ради тестов: сборка приложения должна
 * проверяться целиком, включая маршруты и сериализацию, но с управляемыми часами и
 * инвентарём.
 */
export interface AppOverrides {
  readonly gateway?: TravelInventoryGateway;
  readonly planner?: LlmPlanner;
  readonly repository?: PlanRepository;
  readonly now?: () => string;
  readonly nowMs?: () => number;
  readonly newId?: (prefix: string) => string;
}

export async function buildApp(
  env: Env = loadEnv(),
  overrides: AppOverrides = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Тела запросов и ответов в логи не попадают: там персональные данные поездки (§15.5).
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    genReqId: () => randomUUID(),
    bodyLimit: 256 * 1024,
    trustProxy: true,
  });

  const now = overrides.now ?? ((): string => new Date().toISOString());
  const nowMs = overrides.nowMs ?? ((): number => Date.now());
  const newId = overrides.newId ?? ((prefix: string): string => `${prefix}_${randomUUID()}`);

  const gateway =
    overrides.gateway ??
    createGateway(env, now, (event) => {
      app.log.warn(event);
    });

  const planner =
    overrides.planner ??
    createPlanner(env, (event) => {
      app.log.warn(event);
    });

  const repository = overrides.repository ?? new InMemoryPlanRepository(env.PLAN_TTL_MS, nowMs);
  const budgets = budgetsFromEnv(env);

  const orchestrator = new PlanOrchestrator({
    gateway,
    planner,
    repository,
    budgets,
    now,
    nowMs,
    newId,
    log: (event) => {
      app.log.info(event);
    },
  });

  const selection = new SelectionService({ repository, budgets, now });
  const rateLimiter = new SlidingWindowRateLimiter(env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS, nowMs);

  app.addHook('onSend', async (_request, reply, payload) => {
    // Заголовки безопасности задаются в коде, а не в конфиге прокси: приложение
    // раздаётся одним контейнером и не может рассчитывать на внешний слой (§15.5).
    reply.headers({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    });
    return payload;
  });

  await registerMetaRoutes(app, {
    gateway,
    plannerMode: planner.mode,
    version: API_VERSION,
  });
  await registerPlanRoutes(app, { orchestrator, selection, repository, rateLimiter });

  app.addHook('onClose', async () => {
    await gateway.close?.();
  });

  app.log.info({
    event: 'appReady',
    inventoryMode: env.INVENTORY_MODE,
    inventorySource: gateway.source,
    plannerMode: planner.mode,
    fixtureScenario: env.FIXTURE_SCENARIO,
    ...(planner.mode === 'llm' ? { plannerModel: resolveLlmModel(env) } : {}),
  });

  return app;
}

/**
 * Выбор источника инвентаря.
 *
 * `fixture` — штатный демо-режим. `live` всегда говорит с MCP и честно помечает
 * недоступные категории. `auto` пробует MCP и откатывается на fixtures, если
 * discovery не дал ни одной категории: смешивать источники внутри одного плана
 * нельзя (см. docs/MCP_SPIKE_REPORT.md).
 */
function createGateway(
  env: Env,
  now: () => string,
  log: (event: Record<string, unknown>) => void,
): TravelInventoryGateway {
  if (env.INVENTORY_MODE === 'fixture') {
    return new FixtureInventoryGateway({ scenario: env.FIXTURE_SCENARIO, now });
  }

  const live = new LiveMcpInventoryGateway({
    url: env.TUTU_MCP_URL,
    timeoutMs: env.MCP_CALL_TIMEOUT_MS,
    now,
    log,
    ...(env.TUTU_MCP_AUTH_TOKEN === undefined ? {} : { authToken: env.TUTU_MCP_AUTH_TOKEN }),
  });

  if (env.INVENTORY_MODE === 'live') {
    log({ event: 'liveInventoryEnabled', url: env.TUTU_MCP_URL });
    return live;
  }

  return new AutoInventoryGateway({
    live,
    fixture: new FixtureInventoryGateway({ scenario: env.FIXTURE_SCENARIO, now }),
    log,
  });
}

function createPlanner(env: Env, log: (event: Record<string, unknown>) => void): LlmPlanner {
  if (resolveLlmMode(env) === 'deterministic') return new DeterministicPlanner();

  const apiKey = resolveLlmApiKey(env);
  if (apiKey === undefined) return new DeterministicPlanner();

  return new OpenAiPlanner({
    apiKey,
    baseURL: env.LLM_BASE_URL,
    model: resolveLlmModel(env),
    maxRepairAttempts: env.MAX_SCHEMA_REPAIR_ATTEMPTS,
    log,
  });
}
