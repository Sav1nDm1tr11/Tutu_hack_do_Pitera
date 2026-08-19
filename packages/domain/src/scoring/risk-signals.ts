import type { RiskSignal, TransportOption } from '../contracts/candidate';
import type { TravelRequest } from '../contracts/travel-request';
import { formatDuration } from '../time/format';
import { arrivesBefore, overlapsNight } from '../time/wall-clock';
import { NIGHT_WINDOW } from './risk-policy';
import { analyzeTransfers } from './transfers';

/**
 * Риск-сигналы для карточки. Каждый сигнал несёт код, уровень и текст: цвет не может
 * быть единственным носителем информации о риске (§19).
 *
 * Сигналы зависят от запроса пользователя (ночные часы, дедлайн, политика буферов),
 * поэтому вычисляются после получения запроса, а не при нормализации инвентаря.
 */
export function deriveTransportRiskSignals(
  option: TransportOption,
  request: TravelRequest,
  alternativesCount: number,
): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const analysis = analyzeTransfers(option, request.hardConstraints.minimumTransferPolicy);

  if (overlapsNight(option.departure.at, option.arrival.at, NIGHT_WINDOW) === true) {
    signals.push({
      code: 'nightSegment',
      severity: request.travelers.children.length > 0 ? 'critical' : 'warning',
      message: 'Часть пути приходится на ночные часы',
    });
  }

  for (const detail of analysis.details) {
    if (detail.satisfied) continue;
    signals.push({
      code: 'tightTransfer',
      severity: 'critical',
      message: `Пересадка в ${detail.arrivalPlace.name}: ${formatDuration(detail.waitMinutes)} вместо рекомендуемых ${formatDuration(detail.requiredMinutes)}`,
    });
  }

  if (analysis.hasStationChange === true) {
    signals.push({
      code: 'stationChange',
      severity: 'warning',
      message: 'На пересадке нужно перебраться между разными точками',
    });
  }

  if (analysis.count !== undefined && analysis.count >= 3) {
    signals.push({
      code: 'manyTransfers',
      severity: 'warning',
      message: `Пересадок: ${analysis.count}`,
    });
  }

  if (alternativesCount === 0) {
    signals.push({
      code: 'noAlternatives',
      severity: 'warning',
      message: 'Замены в близкое время не нашлось',
    });
  }

  if (
    request.hardConstraints.arriveBeforeLocalTime !== undefined &&
    option.direction === 'outbound' &&
    arrivesBefore(option.arrival.at, request.hardConstraints.arriveBeforeLocalTime) === undefined
  ) {
    signals.push({
      code: 'arrivesLate',
      severity: 'info',
      message: 'Время прибытия неизвестно — дедлайн проверить нельзя',
    });
  }

  if (option.dataCompleteness < 0.7) {
    signals.push({
      code: 'incompleteData',
      severity: 'info',
      message: 'Инвентарь вернул не все характеристики этого варианта',
    });
  }

  return signals;
}
