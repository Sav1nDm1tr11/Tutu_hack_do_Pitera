import { describe, expect, it } from 'vitest';
import { mapHotelOffers, mapTransportOffers } from './map-offers';

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
