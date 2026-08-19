/**
 * Разбор NDJSON-потока.
 *
 * Ключевая деталь — буфер: чанки `fetch` не совпадают с границами строк, и объект может
 * приехать разрезанным пополам. Без склейки клиент терял бы ровно те события, которые
 * пришли на стыке чанков, причём случайным образом.
 */
export async function* readNdjson(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<unknown> {
  const body = response.body;
  if (body === null) throw new Error('Ответ сервера не содержит потока данных');

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted === true) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line !== '') yield JSON.parse(line);
        newlineIndex = buffer.indexOf('\n');
      }
    }

    // Последняя строка может прийти без завершающего перевода строки.
    const tail = buffer.trim();
    if (tail !== '') yield JSON.parse(tail);
  } finally {
    reader.releaseLock();
  }
}
