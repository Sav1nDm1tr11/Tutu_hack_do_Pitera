import { describe, expect, it } from 'vitest';
import type { RawHotelOffer, RawTransportOffer } from './raw';
import { normalizeHotelOffer, normalizeTransportOffer, type NormalizationContext } from './normalize';
import { normalizeInventoryBatch } from './normalize-batch';

const context: NormalizationContext = { fetchedAt: '2026-08-19T12:00', live: true, toolCallId: 'tc_1' };

const validTransport: RawTransportOffer = {
  id: 'out_1',
  direction: 'outbound',
  mode: 'flight',
  operator: 'Уральские авиалинии',
  departurePlace: { id: 'ekb:svx', name: 'Кольцово', lat: 56.7431, lon: 60.8027 },
  departureAt: '2026-09-12T08:40',
  arrivalPlace: { id: 'spb:led', name: 'Пулково', lat: 59.8003, lon: 30.2625 },
  arrivalAt: '2026-09-12T09:50',
  durationMinutes: 190,
  transferCount: 0,
  priceAmount: 18_600,
  currency: 'RUB',
  serviceClass: 'Эконом',
  checkoutUrl: 'https://avia.tutu.ru/offers/out_1',
};

describe('normalizeTransportOffer', () => {
  it('приводит полную запись к каноничному виду', () => {
    const result = normalizeTransportOffer(validTransport, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.option.id).toBe('out_1');
    expect(result.option.mode).toBe('flight');
    expect(result.option.price).toEqual({ amount: 18_600, currency: 'RUB' });
    expect(result.option.departure.place.point).toEqual({ lat: 56.7431, lon: 60.8027 });
    expect(result.option.dataCompleteness).toBe(1);
    expect(result.option.source.length).toBeGreaterThan(0);
  });

  // §3.3: отсутствующее поле остаётся отсутствующим и снижает dataCompleteness.
  it('не подставляет значения вместо отсутствующих полей', () => {
    const { priceAmount: _price, currency: _currency, durationMinutes: _duration, transferCount: _transfers, operator: _operator, serviceClass: _class, checkoutUrl: _url, ...sparse } = validTransport;

    const result = normalizeTransportOffer(sparse, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.option.price).toBeUndefined();
    expect(result.option.durationMinutes).toBeUndefined();
    expect(result.option.transferCount).toBeUndefined();
    expect(result.option.checkoutUrl).toBeUndefined();
    expect(result.option.dataCompleteness).toBeLessThan(0.5);
  });

  it('игнорирует лишние неизвестные поля', () => {
    const result = normalizeTransportOffer(
      { ...validTransport, futureField: 'что-то новое' } as RawTransportOffer,
      context,
    );
    expect(result.ok).toBe(true);
  });

  it('не отдаёт координаты, которых не было', () => {
    const result = normalizeTransportOffer(
      {
        ...validTransport,
        departurePlace: { id: 'ekb:svx', name: 'Кольцово' },
        arrivalPlace: { id: 'spb:led', name: 'Пулково' },
      },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.departure.place.point).toBeUndefined();
    expect(result.option.arrival.place.point).toBeUndefined();
  });

  it('отбрасывает координаты вне допустимого диапазона', () => {
    const result = normalizeTransportOffer(
      { ...validTransport, departurePlace: { id: 'x', name: 'Кольцово', lat: 999, lon: 60 } },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.departure.place.point).toBeUndefined();
  });

  // §16.5: посторонний хост не показывается вовсе, а не «с предупреждением».
  it('вырезает checkout-ссылку на постороннем хосте', () => {
    const result = normalizeTransportOffer(
      { ...validTransport, checkoutUrl: 'https://tutu.ru.evil.com/offers/out_1' },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.checkoutUrl).toBeUndefined();
  });

  it('число пересадок выводится из детализации сегментов', () => {
    const result = normalizeTransportOffer(
      {
        ...validTransport,
        transferCount: 7,
        segments: [
          {
            id: 's1',
            mode: 'flight',
            departurePlace: { id: 'a', name: 'A', lat: 56, lon: 60 },
            departureAt: '2026-09-12T08:40',
            arrivalPlace: { id: 'b', name: 'B', lat: 55, lon: 37 },
            arrivalAt: '2026-09-12T09:40',
          },
          {
            id: 's2',
            mode: 'flight',
            departurePlace: { id: 'b', name: 'B', lat: 55, lon: 37 },
            departureAt: '2026-09-12T11:40',
            arrivalPlace: { id: 'c', name: 'C', lat: 59, lon: 30 },
            arrivalAt: '2026-09-12T13:10',
          },
        ],
      },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.transferCount).toBe(1);
    expect(result.option.segments).toHaveLength(2);
  });

  // Частичная детализация даёт ложную уверенность в буферах пересадки.
  it('отбрасывает детализацию целиком, если один сегмент неполный', () => {
    const result = normalizeTransportOffer(
      {
        ...validTransport,
        segments: [
          {
            id: 's1',
            mode: 'flight',
            departurePlace: { id: 'a', name: 'A' },
            departureAt: '2026-09-12T08:40',
            arrivalPlace: { id: 'b', name: 'B' },
            arrivalAt: '2026-09-12T09:40',
          },
          { id: 's2', mode: 'flight', departurePlace: { id: 'b', name: 'B' } },
        ],
      },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.segments).toBeUndefined();
  });

  describe('quarantine', () => {
    const cases: readonly [string, RawTransportOffer, string][] = [
      ['без идентификатора', { ...validTransport, id: undefined }, 'missingId'],
      ['с неизвестным видом транспорта', { ...validTransport, mode: 'teleport' }, 'unknownMode'],
      ['без места отправления', { ...validTransport, departurePlace: undefined }, 'missingPlaces'],
      ['без времени', { ...validTransport, arrivalAt: undefined }, 'missingTimes'],
      ['с нечитаемым временем', { ...validTransport, departureAt: 'скоро' }, 'missingTimes'],
      [
        'с прибытием раньше отправления',
        { ...validTransport, arrivalAt: '2026-09-12T07:00' },
        'negativeDuration',
      ],
    ];

    for (const [title, offer, reason] of cases) {
      it(`отправляет в quarantine запись ${title}`, () => {
        const result = normalizeTransportOffer(offer, context);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.quarantined.reason).toBe(reason);
        expect(result.quarantined.detail).not.toBe('');
      });
    }
  });

  it('в fixture-режиме источник не помечается как ответ MCP', () => {
    const result = normalizeTransportOffer(validTransport, { ...context, live: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.source.every((ref) => ref.sourceType !== 'tutuMcp')).toBe(true);
  });
});

describe('normalizeHotelOffer', () => {
  const validHotel: RawHotelOffer = {
    id: 'hotel_1',
    name: 'Отель у вокзала',
    checkIn: '2026-09-12T14:00',
    checkOut: '2026-09-15T12:00',
    nights: 3,
    priceAmount: 18_900,
    currency: 'RUB',
    rating: 8.1,
    reviewSummaryText: 'Чисто и близко к вокзалу',
    reviewRedFlags: ['шум с улицы'],
    checkoutUrl: 'https://hotel.tutu.ru/offers/hotel_1',
  };

  it('приводит полную запись к каноничному виду', () => {
    const result = normalizeHotelOffer(validHotel, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.rating).toBe(8.1);
    expect(result.option.reviewRedFlags).toEqual(['шум с улицы']);
  });

  it('без анализа отзывов red flags остаются пустыми, а не выводятся эвристикой', () => {
    const { reviewSummaryText: _text, reviewRedFlags: _flags, ...withoutReviews } = validHotel;
    const result = normalizeHotelOffer(withoutReviews, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.reviewSummary).toBeUndefined();
    expect(result.option.reviewRedFlags).toEqual([]);
  });

  it('обрезает слишком длинный текст отзыва', () => {
    const result = normalizeHotelOffer(
      { ...validHotel, reviewSummaryText: 'а'.repeat(5000) },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.reviewSummary!.text.length).toBeLessThanOrEqual(600);
  });

  it('число ночей выводится из даты, если поле не пришло', () => {
    const { nights: _nights, ...withoutNights } = validHotel;
    const result = normalizeHotelOffer(withoutNights, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option.nights).toBe(3);
  });

  it('отправляет в quarantine отель без названия и с неверными датами', () => {
    expect(normalizeHotelOffer({ ...validHotel, name: '  ' }, context).ok).toBe(false);
    expect(normalizeHotelOffer({ ...validHotel, checkIn: undefined }, context).ok).toBe(false);
    expect(
      normalizeHotelOffer({ ...validHotel, checkOut: '2026-09-11T12:00' }, context).ok,
    ).toBe(false);
  });
});

describe('normalizeInventoryBatch', () => {
  it('одна битая запись не роняет остальные', () => {
    const result = normalizeInventoryBatch(
      {
        transport: [validTransport, { ...validTransport, id: 'out_2', mode: 'teleport' }],
        hotels: [],
      },
      context,
    );

    expect(result.counts.transportAccepted).toBe(1);
    expect(result.quarantined).toHaveLength(1);
    expect(Object.keys(result.pool)).toEqual(['out_1']);
  });

  it('пустая пачка обрабатывается без ошибок', () => {
    const result = normalizeInventoryBatch({ transport: [], hotels: [] }, context);
    expect(result.pool).toEqual({});
    expect(result.quarantined).toHaveLength(0);
  });
});
