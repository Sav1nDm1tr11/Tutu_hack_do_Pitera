import type { FreshnessState } from '../contracts/common';
import { parseWallClock } from './wall-clock';

/**
 * §14.3. TTL не угадывается приложением, если его вернул инвентарь: при наличии
 * `expiresAt` состояние считается по нему. Консервативный fallback применяется только
 * когда TTL не пришёл, и `fetchedAt` в этом случае обязателен к показу в UI.
 */
export interface FreshnessPolicy {
  /** До этого возраста данные считаются свежими. */
  readonly freshMs: number;
  /** После этого возраста данные считаются устаревшими. */
  readonly staleMs: number;
}

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  freshMs: 5 * 60_000,
  staleMs: 30 * 60_000,
};

export interface FreshnessInput {
  readonly fetchedAt: string;
  readonly expiresAt?: string | undefined;
  readonly now: string;
  readonly isOffline?: boolean | undefined;
  readonly policy?: FreshnessPolicy | undefined;
}

export function deriveFreshness(input: FreshnessInput): FreshnessState {
  if (input.isOffline === true) return 'offline';

  const policy = input.policy ?? DEFAULT_FRESHNESS_POLICY;
  const fetchedAt = parseWallClock(input.fetchedAt);
  const now = parseWallClock(input.now);

  // Невозможность определить возраст данных трактуется в пользу осторожности.
  if (fetchedAt === undefined || now === undefined) return 'stale';

  if (input.expiresAt !== undefined) {
    const expiresAt = parseWallClock(input.expiresAt);
    if (expiresAt !== undefined) {
      if (now.totalMinutes >= expiresAt.totalMinutes) return 'stale';
      const remainingMs = (expiresAt.totalMinutes - now.totalMinutes) * 60_000;
      return remainingMs <= policy.freshMs ? 'aging' : 'fresh';
    }
  }

  const ageMs = (now.totalMinutes - fetchedAt.totalMinutes) * 60_000;
  if (ageMs >= policy.staleMs) return 'stale';
  if (ageMs >= policy.freshMs) return 'aging';
  return 'fresh';
}

export function isCheckoutAllowedForFreshness(state: FreshnessState): boolean {
  return state === 'fresh' || state === 'aging';
}
