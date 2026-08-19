export function BrandMark({ compact = false }: { readonly compact?: boolean }): React.JSX.Element {
  return (
    <span className="brand-lockup" aria-label="Туту План Б">
      <svg viewBox="0 0 44 44" className="brand-symbol" fill="none" aria-hidden="true">
        <path
          d="M8 26.5c4.3-8.8 12-14 23.5-15.5"
          stroke="currentColor"
          strokeWidth="5.2"
          strokeLinecap="round"
        />
        <path
          d="m26.5 7.5 6.7 2.7-3 6.5"
          stroke="currentColor"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="29" r="5.2" fill="var(--color-brand-coral)" />
        <path d="M10 36v4M5.5 40h9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className="brand-copy">
          <strong>Туту</strong>
          <span>План Б</span>
        </span>
      )}
    </span>
  );
}
