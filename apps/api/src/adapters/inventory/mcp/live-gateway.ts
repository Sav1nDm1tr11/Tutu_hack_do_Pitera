import type {
  CapabilityKey,
  CapabilitySnapshot,
  HotelQuery,
  InventoryResponse,
  RawHotelOffer,
  RawTransportOffer,
  TransportMode,
  TransportQuery,
  TravelInventoryGateway,
} from '@tutu-plan-b/domain';
import { emptyInventoryResponse } from '@tutu-plan-b/domain';
import { planHotelArguments, planTransportArguments } from './arguments';
import { mapHotelOffers, mapTransportOffers } from './map-offers';
import {
  McpSession,
  McpUnavailableError,
  type DiscoveredTool,
  type McpSessionOptions,
} from './session';
import { buildToolCatalog, type ToolCatalog } from './tool-catalog';

export interface LiveMcpGatewayOptions {
  readonly url: string;
  readonly authToken?: string | undefined;
  readonly timeoutMs: number;
  readonly now: () => string;
  readonly log: (event: Record<string, unknown>) => void;
}

/**
 * Live-адаптер Tutu MCP.
 *
 * Реализует тот же `TravelInventoryGateway`, что и fixtures: оркестратор не знает, откуда
 * пришли данные. Источник всегда `live` — даже если часть категорий недоступна — чтобы
 * интерфейс не смешивал live и fixture без видимого индикатора (§4.1 spec).
 *
 * Сессия и discovery ленивы: они происходят при первом запросе, а не при старте
 * процесса. Это позволяет серверу подняться в `auto`-режиме даже когда MCP недоступен,
 * и честно деградировать до fixtures.
 */
export class LiveMcpInventoryGateway implements TravelInventoryGateway {
  readonly source = 'live' as const;

  private connecting: Promise<ToolCatalog> | undefined;
  private catalog: ToolCatalog | undefined;
  private session: McpSession | undefined;
  private unavailableReason: string | undefined;

  constructor(private readonly options: LiveMcpGatewayOptions) {}

  async describeCapabilities(): Promise<CapabilitySnapshot> {
    const catalog = await this.ensureCatalog();
    const statusOf = (key: CapabilityKey): CapabilitySnapshot['capabilities'][CapabilityKey] => {
      const bound = catalog?.bindings.get(key);
      if (bound !== undefined) return { status: 'available' };
      return {
        status: 'unavailable',
        reason: catalog?.reasons.get(key) ?? this.unavailableReason ?? 'MCP недоступен',
      };
    };

    return {
      source: 'live',
      checkedAt: this.options.now(),
      capabilities: {
        flight: statusOf('flight'),
        train: statusOf('train'),
        bus: statusOf('bus'),
        suburbanTrain: statusOf('suburbanTrain'),
        hotel: statusOf('hotel'),
        hotelReviews: statusOf('hotelReviews'),
      },
    };
  }

  async searchTransport(query: TransportQuery): Promise<InventoryResponse<RawTransportOffer>> {
    const catalog = await this.ensureCatalog();
    if (catalog === undefined) {
      return emptyInventoryResponse('unavailable', this.unavailableReason ?? 'MCP недоступен');
    }

    const offers: RawTransportOffer[] = [];
    const toolCallIds: string[] = [];
    const failed: CapabilityKey[] = [];
    const messages: string[] = [];

    for (const mode of query.modes) {
      const result = await this.searchMode(catalog, query, mode);
      offers.push(...result.offers);
      toolCallIds.push(...result.toolCallIds);
      failed.push(...result.failedCapabilities);
      if (result.message !== undefined) messages.push(result.message);
    }

    const status = statusFromParts(offers.length > 0, failed.length > 0, query.modes.length);
    return {
      offers,
      toolCallIds,
      status,
      failedCapabilities: failed,
      ...(messages.length === 0 ? {} : { message: messages.join('; ') }),
    };
  }

  async searchHotels(query: HotelQuery): Promise<InventoryResponse<RawHotelOffer>> {
    const catalog = await this.ensureCatalog();
    if (catalog === undefined) {
      return emptyInventoryResponse('unavailable', this.unavailableReason ?? 'MCP недоступен');
    }

    const tool = catalog.bindings.get('hotel');
    if (tool === undefined) {
      return {
        offers: [],
        toolCallIds: [],
        status: 'unavailable',
        failedCapabilities: ['hotel'],
        message: catalog.reasons.get('hotel') ?? 'Поиск отелей недоступен',
      };
    }

    const plan = planHotelArguments(tool, query.request, query.checkIn, query.checkOut);
    if (plan.missingRequired.length > 0) {
      return {
        offers: [],
        toolCallIds: [],
        status: 'unavailable',
        failedCapabilities: ['hotel'],
        message: `Tool ${tool.name} требует поля, которых нет в запросе: ${plan.missingRequired.join(', ')}`,
      };
    }

    return this.invokeHotel(tool, plan.args, query.checkIn, query.checkOut);
  }

  async close(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    this.catalog = undefined;
    this.connecting = undefined;
    if (session !== undefined) await session.close();
  }

  private async searchMode(
    catalog: ToolCatalog,
    query: TransportQuery,
    mode: TransportMode,
  ): Promise<InventoryResponse<RawTransportOffer>> {
    const tool = catalog.bindings.get(mode);
    if (tool === undefined) {
      return {
        offers: [],
        toolCallIds: [],
        status: 'unavailable',
        failedCapabilities: [mode],
        message: catalog.reasons.get(mode) ?? `Категория ${mode} недоступна`,
      };
    }

    const plan = planTransportArguments(tool, query.request, query.direction, mode);
    if (plan.missingRequired.length > 0) {
      return {
        offers: [],
        toolCallIds: [],
        status: 'unavailable',
        failedCapabilities: [mode],
        message: `Tool ${tool.name} требует поля, которых нет в запросе: ${plan.missingRequired.join(', ')}`,
      };
    }

    const session = this.session;
    if (session === undefined) {
      return emptyInventoryResponse('unavailable', 'MCP-сессия потеряна');
    }

    const callId = `mcp:${tool.name}:${query.direction}:${mode}`;
    const result = await session.callTool(tool.name, plan.args);

    if (!result.ok) {
      this.options.log({
        event: 'mcpToolFailed',
        tool: tool.name,
        capability: mode,
        message: result.message,
      });
      return {
        offers: [],
        toolCallIds: [callId],
        status: 'unavailable',
        failedCapabilities: [mode],
        message: result.message,
      };
    }

    return {
      offers: mapTransportOffers(result.payload, query.direction),
      toolCallIds: [callId],
      status: 'ok',
      failedCapabilities: [],
    };
  }

  private async invokeHotel(
    tool: DiscoveredTool,
    args: Readonly<Record<string, unknown>>,
    checkIn: string,
    checkOut: string,
  ): Promise<InventoryResponse<RawHotelOffer>> {
    const session = this.session;
    if (session === undefined) {
      return emptyInventoryResponse('unavailable', 'MCP-сессия потеряна');
    }

    const callId = `mcp:${tool.name}:hotel`;
    const result = await session.callTool(tool.name, args);

    if (!result.ok) {
      this.options.log({
        event: 'mcpToolFailed',
        tool: tool.name,
        capability: 'hotel',
        message: result.message,
      });
      return {
        offers: [],
        toolCallIds: [callId],
        status: 'unavailable',
        failedCapabilities: ['hotel'],
        message: result.message,
      };
    }

    return {
      offers: mapHotelOffers(result.payload, checkIn, checkOut),
      toolCallIds: [callId],
      status: 'ok',
      failedCapabilities: [],
    };
  }

  /**
   * Discovery выполняется один раз на время жизни процесса.
   *
   * Повторные вызовы разделяют один in-flight promise: параллельные запросы
   * поиска не должны открывать несколько MCP-сессий.
   */
  private async ensureCatalog(): Promise<ToolCatalog | undefined> {
    if (this.catalog !== undefined) return this.catalog;
    if (this.unavailableReason !== undefined && this.connecting === undefined) return undefined;

    this.connecting ??= this.connectOnce();
    try {
      this.catalog = await this.connecting;
      return this.catalog;
    } catch (error) {
      this.unavailableReason = describeUnavailable(error);
      this.options.log({
        event: 'mcpDiscoveryFailed',
        message: this.unavailableReason,
      });
      return undefined;
    } finally {
      this.connecting = undefined;
    }
  }

  private async connectOnce(): Promise<ToolCatalog> {
    const session = new McpSession(toSessionOptions(this.options));
    const tools = await session.connect();
    const catalog = buildToolCatalog(tools);

    this.session = session;
    this.options.log({
      event: 'mcpDiscovered',
      bound: [...catalog.bindings.keys()],
      unmatched: catalog.unmatched,
      forbidden: catalog.forbidden,
      toolCount: tools.length,
    });

    return catalog;
  }
}

function toSessionOptions(options: LiveMcpGatewayOptions): McpSessionOptions {
  return {
    url: options.url,
    timeoutMs: options.timeoutMs,
    clientName: 'tutu-plan-b',
    clientVersion: '0.1.0',
    ...(options.authToken === undefined ? {} : { authToken: options.authToken }),
  };
}

function statusFromParts(
  hasOffers: boolean,
  hasFailures: boolean,
  requestedCount: number,
): InventoryResponse<unknown>['status'] {
  if (hasOffers && !hasFailures) return 'ok';
  if (hasOffers && hasFailures) return 'partial';
  if (requestedCount === 0) return 'ok';
  return 'unavailable';
}

function describeUnavailable(error: unknown): string {
  if (error instanceof McpUnavailableError) return error.message;
  if (error instanceof Error) return error.message;
  return 'MCP недоступен';
}
