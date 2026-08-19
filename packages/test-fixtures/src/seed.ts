/**
 * Детерминированный генератор псевдослучайных чисел.
 *
 * Демо обязано быть воспроизводимым: один и тот же запрос должен давать один и тот же
 * набор вариантов, иначе прогон на питче отличается от прогона в тестах.
 * Поэтому `Math.random` здесь не используется — seed выводится из самого запроса.
 */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface Rng {
  /** Число в [0, 1). */
  next(): number;
  /** Целое в [min, max]. */
  int(min: number, max: number): number;
  /** Множитель в [1 - spread, 1 + spread]. */
  jitter(spread: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: string | number): Rng {
  let state = (typeof seed === 'string' ? hashString(seed) : seed) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    jitter: (spread) => 1 + (next() * 2 - 1) * spread,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() из пустого списка');
      return items[Math.floor(next() * items.length)]!;
    },
  };
}
