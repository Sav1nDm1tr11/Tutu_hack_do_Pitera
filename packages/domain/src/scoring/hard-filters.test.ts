import { describe, expect, it } from 'vitest';
import { request, transport } from '../testing/builders';
import { checkBudget, checkTransportHardConstraints, mergeVerdicts } from './hard-filters';

describe('checkTransportHardConstraints', () => {
  it('пропускает вариант, не нарушающий ограничений', () => {
    expect(checkTransportHardConstraints(transport(), request()).status).toBe('passed');
  });

  it('исключает запрещённый вид транспорта', () => {
    const verdict = checkTransportHardConstraints(
      transport({ mode: 'bus' }),
      request({
        hardConstraints: {
          allowedModes: ['flight', 'train'],
          noNightSegments: false,
          minimumTransferPolicy: 'standard',
          budgetIsHard: true,
        },
      }),
    );

    expect(verdict.status).toBe('rejected');
    expect(verdict.violations[0]?.code).toBe('modeNotAllowed');
  });

  it('исключает вариант с датой, не совпадающей с запросом', () => {
    const verdict = checkTransportHardConstraints(
      transport({ departureAt: '2026-09-13T08:40', arrivalAt: '2026-09-13T11:50' }),
      request(),
    );

    expect(verdict.status).toBe('rejected');
    expect(verdict.violations[0]?.code).toBe('dateMismatch');
  });

  it('исключает ночной сегмент при запрете ночи', () => {
    const verdict = checkTransportHardConstraints(
      transport({ departureAt: '2026-09-12T23:40', arrivalAt: '2026-09-13T01:10' }),
      request({
        hardConstraints: {
          noNightSegments: true,
          minimumTransferPolicy: 'standard',
          budgetIsHard: true,
        },
      }),
    );

    expect(verdict.status).toBe('rejected');
    expect(verdict.violations[0]?.code).toBe('nightSegment');
  });

  it('исключает вариант с числом пересадок больше лимита', () => {
    const verdict = checkTransportHardConstraints(
      transport({ transferCount: 3 }),
      request({
        hardConstraints: {
          maxTransfers: 1,
          noNightSegments: false,
          minimumTransferPolicy: 'standard',
          budgetIsHard: true,
        },
      }),
    );

    expect(verdict.status).toBe('rejected');
    expect(verdict.violations[0]?.code).toBe('tooManyTransfers');
  });

  it('исключает прибытие позже дедлайна', () => {
    const verdict = checkTransportHardConstraints(
      transport({ arrivalAt: '2026-09-12T15:30' }),
      request({
        hardConstraints: {
          arriveBeforeLocalTime: '14:00',
          noNightSegments: false,
          minimumTransferPolicy: 'standard',
          budgetIsHard: true,
        },
      }),
    );

    expect(verdict.status).toBe('rejected');
    expect(verdict.violations[0]?.code).toBe('arrivesAfterDeadline');
  });

  it('дедлайн прибытия не применяется к обратной дороге', () => {
    const verdict = checkTransportHardConstraints(
      transport({
        direction: 'inbound',
        departureAt: '2026-09-15T14:10',
        arrivalAt: '2026-09-15T19:20',
      }),
      request({
        hardConstraints: {
          arriveBeforeLocalTime: '14:00',
          noNightSegments: false,
          minimumTransferPolicy: 'standard',
          budgetIsHard: true,
        },
      }),
    );

    expect(verdict.status).toBe('passed');
  });

  // Центральное правило §9.1: нехватка данных никогда не трактуется в пользу варианта,
  // но и не выбрасывает его молча.
  describe('нехватка данных', () => {
    it('неизвестное число пересадок даёт needsVerification, а не passed', () => {
      const verdict = checkTransportHardConstraints(
        transport({ transferCount: undefined }),
        request({
          hardConstraints: {
            maxTransfers: 1,
            noNightSegments: false,
            minimumTransferPolicy: 'standard',
            budgetIsHard: true,
          },
        }),
      );

      expect(verdict.status).toBe('needsVerification');
      expect(verdict.violations[0]?.code).toBe('transferDataMissing');
      expect(verdict.violations[0]?.blocking).toBe(false);
    });

    it('нечитаемое время при запрете ночи даёт needsVerification', () => {
      const verdict = checkTransportHardConstraints(
        transport({ arrivalAt: 'неизвестно' }),
        request({
          hardConstraints: {
            noNightSegments: true,
            minimumTransferPolicy: 'standard',
            budgetIsHard: true,
          },
        }),
      );

      expect(verdict.status).toBe('needsVerification');
      expect(verdict.violations.map((violation) => violation.code)).toContain('nightDataMissing');
    });

    it('ограничение не проверяется, если пользователь его не задал', () => {
      expect(
        checkTransportHardConstraints(transport({ transferCount: undefined }), request()).status,
      ).toBe('passed');
    });
  });
});

describe('checkBudget', () => {
  it('цена в пределах бюджета проходит', () => {
    expect(checkBudget(50_000, request()).status).toBe('passed');
  });

  it('точное совпадение с бюджетом проходит', () => {
    expect(checkBudget(90_000, request()).status).toBe('passed');
  });

  it('превышение жёсткого бюджета исключает вариант', () => {
    const verdict = checkBudget(120_000, request());
    expect(verdict.status).toBe('rejected');
    expect(verdict.violations[0]?.code).toBe('budgetExceeded');
  });

  // Бюджет как предпочтение: вариант остаётся, но причина фиксируется для объяснения.
  it('превышение мягкого бюджета оставляет вариант с пометкой', () => {
    const verdict = checkBudget(
      120_000,
      request({
        hardConstraints: {
          noNightSegments: false,
          minimumTransferPolicy: 'standard',
          budgetIsHard: false,
        },
      }),
    );

    expect(verdict.status).toBe('needsVerification');
    expect(verdict.violations[0]?.code).toBe('budgetExceeded');
  });

  it('неизвестная цена не считается соблюдением бюджета', () => {
    const verdict = checkBudget(undefined, request());
    expect(verdict.status).toBe('needsVerification');
    expect(verdict.violations[0]?.code).toBe('priceUnknown');
  });
});

describe('mergeVerdicts', () => {
  it('одно блокирующее нарушение делает итог rejected', () => {
    expect(
      mergeVerdicts(checkBudget(50_000, request()), checkBudget(120_000, request())).status,
    ).toBe('rejected');
  });

  it('только неблокирующие нарушения дают needsVerification', () => {
    expect(
      mergeVerdicts(checkBudget(50_000, request()), checkBudget(undefined, request())).status,
    ).toBe('needsVerification');
  });

  it('отсутствие нарушений даёт passed', () => {
    expect(mergeVerdicts(checkBudget(50_000, request())).status).toBe('passed');
  });
});
