import type { DimensionKey, ScoreDimension, ScoreSignal } from '../contracts/score';

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Считает одну размерность как взвешенное среднее ТОЛЬКО доступных сигналов.
 * Отсутствующий сигнал не получает среднее значение и не считается положительным —
 * он лишь уменьшает `availableWeight`, то есть confidence итогового score (§9.2).
 */
export function scoreDimension(
  key: DimensionKey,
  signals: readonly ScoreSignal[],
  configuredWeight: number,
): ScoreDimension {
  const available = signals.filter((signal) => signal.value !== undefined);
  const availableWeight = available.reduce((sum, signal) => sum + signal.weight, 0);
  const requiredSignalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);

  const reasons = signals.flatMap((signal) => [...signal.reasons]);

  if (availableWeight === 0) {
    return {
      key,
      score: 0,
      weight: configuredWeight,
      availableWeight: 0,
      requiredSignalWeight,
      reasons,
    };
  }

  const weighted = available.reduce(
    (sum, signal) => sum + clamp01(signal.value!) * signal.weight,
    0,
  );

  return {
    key,
    score: clamp01(weighted / availableWeight),
    weight: configuredWeight,
    availableWeight,
    requiredSignalWeight,
    reasons,
  };
}

/**
 * Итог по размерностям: размерность без доступных сигналов не участвует в среднем
 * и не подтягивает результат ни вверх, ни вниз — она только снижает confidence.
 */
export function aggregateDimensions(dimensions: readonly ScoreDimension[]): {
  total: number;
  confidence: number;
} {
  const configuredWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const contributing = dimensions.filter((dimension) => dimension.availableWeight > 0);
  const contributingWeight = contributing.reduce((sum, dimension) => sum + dimension.weight, 0);

  if (contributingWeight === 0 || configuredWeight === 0) {
    return { total: 0, confidence: 0 };
  }

  const weighted = contributing.reduce(
    (sum, dimension) => sum + dimension.score * dimension.weight,
    0,
  );

  // Confidence взвешивает покрытие сигналов внутри размерности её собственным весом:
  // пробел в размерности с весом 50 бьёт по уверенности сильнее, чем в размерности с весом 10.
  const coverage = dimensions.reduce(
    (sum, dimension) => sum + signalCoverage(dimension) * dimension.weight,
    0,
  );

  return {
    total: Math.round((weighted / contributingWeight) * 1000) / 10,
    confidence: Math.round(clamp01(coverage / configuredWeight) * 1000) / 1000,
  };
}

/** `available signal weight / configured signal weight` (§9.2). */
function signalCoverage(dimension: ScoreDimension): number {
  if (dimension.requiredSignalWeight <= 0) return 0;
  return clamp01(dimension.availableWeight / dimension.requiredSignalWeight);
}
