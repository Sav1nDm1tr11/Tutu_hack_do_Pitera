import type { GroupedInventory, RoutePlan, ScoringContext } from '@tutu-plan-b/domain';

/**
 * Снимок, достаточный для пересчёта плана после замены варианта, без повторного
 * обращения к инвентарю (§13.3). Хранится на сервере и наружу не отдаётся.
 *
 * Вместе с инвентарём сохраняется и контекст нормализации оценок: пересчёт обязан идти
 * по тем же диапазонам, что и первичный расчёт, иначе замена одного этапа сдвинула бы
 * оценки остальных вариантов.
 */
export interface StoredPlan {
  readonly plan: RoutePlan;
  readonly grouped: GroupedInventory;
  readonly context: ScoringContext;
  readonly expiresAtMs: number;
}

export interface PlanRepository {
  save(plan: RoutePlan, grouped: GroupedInventory, context: ScoringContext): void;
  get(planId: string): StoredPlan | undefined;
  replace(plan: RoutePlan): StoredPlan | undefined;
  delete(planId: string): void;
  size(): number;
}

/**
 * TTL-хранилище в памяти. Для MVP этого достаточно (§2.2), но у выбора есть цена:
 * перезапуск процесса теряет все планы, поэтому клиент обязан уметь пережить
 * `PLAN_NOT_FOUND` и предложить повторный поиск, а не показать пустой экран.
 */
export class InMemoryPlanRepository implements PlanRepository {
  private readonly plans = new Map<string, StoredPlan>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number,
    /** Ограничение размера: без него долгий процесс превращается в утечку памяти. */
    private readonly maxEntries = 500,
  ) {}

  save(plan: RoutePlan, grouped: GroupedInventory, context: ScoringContext): void {
    this.evictExpired();

    if (this.plans.size >= this.maxEntries) {
      const oldest = this.plans.keys().next();
      if (!oldest.done) this.plans.delete(oldest.value);
    }

    this.plans.set(plan.id, { plan, grouped, context, expiresAtMs: this.now() + this.ttlMs });
  }

  get(planId: string): StoredPlan | undefined {
    const stored = this.plans.get(planId);
    if (stored === undefined) return undefined;

    if (stored.expiresAtMs <= this.now()) {
      this.plans.delete(planId);
      return undefined;
    }

    return stored;
  }

  /** Сохраняет новую ревизию плана, не теряя снимок инвентаря. */
  replace(plan: RoutePlan): StoredPlan | undefined {
    const existing = this.get(plan.id);
    if (existing === undefined) return undefined;

    const updated: StoredPlan = { ...existing, plan };
    this.plans.set(plan.id, updated);
    return updated;
  }

  delete(planId: string): void {
    this.plans.delete(planId);
  }

  size(): number {
    this.evictExpired();
    return this.plans.size;
  }

  private evictExpired(): void {
    const nowMs = this.now();
    for (const [planId, stored] of this.plans) {
      if (stored.expiresAtMs <= nowMs) this.plans.delete(planId);
    }
  }
}
