import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] shadow-[var(--shadow-cta)]',
  secondary:
    'bg-[var(--color-surface)] text-ink border border-line hover:bg-[var(--color-accent-soft)]',
  ghost: 'bg-transparent text-ink border border-line hover:bg-[var(--color-accent-soft)]',
  danger: 'bg-[#DC2626] text-white hover:bg-[#b91c1c]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[12.5px] rounded-[10px]',
  md: 'h-11 px-4 text-[13.5px] rounded-[12px]',
  lg: 'h-[52px] px-6 text-base rounded-[14px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly icon?: ReactNode;
  readonly loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading = false, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-bold transition-colors',
        'disabled:cursor-not-allowed disabled:bg-[var(--color-track)] disabled:text-muted disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      style={{ transitionDuration: 'var(--duration-micro)' }}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

function Spinner(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
