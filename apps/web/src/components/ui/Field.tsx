import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface FieldProps {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
  }) => ReactNode;
}

/**
 * Обёртка поля формы.
 *
 * Связывает label, подсказку и ошибку через id: без `aria-describedby` сообщение об
 * ошибке видно глазами, но не доходит до скринридера, и форма становится непроходимой
 * без зрения (§19).
 */
export function Field({ label, error, hint, children }: FieldProps): React.JSX.Element {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error !== undefined ? errorId : undefined, hint !== undefined ? hintId : undefined]
    .filter((value): value is string => value !== undefined)
    .join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-muted">
        {label}
      </label>

      {children({
        id,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-invalid': error !== undefined ? true : undefined,
      })}

      {hint !== undefined && error === undefined && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}

      {error !== undefined && (
        <p id={errorId} className="flex items-center gap-1.5 text-xs font-bold text-danger">
          <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M8 4.5v4.2M8 11.2h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClassName = cn(
  'h-11 w-full min-w-0 rounded-[12px] border border-line bg-[var(--color-input)] px-3 text-[15px] font-semibold text-ink',
  'placeholder:text-muted/70',
  'aria-[invalid=true]:border-[var(--color-danger-ink)] aria-[invalid=true]:bg-danger-soft',
);

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;
