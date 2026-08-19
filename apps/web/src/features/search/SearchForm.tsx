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
  const form = useForm<SearchFormValues, unknown, SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: defaultFormValues(today()),
    mode: 'onBlur',
  });

  const { errors } = form.formState;
  const tripType = form.watch('tripType');
  const childrenCount = form.watch('childrenCount');
  const arriveBefore = form.watch('arriveBeforeLocalTime');

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => {
        onSubmit(toTravelRequest(values, `req_${crypto.randomUUID()}`));
      })}
      className="flex flex-col"
    >
      <div className="grid grid-cols-2 gap-2.5">
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

      <div className="mt-3 flex gap-1.5">
        {(
          [
            { value: 'roundTrip', label: 'Туда и обратно' },
            { value: 'oneWay', label: 'В одну сторону' },
          ] as const
        ).map((option) => (
          <label
            key={option.value}
            className="tap-target flex flex-1 cursor-pointer items-center justify-center rounded-[12px] border border-line px-3 text-[13.5px] font-medium has-checked:border-[var(--color-primary)] has-checked:bg-[var(--color-accent-soft)] has-checked:font-bold has-checked:text-[var(--color-accent)]"
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

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Field label="Туда" error={errors.departDate?.message}>
          {(props) => (
            <input type="date" className={inputClassName} {...props} {...form.register('departDate')} />
          )}
        </Field>

        {tripType === 'roundTrip' && (
          <Field label="Обратно" error={errors.returnDate?.message}>
            {(props) => (
              <input type="date" className={inputClassName} {...props} {...form.register('returnDate')} />
            )}
          </Field>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <Field label="Взрослых" error={errors.adults?.message}>
          {(props) => (
            <input
              type="number"
              min={1}
              max={9}
              inputMode="numeric"
              className={`${inputClassName} tabular`}
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
              className={`${inputClassName} tabular`}
              {...props}
              {...form.register('childrenCount', { valueAsNumber: true })}
            />
          )}
        </Field>

        <Field label="Бюджет, ₽" error={errors.budget?.message}>
          {(props) => (
            <input
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              className={`${inputClassName} tabular`}
              {...props}
              {...form.register('budget', { valueAsNumber: true })}
            />
          )}
        </Field>
      </div>

      {childrenCount > 0 && (
        <div className="mt-3">
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
        </div>
      )}

      <div className="mt-4">
        <ConstraintChips form={form} />
      </div>

      <div className="mt-3">
        <Field
          label="Прибыть не позже (местное время)"
          error={errors.arriveBeforeLocalTime?.message}
          hint={arriveBefore === '' ? 'Необязательно' : undefined}
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

      <Button type="submit" size="lg" loading={submitting} className="mt-[18px] w-full">
        Собрать устойчивый маршрут
      </Button>
      <p className="mt-2.5 text-[11.5px] leading-snug text-muted">
        Мы не бронируем и не принимаем оплату. Оформление — на официальной странице Туту.
      </p>

      {form.formState.isSubmitted && Object.keys(errors).length > 0 && (
        <p role="alert" className="mt-2 text-sm font-bold text-danger">
          Проверьте выделенные поля — запрос не отправлен.
        </p>
      )}
    </form>
  );
}
