import { z } from 'zod';
import { isoDateSchema, localTimeSchema, placeRefSchema, transportModeSchema } from './common';

export const tripTypeSchema = z.enum(['oneWay', 'roundTrip']);
export type TripType = z.infer<typeof tripTypeSchema>;

export const presetSchema = z.enum(['reliable', 'balanced', 'budget']);
export type Preset = z.infer<typeof presetSchema>;

export const minimumTransferPolicySchema = z.enum(['standard', 'extra']);
export type MinimumTransferPolicy = z.infer<typeof minimumTransferPolicySchema>;

/**
 * Жёсткое ограничение исключает вариант; мягкое предпочтение только влияет на рейтинг (§2.3).
 * Поэтому две группы не смешиваются в одном объекте.
 */
export const hardConstraintsSchema = z.object({
  allowedModes: z.array(transportModeSchema).min(1).optional(),
  noNightSegments: z.boolean().default(false),
  maxTransfers: z.number().int().min(0).max(5).optional(),
  arriveBeforeLocalTime: localTimeSchema.optional(),
  minimumTransferPolicy: minimumTransferPolicySchema.default('standard'),
  budgetIsHard: z.boolean().default(true),
});
export type HardConstraints = z.infer<typeof hardConstraintsSchema>;

export const preferencesSchema = z.object({
  price: z.number().min(0).max(1).default(0.5),
  duration: z.number().min(0).max(1).default(0.5),
  resilience: z.number().min(0).max(1).default(0.5),
  comfort: z.number().min(0).max(1).default(0.5),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const travelersSchema = z.object({
  adults: z.number().int().min(1).max(9),
  children: z
    .array(z.object({ age: z.number().int().min(0).max(17).optional() }))
    .max(9)
    .default([]),
});
export type Travelers = z.infer<typeof travelersSchema>;

const travelRequestShape = z.object({
  requestId: z.string().min(1),
  origin: placeRefSchema,
  destination: placeRefSchema,
  tripType: tripTypeSchema,
  departDate: isoDateSchema,
  returnDate: isoDateSchema.optional(),
  travelers: travelersSchema,
  budget: z.object({
    amount: z.number().min(0),
    currency: z.literal('RUB'),
    scope: z.literal('totalTrip'),
  }),
  hardConstraints: hardConstraintsSchema,
  preferences: preferencesSchema,
  /** Свободный текст пользователя. Не логируется (§16.4) и не может менять hard constraints. */
  freeTextNote: z.string().max(500).optional(),
  locale: z.literal('ru-RU').default('ru-RU'),
});

/**
 * Логические проверки живут в схеме, а не в UI: одна и та же схема валидирует
 * форму в браузере и тело запроса на сервере (§12.1).
 */
export const travelRequestSchema = travelRequestShape
  .refine((request) => request.origin.id !== request.destination.id, {
    message: 'Пункты отправления и назначения должны различаться',
    path: ['destination'],
  })
  .refine((request) => request.tripType === 'oneWay' || request.returnDate !== undefined, {
    message: 'Для поездки «туда и обратно» укажите дату возвращения',
    path: ['returnDate'],
  })
  .refine(
    (request) =>
      request.returnDate === undefined || request.returnDate >= request.departDate,
    {
      message: 'Дата возвращения не может быть раньше даты отправления',
      path: ['returnDate'],
    },
  );

export type TravelRequest = z.infer<typeof travelRequestSchema>;
