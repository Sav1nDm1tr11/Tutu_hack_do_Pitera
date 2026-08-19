import type { Env } from '../config/env';

/**
 * Бюджеты агента из §11.5. Они существуют не для экономии, а как условие
 * предсказуемости: без явных границ цикл «поищу ещё вариант» не имеет конца,
 * а пользователь ждёт неопределённое время.
 */
export interface AgentBudgets {
  readonly maxSteps: number;
  readonly maxLlmCalls: number;
  readonly maxToolCalls: number;
  readonly toolCallTimeoutMs: number;
  readonly totalTimeoutMs: number;
  readonly maxSchemaRepairAttempts: number;
  readonly maxFallbackStages: number;
  readonly maxFallbackOptionsPerStage: number;
}

export function budgetsFromEnv(env: Env): AgentBudgets {
  return {
    maxSteps: env.MAX_AGENT_STEPS,
    maxLlmCalls: env.MAX_LLM_CALLS_PER_PLAN,
    maxToolCalls: env.MAX_MCP_TOOL_CALLS_PER_PLAN,
    toolCallTimeoutMs: env.MCP_CALL_TIMEOUT_MS,
    totalTimeoutMs: env.PLAN_TOTAL_TIMEOUT_MS,
    maxSchemaRepairAttempts: env.MAX_SCHEMA_REPAIR_ATTEMPTS,
    maxFallbackStages: env.MAX_FALLBACK_STAGES,
    maxFallbackOptionsPerStage: env.MAX_FALLBACK_OPTIONS_PER_STAGE,
  };
}

export class BudgetExceededError extends Error {
  constructor(readonly kind: 'steps' | 'llmCalls' | 'toolCalls' | 'deadline') {
    super(`Бюджет исчерпан: ${kind}`);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Счётчик бюджета на один план. Намеренно мутабельный и короткоживущий:
 * один экземпляр обслуживает ровно один запрос.
 */
export class BudgetTracker {
  private steps = 0;
  private llmCalls = 0;
  private toolCalls = 0;
  private readonly deadlineMs: number;

  constructor(
    private readonly budgets: AgentBudgets,
    private readonly nowMs: () => number,
  ) {
    this.deadlineMs = nowMs() + budgets.totalTimeoutMs;
  }

  get remainingMs(): number {
    return Math.max(0, this.deadlineMs - this.nowMs());
  }

  get usage(): { steps: number; llmCalls: number; toolCalls: number } {
    return { steps: this.steps, llmCalls: this.llmCalls, toolCalls: this.toolCalls };
  }

  /** Проверка перед началом фазы: лучше остановиться до вызова, чем посреди него. */
  assertDeadline(): void {
    if (this.remainingMs <= 0) throw new BudgetExceededError('deadline');
  }

  consumeStep(): void {
    this.assertDeadline();
    this.steps += 1;
    if (this.steps > this.budgets.maxSteps) throw new BudgetExceededError('steps');
  }

  /** Возвращает `false` вместо исключения: исчерпанный бюджет LLM — не отказ, а деградация. */
  tryConsumeLlmCall(): boolean {
    if (this.llmCalls >= this.budgets.maxLlmCalls) return false;
    this.llmCalls += 1;
    return true;
  }

  tryConsumeToolCalls(count: number): boolean {
    if (this.toolCalls + count > this.budgets.maxToolCalls) return false;
    this.toolCalls += count;
    return true;
  }

  /** Таймаут отдельного вызова не может превышать остаток общего дедлайна. */
  callTimeoutMs(): number {
    return Math.min(this.budgets.toolCallTimeoutMs, Math.max(1, this.remainingMs));
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Таймаут ${timeoutMs} мс: ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
