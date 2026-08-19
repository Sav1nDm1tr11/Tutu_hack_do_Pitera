import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { TravelRequest } from '@tutu-plan-b/domain';
import { Button } from '../../components/ui/Button';
import { Field, inputClassName } from '../../components/ui/Field';
import { PlacePicker } from './PlacePicker';
import { ConstraintChips } from './ConstraintChips';
import {
  defaultFormValues,
  searchFormSchema,
  toTravelRequest,
  type SearchFormValues,
} from './search-form-schema';

export interface SearchFormProps {
  readonly onSubmit: (request: TravelRequest) => void;
  readonly submitting: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SearchForm({ onSubmit, submitting }: SearchFormProps): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Третий параметр — тип уже провалидированных значений. Без него resolver выводит
  // TTransformedValues как FieldValues, и типы формы расходятся с типами схемы.
  const form = useForm<SearchFormValues, unknown, SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: defaultFormValues(today()),
    // Валидация на blur, а не на каждое нажатие: подсвечивать «неверно» посреди набора
    // даты значит спорить с пользователем, который ещё не закончил вводить.
    mode: 'onBlur',
  });

  const { errors } = form.formState;
  const tripType = form.watch('tripType');
  const childrenCount = form.watch('childrenCount');

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => {
        onSubmit(toTravelRequest(values, `req_${crypto.randomUUID()}`));
      })}
      className="flex flex-col gap-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="origin"
          render={({ field }) => (
            <PlacePicker
              label="Откуда"
              value={field.value}
              onChange={field.onChange}
              error={errors.origin?.message}
              placeholder="Екатеринбург"
            />
          )}
        />
        <Controller
          control={form.control}
          name="destination"
          render={({ field }) => (
            <PlacePicker
              label="Куда"
              value={field.value}
              onChange={field.onChange}
              error={errors.destination?.message}
              placeholder="Санкт-Петербург"
            />
          )}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">Тип поездки</legend>
        <div className="flex gap-2">
          {(
            [
              { value: 'roundTrip', label: 'Туда и обратно' },
              { value: 'oneWay', label: 'В одну сторону' },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className="tap-target flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-line bg-white px-3 text-[15px] has-checked:border-violet has-checked:bg-info-soft has-checked:font-medium has-checked:text-navy"
            >
              <input
                type="radio"
                value={option.value}
                {...form.register('tripType')}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Дата отправления" error={errors.departDate?.message}>
          {(props) => (
            <input type="date" className={inputClassName} {...props} {...form.register('departDate')} />
          )}
        </Field>

        {tripType === 'roundTrip' && (
          <Field label="Дата возвращения" error={errors.returnDate?.message}>
            {(props) => (
              <input type="date" className={inputClassName} {...props} {...form.register('returnDate')} />
            )}
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Взрослых" error={errors.adults?.message}>
          {(props) => (
            <input
              type="number"
              min={1}
              max={9}
              inputMode="numeric"
              className={inputClassName}
              {...props}
              {...form.register('adults', { valueAsNumber: true })}
            />
          )}
        </Field>

        <Field label="Детей" error={errors.childrenCount?.message}>
          {(props) => (
            <input
              type="number"
              min={0}
              max={9}
              inputMode="numeric"
              className={inputClassName}
              {...props}
              {...form.register('childrenCount', { valueAsNumber: true })}
            />
          )}
        </Field>

        <Field
          label="Бюджет на поездку, ₽"
          error={errors.budget?.message}
          hint="Учитываем как жёсткое ограничение"
        >
          {(props) => (
            <input
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              className={inputClassName}
              {...props}
              {...form.register('budget', { valueAsNumber: true })}
            />
          )}
        </Field>
      </div>

      {childrenCount > 0 && (
        <Field
          label="Возраст ребёнка"
          error={errors.childAge?.message}
          hint="Возраст влияет на доступные тарифы и требования к пересадкам"
        >
          {(props) => (
            <input
              type="number"
              min={0}
              max={17}
              inputMode="numeric"
              className={inputClassName}
              {...props}
              {...form.register('childAge', { valueAsNumber: true })}
            />
          )}
        </Field>
      )}

      <div className="rounded-[20px] border border-line bg-white/60">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="tap-target flex w-full items-center justify-between gap-2 px-4 text-left text-[15px] font-medium text-navy"
        >
          Что важно в поездке?
          <svg
            viewBox="0 0 20 20"
            className="size-4 shrink-0 transition-transform"
            style={{
              transform: advancedOpen ? 'rotate(180deg)' : 'none',
              transitionDuration: 'var(--duration-micro)',
            }}
            fill="none"
            aria-hidden="true"
          >
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
            <ConstraintChips form={form} />

            <Field
              label="Прибыть не позже (местное время)"
              error={errors.arriveBeforeLocalTime?.message}
              hint="Например, чтобы успеть на встречу или заселение"
            >
              {(props) => (
                <input
                  type="time"
                  className={inputClassName}
                  {...props}
                  {...form.register('arriveBeforeLocalTime')}
                />
              )}
            </Field>
          </div>
        )}
      </div>

      <Button type="submit" size="lg" loading={submitting} className="w-full sm:w-auto sm:self-start">
        Собрать маршрут
      </Button>

      {/* Сводка ошибок появляется только после попытки отправки: заранее показанный
          список претензий к незаполненной форме бесполезен. */}
      {form.formState.isSubmitted && Object.keys(errors).length > 0 && (
        <p role="alert" className="text-sm font-medium text-danger">
          Проверьте выделенные поля — запрос не отправлен.
        </p>
      )}
    </form>
  );
}
