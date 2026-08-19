import type { FastifyInstance } from 'fastify';
import type { PlaceRef, TravelInventoryGateway } from '@tutu-plan-b/domain';
import { suggestCities } from '@tutu-plan-b/test-fixtures';

export interface MetaRoutesDeps {
  readonly gateway: TravelInventoryGateway;
  readonly plannerMode: 'llm' | 'deterministic';
  readonly version: string;
}

export async function registerMetaRoutes(
  app: FastifyInstance,
  deps: MetaRoutesDeps,
): Promise<void> {
  /** Liveness: отвечает, пока процесс жив, и не зависит от внешних сервисов. */
  app.get('/api/health', async () => ({ status: 'ok', version: deps.version }));

  /**
   * Readiness со снимком возможностей. Клиент показывает по нему badge источника данных,
   * поэтому деградация категории видна пользователю, а не только в логах (§5.4).
   */
  app.get('/api/capabilities', async () => {
    const capabilities = await deps.gateway.describeCapabilities();
    return { capabilities, plannerMode: deps.plannerMode };
  });

  /**
   * Подсказки городов. В демо-режиме источник — тот же каталог, что и у инвентаря:
   * предлагать направления, для которых нет ни одного варианта, значит обещать
   * пользователю поиск, который заведомо вернёт пустоту.
   */
  app.get('/api/places', async (request) => {
    const { q } = request.query as { q?: string };
    const query = (q ?? '').trim();

    if (query.length < 2) return { places: [] };

    return {
      places: suggestCities(query, 8).map(
        (city): PlaceRef => ({
          id: city.id,
          name: city.name,
          kind: 'city',
          point: city.point,
          timezone: formatUtcOffset(city.utcOffsetMinutes),
        }),
      ),
    };
  });
}

/**
 * Фиксированное смещение вместо имени зоны IANA: демо-каталог знает только смещение,
 * и выдумывать `Europe/Moscow` там, где известно лишь `+03:00`, значило бы сообщить
 * больше, чем есть в данных.
 */
function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const rest = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${rest}`;
}
