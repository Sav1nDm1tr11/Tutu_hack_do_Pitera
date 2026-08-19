import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import fastifyStatic from '@fastify/static';
import { buildApp } from './app';
import { loadEnv } from './config/env';

loadDotenv({ path: resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../.env') });

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp(env);

  const webDist = resolve(env.WEB_DIST_DIR);
  // Статика подключается только если каталог реально собран: в dev web живёт на Vite,
  // а отсутствие dist не должно валить API.
  if (env.WEB_DIST_DIR !== '' && existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Маршрут не найден.', retryable: false },
        });
      }
      return reply.sendFile('index.html');
    });
  }

  // Graceful shutdown: незавершённый NDJSON-поток на клиенте выглядит как зависание,
  // поэтому Fastify даётся возможность закрыть соединения самостоятельно.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      app.log.info({ event: 'shutdown', signal });
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((error: unknown) => {
  console.error('Не удалось запустить сервер:', error);
  process.exit(1);
});
