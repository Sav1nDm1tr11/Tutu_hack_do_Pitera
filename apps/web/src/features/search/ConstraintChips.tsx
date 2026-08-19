import type { UseFormReturn } from 'react-hook-form';
import { cn } from '../../lib/cn';
import type { SearchFormValues } from './search-form-schema';

type BooleanConstraint = 'noNightSegments' | 'maxOneTransfer' | 'extraTransferBuffer';

const TOGGLES: readonly { name: BooleanConstraint; label: string; hint: string }[] = [
  {
    name: 'noNightSegments',
    label: 'Без ночных сегментов',
    hint: 'Исключаем поездки, попадающие в ночные часы',
  },
  {
    name: 'maxOneTransfer',
    label: 'Не больше одной пересадки',
    hint: 'Жёсткое ограничение: варианты с двумя и более пересадками не показываем',
  },
  {
    name: 'extraTransferBuffer',
    label: 'Больше времени на пересадку',
    hint: 'Увеличенный минимальный буфер между сегментами',
  },
];

const PRESETS: readonly { value: SearchFormValues['preset']; label: string }[] = [
  { value: 'balanced', label: 'Сбалансированно' },
  { value: 'price', label: 'Приоритет низкой цены' },
  { value: 'comfort', label: 'Приоритет комфорта' },
];

/**
 * Чипы ограничений и приоритета (§6.2).
 *
 * Реализованы как настоящие checkbox и radio, а не как `div` с обработчиком клика:
 * состояние «включено» должно читаться скринридером и переключаться с клавиатуры без
 * дополнительного кода (§19). Визуальная форма чипа — только оформление.
 */
export function ConstraintChips({
  form,
}: {
  readonly form: UseFormReturn<SearchFormValues, unknown, SearchFormValues>;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Жёсткие ограничения</legend>
        <div className="flex flex-wrap gap-2">
          {TOGGLES.map((toggle) => (
            <label key={toggle.name} title={toggle.hint} className={chipClassName}>
              <input type="checkbox" {...form.register(toggle.name)} className="sr-only" />
              <CheckMark />
              {toggle.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Что важнее</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <label key={preset.value} className={chipClassName}>
              <input
                type="radio"
                value={preset.value}
                {...form.register('preset')}
                className="sr-only"
              />
              <CheckMark />
              {preset.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

const chipClassName = cn(
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3.5 text-sm text-ink',
  'has-checked:border-violet has-checked:bg-info-soft has-checked:font-medium has-checked:text-navy',
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-violet',
);

/** Галочка появляется только у выбранного чипа: цвет не единственный признак (§19). */
function CheckMark(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className="hidden size-3.5 shrink-0 text-violet peer-checked:block in-has-checked:block"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5l3.2 3.2L13 4.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
