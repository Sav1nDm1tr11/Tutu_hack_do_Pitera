import { z } from 'zod';

/**
 * Конфигурация валидируется схемой при старте (§16.1): сервер, поднявшийся с
 * неправильным `INVENTORY_MODE` или бюджетом вызовов, ведёт себя непредсказуемо
 * именно в тот момент, когда это дороже всего.
 *
 * Секретов с префиксом `VITE_` здесь нет и быть не может: всё с этим префиксом
 * попадает в браузерный bundle.
 */
const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveInt(3001),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  INVENTORY_MODE: z.enum(['fixture', 'live', 'auto']).default('fixture'),
  TUTU_MCP_URL: z.string().url().default('https://mcp.tutu.ru/mcp'),
  TUTU_MCP_AUTH_TOKEN: z.string().min(1).optional(),
  /** Демо-сценарий инвентаря. Полезен для показа деградаций без правки кода. */
  FIXTURE_SCENARIO: z.string().default('default'),

  /**
   * Ключ OpenAI-совместимого провайдера. OpenRouter принимается так же, как OpenAI:
   * SDK тот же, меняется только `LLM_BASE_URL`. `OPENAI_API_KEY` оставлен синонимом,
   * чтобы старые `.env` не ломались.
   */
  LLM_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  LLM_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  /**
   * Бесплатная модель по умолчанию — самая крупная `:free` chat-модель в каталоге
   * OpenRouter на момент настройки (Nemotron 3 Ultra 550B). Это не OpenAI:
   * для проверки функционала достаточно любой мощной бесплатной модели.
   */
  LLM_MODEL: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  LLM_MODE: z.enum(['auto', 'off', 'required']).default('auto'),

  MAX_AGENT_STEPS: positiveInt(6),
  MAX_LLM_CALLS_PER_PLAN: positiveInt(2),
  MAX_MCP_TOOL_CALLS_PER_PLAN: positiveInt(10),
  MCP_CALL_TIMEOUT_MS: positiveInt(8_000),
  PLAN_TOTAL_TIMEOUT_MS: positiveInt(30_000),
  MAX_SCHEMA_REPAIR_ATTEMPTS: z.coerce.number().int().min(0).max(3).default(1),
  MAX_FALLBACK_STAGES: positiveInt(2),
  MAX_FALLBACK_OPTIONS_PER_STAGE: positiveInt(2),

  PLAN_TTL_MS: positiveInt(86_400_000),
  RATE_LIMIT_MAX: positiveInt(30),
  RATE_LIMIT_WINDOW_MS: positiveInt(60_000),

  /** Каталог собранного web-приложения. Пустая строка отключает раздачу статики. */
  WEB_DIST_DIR: z.string().default('../web/dist'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
  }

  return parsed.data;
}

const DEFAULT_FREE_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

export function resolveLlmApiKey(env: Env): string | undefined {
  return env.LLM_API_KEY ?? env.OPENAI_API_KEY;
}

export function resolveLlmModel(env: Env): string {
  return env.LLM_MODEL ?? env.OPENAI_MODEL ?? DEFAULT_FREE_MODEL;
}

/**
 * LLM включается только если для этого есть и разрешение, и ключ. Режим `required`
 * существует, чтобы в проверочных прогонах молчаливый откат на детерминированный
 * планировщик не выглядел как успешная работа модели.
 */
export function resolveLlmMode(env: Env): 'llm' | 'deterministic' {
  if (env.LLM_MODE === 'off') return 'deterministic';
  if (resolveLlmApiKey(env) === undefined) {
    if (env.LLM_MODE === 'required') {
      throw new Error('LLM_MODE=required, но LLM_API_KEY / OPENAI_API_KEY не задан');
    }
    return 'deterministic';
  }
  return 'llm';
}
