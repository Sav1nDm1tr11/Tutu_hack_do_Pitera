import { z } from 'zod';

/**
 * Каждый показанный пользователю факт обязан иметь происхождение (§2.1.5 системного дизайна).
 * `tutuMcp` — пришло из инвентаря, `userInput` — задал пользователь,
 * `calculation` — посчитано детерминированным кодом. Четвёртого варианта нет:
 * если значение неизвестно, поле отсутствует, а не заполняется догадкой.
 */
export const sourceTypeSchema = z.enum(['tutuMcp', 'userInput', 'calculation']);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const evidenceRefSchema = z.object({
  sourceType: sourceTypeSchema,
  toolCallId: z.string().min(1).optional(),
  fieldPath: z.string().min(1),
  label: z.string().min(1),
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const geoPointSchema = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

/**
 * Свободная строка не может быть единственным идентификатором места после autocomplete
 * (§8.1). Координаты опциональны: если инвентарь их не вернул, глобус деградирует до
 * текстовой схемы, а не показывает выдуманную точку.
 */
export const placeRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['city', 'station', 'airport', 'busStation', 'hotel', 'unknown']).default('unknown'),
  point: geoPointSchema.optional(),
  timezone: z.string().min(1).optional(),
});
export type PlaceRef = z.infer<typeof placeRefSchema>;

export const moneySchema = z.object({
  amount: z.number().min(0),
  currency: z.literal('RUB'),
});
export type Money = z.infer<typeof moneySchema>;

export const transportModeSchema = z.enum(['flight', 'train', 'bus', 'suburbanTrain']);
export type TransportMode = z.infer<typeof transportModeSchema>;

export const inventorySourceSchema = z.enum(['live', 'fixture']);
export type InventorySource = z.infer<typeof inventorySourceSchema>;

/**
 * §14.3. `stale` запрещает выдавать цену как актуальную, `offline` дополнительно
 * отключает оформление до revalidation.
 */
export const freshnessStateSchema = z.enum(['fresh', 'aging', 'stale', 'offline']);
export type FreshnessState = z.infer<typeof freshnessStateSchema>;

export const capabilityKeySchema = z.enum([
  'flight',
  'train',
  'bus',
  'suburbanTrain',
  'hotel',
  'hotelReviews',
]);
export type CapabilityKey = z.infer<typeof capabilityKeySchema>;

export const capabilityStatusSchema = z.enum(['available', 'degraded', 'unavailable']);
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;

/**
 * Публичный allowlisted snapshot (§13.5). Raw tool schemas клиенту не отдаются.
 */
export const capabilitySnapshotSchema = z.object({
  source: inventorySourceSchema,
  checkedAt: z.string().min(1),
  capabilities: z.record(
    capabilityKeySchema,
    z.object({
      status: capabilityStatusSchema,
      reason: z.string().optional(),
    }),
  ),
});
export type CapabilitySnapshot = z.infer<typeof capabilitySnapshotSchema>;

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата в формате YYYY-MM-DD');

export const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
    'Ожидается дата-время в формате ISO 8601',
  );

export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ожидается время в формате HH:MM');
