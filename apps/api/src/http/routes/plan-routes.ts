import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiErrorCode, PlanStreamEvent } from '@tutu-plan-b/domain';
import { selectionPatchSchema, travelRequestSchema } from '@tutu-plan-b/domain';
import type { PlanOrchestrator } from '../../orchestration/plan-orchestrator';
import type { SelectionService } from '../../orchestration/selection-service';
import type { PlanRepository } from '../../repositories/plan-repository';
import type { SlidingWindowRateLimiter } from '../rate-limit';

export interface PlanRoutesDeps {
  readonly orchestrator: PlanOrchestrator;
  readonly selection: SelectionService;
  readonly repository: PlanRepository;
  readonly rateLimiter: SlidingWindowRateLimiter;
}

export async function registerPlanRoutes(
  app: FastifyInstance,
  deps: PlanRoutesDeps,
): Promise<void> {
  app.post('/api/plan', async (request, reply) => {
    const limit = deps.rateLimiter.check(clientKey(request));
    if (!limit.allowed) {
      return sendError(reply, 429, 'RATE_LIMITED', 'Слишком много запросов. Подождите немного.', {
        retryable: true,
        headers: { 'retry-after': String(limit.retryAfterSeconds) },
      });
    }

    const parsed = travelRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_FAILED', 'Проверьте параметры поиска.', {
        retryable: false,
        details: { issues: parsed.error.issues.map(describeIssue) },
      });
    }

    // NDJSON, а не SSE: события структурные и однонаправленные, а построчный JSON
    // одинаково просто читается и fetch-стримом, и curl при отладке (§13.1).
    reply.raw.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // Прокси с буферизацией превратили бы поток в единый ответ в конце.
      'x-accel-buffering': 'no',
    });

    let clientGone = false;
    const onClose = (): void => {
      clientGone = true;
    };
    // Слушаем именно ответ: Node ≥16 эмитит `close` на IncomingMessage сразу после того,
    // как тело запроса дочитано, поэтому подписка на `request.raw` обрывала бы поток до
    // первой итерации. `close` на response означает настоящий разрыв соединения.
    reply.raw.on('close', onClose);

    try {
      for await (const event of deps.orchestrator.createPlanStream(parsed.data)) {
        // Клиент ушёл — продолжать расчёт незачем, генератор закроется по выходу из цикла.
        if (clientGone) break;
        reply.raw.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      app.log.error({ err: error }, 'Поток плана прервался');
      if (!clientGone) {
        const event: PlanStreamEvent = {
          type: 'plan.error',
          code: 'INTERNAL_ERROR',
          message: 'Поток прервался. Попробуйте повторить поиск.',
          retryable: true,
        };
        reply.raw.write(`${JSON.stringify(event)}\n`);
      }
    } finally {
      reply.raw.off('close', onClose);
      reply.raw.end();
    }

    return reply;
  });

  app.get('/api/plan/:planId', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const stored = deps.repository.get(planId);

    if (stored === undefined) {
      return sendError(reply, 404, 'PLAN_NOT_FOUND', 'План устарел или не найден.', {
        retryable: false,
      });
    }

    return reply.send({ plan: stored.plan });
  });

  app.patch('/api/plan/:planId/selection', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const parsed = selectionPatchSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_FAILED', 'Некорректный запрос на замену варианта.', {
        retryable: false,
        details: { issues: parsed.error.issues.map(describeIssue) },
      });
    }

    const outcome = deps.selection.apply(planId, parsed.data);
    if (!outcome.ok) {
      const status = outcome.code === 'PLAN_NOT_FOUND' ? 404 : outcome.code === 'REVISION_CONFLICT' ? 409 : 400;
      return sendError(reply, status, outcome.code, outcome.message, {
        retryable: outcome.code === 'REVISION_CONFLICT',
      });
    }

    return reply.send({ plan: outcome.plan, changedStageId: outcome.changedStageId });
  });
}

function clientKey(request: FastifyRequest): string {
  return request.ip;
}

function describeIssue(issue: { path: readonly (string | number | symbol)[]; message: string }): {
  path: string;
  message: string;
} {
  return { path: issue.path.map(String).join('.'), message: issue.message };
}

/**
 * Единый формат ошибки (§13.6). `details` содержит только описания полей: raw payload
 * инвентаря и текст промптов наружу не выходят.
 */
function sendError(
  reply: FastifyReply,
  status: number,
  code: ApiErrorCode,
  message: string,
  options: {
    retryable: boolean;
    details?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): FastifyReply {
  if (options.headers !== undefined) reply.headers(options.headers);

  return reply.status(status).send({
    error: {
      code,
      message,
      retryable: options.retryable,
      requestId: reply.request.id,
      ...(options.details === undefined ? {} : { details: options.details }),
    },
  });
}
