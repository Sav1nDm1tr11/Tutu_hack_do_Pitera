import { useEffect, useId, useRef, useState } from 'react';
import type { PlaceRef } from '@tutu-plan-b/domain';
import { fetchPlaces } from '../../lib/api-client';
import { cn } from '../../lib/cn';

export interface PlacePickerProps {
  readonly label: string;
  readonly value: PlaceRef | undefined;
  readonly onChange: (place: PlaceRef | undefined) => void;
  readonly error?: string | undefined;
  readonly placeholder?: string;
}

/**
 * Combobox выбора города.
 *
 * Собран вручную по паттерну ARIA 1.2, а не на готовом компоненте, по одной причине:
 * ключевое требование здесь — «свободная строка не является идентификатором места»
 * (§8.1). Значение существует только после выбора из списка, и любое изменение текста
 * сбрасывает его. Готовые autocomplete обычно допускают обратное.
 */
export function PlacePicker({
  label,
  value,
  onChange,
  error,
  placeholder,
}: PlacePickerProps): React.JSX.Element {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const errorId = `${inputId}-error`;

  const [query, setQuery] = useState(value?.name ?? '');
  const [options, setOptions] = useState<readonly PlaceRef[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value?.name ?? '');
  }, [value]);

  useEffect(() => {
    if (query.trim().length < 2 || value?.name === query) {
      setOptions([]);
      return;
    }

    // Debounce + AbortController: без них каждое нажатие клавиши создаёт запрос,
    // а ответы приходят вперемешку и подставляют устаревшие подсказки.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchPlaces(query, controller.signal)
        .then((places) => {
          setOptions(places);
          setActiveIndex(places.length > 0 ? 0 : -1);
          setOpen(places.length > 0);
        })
        .catch(() => {
          setOptions([]);
        });
    }, 220);

    return (): void => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, value?.name]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      if (containerRef.current?.contains(event.target as Node) === false) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return (): void => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  function commit(place: PlaceRef): void {
    onChange(place);
    setQuery(place.name);
    setOpen(false);
    setOptions([]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      setOpen(true);
      setActiveIndex((current) => {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        return (current + delta + options.length) % options.length;
      });
      return;
    }

    if (event.key === 'Enter' && open) {
      const active = options[activeIndex];
      if (active !== undefined) {
        event.preventDefault();
        commit(active);
      }
      return;
    }

    if (event.key === 'Escape') setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <label htmlFor={inputId} className="text-xs font-bold text-muted">
        {label}
      </label>

      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          aria-invalid={error !== undefined ? true : undefined}
          aria-describedby={error !== undefined ? errorId : undefined}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            // Текст изменился — прежний выбор больше не соответствует введённому.
            if (value !== undefined) onChange(undefined);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'h-11 w-full min-w-0 rounded-[12px] border bg-[var(--color-input)] px-3 pr-9 text-[15px] font-semibold text-ink',
            'placeholder:text-muted/70',
            error === undefined ? 'border-line' : 'border-[var(--color-danger-ink)] bg-danger-soft',
          )}
        />

        {value !== undefined && (
          <span
            aria-hidden="true"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-success"
            title="Город выбран"
          >
            <svg viewBox="0 0 20 20" className="size-4.5" fill="none">
              <path
                d="M4 10.5l4 4 8-9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}

        <ul
          id={listId}
          role="listbox"
          aria-label={`Подсказки: ${label}`}
          hidden={!open}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-[14px] border border-line bg-[var(--color-surface)] py-1"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          {options.map((place, index) => (
            <li
              key={place.id}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // onMouseDown вместо onClick: click сработал бы после blur, и список
              // успел бы закрыться до выбора.
              onMouseDown={(event) => {
                event.preventDefault();
                commit(place);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'cursor-pointer px-3 py-2.5 text-[15px]',
                index === activeIndex
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'text-ink',
              )}
            >
              {place.name}
            </li>
          ))}
        </ul>
      </div>

      {error !== undefined && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
