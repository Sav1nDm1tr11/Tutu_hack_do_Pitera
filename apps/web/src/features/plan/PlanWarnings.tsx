import type { PlanWarning } from '@tutu-plan-b/domain';
import { cn } from '../../lib/cn';

const SEVERITY_STYLES: Record<PlanWarning['severity'], string> = {
  info: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  warning: 'bg-warning-soft text-warning',
  critical: 'bg-danger-soft text-danger',
};

const SEVERITY_ORDER: Record<PlanWarning['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Предупреждения плана.
 *
 * Показываются все и всегда, а не только критические: «демо-данные» и «часть цен
 * неизвестна» — это не служебные подробности, а условия, при которых пользователь
 * принимает решение о покупке (§5.4, §11.1).
 */
export function PlanWarnings({
  warnings,
}: {
  readonly warnings: readonly PlanWarning[];
}): React.JSX.Element | null {
  if (warnings.length === 0) return null;

  const sorted = [...warnings].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((warning) => (
        <li
          key={`${warning.code}:${warning.message}`}
          className={cn(
            'flex items-start gap-2 rounded-[16px] px-3 py-2.5 text-sm',
            SEVERITY_STYLES[warning.severity],
          )}
        >
          <Icon severity={warning.severity} />
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}

function Icon({ severity }: { readonly severity: PlanWarning['severity'] }): React.JSX.Element {
  if (severity === 'info') {
    return (
      <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7.2v4M8 4.9h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0" fill="none" aria-hidden="true">
      <path d="M8 2.2l6.2 11.4H1.8L8 2.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.4v3.1M8 11.7h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
