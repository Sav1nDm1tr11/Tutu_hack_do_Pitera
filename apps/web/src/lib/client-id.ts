/**
 * Идентификатор запроса в браузере.
 *
 * `crypto.randomUUID()` есть только в secure context (HTTPS / localhost). Сайт на
 * обычном HTTP иначе падает в обработчике submit — кнопка «не работает», запрос
 * на сервер не уходит.
 */
export function createClientId(prefix: string): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto !== undefined && typeof webCrypto.randomUUID === 'function') {
    return `${prefix}_${webCrypto.randomUUID()}`;
  }

  const bytes = new Uint8Array(16);
  if (webCrypto !== undefined && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}
