import { describe, expect, it } from 'vitest';
import { mapHotelOffers, mapTransportOffers } from './map-offers';
import multitransport from './__fixtures__/tutu-multitransport.json' with { type: 'json' };

describe('mapTransportOffers', () => {
  it('читает известные псевдонимы и не выдумывает отсутствующие поля', () => {
    const [offer] = mapTransportOffers(
      {
        offers: [
          {
            id: 'f1',
            mode: 'flight',
            from: { name: 'Екатеринбург', lat: 56.8, lon: 60.6 },
            to: { name: 'Пулково' },
            departureTime: '2026-09-12T08:10:00+05:00',
            arrivalTime: '2026-09-12T09:40:00+03:00',
            price: 12_400,
            currency: 'RUB',
            deeplink: 'https://www.tutu.ru/avia/offer/f1',
          },
        ],
      },
      'outbound',
    );

    expect(offer).toMatchObject({
      id: 'f1',
      direction: 'outbound',
      mode: 'flight',
      departurePlace: { name: 'Екатеринбург', lat: 56.8, lon: 60.6 },
      arrivalPlace: { name: 'Пулково' },
      departureAt: '2026-09-12T08:10:00+05:00',
      arrivalAt: '2026-09-12T09:40:00+03:00',
      priceAmount: 12_400,
      currency: 'RUB',
      checkoutUrl: 'https://www.tutu.ru/avia/offer/f1',
    });
    expect(offer?.operator).toBeUndefined();
    expect(offer?.seatsAvailable).toBeUndefined();
  });

  it('поднимает сегменты из вложенного массива', () => {
    const [offer] = mapTransportOffers(
      {
        data: {
          items: [
            {
              id: 't1',
              type: 'train',
              segments: [
                {
                  from: 'Екатеринбург',
                  to: 'Пермь',
                  departure_at: '2026-09-12T18:00:00+05:00',
                  arrival_at: '2026-09-12T22:00:00+05:00',
                },
              ],
            },
          ],
        },
      },
      'inbound',
    );

    expect(offer?.direction).toBe('inbound');
    expect(offer?.segments).toHaveLength(1);
    expect(offer?.departurePlace?.name).toBe('Екатеринбург');
    expect(offer?.arrivalPlace?.name).toBe('Пермь');
  });
});

describe('mapHotelOffers', () => {
  it('подставляет даты заезда из запроса, если сервер их не вернул', () => {
    const [offer] = mapHotelOffers(
      [{ hotelId: 'h1', title: 'Невский 12', rating: 8.4, amount: 18_000 }],
      '2026-09-12',
      '2026-09-18',
    );

    expect(offer).toMatchObject({
      id: 'h1',
      name: 'Невский 12',
      rating: 8.4,
      priceAmount: 18_000,
      checkIn: '2026-09-12',
      checkOut: '2026-09-18',
    });
  });
});

describe('нормализация словаря видов транспорта', () => {
  it('переводит транспорт источника в доменные значения', () => {
    const offers = mapTransportOffers(
      {
        variants: [
          { id: 'r1', transport: 'railway' },
          { id: 'a1', transport: 'avia' },
          { id: 'e1', transport: 'etrain' },
          { id: 'b1', transport: 'bus' },
          { id: 't1', transport: 'train' },
          { id: 'f1', transport: 'flight' },
        ],
      },
      'outbound',
    );

    expect(offers.map((offer) => offer.mode)).toEqual([
      'train',
      'flight',
      'suburbanTrain',
      'bus',
      'train',
      'flight',
    ]);
  });

  it('оставляет незнакомый вид транспорта как есть — карантин должен отработать честно', () => {
    const [offer] = mapTransportOffers({ variants: [{ id: 'x1', transport: 'ferry' }] }, 'outbound');

    expect(offer?.mode).toBe('ferry');
  });

  it('переводит вид транспорта и внутри сегментов', () => {
    const [offer] = mapTransportOffers(
      {
        variants: [
          {
            id: 'r2',
            transport: 'railway',
            segments: [{ transport: 'railway', from: 'Москва', to: 'Тверь' }],
          },
        ],
      },
      'outbound',
    );

    expect(offer?.segments?.[0]?.mode).toBe('train');
  });
});

/**
 * Фикстура — реальный ответ `search_multitransport` (Москва → СПб, 2026-09-05),
 * усечённый до трёх вариантов. Проверяем именно те поля, которые терялись на живом MCP.
 */
describe('реальный payload search_multitransport', () => {
  const offers = mapTransportOffers(multitransport, 'outbound');

  it('читает цену из вложенного объекта price', () => {
    expect(offers[0]?.priceAmount).toBe(1620.82);
    expect(offers[0]?.currency).toBe('RUB');
    expect(offers.every((offer) => typeof offer.priceAmount === 'number')).toBe(true);
  });

  it('читает duration_min, carriers и segments_count', () => {
    expect(offers[0]).toMatchObject({
      id: '255d7ca003ba8a6908ba4bd5468fb0ad',
      mode: 'train',
      operator: 'ФПК',
      durationMinutes: 320,
      departureAt: '2026-09-05T17:45:00+03:00',
      arrivalAt: '2026-09-05T23:05:00+03:00',
      // segments_count = 1 → пересадок 0.
      transferCount: 0,
    });
    expect(offers[1]?.operator).toBe('Пальмира');
  });

  it('разворачивает legs[].segments[] так, что число сегментов совпадает с segments_count', () => {
    const raw = (multitransport as { variants: { segments_count: number }[] }).variants;
    offers.forEach((offer, index) => {
      expect(offer.segments?.length).toBe(raw[index]?.segments_count);
    });
  });

  it('переносит места и ссылку на оформление', () => {
    expect(offers[0]?.departurePlace?.name).toContain('Москва');
    expect(offers[0]?.arrivalPlace?.name).toContain('Санкт-Петербург');
    expect(offers[0]?.checkoutUrl).toContain('tutu.ru');
  });
});
