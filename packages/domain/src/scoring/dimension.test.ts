import { describe, expect, it } from 'vitest';
import type { ScoreSignal } from '../contracts/score';
import { aggregateDimensions, clamp01, scoreDimension } from './dimension';

const signal = (key: string, value: number | undefined, weight = 1): ScoreSignal => ({
  key,
  value,
  weight,
  reasons: [],
});

describe('clamp01', () => {
  it('ограничивает диапазон и обезвреживает NaN', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('scoreDimension', () => {
  it('считает взвешенное среднее доступных сигналов', () => {
    const dimension = scoreDimension(
      'price',
      [signal('a', 1, 2), signal('b', 0, 1)],
      30,
    );

    expect(dimension.score).toBeCloseTo(2 / 3, 6);
    expect(dimension.availableWeight).toBe(3);
    expect(dimension.requiredSignalWeight).toBe(3);
  });

  /**
   * Ядро §9.2. Отсутствующий сигнал не получает среднее значение и не считается
   * положительным: он исключается из числителя и знаменателя, а его вес остаётся
   * в requiredSignalWeight, снижая confidence.
   */
  it('пропущенный сигнал не участвует в среднем, но уменьшает покрытие', () => {
    const withAll = scoreDimension('resilience', [signal('a', 1, 1), signal('b', 0, 1)], 50);
    const withGap = scoreDimension('resilience', [signal('a', 1, 1), signal('b', undefined, 1)], 50);

    expect(withAll.score).toBeCloseTo(0.5, 6);
    expect(withGap.score).toBeCloseTo(1, 6);

    // Оценка не «средняя» и не «нулевая» — она построена на меньшем объёме данных,
    // и это выражается покрытием, а не подтасовкой значения.
    expect(withGap.availableWeight).toBe(1);
    expect(withGap.requiredSignalWeight).toBe(2);
  });

  it('пропущенный сигнал не подставляется нулём', () => {
    const withGap = scoreDimension('resilience', [signal('a', 1, 1), signal('b', undefined, 1)], 50);
    const withZero = scoreDimension('resilience', [signal('a', 1, 1), signal('b', 0, 1)], 50);
    expect(withGap.score).not.toBeCloseTo(withZero.score, 6);
  });

  it('размерность без доступных сигналов получает нулевой availableWeight', () => {
    const dimension = scoreDimension('comfort', [signal('a', undefined), signal('b', undefined)], 15);
    expect(dimension.availableWeight).toBe(0);
    expect(dimension.score).toBe(0);
    expect(dimension.requiredSignalWeight).toBe(2);
  });

  it('сигнал с нулевым весом не влияет на покрытие', () => {
    const dimension = scoreDimension('comfort', [signal('a', 1, 2), signal('b', undefined, 0)], 15);
    expect(dimension.availableWeight).toBe(2);
    expect(dimension.requiredSignalWeight).toBe(2);
  });

  it('значения вне 0..1 обрезаются, а не искажают среднее', () => {
    expect(scoreDimension('price', [signal('a', 5, 1)], 30).score).toBe(1);
  });
});

describe('aggregateDimensions', () => {
  it('итог считается только по размерностям с доступными сигналами', () => {
    const result = aggregateDimensions([
      { key: 'price', score: 1, weight: 50, availableWeight: 1, requiredSignalWeight: 1, reasons: [] },
      { key: 'duration', score: 0, weight: 50, availableWeight: 1, requiredSignalWeight: 1, reasons: [] },
    ]);

    expect(result.total).toBeCloseTo(50, 5);
    expect(result.confidence).toBeCloseTo(1, 5);
  });

  // Размерность без данных не тянет итог к нулю — она снижает уверенность.
  it('размерность без данных исключается из итога и снижает confidence', () => {
    const result = aggregateDimensions([
      { key: 'price', score: 0.8, weight: 50, availableWeight: 1, requiredSignalWeight: 1, reasons: [] },
      { key: 'comfort', score: 0, weight: 50, availableWeight: 0, requiredSignalWeight: 1, reasons: [] },
    ]);

    expect(result.total).toBeCloseTo(80, 5);
    expect(result.confidence).toBeCloseTo(0.5, 5);
  });

  it('пробел в тяжёлой размерности бьёт по confidence сильнее, чем в лёгкой', () => {
    const gapInHeavy = aggregateDimensions([
      { key: 'resilience', score: 1, weight: 50, availableWeight: 1, requiredSignalWeight: 2, reasons: [] },
      { key: 'comfort', score: 1, weight: 10, availableWeight: 2, requiredSignalWeight: 2, reasons: [] },
    ]);
    const gapInLight = aggregateDimensions([
      { key: 'resilience', score: 1, weight: 50, availableWeight: 2, requiredSignalWeight: 2, reasons: [] },
      { key: 'comfort', score: 1, weight: 10, availableWeight: 1, requiredSignalWeight: 2, reasons: [] },
    ]);

    expect(gapInHeavy.confidence).toBeLessThan(gapInLight.confidence);
  });

  it('полное отсутствие данных даёт нулевой итог и нулевую уверенность', () => {
    const result = aggregateDimensions([
      { key: 'price', score: 0, weight: 50, availableWeight: 0, requiredSignalWeight: 1, reasons: [] },
    ]);

    expect(result.total).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('итог лежит в диапазоне 0..100', () => {
    const result = aggregateDimensions([
      { key: 'price', score: 1, weight: 100, availableWeight: 1, requiredSignalWeight: 1, reasons: [] },
    ]);
    expect(result.total).toBe(100);
  });
});
