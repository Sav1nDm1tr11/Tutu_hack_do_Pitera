import { describe, expect, it } from 'vitest';
import { arrivesBefore, dateOf, minutesBetween, overlapsNight, parseWallClock } from './wall-clock';

const NIGHT = { startMinuteOfDay: 23 * 60, endMinuteOfDay: 6 * 60 };

describe('parseWallClock', () => {
  it('разбирает ISO с и без секунд и смещения', () => {
    expect(parseWallClock('2026-09-12T08:40')?.minuteOfDay).toBe(520);
    expect(parseWallClock('2026-09-12T08:40:15')?.minuteOfDay).toBe(520);
    expect(parseWallClock('2026-09-12T08:40:00+05:00')?.minuteOfDay).toBe(520);
    expect(parseWallClock('2026-09-12')?.minuteOfDay).toBe(0);
  });

  // Смещение из строки намеренно игнорируется: инвентарь может не вернуть таймзону,
  // и 23:40 в ответе означает 23:40 на месте события (§3.2).
  it('не пересчитывает время по смещению', () => {
    const withOffset = parseWallClock('2026-09-12T23:40:00+03:00');
    const withoutOffset = parseWallClock('2026-09-12T23:40');
    expect(withOffset?.totalMinutes).toBe(withoutOffset?.totalMinutes);
  });

  it('возвращает undefined на мусоре', () => {
    expect(parseWallClock('не дата')).toBeUndefined();
    expect(parseWallClock('2026-13-45T99:99')).toBeUndefined();
    expect(parseWallClock('')).toBeUndefined();
  });
});

describe('minutesBetween', () => {
  it('считает разницу через полночь', () => {
    expect(minutesBetween('2026-09-12T23:30', '2026-09-13T01:00')).toBe(90);
  });

  it('возвращает undefined, если одна метка не разобрана', () => {
    expect(minutesBetween('плохо', '2026-09-13T01:00')).toBeUndefined();
  });
});

describe('overlapsNight', () => {
  it('дневной рейс не считается ночным', () => {
    expect(overlapsNight('2026-09-12T08:40', '2026-09-12T11:50', NIGHT)).toBe(false);
  });

  it('вылет поздним вечером с прибытием после полуночи — ночной', () => {
    expect(overlapsNight('2026-09-12T23:40', '2026-09-13T01:10', NIGHT)).toBe(true);
  });

  it('рейс, полностью проходящий сквозь ночь, — ночной', () => {
    expect(overlapsNight('2026-09-12T20:00', '2026-09-13T09:00', NIGHT)).toBe(true);
  });

  it('вечерний рейс, заканчивающийся до 23:00, не ночной', () => {
    expect(overlapsNight('2026-09-12T19:10', '2026-09-12T22:20', NIGHT)).toBe(false);
  });

  it('раннее утро до 06:00 — ночной', () => {
    expect(overlapsNight('2026-09-12T04:30', '2026-09-12T07:40', NIGHT)).toBe(true);
  });

  it('многосуточный поезд — ночной', () => {
    expect(overlapsNight('2026-09-12T16:42', '2026-09-14T03:10', NIGHT)).toBe(true);
  });

  // Ключевое требование §9.1: неизвестность не трактуется как «ночи нет».
  it('возвращает undefined при неразобранном времени', () => {
    expect(overlapsNight('плохо', '2026-09-13T01:10', NIGHT)).toBeUndefined();
    expect(overlapsNight('2026-09-13T01:10', 'плохо', NIGHT)).toBeUndefined();
  });

  it('возвращает undefined, если прибытие раньше отправления', () => {
    expect(overlapsNight('2026-09-12T18:00', '2026-09-12T09:00', NIGHT)).toBeUndefined();
  });
});

describe('arrivesBefore', () => {
  it('сравнивает по настенным часам точки прибытия', () => {
    expect(arrivesBefore('2026-09-12T13:40', '14:00')).toBe(true);
    expect(arrivesBefore('2026-09-12T14:00', '14:00')).toBe(true);
    expect(arrivesBefore('2026-09-12T14:01', '14:00')).toBe(false);
  });

  it('возвращает undefined при неразобранных значениях', () => {
    expect(arrivesBefore('плохо', '14:00')).toBeUndefined();
    expect(arrivesBefore('2026-09-12T13:40', '25:00')).toBeUndefined();
  });
});

describe('dateOf', () => {
  it('извлекает дату без времени', () => {
    expect(dateOf('2026-09-12T23:40')).toBe('2026-09-12');
    expect(dateOf('плохо')).toBeUndefined();
  });
});
