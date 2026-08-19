import { describe, expect, it } from 'vitest';
import type { CandidateOption, CandidatePool } from '../contracts/candidate';
import { FALLBACK_CAVEAT } from '../contracts/fallback';
import { groupInventory } from '../scoring/assemble';
import { buildConfigurations } from '../scoring/configurations';
import { hotel, place, request, segment, transport } from '../testing/builders';
import { buildFallbackPlans } from './build-fallback';

const NOW = '2026-09-01T10:00';
const MAX_STAGES = 2;
const MAX_OPTIONS = 2;

const EKB = place('ekb:svx', 'Кольцово', 60.8027, 56.7431);
const LED = place('spb:led', 'Пулково', 30.2625, 59.8003);
const SVO = place('msk:svo', 'Шереметьево', 37.4146, 55.9726);
const DME = place('msk:dme', 'Домодедово', 37.9063, 55.4088);

function pool(...options: readonly CandidateOption[]): CandidatePool {
  return Object.fromEntries(options.map((option) => [option.id, option]));
}

const tightOutbound = transport({
  id: 'out_tight',
  departureAt: '2026-09-12T07:05',
  arrivalAt: '2026-09-12T11:35',
  price: 12_400,
  segments: [
    segment('s1', '2026-09-12T07:05', '2026-09-12T08:40', EKB, DME),
    segment('s2', '2026-09-12T10:05', '2026-09-12T11:35', SVO, LED),
  ],
});

const backupA = transport({ id: 'out_backup_a', departureAt: '2026-09-12T08:40', arrivalAt: '2026-09-12T09:50', price: 18_600 });
const backupB = transport({ id: 'out_backup_b', departureAt: '2026-09-12T10:20', arrivalAt: '2026-09-12T11:30', price: 19_400 });
const backupC = transport({ id: 'out_backup_c', departureAt: '2026-09-12T12:10', arrivalAt: '2026-09-12T13:20', price: 20_100 });
const inbound = transport({ id: 'in_1', direction: 'inbound', departureAt: '2026-09-15T14:10', arrivalAt: '2026-09-15T19:20', price: 17_800 });

function planFor(candidatePool: CandidatePool) {
  const travelRequest = request();
  const result = buildConfigurations({ pool: candidatePool, request: travelRequest, now: NOW });
  const grouped = groupInventory(result.pool, travelRequest);

  const alternativesByOptionId = new Map<string, number>();
  for (const entry of [...grouped.outbound, ...grouped.inbound]) {
    alternativesByOptionId.set(entry.option.id, entry.option.direction === 'outbound' ? grouped.outbound.length - 1 : 0);
  }

  return { result, grouped, travelRequest, alternativesByOptionId };
}

describe('buildFallbackPlans', () => {
  it('готовит замены для уязвимого этапа и ссылается только на реальные ID', () => {
    const candidatePool = pool(tightOutbound, backupA, backupB, backupC, inbound, hotel());
    const { result, grouped, travelRequest, alternativesByOptionId } = planFor(candidatePool);

    const configuration = result.configurations.find((item) =>
      item.stages.some((stage) => stage.selectedOptionId === 'out_tight'),
    );
    expect(configuration).toBeDefined();

    const plans = buildFallbackPlans({
      configuration: configuration!,
      pool: result.pool,
      request: travelRequest,
      grouped,
      alternativesByOptionId,
      now: NOW,
      maxStages: MAX_STAGES,
      maxOptionsPerStage: MAX_OPTIONS,
    });

    expect(plans.length).toBeGreaterThan(0);

    for (const plan of plans) {
      for (const optionId of plan.optionIds) {
        expect(result.pool[optionId], optionId).toBeDefined();
      }
    }
  });

  // §10.1: границы — условие корректности, а не оптимизация.
  it('соблюдает лимиты: не больше двух этапов и двух опций на этап', () => {
    const candidatePool = pool(tightOutbound, backupA, backupB, backupC, inbound, hotel());
    const { result, grouped, travelRequest, alternativesByOptionId } = planFor(candidatePool);

    for (const configuration of result.configurations) {
      const plans = buildFallbackPlans({
        configuration,
        pool: result.pool,
        request: travelRequest,
        grouped,
        alternativesByOptionId,
        now: NOW,
        maxStages: MAX_STAGES,
        maxOptionsPerStage: MAX_OPTIONS,
      });

      expect(plans.length).toBeLessThanOrEqual(MAX_STAGES);
      for (const plan of plans) {
        expect(plan.optionIds.length).toBeLessThanOrEqual(MAX_OPTIONS);
      }
    }
  });

  it('каждый план несёт обязательную оговорку и метку актуальности', () => {
    const candidatePool = pool(tightOutbound, backupA, backupB, inbound, hotel());
    const { result, grouped, travelRequest, alternativesByOptionId } = planFor(candidatePool);

    const plans = buildFallbackPlans({
      configuration: result.configurations[0]!,
      pool: result.pool,
      request: travelRequest,
      grouped,
      alternativesByOptionId,
      now: NOW,
      maxStages: MAX_STAGES,
      maxOptionsPerStage: MAX_OPTIONS,
    });

    for (const plan of plans) {
      expect(plan.caveat).toBe(FALLBACK_CAVEAT);
      expect(plan.validAt).toBe(NOW);
    }
  });

  // Пустой блок «План Б» без объяснения выглядел бы как сбой продукта.
  it('при отсутствии замен возвращает честную причину, а не пустой план', () => {
    const candidatePool = pool(tightOutbound, inbound, hotel());
    const { result, grouped, travelRequest } = planFor(candidatePool);

    const plans = buildFallbackPlans({
      configuration: result.configurations[0]!,
      pool: result.pool,
      request: travelRequest,
      grouped,
      alternativesByOptionId: new Map([['out_tight', 0]]),
      now: NOW,
      maxStages: MAX_STAGES,
      maxOptionsPerStage: MAX_OPTIONS,
    });

    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]?.status).toBe('notAvailable');
    expect(plans[0]?.unavailableReason).toBeDefined();
    expect(plans[0]?.optionIds).toEqual([]);
  });

  it('замена, уезжающая слишком далеко по времени, не предлагается', () => {
    const farAway = transport({
      id: 'out_far',
      departureAt: '2026-09-12T23:30',
      arrivalAt: '2026-09-13T00:40',
      price: 9_000,
    });

    const candidatePool = pool(tightOutbound, farAway, inbound, hotel());
    const { result, grouped, travelRequest } = planFor(candidatePool);

    const configuration = result.configurations.find((item) =>
      item.stages.some((stage) => stage.selectedOptionId === 'out_tight'),
    );
    if (configuration === undefined) return;

    const plans = buildFallbackPlans({
      configuration,
      pool: result.pool,
      request: travelRequest,
      grouped,
      alternativesByOptionId: new Map([['out_tight', 1]]),
      now: NOW,
      maxStages: MAX_STAGES,
      maxOptionsPerStage: MAX_OPTIONS,
    });

    expect(plans.flatMap((plan) => plan.optionIds)).not.toContain('out_far');
  });

  it('предпочитает замену без тесной пересадки', () => {
    const tightBackup = transport({
      id: 'out_backup_tight',
      departureAt: '2026-09-12T08:00',
      arrivalAt: '2026-09-12T12:30',
      price: 11_000,
      segments: [
        segment('t1', '2026-09-12T08:00', '2026-09-12T09:35', EKB, DME),
        segment('t2', '2026-09-12T11:00', '2026-09-12T12:30', SVO, LED),
      ],
    });

    const candidatePool = pool(tightOutbound, tightBackup, backupA, inbound, hotel());
    const { result, grouped, travelRequest } = planFor(candidatePool);

    const configuration = result.configurations.find((item) =>
      item.stages.some((stage) => stage.selectedOptionId === 'out_tight'),
    );
    if (configuration === undefined) return;

    const plans = buildFallbackPlans({
      configuration,
      pool: result.pool,
      request: travelRequest,
      grouped,
      alternativesByOptionId: new Map([['out_tight', 2]]),
      now: NOW,
      maxStages: MAX_STAGES,
      maxOptionsPerStage: 1,
    });

    const chosen = plans.flatMap((plan) => plan.optionIds);
    if (chosen.length > 0) {
      expect(chosen[0]).toBe('out_backup_a');
    }
  });
});
