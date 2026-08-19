import { cn } from '../../lib/cn';

export type TransportIconMode = 'flight' | 'train' | 'bus' | 'suburbanTrain' | 'hotel';

export interface TransportIconProps {
  readonly mode: TransportIconMode;
  readonly className?: string;
}

export function TransportIcon({ mode, className }: TransportIconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-5 shrink-0', className)}
      fill="none"
      aria-hidden="true"
    >
      {mode === 'flight' && (
        <path
          d="M21 16.1 13.7 13l-3.1 7-2.1-.9.9-7.8-5.8-3.2-1.9 1.8-1.2-.5 1.2-3.7 3.6-.9.5 1.2-1.1 2.4 6.3 2 4-6.8c.7-1.1 2-1.7 3.3-1.4l.5.1-4 9.1 6.8 3.8-.6 1.9Z"
          fill="currentColor"
        />
      )}
      {mode === 'train' && (
        <>
          <rect
            x="5"
            y="2.5"
            width="14"
            height="15"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8 6h8v4H8zM8 20l2-2.5M16 20l-2-2.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="9" cy="14" r="1" fill="currentColor" />
          <circle cx="15" cy="14" r="1" fill="currentColor" />
        </>
      )}
      {mode === 'suburbanTrain' && (
        <>
          <path
            d="M6 17V6.5A3.5 3.5 0 0 1 9.5 3h5A3.5 3.5 0 0 1 18 6.5V17"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M6 10h12M8 21l2-4M16 21l-2-4M9 6.5h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="9" cy="14" r="1" fill="currentColor" />
          <circle cx="15" cy="14" r="1" fill="currentColor" />
        </>
      )}
      {mode === 'bus' && (
        <>
          <rect x="4" y="3" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M7 6h10v6H7zM7 22v-3M17 22v-3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="8" cy="15.5" r="1" fill="currentColor" />
          <circle cx="16" cy="15.5" r="1" fill="currentColor" />
        </>
      )}
      {mode === 'hotel' && (
        <>
          <path
            d="M5 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M3 21h18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M8 7h2v2H8zM14 7h2v2h-2zM8 12h2v2H8zM14 12h2v2h-2zM10 21v-4h4v4"
            fill="currentColor"
          />
        </>
      )}
    </svg>
  );
}
