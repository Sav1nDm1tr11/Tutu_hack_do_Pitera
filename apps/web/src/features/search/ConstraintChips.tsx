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
    label: 'Запас на пересадку',
    hint: 'Увеличенный минимальный буфер между сегментами',
  },
];

const PRESETS: readonly { value: SearchFormValues['preset']; label: string }[] = [
  { value: 'price', label: 'Дешевле' },
  { value: 'balanced', label: 'Баланс' },
  { value: 'reliable', label: 'Надёжнее' },
];

export function ConstraintChips({
  form,
}: {
  readonly form: UseFormReturn<SearchFormValues, unknown, SearchFormValues>;
}): React.JSX.Element {
  const preset = form.watch('preset');

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-xs font-bold text-muted">Ограничения</legend>
        <div className="flex flex-wrap gap-1.5">
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
        <legend className="mb-2 text-xs font-bold text-muted">Что важнее</legend>
        <div className="priority-track" role="radiogroup" aria-label="Приоритет поиска">
          {PRESETS.map((item) => {
            const active = preset === item.value;
            return (
              <label
                key={item.value}
                className={cn(
                  'flex min-h-[42px] flex-1 cursor-pointer items-center justify-center rounded-[11px] text-[13.5px]',
                  active ? 'bg-[var(--color-surface)] font-extrabold text-[var(--color-accent)] shadow-[0_2px_8px_rgba(76,29,149,.14)]' : 'font-semibold text-muted',
                )}
              >
                <input
                  type="radio"
                  value={item.value}
                  {...form.register('preset')}
                  className="sr-only"
                />
                {item.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

const chipClassName = cn(
  'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] text-ink',
  'border-line bg-transparent font-medium',
  'has-checked:border-[var(--color-primary)] has-checked:bg-[var(--color-accent-soft)] has-checked:font-bold has-checked:text-[var(--color-accent)]',
);

function CheckMark(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className="hidden size-3 shrink-0 text-[var(--color-accent)] in-has-checked:block"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5l3.2 3.2L13 4.8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
