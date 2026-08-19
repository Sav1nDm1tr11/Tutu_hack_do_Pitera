import { z } from 'zod';
import type { DefaultValues } from 'react-hook-form';
import type { PlaceRef, TravelRequest } from '@tutu-plan-b/domain';

const placeField = z.custom<PlaceRef>(
  (value) => typeof value === 'object' && value !== null && 'id' in value,
  { message: 'Выберите город из подсказок' },
);

/**
 * Числовые поля объявлены как `z.number()`, а не `z.coerce.number()`: приведение сделало бы
 * входной тип схемы `unknown`, из-за чего resolver перестаёт выводить типы формы. Поэтому
 * строка → число происходит на границе ввода (`register(..., { valueAsNumber: true })`),
 * и схема работает уже с числами. Пустое поле даёт NaN, который zod отвергает.
 */
function numberField(error: string): z.ZodNumber {
  return z.number({ error }).int(error);
}

/**
 * Схема формы, а не запроса.
 *
 * Она отличается от `travelRequestSchema` намеренно: форма работает с тем, что человек
 * реально вводит (строки, пустые поля, выбранное место), и её ошибки адресованы человеку.
 * `TravelRequest` собирается уже из проверенных значений — так одно и то же правило не
 * приходится формулировать дважды в разных терминах.
 */
export const searchFormSchema = z
  .object({
    origin: placeField,
    destination: placeField,
    tripType: z.enum(['roundTrip', 'oneWay']),
    departDate: z.string().min(1, 'Укажите дату отправления'),
    returnDate: z.string(),
    adults: numberField('Укажите число взрослых')
      .min(1, 'Минимум один взрослый')
      .max(9, 'Не больше девяти'),
    childrenCount: numberField('Укажите число детей').min(0).max(9),
    childAge: numberField('Укажите возраст ребёнка').min(0).max(17),
    budget: numberField('Укажите бюджет поездки').min(1, 'Укажите бюджет поездки'),
    noNightSegments: z.boolean(),
    maxOneTransfer: z.boolean(),
    extraTransferBuffer: z.boolean(),
    arriveBeforeLocalTime: z.string(),
    preset: z.enum(['balanced', 'price', 'comfort']),
  })
  .refine((form) => form.origin.id !== form.destination.id, {
    message: 'Города отправления и назначения должны различаться',
    path: ['destination'],
  })
  .refine((form) => form.tripType === 'oneWay' || form.returnDate !== '', {
    message: 'Для поездки туда и обратно укажите дату возвращения',
    path: ['returnDate'],
  })
  .refine((form) => form.returnDate === '' || form.returnDate >= form.departDate, {
    message: 'Дата возвращения не может быть раньше даты отправления',
    path: ['returnDate'],
  });

export type SearchFormValues = z.infer<typeof searchFormSchema>;

/** Веса предпочтений по выбранному приоритету. Пресеты конфигураций считает сервер. */
const PREFERENCE_WEIGHTS: Record<
  SearchFormValues['preset'],
  TravelRequest['preferences']
> = {
  balanced: { price: 0.5, duration: 0.5, resilience: 0.5, comfort: 0.5 },
  price: { price: 0.85, duration: 0.45, resilience: 0.4, comfort: 0.25 },
  comfort: { price: 0.25, duration: 0.5, resilience: 0.7, comfort: 0.85 },
};

export function toTravelRequest(form: SearchFormValues, requestId: string): TravelRequest {
  const returnDate = form.tripType === 'roundTrip' && form.returnDate !== '' ? form.returnDate : undefined;

  return {
    requestId,
    origin: form.origin,
    destination: form.destination,
    tripType: returnDate === undefined ? 'oneWay' : 'roundTrip',
    departDate: form.departDate,
    ...(returnDate === undefined ? {} : { returnDate }),
    travelers: {
      adults: form.adults,
      children: Array.from({ length: form.childrenCount }, () => ({ age: form.childAge })),
    },
    budget: { amount: form.budget, currency: 'RUB', scope: 'totalTrip' },
    hardConstraints: {
      noNightSegments: form.noNightSegments,
      ...(form.maxOneTransfer ? { maxTransfers: 1 } : {}),
      ...(form.arriveBeforeLocalTime === ''
        ? {}
        : { arriveBeforeLocalTime: form.arriveBeforeLocalTime }),
      minimumTransferPolicy: form.extraTransferBuffer ? 'extra' : 'standard',
      budgetIsHard: true,
    },
    preferences: PREFERENCE_WEIGHTS[form.preset],
    locale: 'ru-RU',
  };
}

/**
 * Города намеренно отсутствуют в значениях по умолчанию: свободная строка не является
 * валидным идентификатором места (§8.1), поэтому поле остаётся пустым до выбора из
 * подсказок, а не заполняется пустышкой.
 */
export function defaultFormValues(today: string): DefaultValues<SearchFormValues> {
  return {
    tripType: 'roundTrip',
    departDate: today,
    returnDate: '',
    adults: 1,
    childrenCount: 0,
    childAge: 7,
    budget: 60_000,
    noNightSegments: false,
    maxOneTransfer: false,
    extraTransferBuffer: false,
    arriveBeforeLocalTime: '',
    preset: 'balanced',
  };
}
