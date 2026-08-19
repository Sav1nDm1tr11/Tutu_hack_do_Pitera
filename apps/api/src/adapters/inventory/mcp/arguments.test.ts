import { describe, expect, it } from 'vitest';
import type { PlaceRef, TravelRequest } from '@tutu-plan-b/domain';
import { planHotelArguments, planTransportArguments } from './arguments';
import type { DiscoveredTool } from './session';

const origin: PlaceRef = { id: 'ekb', name: 'Екатеринбург', kind: 'city' };
const destination: PlaceRef = { id: 'spb', name: 'Санкт-Петербург', kind: 'city' };

function request(): TravelRequest {
  return {
    requestId: 'req_1',
    origin,
    destination,
    tripType: 'roundTrip',
    departDate: '2026-09-12',
    returnDate: '2026-09-18',
    travelers: { adults: 2, children: [{ age: 7 }] },
    budget: { amount: 80_000, currency: 'RUB', scope: 'totalTrip' },
    hardConstraints: {
      noNightSegments: false,
      minimumTransferPolicy: 'standard',
      budgetIsHard: true,
    },
    preferences: { price: 0.5, duration: 0.5, resilience: 0.5, comfort: 0.5 },
    locale: 'ru-RU',
  };
}

function tool(properties: Record<string, { type?: string; enum?: readonly string[]; hasDefault?: boolean }>, required: readonly string[] = []): DiscoveredTool {
  return {
    name: 'search',
    description: '',
    inputSchema: {
      properties: Object.fromEntries(
        Object.entries(properties).map(([name, spec]) => [
          name,
          {
            type: spec.type,
            description: undefined,
            format: undefined,
            enumValues: spec.enum,
            hasDefault: spec.hasDefault === true,
          },
        ]),
      ),
      required,
    },
  };
}

describe('planTransportArguments', () => {
  it('заполняет поля по псевдонимам схемы, а не по захардкоженным именам', () => {
    const plan = planTransportArguments(
      tool({
        fromCity: { type: 'string' },
        toCity: { type: 'string' },
        departure_date: { type: 'string' },
        adults: { type: 'integer' },
        children: { type: 'integer' },
        transportType: { type: 'string', enum: ['avia', 'train', 'bus'] },
      }),
      request(),
      'outbound',
      'flight',
    );

    expect(plan.missingRequired).toEqual([]);
    expect(plan.args).toEqual({
      fromCity: 'Екатеринбург',
      toCity: 'Санкт-Петербург',
      departure_date: '2026-09-12',
      adults: 2,
      children: 1,
      transportType: 'avia',
    });
  });

  it('для обратного плеча меняет местами города и дату', () => {
    const plan = planTransportArguments(
      tool({ from: { type: 'string' }, to: { type: 'string' }, date: { type: 'string' } }),
      request(),
      'inbound',
      'train',
    );

    expect(plan.args).toEqual({
      from: 'Санкт-Петербург',
      to: 'Екатеринбург',
      date: '2026-09-18',
    });
  });

  it('не вызывает tool, если обязательное поле заполнить нечем', () => {
    const plan = planTransportArguments(
      tool({ mystery: { type: 'string' } }, ['mystery']),
      request(),
      'outbound',
      'flight',
    );

    expect(plan.missingRequired).toEqual(['mystery']);
  });

  it('игнорирует обязательные поля со значением по умолчанию', () => {
    const plan = planTransportArguments(
      tool({ from: { type: 'string' }, extra: { type: 'string', hasDefault: true } }, ['from', 'extra']),
      request(),
      'outbound',
      'bus',
    );

    expect(plan.missingRequired).toEqual([]);
    expect(plan.args).toEqual({ from: 'Екатеринбург' });
  });
});

describe('planHotelArguments', () => {
  it('передаёт город назначения и даты проживания', () => {
    const plan = planHotelArguments(
      tool({
        city: { type: 'string' },
        checkIn: { type: 'string' },
        checkOut: { type: 'string' },
        guests: { type: 'integer' },
      }),
      request(),
      '2026-09-12',
      '2026-09-18',
    );

    expect(plan.args).toEqual({
      city: 'Санкт-Петербург',
      checkIn: '2026-09-12',
      checkOut: '2026-09-18',
      guests: 2,
    });
  });
});
