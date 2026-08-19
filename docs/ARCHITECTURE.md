# Architecture notes — «ТуТу План Б»

Коротко о том, как устроен репозиторий и какие границы нельзя размывать.
Подробный контракт — в `docs/SPEC.md`. Отчёт по недоступности live MCP —
в `docs/MCP_SPIKE_REPORT.md`.

## Слои

```
apps/web  ──HTTP──►  apps/api  ──gateway──►  inventory (fixture | live MCP)
     │                    │
     │                    ├── adapters/llm      (OpenRouter / OpenAI-совместимый | deterministic)
     │                    └── orchestration     (фазы, бюджеты, stream)
     │
     └── @tutu-plan-b/domain   (контракты, scoring, geo, fallback)
              ▲
              └── @tutu-plan-b/test-fixtures   (только API и тесты)
```

`packages/domain` не знает ни про React, ни про Fastify, ни про MCP SDK.
Время и случайность приходят параметром: числа на экране считаются фактами,
и их нельзя пересчитывать по-разному в тесте и в проде.

## Источник инвентаря

| `INVENTORY_MODE` | Поведение |
|---|---|
| `fixture` | Демо-каталог. Badge «Демо-данные». Значение по умолчанию. |
| `live` | Tutu MCP. Категории, не найденные в `tools/list`, помечаются unavailable. |
| `auto` | Сначала live; если discovery не дал ни одной категории — fixtures. Источники не смешиваются. |

Live-адаптер не хардкодит имена tool'ов. Сопоставление строится из discovery
по ключевым словам (`apps/api/src/adapters/inventory/mcp/tool-catalog.ts`).
Booking/payment tool'ы в deny-list и не вызываются: приложение не оформляет
поездки, оно доводит до tutu.ru.

Пока `pnpm mcp:inspect` не завершился успешно, live-адаптер реализован,
но не считается проверенным.

## Что считает модель, а что — код

LLM (если есть ключ OpenRouter/OpenAI-совместимого API) строит только search plan и текст объяснения.
Score, totals, hard filters, Plan B и геометрия маршрута — детерминированный
домен. Без ключа работает `DeterministicPlanner`: happy path сохраняется.

## Потоки данных в UI

1. `POST /api/plan` отдаёт NDJSON (`plan.started` → progress → `plan.ready`).
2. Клиент кладёт последний план в IndexedDB. Service worker не кэширует API:
   устаревшая цена, выданная как актуальная, запрещена.
3. Оформление — это allowlisted deeplink на tutu.ru, не заказ в нашем API.

## Камера глобуса

`deriveRouteViewport` живёт в домене и одинаково работает на всех экранах.
MapLibre изолирован в `RouteGlobe`: React передаёт геометрию, камеру считает
домен, пользовательский pan/zoom отключает автокадрирование.
