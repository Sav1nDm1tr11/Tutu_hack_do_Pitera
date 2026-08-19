import { z } from 'zod';
import { evidenceRefSchema } from './common';

export const dimensionKeySchema = z.enum(['price', 'duration', 'resilience', 'comfort']);
export type DimensionKey = z.infer<typeof dimensionKeySchema>;

/**
 * Причины перечислены кодами, потому что объяснение LLM обязано ссылаться только на
 * существующие в ScoreBreakdown причины (инвариант eval, §22.3). Свободный текст модели
 * не может изобрести новый код.
 */
export const scoreReasonCodeSchema = z.enum([
  'withinBudget',
  'overBudget',
  'priceUnknown',
  'cheapestInPool',
  'fastestInPool',
  'longTotalDuration',
  'durationUnknown',
  'noTransfers',
  'transfersWithinLimit',
  'manyTransfers',
  'transferCountUnknown',
  'comfortableBuffer',
  'tightBuffer',
  'bufferUnknown',
  'stationChange',
  'alternativesAvailable',
  'noAlternatives',
  'nightSegment',
  'noNightSegments',
  'directFlightOrTrain',
  'highHotelRating',
  'hotelReviewRedFlags',
  'hotelRatingUnknown',
  'incompleteData',
]);
export type ScoreReasonCode = z.infer<typeof scoreReasonCodeSchema>;

export const scoreReasonSchema = z.object({
  code: scoreReasonCodeSchema,
  severity: z.enum(['positive', 'neutral', 'warning', 'critical']),
  message: z.string().min(1),
  evidence: z.array(evidenceRefSchema).default([]),
});
export type ScoreReason = z.infer<typeof scoreReasonSchema>;

export const scoreDimensionSchema = z.object({
  key: dimensionKeySchema,
  /** 0..1 внутри размерности. */
  score: z.number().min(0).max(1),
  /** Настроенный вес размерности из risk-policy. */
  weight: z.number().min(0),
  /**
   * Вес фактически доступных сигналов. Если 0 — размерность не участвует в итоге
   * и только снижает confidence (§9.2).
   */
  availableWeight: z.number().min(0),
  /**
   * Суммарный вес объявленных для размерности сигналов.
   * `confidence = availableWeight / requiredSignalWeight` (§9.2).
   */
  requiredSignalWeight: z.number().min(0),
  reasons: z.array(scoreReasonSchema).default([]),
});
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>;

export const scoreBreakdownSchema = z.object({
  /** 0..100, больше — лучше. */
  total: z.number().min(0).max(100),
  /** Доля покрытия требуемых сигналов, 0..1. */
  confidence: z.number().min(0).max(1),
  hardConstraintPassed: z.boolean(),
  /** Вариант нельзя выдать как полностью подходящий, если не хватает данных (§9.1). */
  needsVerification: z.boolean(),
  dimensions: z.array(scoreDimensionSchema),
});
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;

/**
 * Сигнал с `value: undefined` не получает среднее значение и не считается положительным.
 * Он лишь уменьшает `availableWeight` (§9.2).
 */
export interface ScoreSignal {
  readonly key: string;
  readonly value: number | undefined;
  readonly weight: number;
  readonly reasons: readonly ScoreReason[];
}
