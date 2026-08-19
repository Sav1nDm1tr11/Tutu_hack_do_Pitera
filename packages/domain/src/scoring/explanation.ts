import type { ExplanationBlock, PlanTotals } from '../contracts/plan';
import type { ScoreBreakdown, ScoreReason } from '../contracts/score';
import type { Preset } from '../contracts/travel-request';
import { FALLBACK_CAVEAT } from '../contracts/fallback';

/**
 * Объяснению нужны только посчитанные факты, а не вся сборка маршрута.
 * Узкий вход — не косметика: он делает невозможным построение текста по данным,
 * которых нет в `ScoreBreakdown`, а значит и появление в объяснении утверждения,
 * не подкреплённого расчётом.
 */
export interface ExplainableConfiguration {
  readonly score: ScoreBreakdown;
  readonly totals: PlanTotals;
}

const HEADLINES: Record<Preset, string> = {
  reliable: 'Больше запаса времени и готовых замен',
  balanced: 'Компромисс между ценой, временем и устойчивостью',
  budget: 'Минимальная цена при соблюдении ваших ограничений',
};

const SEVERITY_ORDER: Record<ScoreReason['severity'], number> = {
  critical: 0,
  warning: 1,
  positive: 2,
  neutral: 3,
};

/**
 * Детерминированное объяснение по уже посчитанным фактам.
 *
 * Это не «заглушка на случай отсутствия LLM», а основная реализация: она обязана быть
 * достаточной для демо без модели (§17). LLM-версия лишь переписывает те же самые
 * `reasonCode`, не добавляя новых утверждений.
 */
export function buildTemplateExplanation(
  preset: Preset,
  scored: ExplainableConfiguration,
): ExplanationBlock {
  const reasons = scored.score.dimensions.flatMap((dimension) => dimension.reasons);

  const ranked = [...dedupeByCode(reasons)].sort((left, right) => {
    const delta = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (delta !== 0) return delta;
    return left.code.localeCompare(right.code);
  });

  return {
    headline: HEADLINES[preset],
    bullets: ranked.slice(0, 5).map((reason) => ({
      reasonCode: reason.code,
      text: reason.message,
    })),
    caveats: buildCaveats(scored),
    generatedBy: 'template',
  };
}

function dedupeByCode(reasons: readonly ScoreReason[]): ScoreReason[] {
  const seen = new Map<string, ScoreReason>();
  for (const reason of reasons) {
    if (!seen.has(reason.code)) seen.set(reason.code, reason);
  }
  return [...seen.values()];
}

/**
 * Оговорки обязательны при неполных данных (инвариант eval, §22.3): пользователь должен
 * видеть, что часть оценки построена на неизвестном, а не считать её полной.
 */
function buildCaveats(scored: ExplainableConfiguration): string[] {
  const caveats: string[] = [];

  if (scored.score.needsVerification) {
    caveats.push(
      'Часть ваших ограничений не удалось проверить по данным инвентаря — уточните детали перед оформлением.',
    );
  }

  if (scored.score.confidence < 0.75) {
    caveats.push(
      `Оценка построена на неполных данных: покрытие сигналов ${Math.round(scored.score.confidence * 100)}%.`,
    );
  }

  if (scored.totals.priceCompleteness < 1) {
    caveats.push('Итоговая цена показана не по всем этапам маршрута.');
  }

  caveats.push(FALLBACK_CAVEAT);

  return caveats.slice(0, 4);
}
