import { describe, expect, it } from 'vitest';
import { deriveFreshness, isCheckoutAllowedForFreshness } from './freshness';

const NOW = '2026-08-19T12:00';

describe('deriveFreshness', () => {
  it('свежие данные в пределах политики', () => {
    expect(deriveFreshness({ fetchedAt: '2026-08-19T11:58', now: NOW })).toBe('fresh');
  });

  it('стареющие данные между порогами', () => {
    expect(deriveFreshness({ fetchedAt: '2026-08-19T11:45', now: NOW })).toBe('aging');
  });

  it('устаревшие данные после порога', () => {
    expect(deriveFreshness({ fetchedAt: '2026-08-19T11:10', now: NOW })).toBe('stale');
  });

  // Если инвентарь сообщил TTL, он приоритетнее нашей осторожной эвристики (§14.3).
  it('использует expiresAt, когда он пришёл', () => {
    expect(
      deriveFreshness({ fetchedAt: '2026-08-19T11:10', expiresAt: '2026-08-19T13:00', now: NOW }),
    ).toBe('fresh');
    expect(
      deriveFreshness({ fetchedAt: '2026-08-19T11:58', expiresAt: '2026-08-19T12:03', now: NOW }),
    ).toBe('aging');
    expect(
      deriveFreshness({ fetchedAt: '2026-08-19T11:58', expiresAt: '2026-08-19T11:59', now: NOW }),
    ).toBe('stale');
  });

  it('offline имеет приоритет над возрастом данных', () => {
    expect(deriveFreshness({ fetchedAt: '2026-08-19T11:59', now: NOW, isOffline: true })).toBe(
      'offline',
    );
  });

  // Невозможность определить возраст не должна выглядеть как свежесть.
  it('трактует неразобранные метки как stale', () => {
    expect(deriveFreshness({ fetchedAt: 'плохо', now: NOW })).toBe('stale');
    expect(deriveFreshness({ fetchedAt: '2026-08-19T11:59', now: 'плохо' })).toBe('stale');
  });

  it('игнорирует неразобранный expiresAt и падает назад на возраст', () => {
    expect(
      deriveFreshness({ fetchedAt: '2026-08-19T11:58', expiresAt: 'плохо', now: NOW }),
    ).toBe('fresh');
  });
});

describe('isCheckoutAllowedForFreshness', () => {
  it('оформление запрещено на устаревших и offline данных', () => {
    expect(isCheckoutAllowedForFreshness('fresh')).toBe(true);
    expect(isCheckoutAllowedForFreshness('aging')).toBe(true);
    expect(isCheckoutAllowedForFreshness('stale')).toBe(false);
    expect(isCheckoutAllowedForFreshness('offline')).toBe(false);
  });
});
