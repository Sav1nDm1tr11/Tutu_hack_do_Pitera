import { describe, expect, it } from 'vitest';
import type { CandidateOption, CandidatePool } from '../contracts/candidate';
import { isTransportOption } from '../contracts/candidate';
import { hotel, place, request, segment, transport } from '../testing/builders';
import { buildConfigurations } from './configurations';
import { HOTEL_UNAVAILABLE_OPTION_ID } from './stages';

const NOW = '2026-09-01T10:00';

const EKB = place('ekb:svx', 'Кольцово', 60.8027, 56.7431);
const LED = place('spb:led', 'Пулково', 30.2625, 59.8003);
const SVO = place('msk:svo', 'Шереметьево', 37.4146, 55.9726);
const DME = place('msk:dme', 'Домодедово', 37.9063, 55.4088);

function pool(...options: readonly CandidateOption[]): CandidatePool {
  return Object.fromEntries(options.map((option) => [option.id, option]));
}

const outboundDirect = transport({
  id: 'out_direct',
  departureAt: '2026-09-12T08:40',
  arrivalAt: '2026-09-12T09:50',
  price: 18_600,
  transferCount: 0,
});

/** Дешевле прямого, но со сменой аэропорта и коротким буфером — риск, а не выгода. */
const outboundCheapTight = transport({
  id: 'out_cheap_tight',
  departureAt: '2026-09-12T07:05',
  arrivalAt: '2026-09-12T11:35',
  price: 12_400,
  segments: [
    segment('s1', '2026-09-12T07:05', '2026-09-12T08:40', EKB, DME),
    segment('s2', '2026-09-12T10:05', '2026-09-12T11:35', SVO, LED),
  ],
});

const outboundNight = transport({
  id: 'out_night',
  departureAt: '2026-09-12T23:40',
  arrivalAt: '2026-09-13T00:50',
  price: 9_200,
  transferCount: 0,
});

const inboundDay = transport({
  id: 'in_day',
  direction: 'inbound',
  departureAt: '2026-09-15T14:10',
  arrivalAt: '2026-09-15T19:20',
  price: 17_800,
  transferCount: 0,
});

const inboundNight = transport({
  id: 'in_night',
  direction: 'inbound',
  departureAt: '2026-09-15T23:30',
  arrivalAt: '2026-09-16T04:40',
  price: 10_600,
  transferCount: 0,
});

const hotelComfort = hotel({ id: 'hotel_comfort', price: { amount: 18_900, currency: 'RUB' }, rating: 8.6 });
const hotelBudget = hotel({ id: 'hotel_budget', price: { amount: 9_900, currency: 'RUB' }, rating: 7.1 });

const fullPool = pool(
  outboundDirect,
  outboundCheapTight,
  outboundNight,
  inboundDay,
  inboundNight,
  hotelComfort,
  hotelBudget,
);

describe('buildConfigurations', () => {
  it('возвращает до трёх конфигураций и не больше', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    expect(result.configurations.length).toBeGreaterThan(0);
    expect(result.configurations.length).toBeLessThanOrEqual(3);
  });

  // Инвариант §22.3: ни одного option ID вне candidate pool.
  it('каждый выбранный и альтернативный вариант существует в pool', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });

    for (const configuration of result.configurations) {
      for (const stage of configuration.stages) {
        if (stage.temporarilyUnavailable) continue;
        expect(result.pool[stage.selectedOptionId], stage.selectedOptionId).toBeDefined();
        for (const alternativeId of stage.alternativeOptionIds) {
          expect(result.pool[alternativeId], alternativeId).toBeDefined();
        }
      }
    }
  });

  it('конфигурации различаются хотя бы одним выбранным вариантом', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    const selections = result.configurations.map((configuration) =>
      configuration.stages.map((stage) => stage.selectedOptionId).join('|'),
    );

    expect(new Set(selections).size).toBe(selections.length);
  });

  it('надёжный вариант не выбирает маршрут с тесной пересадкой', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    const reliable = result.configurations.find((configuration) =>
      configuration.labels.includes('reliable'),
    );

    const outboundStage = reliable?.stages.find((stage) => stage.kind === 'transport');
    expect(outboundStage?.selectedOptionId).not.toBe('out_cheap_tight');
  });

  it('бюджетный вариант не дороже надёжного', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    const priceOf = (label: 'reliable' | 'budget'): number | undefined =>
      result.configurations.find((configuration) => configuration.labels.includes(label))?.totals
        .price?.amount;

    const budget = priceOf('budget');
    const reliable = priceOf('reliable');
    if (budget !== undefined && reliable !== undefined) {
      expect(budget).toBeLessThanOrEqual(reliable);
    }
  });

  it('надёжный вариант устойчивее бюджетного по размерности resilience', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    const resilienceOf = (label: 'reliable' | 'budget'): number | undefined =>
      result.configurations
        .find((configuration) => configuration.labels.includes(label))
        ?.score.dimensions.find((dimension) => dimension.key === 'resilience')?.score;

    const reliable = resilienceOf('reliable');
    const budget = resilienceOf('budget');
    if (reliable !== undefined && budget !== undefined) {
      expect(reliable).toBeGreaterThanOrEqual(budget);
    }
  });

  /**
   * §9.5.5. Три почти одинаковых карточки выглядели бы как выбор, которого нет,
   * поэтому совпавшие конфигурации сливаются, а labels объединяются.
   */
  it('совпавшие конфигурации сливаются в одну с несколькими метками', () => {
    const single = pool(outboundDirect, inboundDay, hotelComfort);
    const result = buildConfigurations({ pool: single, request: request(), now: NOW });

    expect(result.configurations).toHaveLength(1);
    expect(result.configurations[0]?.labels).toEqual(['reliable', 'balanced', 'budget']);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'fewerConfigurationsThanRequested',
    );
  });

  it('не добивает результат копиями до трёх вариантов', () => {
    const single = pool(outboundDirect, inboundDay, hotelComfort);
    const result = buildConfigurations({ pool: single, request: request(), now: NOW });
    expect(result.configurations).toHaveLength(1);
  });

  it('жёсткие ограничения соблюдаются в выбранных вариантах', () => {
    const result = buildConfigurations({
      pool: fullPool,
      request: request({
        hardConstraints: {
          noNightSegments: true,
          minimumTransferPolicy: 'standard',
          budgetIsHard: true,
        },
      }),
      now: NOW,
    });

    const selectedIds = result.configurations.flatMap((configuration) =>
      configuration.stages.map((stage) => stage.selectedOptionId),
    );

    expect(selectedIds).not.toContain('out_night');
    expect(selectedIds).not.toContain('in_night');
  });

  it('при отсутствии подходящего транспорта возвращает объяснение, а не пустоту', () => {
    const result = buildConfigurations({
      pool: pool(hotelComfort),
      request: request(),
      now: NOW,
    });

    expect(result.configurations).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).not.toBe('');
  });

  it('несовместимые ограничения дают ноль конфигураций вместо их нарушения', () => {
    const result = buildConfigurations({
      pool: pool(outboundNight, inboundNight),
      request: request({
        hardConstraints: {
          noNightSegments: true,
          minimumTransferPolicy: 'standard',
          budgetIsHard: true,
        },
      }),
      now: NOW,
    });

    expect(result.configurations).toHaveLength(0);
  });

  // §5.2: отказ категории отелей оставляет транспортный маршрут видимым.
  it('без отелей транспортная часть сохраняется, а этап помечается недоступным', () => {
    const result = buildConfigurations({
      pool: pool(outboundDirect, outboundNight, inboundDay, inboundNight),
      request: request(),
      now: NOW,
    });

    expect(result.configurations.length).toBeGreaterThan(0);
    const hotelStage = result.configurations[0]?.stages.find((stage) => stage.kind === 'hotel');
    expect(hotelStage?.temporarilyUnavailable).toBe(true);
    expect(hotelStage?.selectedOptionId).toBe(HOTEL_UNAVAILABLE_OPTION_ID);
    expect(result.warnings.map((warning) => warning.code)).toContain('hotelsUnavailable');
  });

  it('поездка в одну сторону не содержит проживания и обратной дороги', () => {
    const result = buildConfigurations({
      pool: fullPool,
      request: request({ tripType: 'oneWay', returnDate: undefined }),
      now: NOW,
    });

    const kinds = result.configurations[0]?.stages.map((stage) => stage.kind) ?? [];
    expect(kinds).toEqual(['transport']);
  });

  it('ожидание заселения появляется отдельным вычисленным этапом', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    const configuration = result.configurations.find((item) =>
      item.stages.some((stage) => stage.kind === 'wait'),
    );

    const waitStage = configuration?.stages.find((stage) => stage.kind === 'wait');
    expect(waitStage).toBeDefined();

    const waitOption = result.pool[waitStage!.selectedOptionId];
    expect(waitOption?.kind).toBe('calculated');
    expect(waitOption?.source[0]?.sourceType).toBe('calculation');
  });

  it('риск-сигналы проставляются на транспортных вариантах', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    const tight = result.pool.out_cheap_tight;

    expect(tight).toBeDefined();
    expect(isTransportOption(tight!)).toBe(true);
    expect(
      isTransportOption(tight!) ? tight.riskSignals.map((signal) => signal.code) : [],
    ).toContain('tightTransfer');
  });

  it('ночной вариант получает риск-сигнал nightSegment', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    const night = result.pool.out_night;

    expect(
      isTransportOption(night!) ? night.riskSignals.map((signal) => signal.code) : [],
    ).toContain('nightSegment');
  });

  it('детерминирован: одинаковый вход даёт одинаковый результат', () => {
    const first = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    const second = buildConfigurations({ pool: fullPool, request: request(), now: NOW });
    expect(first.configurations).toEqual(second.configurations);
  });

  it('каждая причина объяснения существует в ScoreBreakdown', () => {
    const result = buildConfigurations({ pool: fullPool, request: request(), now: NOW });

    for (const configuration of result.configurations) {
      const availableCodes = new Set(
        configuration.score.dimensions.flatMap((dimension) =>
          dimension.reasons.map((reason) => reason.code),
        ),
      );

      for (const bullet of configuration.explanation.bullets) {
        expect(availableCodes.has(bullet.reasonCode), bullet.reasonCode).toBe(true);
      }
    }
  });

  it('при неполных данных объяснение содержит оговорку', () => {
    const result = buildConfigurations({
      pool: pool(
        transport({ id: 'out_sparse', price: undefined, transferCount: undefined, dataCompleteness: 0.4 }),
        inboundDay,
      ),
      request: request(),
      now: NOW,
    });

    const configuration = result.configurations[0];
    expect(configuration).toBeDefined();
    expect(configuration!.explanation.caveats.length).toBeGreaterThan(0);
    expect(configuration!.score.confidence).toBeLessThan(1);
  });

  it('неизвестная цена не превращается в нулевую сумму', () => {
    const result = buildConfigurations({
      pool: pool(transport({ id: 'out_no_price', price: undefined }), inboundDay),
      request: request(),
      now: NOW,
    });

    const totals = result.configurations[0]?.totals;
    expect(totals?.price).toBeUndefined();
    expect(totals?.priceCompleteness).toBeLessThan(1);
  });
});
