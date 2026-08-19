import type {
  CapabilitySnapshot,
  HotelQuery,
  InventoryResponse,
  RawHotelOffer,
  RawTransportOffer,
  TransportQuery,
  TravelInventoryGateway,
} from '@tutu-plan-b/domain';
import { FixtureInventoryGateway } from '../fixture-gateway';
import { LiveMcpInventoryGateway } from './live-gateway';

export interface AutoInventoryGatewayOptions {
  readonly live: LiveMcpInventoryGateway;
  readonly fixture: FixtureInventoryGateway;
  readonly log: (event: Record<string, unknown>) => void;
}

/**
 * Режим `INVENTORY_MODE=auto`.
 *
 * Live пробуется первым. Если discovery не дал ни одной категории, источник
 * переключается на fixtures: демо с честным badge «Демо-данные» полезнее живого
 * MCP, который ответил пустым каталогом (см. docs/MCP_SPIKE_REPORT.md). Смешивать
 * live-предложения с fixture-предложениями нельзя — пользователь всегда видит
 * один `source`.
 */
export class AutoInventoryGateway implements TravelInventoryGateway {
  private resolved: TravelInventoryGateway | undefined;
  private resolving: Promise<TravelInventoryGateway> | undefined;

  constructor(private readonly options: AutoInventoryGatewayOptions) {}

  get source(): TravelInventoryGateway['source'] {
    return this.resolved?.source ?? 'live';
  }

  async describeCapabilities(): Promise<CapabilitySnapshot> {
    const gateway = await this.resolve();
    return gateway.describeCapabilities();
  }

  async searchTransport(query: TransportQuery): Promise<InventoryResponse<RawTransportOffer>> {
    const gateway = await this.resolve();
    return gateway.searchTransport(query);
  }

  async searchHotels(query: HotelQuery): Promise<InventoryResponse<RawHotelOffer>> {
    const gateway = await this.resolve();
    return gateway.searchHotels(query);
  }

  async close(): Promise<void> {
    await this.options.live.close();
  }

  private async resolve(): Promise<TravelInventoryGateway> {
    if (this.resolved !== undefined) return this.resolved;
    this.resolving ??= this.choose();
    this.resolved = await this.resolving;
    return this.resolved;
  }

  private async choose(): Promise<TravelInventoryGateway> {
    const snapshot = await this.options.live.describeCapabilities();
    const available = Object.values(snapshot.capabilities).some(
      (capability) => capability?.status === 'available',
    );

    if (available) {
      this.options.log({ event: 'inventoryResolved', source: 'live' });
      return this.options.live;
    }

    this.options.log({
      event: 'inventoryResolved',
      source: 'fixture',
      reason: 'Live MCP не дал ни одной доступной категории',
    });
    await this.options.live.close();
    return this.options.fixture;
  }
}
