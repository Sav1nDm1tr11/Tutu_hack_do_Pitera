/**
 * §16.5: deeplink проверяется по allowlist до отображения. Проверка живёт в домене,
 * чтобы и сервер, и клиент применяли ровно одно правило — расхождение здесь означало бы
 * возможность увести пользователя на посторонний хост.
 */

const ALLOWED_HOSTS: readonly string[] = [
  'tutu.ru',
  'www.tutu.ru',
  'c.tutu.ru',
  'avia.tutu.ru',
  'poezd.tutu.ru',
  'bus.tutu.ru',
  'suburban.tutu.ru',
  'hotel.tutu.ru',
  'provereno.tutu.ru',
];

export interface CheckoutUrlVerdict {
  readonly allowed: boolean;
  readonly reason?: 'malformedUrl' | 'insecureProtocol' | 'hostNotAllowed' | 'credentialsInUrl';
}

export function inspectCheckoutUrl(rawUrl: string | undefined): CheckoutUrlVerdict {
  if (rawUrl === undefined || rawUrl.trim() === '') {
    return { allowed: false, reason: 'malformedUrl' };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'malformedUrl' };
  }

  if (url.protocol !== 'https:') {
    return { allowed: false, reason: 'insecureProtocol' };
  }

  // `https://user:pass@tutu.ru` проходит проверку хоста, но выглядит как попытка подмены.
  if (url.username !== '' || url.password !== '') {
    return { allowed: false, reason: 'credentialsInUrl' };
  }

  // Сравнение только на полное равенство: суффиксная проверка пропустила бы tutu.ru.evil.com.
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.includes(host)) {
    return { allowed: false, reason: 'hostNotAllowed' };
  }

  return { allowed: true };
}

export function isAllowedCheckoutUrl(rawUrl: string | undefined): boolean {
  return inspectCheckoutUrl(rawUrl).allowed;
}

/** Отфильтрованный URL для отображения: посторонний хост не показывается вовсе. */
export function safeCheckoutUrl(rawUrl: string | undefined): string | undefined {
  return isAllowedCheckoutUrl(rawUrl) ? rawUrl : undefined;
}

export const ALLOWED_CHECKOUT_HOSTS = ALLOWED_HOSTS;
