import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-track)] text-muted',
  info: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly title?: string;
}

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
  title,
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold',
        TONE_CLASSES[tone],
        className,
      )}
      {...(title === undefined ? {} : { title })}
    >
      {icon !== undefined && (
        <span aria-hidden="true" className="grid shrink-0 place-items-center">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}
