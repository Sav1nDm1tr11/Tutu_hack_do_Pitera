import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface text-muted border-line',
  info: 'bg-info-soft text-navy border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
};

export interface BadgeProps {
  readonly tone?: BadgeTone;
  /**
   * Иконка обязательна для статусных тонов: цвет не может быть единственным носителем
   * информации о риске (§19). Поэтому это не украшение, а часть контракта компонента.
   */
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
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
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
