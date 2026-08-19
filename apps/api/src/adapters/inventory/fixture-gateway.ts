import type {
  CapabilitySnapshot,
  HotelQuery,
  InventoryResponse,
  RawHotelOffer,
  RawTransportOffer,
  TransportQuery,
  TravelInventoryGateway,
} from '@tutu-plan-b/domain';
import {
  buildFixtureBatch,
  isFixtureScenarioId,
  type FixtureScenarioId,
} from '@tutu-plan-b/test-fixtures';

export interface FixtureGatewayOptions {
  readonly scenario?: string;
  /** «Сейчас» приходит извне, чтобы snapshot возможностей был воспроизводим в тестах. */
  readonly now: () => string;
}

/**
 * Демо-режим инвентаря.
 *
 * Существует не как заглушка на время разработки, а как штатный режим работы:
 * live Tutu MCP недостижим из среды разработки (см. docs/MCP_SPIKE_REPORT.md), и §11.1
 * прямо предписывает в этом случае работать через fixtures с видимым badge.
 *
 * Поэтому `source` здесь — `fixture`, и это значение доезжает до интерфейса: пользователь
 * всегда знает, что видит демо-данные.
 */
export class FixtureInventoryGateway implements TravelInventoryGateway {
  readonly source = 'fixture' as const;

  private readonly scenario: FixtureScenarioId;
  private readonly now: () => string;

  constructor(options: FixtureGatewayOptions) {
    const requested = options.scenario ?? 'default';
    this.scenario = isFixtureScenarioId(requested) ? requested : 'default';
    this.now = options.now;
  }

  async describeCapabilities(): Promise<CapabilitySnapshot> {
    const unavailableReason =
      this.scenario === 'noHotels' ? 'В демо-сценарии категория отелей отключена' : undefined;

    const hotelStatus = this.scenario === 'noHotels' ? 'unavailable' : 'available';

    return {
      source: 'fixture',
      checkedAt: this.now(),
      capabilities: {
        flight: { status: 'available' },
        train: { status: 'available' },
        bus: { status: 'available' },
        suburbanTrain: {
          status: 'degraded',
          // Электрички в ТуТу — расписание без оформления (§3.1); моделируем это честно.
          reason: 'Только расписание, без цены и оформления',
        },
        hotel: {
          status: hotelStatus,
          ...(unavailableReason === undefined ? {} : { reason: unavailableReason }),
        },
        hotelReviews: { status: 'available' },
      },
    };
  }

  async searchTransport(query: TransportQuery): Promise<InventoryResponse<RawTransportOffer>> {
    const batch = buildFixtureBatch(query.request, this.scenario);
    const requestedModes = new Set<string>(query.modes);

    const offers = batch.transport.filter((offer) => {
      if (offer.direction !== query.direction) return false;
      if (requestedModes.size === 0) return true;
      return offer.mode !== undefined && requestedModes.has(offer.mode);
    });

    return {
      offers,
      toolCallIds: [`fixture:${this.scenario}:transport:${query.direction}`],
      status: offers.length > 0 ? 'ok' : 'unavailable',
      failedCapabilities: [],
      ...(offers.length === 0
        ? { message: 'В демо-каталоге нет вариантов для этого направления' }
        : {}),
    };
  }

  async searchHotels(query: HotelQuery): Promise<InventoryResponse<RawHotelOffer>> {
    const batch = buildFixtureBatch(query.request, this.scenario);

    return {
      offers: batch.hotels,
      toolCallIds: [`fixture:${this.scenario}:hotels`],
      status: batch.hotels.length > 0 ? 'ok' : 'unavailable',
      failedCapabilities: batch.hotels.length > 0 ? [] : ['hotel'],
      ...(batch.hotels.length === 0
        ? { message: 'Варианты проживания в демо-сценарии недоступны' }
        : {}),
    };
  }
}
