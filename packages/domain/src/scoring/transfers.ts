import type { PlaceRef } from '../contracts/common';
import type { TransportOption } from '../contracts/candidate';
import type { MinimumTransferPolicy } from '../contracts/travel-request';
import { minutesBetween } from '../time/wall-clock';
import { TRANSFER_BUFFERS } from './risk-policy';

export interface TransferDetail {
  readonly id: string;
  readonly arrivalPlace: PlaceRef;
  readonly departurePlace: PlaceRef;
  readonly waitMinutes: number;
  readonly requiredMinutes: number;
  /** `undefined` — не удалось определить, меняется ли точка. Это не то же, что `false`. */
  readonly sameStation: boolean | undefined;
  readonly satisfied: boolean;
}

export interface TransferAnalysis {
  /** `undefined` — инвентарь не сообщил ни детализации, ни счётчика пересадок. */
  readonly count: number | undefined;
  readonly details: readonly TransferDetail[];
  /** Наименьший фактический буфер. `undefined`, если детализации пересадок нет. */
  readonly minWaitMinutes: number | undefined;
  /**
   * Отношение фактического буфера к минимально приемлемому, обрезанное сверху единицей.
   * `undefined` при отсутствии детализации, `1` при отсутствии пересадок.
   */
  readonly bufferRatio: number | undefined;
  readonly hasStationChange: boolean | undefined;
  readonly hasTightTransfer: boolean;
}

export function requiredBufferMinutes(
  sameStation: boolean | undefined,
  policy: MinimumTransferPolicy,
): number {
  const buffers = TRANSFER_BUFFERS[policy];
  if (sameStation === undefined) return buffers.unknownMinutes;
  return sameStation ? buffers.sameStationMinutes : buffers.differentStationMinutes;
}

/**
 * Разбирает пересадки внутри одного бокируемого варианта.
 *
 * Детализация пересадок не подтверждена как обязательное поле MCP (§3.2). Когда её нет,
 * мы возвращаем `count` из счётчика (если он пришёл), но буферы остаются `undefined` —
 * подставлять «типичное» время пересадки означало бы придумать факт.
 */
export function analyzeTransfers(
  option: TransportOption,
  policy: MinimumTransferPolicy,
): TransferAnalysis {
  const segments = option.segments;

  if (segments === undefined || segments.length === 0) {
    return {
      count: option.transferCount,
      details: [],
      minWaitMinutes: undefined,
      bufferRatio: option.transferCount === 0 ? 1 : undefined,
      hasStationChange: undefined,
      hasTightTransfer: false,
    };
  }

  const details: TransferDetail[] = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const arriving = segments[index]!;
    const departing = segments[index + 1]!;

    const waitMinutes = minutesBetween(arriving.arrival.at, departing.departure.at);
    if (waitMinutes === undefined) continue;

    const sameStation = deriveSameStation(arriving.arrival.place, departing.departure.place);
    const requiredMinutes = requiredBufferMinutes(sameStation, policy);

    details.push({
      id: `${arriving.id}->${departing.id}`,
      arrivalPlace: arriving.arrival.place,
      departurePlace: departing.departure.place,
      waitMinutes,
      requiredMinutes,
      sameStation,
      satisfied: waitMinutes >= requiredMinutes,
    });
  }

  const count = segments.length - 1;

  if (details.length === 0) {
    return {
      count,
      details: [],
      minWaitMinutes: undefined,
      bufferRatio: count === 0 ? 1 : undefined,
      hasStationChange: undefined,
      hasTightTransfer: false,
    };
  }

  const minWaitMinutes = Math.min(...details.map((detail) => detail.waitMinutes));
  const bufferRatio = Math.min(
    ...details.map((detail) =>
      detail.requiredMinutes === 0 ? 1 : Math.min(1, detail.waitMinutes / detail.requiredMinutes),
    ),
  );

  const stationChangeKnown = details.every((detail) => detail.sameStation !== undefined);

  return {
    count,
    details,
    minWaitMinutes,
    bufferRatio,
    hasStationChange: stationChangeKnown
      ? details.some((detail) => detail.sameStation === false)
      : undefined,
    hasTightTransfer: details.some((detail) => !detail.satisfied),
  };
}

/**
 * Один и тот же город с разными вокзалами — это смена точки. Одинаковый `id` места —
 * гарантированно та же точка. Если у мест нет ни общего id, ни координат, вернуть
 * `undefined` честнее, чем угадать.
 */
function deriveSameStation(arrival: PlaceRef, departure: PlaceRef): boolean | undefined {
  if (arrival.id === departure.id) return true;

  const arrivalPoint = arrival.point;
  const departurePoint = departure.point;
  if (arrivalPoint === undefined || departurePoint === undefined) return undefined;

  const sameCoordinates =
    Math.abs(arrivalPoint.lat - departurePoint.lat) < 1e-4 &&
    Math.abs(arrivalPoint.lon - departurePoint.lon) < 1e-4;

  return sameCoordinates;
}
