import { describe, expect, it } from 'vitest';
import { buildToolCatalog } from './tool-catalog';
import type { DiscoveredTool } from './session';

function tool(name: string, description = ''): DiscoveredTool {
  return { name, description, inputSchema: { properties: {}, required: [] } };
}

describe('buildToolCatalog', () => {
  it('сопоставляет категории по ключевым словам и отклоняет booking-tool\'ы', () => {
    const catalog = buildToolCatalog([
      tool('search_flights', 'Find cheap flights'),
      tool('search_trains', 'Find trains between cities'),
      tool('search_suburban_trains', 'Пригородные электрички, только расписание'),
      tool('search_buses', 'Междугородние автобусы'),
      tool('search_hotels', 'Find hotels in destination city'),
      tool('hotel_reviews', 'Отзывы об отелях'),
      tool('book_flight', 'Create a booking for a selected flight'),
      tool('city_info', 'Справочник городов'),
    ]);

    expect(catalog.bindings.get('flight')?.name).toBe('search_flights');
    expect(catalog.bindings.get('train')?.name).toBe('search_trains');
    expect(catalog.bindings.get('suburbanTrain')?.name).toBe('search_suburban_trains');
    expect(catalog.bindings.get('bus')?.name).toBe('search_buses');
    expect(catalog.bindings.get('hotel')?.name).toBe('search_hotels');
    expect(catalog.bindings.get('hotelReviews')?.name).toBe('hotel_reviews');
    expect(catalog.forbidden).toEqual(['book_flight']);
    expect(catalog.unmatched).toEqual(['city_info']);
  });

  it('не путает электрички с поездами дальнего следования', () => {
    const catalog = buildToolCatalog([
      tool('search_suburban_trains', 'Расписание электричек'),
      tool('search_trains', 'Поезда дальнего следования'),
    ]);

    expect(catalog.bindings.get('train')?.name).toBe('search_trains');
    expect(catalog.bindings.get('suburbanTrain')?.name).toBe('search_suburban_trains');
  });

  it('объявляет категорию недоступной, если подходящего tool нет', () => {
    const catalog = buildToolCatalog([tool('city_info', 'Справочник городов')]);

    expect(catalog.bindings.get('flight')).toBeUndefined();
    expect(catalog.reasons.get('flight')).toMatch(/не найден/i);
  });

  it('не сопоставляет tool без поискового намерения', () => {
    const catalog = buildToolCatalog([tool('flight_status', 'Статус рейса в реальном времени')]);

    expect(catalog.bindings.get('flight')).toBeUndefined();
  });
});
