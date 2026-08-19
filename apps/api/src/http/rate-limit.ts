/**
 * Скользящее окно на память процесса.
 *
 * Полноценный лимитер здесь не нужен, но какой-то нужен обязательно: `/api/plan` тянет
 * за собой вызовы инвентаря и модели, поэтому незащищённый эндпоинт превращается в
 * усилитель нагрузки и расхода бюджета (§15.4).
 */
export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly nowMs: () => number,
  ) {}

  check(key: string): RateLimitDecision {
    const now = this.nowMs();
    const threshold = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > threshold);

    if (recent.length >= this.max) {
      const oldest = recent[0] ?? now;
      this.hits.set(key, recent);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
      };
    }

    recent.push(now);
    this.hits.set(key, recent);

    // Периодическая уборка: без неё карта растёт по числу уникальных клиентов.
    if (this.hits.size > 1_000) this.evictStale(threshold);

    return { allowed: true, retryAfterSeconds: 0 };
  }

  private evictStale(threshold: number): void {
    for (const [key, timestamps] of this.hits) {
      const alive = timestamps.filter((timestamp) => timestamp > threshold);
      if (alive.length === 0) this.hits.delete(key);
      else this.hits.set(key, alive);
    }
  }
}
