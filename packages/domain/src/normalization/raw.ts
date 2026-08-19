/**
 * Лениво типизированный промежуточный слой между инвентарём и каноничной моделью.
 *
 * Точные схемы Tutu MCP не подтверждены (§3.2), поэтому адаптер обязан привести
 * произвольный JSON к этим формам, где **всё** необязательно, а домен — решить, что из
 * этого достаточно для показа пользователю. Так raw MCP типы не покидают адаптер
 * (§4.1), а правило «нет поля — нет показателя» остаётся в одном месте.
 */

export interface RawPlace {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly kind?: string | undefined;
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly timezone?: string | undefined;
}

export interface RawTransportSegment {
  readonly id?: string | undefined;
  readonly mode?: string | undefined;
  readonly operator?: string | undefined;
  readonly departurePlace?: RawPlace | undefined;
  readonly departureAt?: string | undefined;
  readonly arrivalPlace?: RawPlace | undefined;
  readonly arrivalAt?: string | undefined;
  readonly serviceClass?: string | undefined;
}

export interface RawTransportOffer {
  readonly id?: string | undefined;
  readonly direction?: string | undefined;
  readonly mode?: string | undefined;
  readonly operator?: string | undefined;
  readonly departurePlace?: RawPlace | undefined;
  readonly departureAt?: string | undefined;
  readonly arrivalPlace?: RawPlace | undefined;
  readonly arrivalAt?: string | undefined;
  readonly durationMinutes?: number | undefined;
  readonly transferCount?: number | undefined;
  readonly segments?: readonly RawTransportSegment[] | undefined;
  readonly priceAmount?: number | undefined;
  readonly currency?: string | undefined;
  readonly serviceClass?: string | undefined;
  readonly seatsAvailable?: number | undefined;
  readonly refundable?: boolean | undefined;
  readonly checkoutUrl?: string | undefined;
  readonly expiresAt?: string | undefined;
}

export interface RawHotelOffer {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly place?: RawPlace | undefined;
  readonly checkIn?: string | undefined;
  readonly checkOut?: string | undefined;
  readonly nights?: number | undefined;
  readonly priceAmount?: number | undefined;
  readonly pricePerNightAmount?: number | undefined;
  readonly currency?: string | undefined;
  readonly rating?: number | undefined;
  readonly reviewSummaryText?: string | undefined;
  readonly reviewPositiveCount?: number | undefined;
  readonly reviewNegativeCount?: number | undefined;
  readonly reviewRedFlags?: readonly string[] | undefined;
  readonly distanceToCenterKm?: number | undefined;
  readonly checkoutUrl?: string | undefined;
  readonly expiresAt?: string | undefined;
}

export interface RawInventoryBatch {
  readonly transport: readonly RawTransportOffer[];
  readonly hotels: readonly RawHotelOffer[];
}
