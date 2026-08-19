import { describe, expect, it } from 'vitest';
import { inspectCheckoutUrl, isAllowedCheckoutUrl, safeCheckoutUrl } from './allowlist';

describe('deeplink allowlist', () => {
  it('пропускает адреса на разрешённых хостах ТуТу', () => {
    expect(isAllowedCheckoutUrl('https://avia.tutu.ru/offers/abc')).toBe(true);
    expect(isAllowedCheckoutUrl('https://poezd.tutu.ru/offers/abc?utm=1')).toBe(true);
    expect(isAllowedCheckoutUrl('https://www.tutu.ru/')).toBe(true);
  });

  // Суффиксная проверка хоста — классический способ обойти allowlist,
  // поэтому сравнение только на полное равенство.
  it('отклоняет посторонний хост, похожий на разрешённый', () => {
    expect(inspectCheckoutUrl('https://tutu.ru.evil.com/offers/abc')).toEqual({
      allowed: false,
      reason: 'hostNotAllowed',
    });
    expect(inspectCheckoutUrl('https://eviltutu.ru/offers')).toEqual({
      allowed: false,
      reason: 'hostNotAllowed',
    });
    expect(inspectCheckoutUrl('https://tutu.ru.example.org')).toEqual({
      allowed: false,
      reason: 'hostNotAllowed',
    });
  });

  it('отклоняет небезопасные и подменные схемы', () => {
    expect(inspectCheckoutUrl('http://avia.tutu.ru/offers')).toEqual({
      allowed: false,
      reason: 'insecureProtocol',
    });
    expect(inspectCheckoutUrl('javascript:alert(1)')).toEqual({
      allowed: false,
      reason: 'insecureProtocol',
    });
    expect(inspectCheckoutUrl('//avia.tutu.ru/offers')).toEqual({
      allowed: false,
      reason: 'malformedUrl',
    });
    expect(inspectCheckoutUrl('data:text/html,<script>')).toEqual({
      allowed: false,
      reason: 'insecureProtocol',
    });
  });

  it('отклоняет адрес с встроенными учётными данными', () => {
    expect(inspectCheckoutUrl('https://user:pass@avia.tutu.ru/offers')).toEqual({
      allowed: false,
      reason: 'credentialsInUrl',
    });
  });

  it('отклоняет пустое и неразбираемое значение', () => {
    expect(inspectCheckoutUrl(undefined).allowed).toBe(false);
    expect(inspectCheckoutUrl('   ').allowed).toBe(false);
    expect(inspectCheckoutUrl('не ссылка').allowed).toBe(false);
  });

  it('не отдаёт посторонний адрес наружу вовсе', () => {
    expect(safeCheckoutUrl('https://tutu.ru.evil.com')).toBeUndefined();
    expect(safeCheckoutUrl('https://hotel.tutu.ru/x')).toBe('https://hotel.tutu.ru/x');
  });

  it('не зависит от регистра хоста', () => {
    expect(isAllowedCheckoutUrl('https://AVIA.TUTU.RU/offers')).toBe(true);
  });
});
