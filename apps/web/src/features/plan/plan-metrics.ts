import type { CandidatePool, PlanConfiguration } from '@tutu-plan-b/domain';
import {
  formatDuration,
  formatPrice,
  formatTransfers,
  isHotelOption,
  isTransportOption,
  pluralizeRu,
} from '@tutu-plan-b/domain';

const MODE_LABELS: Record<string, string> = {
  flight: 'самолёт',
  train: 'поезд',
  bus: 'автобус',
  suburbanTrain: 'электричка',
};

export function transportModesLabel(
  configuration: PlanConfiguration,
  pool: CandidatePool,
): string | undefined {
  const labels: string[] = [];
  for (const stage of configuration.stages) {
    const option = pool[stage.selectedOptionId];
    if (option === undefined || !isTransportOption(option)) continue;
    const label = MODE_LABELS[option.mode];
    if (label !== undefined && !labels.includes(label)) labels.push(label);
  }
  return labels.length === 0 ? undefined : labels.join(', ');
}

export function hotelNightsLabel(
  configuration: PlanConfiguration,
  pool: CandidatePool,
): string | undefined {
  for (const stage of configuration.stages) {
    const option = pool[stage.selectedOptionId];
    if (option !== undefined && isHotelOption(option)) {
      return `${option.nights} ${pluralizeRu(option.nights, 'ночь', 'ночи', 'ночей')}`;
    }
  }
  return undefined;
}

/** Считаем только этапы, где инвентарь вернул поле refundable. Нет поля — не показываем. */
export function refundableLabel(
  configuration: PlanConfiguration,
  pool: CandidatePool,
): string | undefined {
  let known = 0;
  let refundable = 0;
  for (const stage of configuration.stages) {
    const option = pool[stage.selectedOptionId];
    if (option === undefined || !isTransportOption(option) || option.refundable === undefined) {
      continue;
    }
    known += 1;
    if (option.refundable) refundable += 1;
  }
  return known === 0 ? undefined : `${refundable} из ${known}`;
}

export function summaryMetrics(
  configuration: PlanConfiguration,
  pool: CandidatePool,
): readonly { readonly label: string; readonly value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: 'В дороге', value: formatDuration(configuration.totals.travelMinutes) },
    { label: 'Пересадки', value: formatTransfers(configuration.totals.transferCount) },
  ];

  const transport = transportModesLabel(configuration, pool);
  if (transport !== undefined) rows.push({ label: 'Транспорт', value: transport });

  const nights = hotelNightsLabel(configuration, pool);
  if (nights !== undefined) rows.push({ label: 'Ночи', value: nights });

  rows.push({
    label: 'Уверенность',
    value: `${Math.round(configuration.score.confidence * 100)}%`,
  });

  const refundable = refundableLabel(configuration, pool);
  if (refundable !== undefined) rows.push({ label: 'Возвратных', value: refundable });

  return rows;
}

export function budgetCaption(budgetAmount: number | undefined): string | undefined {
  if (budgetAmount === undefined) return undefined;
  return `из бюджета ${formatPrice({ amount: budgetAmount, currency: 'RUB' })}`;
}
