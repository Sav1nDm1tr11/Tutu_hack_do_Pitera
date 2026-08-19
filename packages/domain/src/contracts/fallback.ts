import { z } from 'zod';
import { isoDateTimeSchema } from './common';

/**
 * Обязательная оговорка из §10.3. Живёт в домене, чтобы UI не мог её «забыть»
 * или переформулировать в более обещающую сторону.
 */
export const FALLBACK_CAVEAT =
  'Альтернативы были доступны на момент поиска. Перед оформлением проверьте актуальность.';

export const fallbackTriggerSchema = z.enum([
  'segmentUnavailable',
  'missedConnection',
  'userRequested',
]);
export type FallbackTrigger = z.infer<typeof fallbackTriggerSchema>;

export const fallbackUnavailableReasonSchema = z.enum([
  'noAlternativesInPool',
  'allAlternativesViolateConstraints',
  'searchBudgetExhausted',
  'insufficientData',
]);
export type FallbackUnavailableReason = z.infer<typeof fallbackUnavailableReasonSchema>;

export const fallbackPlanSchema = z.object({
  id: z.string().min(1),
  targetStageId: z.string().min(1),
  configurationId: z.string().min(1),
  trigger: fallbackTriggerSchema,
  /** Только реальные ID из candidatePool. Максимум MAX_FALLBACK_OPTIONS_PER_STAGE (§10.1). */
  optionIds: z.array(z.string().min(1)).default([]),
  generatedAt: isoDateTimeSchema,
  validAt: isoDateTimeSchema,
  caveat: z.string().min(1),
  status: z.enum(['available', 'notAvailable', 'needsRefresh']),
  /** Заполняется только при status !== 'available': честная причина вместо пустого блока. */
  unavailableReason: fallbackUnavailableReasonSchema.optional(),
});
export type FallbackPlan = z.infer<typeof fallbackPlanSchema>;
