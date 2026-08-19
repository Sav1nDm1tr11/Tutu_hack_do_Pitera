# Implementation Plan: «ТуТу План Б»

**Spec:** `docs/SPEC.md` · **Capability map:** `docs/CAPABILITY_MAP.md` · **Задачи:** `tasks/todo.md`

## Стратегия

Вертикальные срезы. После каждого этапа существует работающий UI и зелёный `pnpm verify`.
Порядок выбран так, чтобы самый рискованный слой — детерминированный scoring, от которого
зависит достоверность всех показанных чисел — был готов и покрыт тестами раньше визуала,
а самый недоступный слой (live MCP) не блокировал ничего.

Ключевое следствие spike: LLM и live MCP переехали в конец. Оба опциональны, оба имеют
детерминированную замену, и ни один не входит в критический путь демо.

## Порядок этапов

### Этап 1 — Skeleton (модуль: инфраструктура)

pnpm workspaces, `tsconfig.base.json` со strict-набором, ESLint с правилом границ
импорта, Prettier, Vitest projects, единый `pnpm verify`.

**Риск:** путь репозитория содержит кириллицу и лежит в OneDrive — возможны сбои
файловых вотчеров и блокировки `node_modules`.
**Митигация:** проверить `pnpm install` и `vite dev` сразу на этапе 1, до наполнения кодом.

**Checkpoint:** `pnpm verify` проходит на пустом проекте.

### Этап 2 — `domain-contracts` + `domain-geo`

Zod-схемы всех контрактов §8 системного дизайна и pure-геометрия. Геометрия идёт здесь,
а не вместе с глобусом, потому что `deriveRouteViewport` — чистая функция с явным списком
обязательных тестов (§22.1) и не должна писаться под давлением визуальной отладки.

**Checkpoint:** unit-тесты на дальний/короткий маршрут, одну точку, антимеридиан, mobile viewport.

### Этап 3 — `domain-normalization` + `inventory-fixture`

Канонизация raw-записей с provenance и quarantine. Fixtures проектируются под demo-сценарий
§26 (Екатеринбург → Санкт-Петербург, взрослый + ребёнок) и под golden-набор: включают
варианты с ночными сегментами, с tight transfer, с отсутствующими координатами, с битыми
записями и с prompt-injection в тексте отзыва.

**Риск:** fixtures, написанные «под красивый результат», скроют дефекты scoring.
**Митигация:** сценарий «нет валидного маршрута» и «отели недоступны» пишутся в этом же этапе.

**Checkpoint:** contract-тесты на missing/extra поля и quarantine.

### Этап 4 — `domain-scoring` + `domain-fallback`

Hard filters, взвешенный score с `confidence`, три preset, дедупликация, пересчёт totals,
выбор уязвимых stages и bounded «План Б».

**Риск:** самая частая ошибка — трактовать отсутствующий сигнал как средний или как хороший.
**Митигация:** отдельный тест, где вариант с меньшим числом известных сигналов не получает
преимущества, а только теряет confidence.

**Checkpoint:** покрытие домена ≥ 90%, все инварианты scoring зелёные.

### Этап 5 — `api-orchestrator`

Fastify, env-схема, security headers, rate limit, TTL repository, NDJSON stream с фазами,
`GET /plans/:id`, `PATCH /selections` с optimistic concurrency, `POST /replan`,
`GET /capabilities`. Бюджеты и таймауты из §11.5 — в конфиге.

**Checkpoint:** curl по stream отдаёт валидный NDJSON; конфликт revision возвращает typed error.

### Этап 6 — `web-search`

Shell приложения: design tokens, Tailwind, роутер, error boundary, форма поиска на
React Hook Form + Zod (та же схема, что на сервере), чипы ограничений, панель
«Что важно в поездке?». Форма работает до загрузки globe chunk.

**Checkpoint:** keyboard flow формы, валидация дат, submit открывает progress-экран.

### Этап 7 — `web-plan-builder`

Экран плана: sticky summary, переключатель конфигураций, timeline как семантический
ordered list, `TransportStageCard` / `HotelStageCard` / `TransferOrWaitCard`, карусель
альтернатив с кнопками, «План Б», bottom sheet на mobile, `aria-live` на изменение
цены и score, freshness-состояния, partial/failed состояния.

Это самый тяжёлый по объёму этап и главный носитель оценки UX/UI.

**Checkpoint:** демо-flow целиком проходится на 320 px и на desktop, без глобуса.

### Этап 8 — `web-globe`

MapLibre в lazy chunk, стилизованный land/water, одна главная линия и приглушённые
альтернативы, крупные маркеры, adaptive camera на базе `deriveRouteViewport`,
двусторонняя синхронизация с timeline, пауза автокамеры после ручного pan/zoom,
fallback-матрица §15.5.

**Риск:** глобус легко превращается в декоративный слой, ломающий производительность и a11y.
**Митигация:** глобус подключается последним из UI и обязан иметь текстовый эквивалент;
никакое действие не существует только на карте.

**Checkpoint:** WebGL отключён → полный функционал через карточки; reduced motion → без полётов.

### Этап 9 — `llm-planner`

OpenAI Responses API за адаптером: `SearchPlan` и `ExplanationBlock` через Structured
Outputs, canonical functions §11.3, один repair, `store: false`, бюджет 2 вызова.
`DeterministicPlanner` — не заглушка, а равноправная реализация того же интерфейса.
Тест на indirect prompt injection в тексте отзыва.

**Checkpoint:** `pnpm eval` на golden-наборе без нарушения инвариантов; работа без ключа.

### Этап 10 — `inventory-mcp`

Live-адаптер на официальном SDK: runtime discovery, маппинг capability → tool name из
`tools/list`, таймауты, exponential backoff только для retryable сетевых/5xx,
circuit breaker per capability, `mcp:inspect`, live/fixture badge.

**Checkpoint:** при недостижимом endpoint приложение работает в fixture-режиме и явно об этом сообщает.

### Этап 11 — `web-pwa-offline` + hardening

Manifest, service worker с `registerType: 'prompt'`, IndexedDB последнего плана со
schemaVersion, `/offline`, `/about-data`, удаление сохранённой поездки, telemetry,
CSP с учётом MapLibre worker, Playwright E2E §22.5, axe-аудит, README.

**Checkpoint:** Definition of Done §27.

## Что можно делать параллельно

Внутри этапа 7 карточки, summary и переключатель конфигураций независимы.
Этапы 9 и 10 независимы друг от друга — оба зависят только от завершённого этапа 5.
Всё остальное последовательно по зависимостям capability map.

## Точки отказа плана

| Если | То |
|---|---|
| `pnpm install` ломается из-за OneDrive/кириллицы | Перенести репозиторий или настроить исключение синхронизации; решается на этапе 1, не позже |
| Vite 8 / Tailwind 4 конфликтуют по версиям | Зафиксировать последнюю совместимую пару, записать в SPEC §2 |
| MapLibre globe projection даёт < 50 FPS | Отключить atmosphere/shadow, затем перейти на статический 2D-фон; функционал не теряется |
| Live MCP так и не открылся | Демо идёт в fixture-режиме с явным badge — это предусмотрено §11.1 и не является провалом |
| `OPENAI_API_KEY` недоступен | Демо идёт в deterministic-режиме; explanation берётся из шаблонов по `ScoreBreakdown` |
| Не хватает времени | Резать в порядке: этап 11 hardening → этап 9 LLM → этап 8 глобус. Этапы 1–7 неприкосновенны |
