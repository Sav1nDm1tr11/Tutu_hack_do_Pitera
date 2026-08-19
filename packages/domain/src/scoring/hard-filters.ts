import type { TransportOption } from '../contracts/candidate';
import type { TravelRequest } from '../contracts/travel-request';
import { arrivesBefore, dateOf, overlapsNight } from '../time/wall-clock';
import { NIGHT_WINDOW } from './risk-policy';

export type HardConstraintCode =
  | 'modeNotAllowed'
  | 'nightSegment'
  | 'nightDataMissing'
  | 'tooManyTransfers'
  | 'transferDataMissing'
  | 'arrivesAfterDeadline'
  | 'arrivalDataMissing'
  | 'dateMismatch'
  | 'budgetExceeded'
  | 'priceUnknown';

export interface HardConstraintViolation {
  readonly code: HardConstraintCode;
  readonly message: string;
  /** `true` — вариант исключается; `false` — попадает в группу needsVerification (§9.1). */
  readonly blocking: boolean;
}

export type HardFilterStatus = 'passed' | 'needsVerification' | 'rejected';

export interface HardFilterVerdict {
  readonly status: HardFilterStatus;
  readonly violations: readonly HardConstraintViolation[];
}

function verdictFrom(violations: readonly HardConstraintViolation[]): HardFilterVerdict {
  if (violations.some((violation) => violation.blocking)) {
    return { status: 'rejected', violations };
  }
  if (violations.length > 0) {
    return { status: 'needsVerification', violations };
  }
  return { status: 'passed', violations: [] };
}

/**
 * Проверка одного транспортного варианта против жёстких ограничений (§9.1).
 *
 * Ключевое правило: нехватка данных **никогда** не трактуется в пользу варианта.
 * Если по полю нельзя проверить ограничение, вариант не отклоняется молча, но и не
 * объявляется подходящим — он получает `needsVerification`.
 */
export function checkTransportHardConstraints(
  option: TransportOption,
  request: TravelRequest,
): HardFilterVerdict {
  const violations: HardConstraintViolation[] = [];
  const constraints = request.hardConstraints;

  if (constraints.allowedModes !== undefined && !constraints.allowedModes.includes(option.mode)) {
    violations.push({
      code: 'modeNotAllowed',
      message: 'Этот вид транспорта исключён вашими настройками',
      blocking: true,
    });
  }

  const expectedDate = option.direction === 'outbound' ? request.departDate : request.returnDate;
  if (expectedDate !== undefined) {
    const actualDate = dateOf(option.departure.at);
    if (actualDate === undefined || actualDate !== expectedDate) {
      violations.push({
        code: 'dateMismatch',
        message: 'Дата отправления не совпадает с запрошенной',
        blocking: true,
      });
    }
  }

  if (constraints.noNightSegments) {
    const isNight = overlapsNight(option.departure.at, option.arrival.at, NIGHT_WINDOW);
    if (isNight === true) {
      violations.push({
        code: 'nightSegment',
        message: 'Поездка попадает в ночные часы, которые вы исключили',
        blocking: true,
      });
    } else if (isNight === undefined) {
      violations.push({
        code: 'nightDataMissing',
        message: 'Не удалось проверить ночные часы: нет полного времени отправления или прибытия',
        blocking: false,
      });
    }
  }

  if (constraints.maxTransfers !== undefined) {
    if (option.transferCount === undefined) {
      violations.push({
        code: 'transferDataMissing',
        message: 'Количество пересадок неизвестно, ограничение проверить нельзя',
        blocking: false,
      });
    } else if (option.transferCount > constraints.maxTransfers) {
      violations.push({
        code: 'tooManyTransfers',
        message: `Пересадок больше допустимых ${constraints.maxTransfers}`,
        blocking: true,
      });
    }
  }

  // Дедлайн прибытия относится к поездке «туда»: он про то, чтобы успеть на месте.
  if (constraints.arriveBeforeLocalTime !== undefined && option.direction === 'outbound') {
    const inTime = arrivesBefore(option.arrival.at, constraints.arriveBeforeLocalTime);
    if (inTime === false) {
      violations.push({
        code: 'arrivesAfterDeadline',
        message: `Прибытие позже ${constraints.arriveBeforeLocalTime}`,
        blocking: true,
      });
    } else if (inTime === undefined) {
      violations.push({
        code: 'arrivalDataMissing',
        message: 'Время прибытия неизвестно, дедлайн проверить нельзя',
        blocking: false,
      });
    }
  }

  return verdictFrom(violations);
}

/**
 * Бюджет проверяется на уровне всей поездки, а не отдельного билета:
 * `scope: 'totalTrip'` в запросе означает именно это.
 */
export function checkBudget(
  totalPrice: number | undefined,
  request: TravelRequest,
): HardFilterVerdict {
  if (totalPrice === undefined) {
    return verdictFrom([
      {
        code: 'priceUnknown',
        message: 'Итоговая цена известна не полностью, соблюдение бюджета не подтверждено',
        blocking: false,
      },
    ]);
  }

  if (totalPrice <= request.budget.amount) return verdictFrom([]);

  return verdictFrom([
    {
      code: 'budgetExceeded',
      message: 'Стоимость выше указанного бюджета',
      blocking: request.hardConstraints.budgetIsHard,
    },
  ]);
}

export function mergeVerdicts(...verdicts: readonly HardFilterVerdict[]): HardFilterVerdict {
  return verdictFrom(verdicts.flatMap((verdict) => verdict.violations));
}
