import type { PlanTotals } from '../contracts/plan';
import type { TravelRequest } from '../contracts/travel-request';
import { minutesBetween, overlapsNight } from '../time/wall-clock';
import { NIGHT_WINDOW } from './risk-policy';
import { analyzeTransfers } from './transfers';
import { collectAssemblyOptions, type RouteAssembly } from './assemble';

/**
 * Итоги по сборке.
 *
 * Ни одно неизвестное значение не превращается в нуль: сумма без одной цены — это не
 * «дешевле», а «неизвестно». Поэтому `price` отсутствует целиком, а `priceCompleteness`
 * показывает, какая доля платных этапов имеет цену.
 */
export function computeTotals(assembly: RouteAssembly, request: TravelRequest): PlanTotals {
  const payable = collectAssemblyOptions(assembly);
  const prices = payable.map((option) => option.price?.amount);
  const knownPrices = prices.filter((price): price is number => price !== undefined);
  const allPricesKnown = knownPrices.length === prices.length && prices.length > 0;

  const totalAmount = allPricesKnown
    ? knownPrices.reduce((sum, price) => sum + price, 0)
    : undefined;

  const outboundMinutes = durationOf(assembly.outbound.durationMinutes, assembly.outbound.departure.at, assembly.outbound.arrival.at);
  const inboundMinutes =
    assembly.inbound === undefined
      ? 0
      : durationOf(assembly.inbound.durationMinutes, assembly.inbound.departure.at, assembly.inbound.arrival.at);

  const travelMinutes =
    outboundMinutes === undefined || inboundMinutes === undefined
      ? undefined
      : outboundMinutes + inboundMinutes;

  const tripEndIso = assembly.inbound?.arrival.at ?? assembly.outbound.arrival.at;
  const totalTripMinutes = minutesBetween(assembly.outbound.departure.at, tripEndIso);

  const transferCounts = [assembly.outbound.transferCount];
  if (assembly.inbound !== undefined) transferCounts.push(assembly.inbound.transferCount);
  const transferCount = transferCounts.some((count) => count === undefined)
    ? undefined
    : transferCounts.reduce<number>((sum, count) => sum + (count ?? 0), 0);

  const nightSegmentCount = [assembly.outbound, assembly.inbound]
    .filter((option): option is NonNullable<typeof option> => option !== undefined)
    .filter((option) => overlapsNight(option.departure.at, option.arrival.at, NIGHT_WINDOW) === true)
    .length;

  return {
    ...(totalAmount === undefined ? {} : { price: { amount: totalAmount, currency: 'RUB' as const } }),
    priceCompleteness: prices.length === 0 ? 0 : knownPrices.length / prices.length,
    ...(totalAmount === undefined ? {} : { budgetDelta: totalAmount - request.budget.amount }),
    ...(travelMinutes === undefined ? {} : { travelMinutes }),
    ...(totalTripMinutes === undefined || totalTripMinutes < 0 ? {} : { totalTripMinutes }),
    ...(transferCount === undefined ? {} : { transferCount }),
    nightSegmentCount,
    stageCount: countStages(assembly),
  };
}

/**
 * Длительность из инвентаря приоритетнее вычисленной: она учитывает таймзоны,
 * которых у нас может не быть. Вычисление по настенным часам — резервный путь.
 */
function durationOf(
  reported: number | undefined,
  departureIso: string,
  arrivalIso: string,
): number | undefined {
  if (reported !== undefined) return reported;
  const computed = minutesBetween(departureIso, arrivalIso);
  return computed !== undefined && computed >= 0 ? computed : undefined;
}

function countStages(assembly: RouteAssembly): number {
  let count = 1;
  if (assembly.hotel !== undefined) count += 1;
  if (assembly.inbound !== undefined) count += 1;
  return count;
}

/** Число внутренних пересадок с подтверждённо недостаточным буфером. */
export function countTightTransfers(
  assembly: RouteAssembly,
  policy: TravelRequest['hardConstraints']['minimumTransferPolicy'],
): number {
  return [assembly.outbound, assembly.inbound]
    .filter((option): option is NonNullable<typeof option> => option !== undefined)
    .reduce((sum, option) => {
      const analysis = analyzeTransfers(option, policy);
      return sum + analysis.details.filter((detail) => !detail.satisfied).length;
    }, 0);
}
