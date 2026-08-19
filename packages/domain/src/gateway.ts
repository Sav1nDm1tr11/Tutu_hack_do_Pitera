import type {
  CapabilityKey,
  CapabilitySnapshot,
  InventorySource,
  TransportMode,
} from './contracts/common';
import type { TravelRequest } from './contracts/travel-request';
import type { RawHotelOffer, RawTransportOffer } from './normalization/raw';

/**
 * Единственный порт получения инвентаря (§2.1.2). И fixture, и live MCP реализуют
 * именно его, поэтому остальная система не знает, откуда пришли данные, — а
 * пользователь знает всегда, потому что `source` доезжает до интерфейса.
 */
export interface TravelInventoryGateway {
  readonly source: InventorySource;

  /** Какие категории реально доступны прямо сейчас. Вызывается до поиска. */
  describeCapabilities(): Promise<CapabilitySnapshot>;

  searchTransport(query: TransportQuery): Promise<InventoryResponse<RawTransportOffer>>;

  searchHotels(query: HotelQuery): Promise<InventoryResponse<RawHotelOffer>>;

  /**
   * Ссылки на оформление для конкретных вариантов.
   *
   * Необязательный метод: у fixtures ссылка приходит вместе с вариантом, а у live-MCP
   * часть продуктов (авиа, автобусы) отдаёт её отдельным вызовом билдера URL. Вызывается
   * уже после сборки конфигураций — только для показанных вариантов, а не для всего пула:
   * каждая ссылка стоит вызова инвентаря.
   *
   * Возвращает ровно то, что вернул источник: URL непрозрачен и не пересобирается.
   */
  resolveCheckoutUrls?(optionIds: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /** Закрытие сессии. Fixtures ничего не держат, live — MCP-транспорт. */
  close?(): Promise<void>;
}

export interface TransportQuery {
  readonly request: TravelRequest;
  readonly direction: 'outbound' | 'inbound';
  /**
   * Категории, которые разрешил планировщик. Пустой список означает «не искать».
   * Тип узкий (`TransportMode`, а не `CapabilityKey`): в транспортный поиск не должны
   * попадать `hotel` и `hotelReviews`.
   */
  readonly modes: readonly TransportMode[];
}

export interface HotelQuery {
  readonly request: TravelRequest;
  readonly checkIn: string;
  readonly checkOut: string;
}

/**
 * Отказ одной категории не должен ломать остальные (§7.2), поэтому ответ описывает
 * частичный успех явно, а не через исключение.
 */
export interface InventoryResponse<T> {
  readonly offers: readonly T[];
  readonly toolCallIds: readonly string[];
  readonly status: 'ok' | 'partial' | 'unavailable';
  readonly failedCapabilities: readonly CapabilityKey[];
  readonly message?: string | undefined;
}

export function emptyInventoryResponse<T>(
  status: InventoryResponse<T>['status'] = 'unavailable',
  message?: string,
): InventoryResponse<T> {
  return {
    offers: [],
    toolCallIds: [],
    status,
    failedCapabilities: [],
    ...(message === undefined ? {} : { message }),
  };
}

export const ALL_TRANSPORT_MODES: readonly TransportMode[] = [
  'flight',
  'train',
  'bus',
  'suburbanTrain',
];

export function capabilitiesFromRequest(request: TravelRequest): TransportMode[] {
  const allowed = request.hardConstraints.allowedModes;
  return allowed === undefined ? [...ALL_TRANSPORT_MODES] : [...allowed];
}
