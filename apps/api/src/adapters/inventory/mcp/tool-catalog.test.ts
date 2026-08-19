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
    // Отзывы отдаёт отдельный tool, и это правильная привязка: инвентарь остаётся за
    // поиском, а отзывы — за карточкой отзывов.
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

  it('предпочитает поисковый tool справочнику *_instructions', () => {
    const catalog = buildToolCatalog([
      tool('search_bus', 'Search Tutu intercity bus tickets between two cities'),
      tool('get_bus_instructions', 'Detailed bus playbook: read before working with search_bus'),
      tool('search_hotels', 'Search Tutu hotel listings, returns rating and guest reviews'),
      tool('get_hotels_instructions', 'Detailed hotels playbook: search_hotels pitfalls'),
      tool(
        'get_offer_details',
        "Fetch details for a single offer from a search_hotels row: rates, photos, review summary, view='reviews' for a feedback-only card",
      ),
    ]);

    expect(catalog.bindings.get('bus')?.name).toBe('search_bus');
    expect(catalog.bindings.get('hotel')?.name).toBe('search_hotels');
    expect(catalog.bindings.get('hotelReviews')?.name).toBe('get_offer_details');
    expect(catalog.unmatched).toContain('get_bus_instructions');
    expect(catalog.unmatched).toContain('get_hotels_instructions');
  });

  it('не связывает категорию со справочником, даже если поиска для неё нет', () => {
    const catalog = buildToolCatalog([
      tool('get_bus_instructions', 'Detailed bus playbook: search for intercity buses'),
    ]);

    expect(catalog.bindings.get('bus')).toBeUndefined();
    expect(catalog.reasons.get('bus')).toMatch(/справочн/i);
  });

  it('при равном счёте выбирает tool с search в имени', () => {
    const catalog = buildToolCatalog([
      tool('aggregate_hotels', 'Список отелей города'),
      tool('search_hotels', 'Список отелей города'),
    ]);

    expect(catalog.bindings.get('hotel')?.name).toBe('search_hotels');
  });
});
