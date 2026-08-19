import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Подписка на системную настройку, а не однократное чтение: пользователь может включить
 * её во время сессии, и §19 требует, чтобы движение действительно прекратилось.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };

    media.addEventListener('change', onChange);
    return (): void => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  return reduced;
}
