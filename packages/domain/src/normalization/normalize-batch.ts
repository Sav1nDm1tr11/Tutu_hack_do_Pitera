import type { CandidatePool } from '../contracts/candidate';
import type { RawInventoryBatch } from './raw';
import {
  normalizeHotelOffer,
  normalizeTransportOffer,
  type NormalizationContext,
  type QuarantinedRecord,
} from './normalize';

export interface NormalizedBatch {
  readonly pool: CandidatePool;
  /**
   * Записи, которые нельзя показать пользователю. Мы не молчим о них: их количество
   * попадает в предупреждения плана, чтобы «мало вариантов» имело объяснение.
   */
  readonly quarantined: readonly QuarantinedRecord[];
  readonly counts: {
    readonly transportAccepted: number;
    readonly hotelsAccepted: number;
  };
}

/**
 * Нормализует пачку raw-записей в canonical pool.
 *
 * Одна битая запись не должна ронять всю категорию — она отправляется в quarantine,
 * а остальные проходят (§7.2, поведение Normalizer при ошибке).
 */
export function normalizeInventoryBatch(
  batch: RawInventoryBatch,
  context: NormalizationContext,
): NormalizedBatch {
  const pool: CandidatePool = {};
  const quarantined: QuarantinedRecord[] = [];
  let transportAccepted = 0;
  let hotelsAccepted = 0;

  for (const raw of batch.transport) {
    const result = normalizeTransportOffer(raw, context);
    if (result.ok) {
      pool[result.option.id] = result.option;
      transportAccepted += 1;
    } else {
      quarantined.push(result.quarantined);
    }
  }

  for (const raw of batch.hotels) {
    const result = normalizeHotelOffer(raw, context);
    if (result.ok) {
      pool[result.option.id] = result.option;
      hotelsAccepted += 1;
    } else {
      quarantined.push(result.quarantined);
    }
  }

  return {
    pool,
    quarantined,
    counts: { transportAccepted, hotelsAccepted },
  };
}
