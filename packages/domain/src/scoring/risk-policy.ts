import type { DimensionKey } from '../contracts/score';
import type { MinimumTransferPolicy, Preset } from '../contracts/travel-request';
import type { TransportMode } from '../contracts/common';
import type { NightWindow } from '../time/wall-clock';

/**
 * Единственное место, где живут продуктовые пороги и веса. В UI их быть не должно (§9.3):
 * иначе одно и то же понятие «устойчивости» разъезжается между экраном и расчётом.
 *
 * Всё в этом файле — продуктовая эвристика, а не гарантия. Версия участвует в логах,
 * чтобы результат прошлого прогона можно было объяснить.
 */
export const RISK_POLICY_VERSION = '2026-08-19.1';

export const PRESET_WEIGHTS: Record<Preset, Record<DimensionKey, number>> = {
  reliable: { price: 15, duration: 20, resilience: 50, comfort: 15 },
  balanced: { price: 30, duration: 25, resilience: 30, comfort: 15 },
  budget: { price: 60, duration: 20, resilience: 10, comfort: 10 },
};

export const PRESET_LABELS: Record<Preset, string> = {
  reliable: 'Надёжный',
  balanced: 'Сбалансированный',
  budget: 'Бюджетный',
};

/** Ночной интервал пользователя. 23:00 → 06:00 следующих суток. */
export const NIGHT_WINDOW: NightWindow = {
  startMinuteOfDay: 23 * 60,
  endMinuteOfDay: 6 * 60,
};

export interface TransferBufferPolicy {
  readonly sameStationMinutes: number;
  readonly differentStationMinutes: number;
  /** Применяется, когда определить смену точки невозможно: осторожная оценка. */
  readonly unknownMinutes: number;
}

/**
 * Минимальные буферы пересадки — продуктовая эвристика, не гарантия перевозчика (§9.4).
 * Поэтому UI обязан показывать их с пояснением, а не как правило ТуТу.
 */
export const TRANSFER_BUFFERS: Record<MinimumTransferPolicy, TransferBufferPolicy> = {
  standard: { sameStationMinutes: 40, differentStationMinutes: 120, unknownMinutes: 120 },
  extra: { sameStationMinutes: 90, differentStationMinutes: 210, unknownMinutes: 210 },
};

/** Комфорт по виду транспорта. Эвристика, одинаковая для всех пользователей MVP. */
export const MODE_COMFORT: Record<TransportMode, number> = {
  flight: 0.8,
  train: 0.75,
  bus: 0.4,
  suburbanTrain: 0.3,
};

export const MODE_LABELS: Record<TransportMode, string> = {
  flight: 'Самолёт',
  train: 'Поезд',
  bus: 'Автобус',
  suburbanTrain: 'Электричка',
};

/** Stage с resilience ниже этого порога становится кандидатом на «План Б» (§10.2). */
export const FALLBACK_RESILIENCE_THRESHOLD = 0.6;

/** Альтернатива считается заменой, если отправляется в этом окне вокруг исходной. */
export const FALLBACK_TIME_WINDOW_MINUTES = 8 * 60;

export const MAX_CONFIGURATIONS = 3;

/**
 * Ограничение перебора сборок. Полный декартов произведение по категориям растёт быстро,
 * а пользователю всё равно показываются три конфигурации.
 */
export const MAX_CANDIDATES_PER_CATEGORY = 10;

/** Ночная поездка с ребёнком наказывается сильнее — детские сценарии заявлены в §5.1. */
export const NIGHT_PENALTY = { withoutChildren: 0.4, withChildren: 0.2 } as const;

export const TRANSFER_COUNT_SCORE: readonly number[] = [1, 0.7, 0.4, 0.15];

export function transferCountScore(count: number): number {
  return TRANSFER_COUNT_SCORE[Math.min(count, TRANSFER_COUNT_SCORE.length - 1)] ?? 0.1;
}

export function alternativesScore(count: number): number {
  if (count <= 0) return 0.1;
  if (count === 1) return 0.6;
  return 1;
}
