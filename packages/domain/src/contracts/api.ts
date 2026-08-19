import { z } from 'zod';
import { capabilityKeySchema } from './common';
import { routePlanSchema } from './plan';

export const planPhaseSchema = z.enum([
  'planning',
  'searchingTransport',
  'searchingHotels',
  'normalizing',
  'scoring',
  'buildingFallback',
  'explaining',
]);
export type PlanPhase = z.infer<typeof planPhaseSchema>;

/**
 * NDJSON-события (§13.1). Клиент обязан игнорировать неизвестные `type`,
 * поэтому парсинг на клиенте использует passthrough, а не строгий union.
 */
export const planStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('plan.started'),
    requestId: z.string().min(1),
    planId: z.string().min(1),
  }),
  z.object({
    type: z.literal('plan.progress'),
    phase: planPhaseSchema,
    message: z.string().min(1),
  }),
  z.object({
    type: z.literal('plan.partial'),
    availableCapabilities: z.array(capabilityKeySchema),
    configurationCount: z.number().int().min(0),
  }),
  z.object({ type: z.literal('plan.ready'), plan: routePlanSchema }),
  z.object({
    type: z.literal('plan.error'),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
]);
export type PlanStreamEvent = z.infer<typeof planStreamEventSchema>;

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'MCP_UNAVAILABLE',
  'MCP_PARTIAL',
  'LLM_UNAVAILABLE',
  'LLM_SCHEMA_INVALID',
  'NO_ROUTE',
  'PLAN_TIMEOUT',
  'PLAN_NOT_FOUND',
  'REVISION_CONFLICT',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    requestId: z.string().min(1),
    /** В production не содержит raw prompts, secrets или полный payload инвентаря (§13.6). */
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Optimistic concurrency: без `expectedRevision` параллельные правки молча затирали бы
 * друг друга (§13.3).
 */
export const selectionPatchSchema = z.object({
  configurationId: z.string().min(1),
  stageId: z.string().min(1),
  selectedOptionId: z.string().min(1),
  expectedRevision: z.number().int().min(0),
});
export type SelectionPatch = z.infer<typeof selectionPatchSchema>;

export const selectionResponseSchema = z.object({
  plan: routePlanSchema,
  changedStageId: z.string().min(1),
});
export type SelectionResponse = z.infer<typeof selectionResponseSchema>;
