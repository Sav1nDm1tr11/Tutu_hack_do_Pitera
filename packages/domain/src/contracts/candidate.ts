import { z } from 'zod';
import {
  evidenceRefSchema,
  isoDateTimeSchema,
  moneySchema,
  placeRefSchema,
  transportModeSchema,
} from './common';

/**
 * Риск-сигнал всегда сопровождается текстом и кодом: цвет не может быть единственным
 * носителем информации о риске (§19).
 */
export const riskSignalCodeSchema = z.enum([
  'nightSegment',
  'tightTransfer',
  'stationChange',
  'manyTransfers',
  'noAlternatives',
  'longWait',
  'incompleteData',
  'arrivesLate',
]);
export type RiskSignalCode = z.infer<typeof riskSignalCodeSchema>;

export const riskSignalSchema = z.object({
  code: riskSignalCodeSchema,
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string().min(1),
});
export type RiskSignal = z.infer<typeof riskSignalSchema>;

const baseOptionShape = {
  id: z.string().min(1),
  /** Происхождение каждого значимого поля. Пустой массив недопустим. */
  source: z.array(evidenceRefSchema).min(1),
  fetchedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.optional(),
  /** Доля заполненных ожидаемых полей, 0..1. Влияет только на confidence, не на score. */
  dataCompleteness: z.number().min(0).max(1),
  price: moneySchema.optional(),
  checkoutUrl: z.string().url().optional(),
  riskSignals: z.array(riskSignalSchema).default([]),
};

export const transportSegmentSchema = z.object({
  id: z.string().min(1),
  mode: transportModeSchema,
  operator: z.string().optional(),
  departure: z.object({ place: placeRefSchema, at: isoDateTimeSchema }),
  arrival: z.object({ place: placeRefSchema, at: isoDateTimeSchema }),
  serviceClass: z.string().optional(),
});
export type TransportSegment = z.infer<typeof transportSegmentSchema>;

export const transportOptionSchema = z.object({
  ...baseOptionShape,
  kind: z.literal('transport'),
  direction: z.enum(['outbound', 'inbound']),
  mode: transportModeSchema,
  operator: z.string().optional(),
  departure: z.object({ place: placeRefSchema, at: isoDateTimeSchema }),
  arrival: z.object({ place: placeRefSchema, at: isoDateTimeSchema }),
  durationMinutes: z.number().int().min(0).optional(),
  /** Отсутствие значения означает «инвентарь не сообщил», а не «пересадок нет». */
  transferCount: z.number().int().min(0).optional(),
  segments: z.array(transportSegmentSchema).optional(),
  serviceClass: z.string().optional(),
  /** Смысл и TTL availability не подтверждены MCP (§3.2), поэтому поле необязательное. */
  seatsAvailable: z.number().int().min(0).optional(),
  refundable: z.boolean().optional(),
});
export type TransportOption = z.infer<typeof transportOptionSchema>;

export const reviewSummarySchema = z.object({
  /** Текст из инвентаря — untrusted data (§16.3), ограничен по длине при нормализации. */
  text: z.string().max(600),
  positiveCount: z.number().int().min(0).optional(),
  negativeCount: z.number().int().min(0).optional(),
});
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

export const hotelOptionSchema = z.object({
  ...baseOptionShape,
  kind: z.literal('hotel'),
  name: z.string().min(1),
  place: placeRefSchema.optional(),
  checkIn: isoDateTimeSchema,
  checkOut: isoDateTimeSchema,
  nights: z.number().int().min(1),
  pricePerNight: moneySchema.optional(),
  rating: z.number().min(0).max(10).optional(),
  reviewSummary: reviewSummarySchema.optional(),
  /** Показываются только если их вернул анализ инвентаря (§6.5). Не выводятся эвристикой. */
  reviewRedFlags: z.array(z.string().max(200)).default([]),
  /** Только при наличии координат или подтверждённого расстояния (§6.5). */
  distanceToCenterKm: z.number().min(0).optional(),
});
export type HotelOption = z.infer<typeof hotelOptionSchema>;

/**
 * Ожидание и пересадка не приходят из инвентаря — они вычисляются из соседних этапов
 * и всегда маркируются `calculated` (§6.5).
 */
export const calculatedOptionSchema = z.object({
  ...baseOptionShape,
  kind: z.literal('calculated'),
  calculationKind: z.enum(['wait', 'transfer']),
  durationMinutes: z.number().int().min(0),
  place: placeRefSchema.optional(),
  arrivalPlace: placeRefSchema.optional(),
  departurePlace: placeRefSchema.optional(),
  /** `undefined` — не удалось определить, меняется ли точка. Это не то же самое, что `false`. */
  sameStation: z.boolean().optional(),
  minimumBufferMinutes: z.number().int().min(0),
  bufferSatisfied: z.boolean(),
});
export type CalculatedOption = z.infer<typeof calculatedOptionSchema>;

export const candidateOptionSchema = z.discriminatedUnion('kind', [
  transportOptionSchema,
  hotelOptionSchema,
  calculatedOptionSchema,
]);
export type CandidateOption = z.infer<typeof candidateOptionSchema>;

export const candidatePoolSchema = z.record(z.string(), candidateOptionSchema);
export type CandidatePool = z.infer<typeof candidatePoolSchema>;

export function isTransportOption(option: CandidateOption): option is TransportOption {
  return option.kind === 'transport';
}

export function isHotelOption(option: CandidateOption): option is HotelOption {
  return option.kind === 'hotel';
}

export function isCalculatedOption(option: CandidateOption): option is CalculatedOption {
  return option.kind === 'calculated';
}
