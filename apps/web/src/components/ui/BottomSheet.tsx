import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface BottomSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly children: ReactNode;
  readonly footer?: ReactNode | undefined;
}

/**
 * Детали этапа на мобильном (§6.3).
 *
 * Radix Dialog взят не ради разметки, а ради поведения: ловушка фокуса, возврат фокуса
 * на триггер при закрытии, Escape и корректные aria-связи — всё это §19 требует, и
 * писать это руками означало бы воспроизводить давно решённую задачу с ошибками.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: BottomSheetProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-[#15133f]/45 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-hidden',
            'flex flex-col rounded-t-[28px] bg-card',
            'sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[420px] sm:rounded-[24px]',
          )}
          style={{ boxShadow: 'var(--shadow-sheet)' }}
        >
          <header className="flex items-start gap-3 border-b border-line px-5 pt-4 pb-3">
            {/* Визуальная «ручка» листа: декоративная, скрыта от скринридера. */}
            <span
              aria-hidden="true"
              className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line sm:hidden"
            />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
              {description !== undefined && (
                <Dialog.Description className="mt-0.5 text-sm text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="tap-target -mt-1 -mr-2 grid place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
              aria-label="Закрыть"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>

          {footer !== undefined && (
            <footer className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
