import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-[#1a1889] active:bg-[#0d0c55]',
  secondary: 'bg-white text-navy border border-line hover:bg-surface',
  ghost: 'bg-transparent text-navy hover:bg-info-soft',
  danger: 'bg-danger text-white hover:bg-[#a92f3d]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-[12px]',
  md: 'h-11 px-4 text-[15px] rounded-[14px]',
  lg: 'h-13 px-6 text-base rounded-[16px]',
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
      // aria-busy, а не подмена текста на «Загрузка…»: скринридер сообщит о состоянии,
      // а зрячий пользователь не потеряет подпись кнопки.
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
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
