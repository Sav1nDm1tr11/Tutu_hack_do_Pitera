import { describe, expect, it } from 'vitest';
import { place, segment, transport } from '../testing/builders';
import { analyzeTransfers, requiredBufferMinutes } from './transfers';

const SVO = place('msk:svo', 'Шереметьево', 37.4146, 55.9726);
const DME = place('msk:dme', 'Домодедово', 37.9063, 55.4088);
const EKB = place('ekb:svx', 'Кольцово', 60.8027, 56.7431);
const LED = place('spb:led', 'Пулково', 30.2625, 59.8003);

describe('requiredBufferMinutes', () => {
  it('смена точки требует большего запаса, чем пересадка на месте', () => {
    expect(requiredBufferMinutes(true, 'standard')).toBeLessThan(
      requiredBufferMinutes(false, 'standard'),
    );
  });

  it('политика extra строже стандартной', () => {
    expect(requiredBufferMinutes(true, 'extra')).toBeGreaterThan(
      requiredBufferMinutes(true, 'standard'),
    );
  });

  // Неизвестность обрабатывается по строгому варианту, а не по удобному.
  it('неизвестная смена точки трактуется осторожно', () => {
    expect(requiredBufferMinutes(undefined, 'standard')).toBe(
      requiredBufferMinutes(false, 'standard'),
    );
  });
});

describe('analyzeTransfers', () => {
  it('прямой вариант без пересадок имеет полный буфер', () => {
    const analysis = analyzeTransfers(transport({ transferCount: 0 }), 'standard');
    expect(analysis.count).toBe(0);
    expect(analysis.bufferRatio).toBe(1);
    expect(analysis.hasTightTransfer).toBe(false);
  });

  it('достаточный буфер на том же аэропорту признаётся комфортным', () => {
    const analysis = analyzeTransfers(
      transport({
        segments: [
          segment('s1', '2026-09-12T06:20', '2026-09-12T07:55', EKB, SVO),
          segment('s2', '2026-09-12T10:40', '2026-09-12T12:10', SVO, LED),
        ],
      }),
      'standard',
    );

    expect(analysis.count).toBe(1);
    expect(analysis.minWaitMinutes).toBe(165);
    expect(analysis.hasTightTransfer).toBe(false);
    expect(analysis.hasStationChange).toBe(false);
    expect(analysis.bufferRatio).toBe(1);
  });

  // Ровно тот случай, который обычный поиск показывает как «дешевле», а мы — как риск.
  it('смена аэропорта с коротким буфером признаётся тесной пересадкой', () => {
    const analysis = analyzeTransfers(
      transport({
        segments: [
          segment('s1', '2026-09-12T07:05', '2026-09-12T08:40', EKB, DME),
          segment('s2', '2026-09-12T10:05', '2026-09-12T11:35', SVO, LED),
        ],
      }),
      'standard',
    );

    expect(analysis.hasStationChange).toBe(true);
    expect(analysis.minWaitMinutes).toBe(85);
    expect(analysis.hasTightTransfer).toBe(true);
    expect(analysis.bufferRatio).toBeLessThan(1);
  });

  it('политика extra превращает приемлемый буфер в тесный', () => {
    const withSegments = transport({
      segments: [
        segment('s1', '2026-09-12T06:20', '2026-09-12T07:55', EKB, SVO),
        segment('s2', '2026-09-12T08:50', '2026-09-12T10:20', SVO, LED),
      ],
    });

    expect(analyzeTransfers(withSegments, 'standard').hasTightTransfer).toBe(false);
    expect(analyzeTransfers(withSegments, 'extra').hasTightTransfer).toBe(true);
  });

  // Детализации нет — буфер неизвестен. Подставлять «типичную» пересадку нельзя (§3.3).
  it('без детализации сегментов буфер остаётся неизвестным', () => {
    const analysis = analyzeTransfers(transport({ transferCount: 1 }), 'standard');
    expect(analysis.count).toBe(1);
    expect(analysis.bufferRatio).toBeUndefined();
    expect(analysis.minWaitMinutes).toBeUndefined();
    expect(analysis.hasStationChange).toBeUndefined();
  });

  it('без детализации и без счётчика число пересадок неизвестно', () => {
    const analysis = analyzeTransfers(transport({ transferCount: undefined }), 'standard');
    expect(analysis.count).toBeUndefined();
    expect(analysis.bufferRatio).toBeUndefined();
  });

  it('число пересадок берётся из детализации, а не из счётчика', () => {
    const analysis = analyzeTransfers(
      transport({
        transferCount: 5,
        segments: [
          segment('s1', '2026-09-12T06:20', '2026-09-12T07:55', EKB, SVO),
          segment('s2', '2026-09-12T10:40', '2026-09-12T12:10', SVO, LED),
        ],
      }),
      'standard',
    );

    expect(analysis.count).toBe(1);
  });

  it('места без общего id и без координат дают неизвестную смену точки', () => {
    const analysis = analyzeTransfers(
      transport({
        segments: [
          segment('s1', '2026-09-12T06:20', '2026-09-12T07:55', EKB, place('x', 'Хаб')),
          segment('s2', '2026-09-12T10:40', '2026-09-12T12:10', place('y', 'Хаб'), LED),
        ],
      }),
      'standard',
    );

    expect(analysis.hasStationChange).toBeUndefined();
    // Неизвестность даёт строгий порог, поэтому 165 минут всё ещё достаточно.
    expect(analysis.hasTightTransfer).toBe(false);
  });
});
