import { describe, expect, it } from 'vitest';
import { buildRouteGeometry } from './route-geometry';
import type { CandidatePool } from '../contracts/candidate';
import type { PlanConfiguration } from '../contracts/plan';
import { hotel, place, transport } from '../testing/builders';

const EKB = place('ekb', 'Екатеринбург', 60.6, 56.84);
const SPB = place('spb', 'Санкт-Петербург', 30.32, 59.94);

function configuration(stageIds: readonly { id: string; kind: 'transport' | 'hotel'; optionId: string }[]): PlanConfiguration {
  return {
    id: 'cfg_test',
    preset: 'balanced',
    labels: ['balanced'],
    stages: stageIds.map((stage) => ({
      id: stage.id,
      kind: stage.kind,
      selectedOptionId: stage.optionId,
      alternativeOptionIds: [],
      temporarilyUnavailable: false,
      title: stage.id,
    })),
    totals: { priceCompleteness: 1, nightSegmentCount: 0, stageCount: stageIds.length },
    score: {
      total: 0.5,
      confidence: 1,
      dimensions: [],
      hardConstraintPassed: true,
      needsVerification: false,
    },
    explanation: { headline: 'x', bullets: [], caveats: [], generatedBy: 'template' },
  };
}

describe('buildRouteGeometry', () => {
  it('в поездке в одну сторону конечная точка помечена как пункт назначения', () => {
    const outbound = transport({ id: 't_out', from: EKB, to: SPB });
    const pool: CandidatePool = { [outbound.id]: outbound };

    const geometry = buildRouteGeometry(
      configuration([{ id: 's1', kind: 'transport', optionId: outbound.id }]),
      pool,
    );

    const roles = geometry.markers.map((marker) => ({ id: marker.place.id, role: marker.role }));
    expect(roles).toEqual(
      expect.arrayContaining([
        { id: 'ekb', role: 'origin' },
        { id: 'spb', role: 'destination' },
      ]),
    );
  });

  it('в поездке туда-обратно возвращение помечено как исходная точка, а не второй пункт назначения', () => {
    const outbound = transport({ id: 't_out', from: EKB, to: SPB });
    const inbound = transport({
      id: 't_in',
      direction: 'inbound',
      from: SPB,
      to: EKB,
      departureAt: '2026-09-15T18:00',
      arrivalAt: '2026-09-16T02:00',
    });
    const pool: CandidatePool = { [outbound.id]: outbound, [inbound.id]: inbound };

    const geometry = buildRouteGeometry(
      configuration([
        { id: 's1', kind: 'transport', optionId: outbound.id },
        { id: 's2', kind: 'transport', optionId: inbound.id },
      ]),
      pool,
    );

    expect(geometry.markers.filter((marker) => marker.role === 'origin')).toHaveLength(1);
    expect(geometry.markers.find((marker) => marker.place.id === 'ekb')?.role).toBe('origin');
    expect(geometry.markers.find((marker) => marker.place.id === 'spb')?.role).toBe('destination');
    expect(geometry.segments).toHaveLength(2);
  });

  it('не достраивает координаты, если у этапа их нет', () => {
    const noPoint = place('unknown', 'Без координат');
    const outbound = transport({ id: 't_out', from: EKB, to: noPoint });
    const pool: CandidatePool = { [outbound.id]: outbound };

    const geometry = buildRouteGeometry(
      configuration([{ id: 's1', kind: 'transport', optionId: outbound.id }]),
      pool,
    );

    expect(geometry.segments).toHaveLength(0);
    expect(geometry.hasCompleteCoordinates).toBe(false);
  });

  it('отель попадает отдельным маркером и не создаёт линию', () => {
    const outbound = transport({ id: 't_out', from: EKB, to: SPB });
    const stay = hotel({
      id: 'h1',
      place: place('hotel_spb', 'Отель в центре', 30.33, 59.93),
    });
    const pool: CandidatePool = { [outbound.id]: outbound, [stay.id]: stay };

    const geometry = buildRouteGeometry(
      configuration([
        { id: 's1', kind: 'transport', optionId: outbound.id },
        { id: 's2', kind: 'hotel', optionId: stay.id },
      ]),
      pool,
    );

    expect(geometry.markers.filter((marker) => marker.role === 'hotel')).toHaveLength(1);
    expect(geometry.segments).toHaveLength(1);
  });
});
