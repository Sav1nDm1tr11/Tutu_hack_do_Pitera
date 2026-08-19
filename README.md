# ТуТу План Б

Mobile-first PWA, которая стресс-тестирует план поездки **до покупки**: где маршрут
ломается, насколько он устойчив и какой у него план Б. Оформление — на tutu.ru,
это приложение заказы не создаёт.

Репозиторий: `Tutu_hack_do_Pitera`. Спека — `docs/SPEC.md`, архитектура —
`docs/ARCHITECTURE.md`. Как пользоваться приложением — `docs/USER.md`.

## Что умеет

- Собрать маршрут Екатеринбург → Санкт-Петербург (и другие направления из демо-каталога).
- Показать до трёх конфигураций: цена / время / устойчивость.
- Подсветить риски пересадок и ночных сегментов.
- Предложить ограниченный план Б по самым уязвимым этапам.
- Показать маршрут на глобусе; без WebGL или координат — текстовая схема.
- Работать без OpenAI-ключа и без live Tutu MCP: полный happy path на fixtures.

## Требования

- Node.js ≥ 22.12
- pnpm 10 (`corepack enable` и `corepack prepare pnpm@10.34.5 --activate`)

## Быстрый старт

```bash
cd Tutu_hack_do_Pitera
cp .env.example .env
pnpm install
pnpm dev
```

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:3001 (`GET /api/health`)

Vite проксирует `/api` на API-сервер. Ключи не нужны: инвентарь — демо,
планировщик — детерминированный.

Типовой запрос для демо: Екатеринбург → Санкт-Петербург, туда и обратно,
1 взрослый, бюджет около 60 000 ₽.

## Скрипты

| Команда | Зачем |
|---|---|
| `pnpm dev` | Web + API параллельно |
| `pnpm test` | Vitest (domain, api) |
| `pnpm typecheck` | `tsc --noEmit` по пакетам |
| `pnpm lint` | ESLint, включая границы слоёв |
| `pnpm build` | Сборка web (API исполняется через tsx) |
| `pnpm verify` | lint + typecheck + test + build |
| `pnpm mcp:inspect` | Discovery Tutu MCP; ненулевой код, если endpoint недоступен |
| `pnpm start` | API, в production ещё раздаёт `apps/web/dist` |

## Режимы инвентаря

Задаются `INVENTORY_MODE` в `.env`:

- `fixture` — демо-данные, badge «Демо-данные». **По умолчанию.**
- `live` — Tutu MCP (`TUTU_MCP_URL`). Категории без подходящего tool помечаются unavailable.
- `auto` — попытка live, откат на fixtures, если discovery пустой. Источники не смешиваются.

Live MCP из среды разработки недостижим (проверено 2026-08-19, см.
`docs/MCP_SPIKE_REPORT.md`). Адаптер написан и включается флагом, но не
считается проверенным, пока `pnpm mcp:inspect` не завершится успешно и не
запишет `docs/mcp-tools.snapshot.json`.

## LLM

По умолчанию рассуждения идут через **OpenRouter** и бесплатную модель
`nvidia/nemotron-3-ultra-550b-a55b:free` (Nemotron 3 Ultra 550B). Это не GPT:
нужна мощная `:free` модель, чтобы проверить функционал без оплаты.

Задайте `LLM_API_KEY` (ключ OpenRouter) в `.env`. Без ключа объяснения строятся
из `ScoreBreakdown` шаблонами. Модель **не** считает score и **не** выбирает
победителя.

`LLM_MODE=required` падает на старте без ключа — чтобы молчаливый откат не
выглядел как работа модели.

Запасные бесплатные slug'и, если Ultra недоступна: `z-ai/glm-5.2:free`,
`google/gemma-4-31b-it:free`, `openai/gpt-oss-20b:free`.

## Production-сборка

```bash
pnpm --filter @tutu-plan-b/web build
pnpm start
```

Fastify раздаёт `apps/web/dist` и SPA-fallback, если каталог существует.
Секреты с префиксом `VITE_` попадают в браузерный bundle — их там быть не должно.

Docker:

```bash
docker build -t tutu-plan-b .
docker run --rm -p 3001:3001 --env-file .env tutu-plan-b
```

## Ограничения MVP

- Демо-цены и расписания синтетические, пока live MCP недоступен.
- Электрички моделируются как расписание без оформления.
- Глобус в демо рисует сушу из локального атласа, не из коммерческого тайлового провайдера.
- Планы на сервере живут в памяти процесса (TTL 24 ч) и не переживают рестарт.
- Приложение не бронирует билеты и не принимает оплату.
- Offline показывает только последний сохранённый план и помечает его как возможно устаревший.

## Структура

```
apps/web                 PWA: поиск, план, глобус, offline
apps/api                 Fastify: оркестратор, адаптеры, TTL-репозиторий
packages/domain          Контракты, нормализация, scoring, geo, fallback
packages/test-fixtures   Детерминированный демо-инвентарь
docs/                    SPEC, capability map, MCP spike, architecture
```
