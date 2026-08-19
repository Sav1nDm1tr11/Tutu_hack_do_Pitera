import { z } from 'zod';
import {
  capabilitySnapshotSchema,
  isoDateTimeSchema,
  moneySchema,
  placeRefSchema,
} from './common';
import { candidatePoolSchema } from './candidate';
import { scoreBreakdownSchema, scoreReasonCodeSchema } from './score';
import { presetSchema, travelRequestSchema } from './travel-request';
import { fallbackPlanSchema } from './fallback';

export const stageKindSchema = z.enum(['transport', 'hotel', 'wait', 'transfer']);
export type StageKind = z.infer<typeof stageKindSchema>;

export const itineraryStageSchema = z.object({
  id: z.string().min(1),
  kind: stageKindSchema,
  /** Обязан существовать в candidatePool — проверяется валидатором плана. */
  selectedOptionId: z.string().min(1),
  alternativeOptionIds: z.array(z.string().min(1)).default([]),
  startAt: isoDateTimeSchema.optional(),
  endAt: isoDateTimeSchema.optional(),
  origin: placeRefSchema.optional(),
  destination: placeRefSchema.optional(),
  /** Категория временно недоступна (§5.2): маршрут показывается без неё, а не скрывается. */
  temporarilyUnavailable: z.boolean().default(false),
  title: z.string().min(1),
});
export type ItineraryStage = z.infer<typeof itineraryStageSchema>;

export const planTotalsSchema = z.object({
  /** Отсутствует, если хотя бы у одного платного этапа нет цены. Не суммируем «как будто ноль». */
  price: moneySchema.optional(),
  /** Доля платных этапов с известной ценой, 0..1. */
  priceCompleteness: z.number().min(0).max(1),
  /** Положительное значение — перерасход бюджета. Отсутствует, если цена неизвестна. */
  budgetDelta: z.number().optional(),
  travelMinutes: z.number().int().min(0).optional(),
  totalTripMinutes: z.number().int().min(0).optional(),
  transferCount: z.number().int().min(0).optional(),
  nightSegmentCount: z.number().int().min(0),
  stageCount: z.number().int().min(0),
});
export type PlanTotals = z.infer<typeof planTotalsSchema>;

/**
 * Объяснение строится только по canonical facts: каждый пункт ссылается на код причины,
 * который существует в ScoreBreakdown соответствующей конфигурации (§11.4, §22.3).
 */
export const explanationBlockSchema = z.object({
  headline: z.string().min(1).max(140),
  bullets: z
    .array(
      z.object({
        reasonCode: scoreReasonCodeSchema,
        text: z.string().min(1).max(240),
      }),
    )
    .max(5),
  caveats: z.array(z.string().min(1).max(240)).max(4).default([]),
  /** `template` — детерминированные шаблоны, `llm` — сгенерировано моделью по фактам. */
  generatedBy: z.enum(['template', 'llm']),
});
export type ExplanationBlock = z.infer<typeof explanationBlockSchema>;

export const planConfigurationSchema = z.object({
  id: z.string().min(1),
  preset: presetSchema,
  /** Несколько labels, если конфигурации совпали и были дедуплицированы (§9.5.5). */
  labels: z.array(presetSchema).min(1),
  stages: z.array(itineraryStageSchema).min(1),
  totals: planTotalsSchema,
  score: scoreBreakdownSchema,
  explanation: explanationBlockSchema,
});
export type PlanConfiguration = z.infer<typeof planConfigurationSchema>;

export const planWarningCodeSchema = z.enum([
  'hotelsUnavailable',
  'partialInventory',
  'fewerConfigurationsThanRequested',
  'noFallbackAvailable',
  'missingCoordinates',
  'llmUnavailable',
  'fixtureMode',
  'budgetExceeded',
  'quarantinedRecords',
]);
export type PlanWarningCode = z.infer<typeof planWarningCodeSchema>;

export const planWarningSchema = z.object({
  code: planWarningCodeSchema,
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string().min(1),
});
export type PlanWarning = z.infer<typeof planWarningSchema>;

export const routePlanSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().min(0),
  request: travelRequestSchema,
  status: z.enum(['partial', 'ready', 'stale', 'failed']),
  configurations: z.array(planConfigurationSchema),
  candidatePool: candidatePoolSchema,
  fallbackPlans: z.array(fallbackPlanSchema).default([]),
  generatedAt: isoDateTimeSchema,
  validAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.optional(),
  capabilities: capabilitySnapshotSchema,
  warnings: z.array(planWarningSchema).default([]),
});
export type RoutePlan = z.infer<typeof routePlanSchema>;
