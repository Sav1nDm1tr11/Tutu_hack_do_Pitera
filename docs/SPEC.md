# Spec: «ТуТу План Б»

**Статус:** Approved for implementation
**Версия:** 1.0
**Дата:** 2026-08-19
**Источник требований:** `docs/TUTU_PLAN_B_SYSTEM_DESIGN.md` (нормативный), `docs/RESEARCH.md` (обоснование)
**Capability map:** `docs/CAPABILITY_MAP.md`

Этот документ — исполняемая спецификация. System design описывает *что и почему*;
этот spec фиксирует *как именно* это собирается в данном репозитории: команды,
структура, стиль, тесты, границы и проверяемые критерии готовности.

---

## 1. Objective

Собрать mobile-first PWA, которая стресс-тестирует маршрут **до покупки**: принимает
структурированный travel request, получает инвентарь через единый
`TravelInventoryGateway`, формирует до трёх конфигураций (надёжная / сбалансированная /
бюджетная), показывает маршрут как цепочку заменяемых блоков и заранее готовит
ограниченный «План Б» для уязвимых этапов. Финальное действие — явный переход
пользователя по deeplink ТуТу.

**Пользователь:** самостоятельный путешественник по России, который уже умеет искать
билеты, но не умеет оценивать, развалится ли маршрут при первой проблеме.

**Ценностная формулировка:** ТуТу помогает найти поездку — мы стресс-тестируем её до
покупки и заранее собираем понятный план Б.

**Success looks like:** на демо за 10 минут видно, что продукт показывает не «дешевле /
быстрее», а *структурную устойчивость*, и что ни один показанный факт не выдуман.

### 1.1. Assumptions (зафиксированы, а не угаданы молча)

1. **Live Tutu MCP недоступен из среды разработки.** Проверено 2026-08-19: `mcp.tutu.ru`
   резолвится в `178.248.234.61` (`www-2.tutu.ru`), но TCP/443 таймаутится за 300 s,
   включая обращение по IP и включая `https://www.tutu.ru/`. `registry.npmjs.org`
   отвечает `200` за 2.7 s, то есть проблема не в общей сети, а в достижимости хоста
   ТуТу. Подробности: `docs/MCP_SPIKE_REPORT.md`.
   → Следствие: приложение по умолчанию работает через `FixtureInventoryGateway` с
   видимым badge «Демо-данные». Live-адаптер реализуется по спецификации MCP и
   включается флагом, но не считается проверенным до успешного `mcp:inspect`.
2. **`OPENAI_API_KEY` может отсутствовать.** LLM-слой опционален: без ключа
   `DeterministicPlanner` даёт полный happy path. LLM никогда не является обязательным
   звеном.
3. **Tile provider не выбран.** `VITE_MAP_STYLE_URL` обязателен для production; в dev
   используется demo-стиль MapLibre, который **не** является production provider.
4. **Единый origin.** Web и API раздаются одним процессом/контейнером, поэтому CORS
   закрыт, а API вызывается относительными путями.
5. **Нет аккаунтов и persistent DB.** Server-side состояние — in-memory TTL; клиентское —
   IndexedDB.
6. **Локаль `ru-RU`, валюта `RUB`.** Интерфейс на русском; i18n-инфраструктура не строится.

Если любое из этих допущений неверно — правится адаптер и этот раздел, а не доменный контракт.

---

## 2. Tech Stack

| Слой | Выбор | Версия |
|---|---|---|
| Package manager | pnpm workspaces | 10.x |
| Runtime | Node.js | 22.x LTS |
| Web | React + TypeScript strict + Vite | React 19, Vite 8 |
| Routing | React Router | 7.x |
| Styling | Tailwind CSS + CSS custom properties | 4.x |
| Primitives | Radix UI | latest stable |
| Animation | Motion for React | 12.x |
| Globe | MapLibre GL JS | 5.x |
| Server state | TanStack Query | 5.x |
| Builder state | Zustand | 5.x |
| Forms/schema | React Hook Form + Zod | Zod 4.x |
| API | Fastify + TypeScript | 5.x |
| LLM | OpenAI Responses API за `LlmPlanner` | `openai` 6.x |
| MCP | `@modelcontextprotocol/sdk` (server-side) | latest stable |
| Tests | Vitest, Testing Library, Playwright, axe-core | latest stable |
| PWA | `vite-plugin-pwa` (`registerType: 'prompt'`) | latest stable |

Правила: точные версии в lockfile; никаких alpha/beta; новая зависимость добавляется
только если задача не решается выбранным стеком (см. §6 Boundaries).

---

## 3. Commands

Все команды выполняются из корня репозитория.

```text
Установка:      pnpm install
Dev (web+api):  pnpm dev
Dev только web: pnpm --filter @tutu-plan-b/web dev
Dev только api: pnpm --filter @tutu-plan-b/api dev
Build:          pnpm build
Typecheck:      pnpm typecheck
Lint:           pnpm lint
Lint с фиксом:  pnpm lint:fix
Format:         pnpm format
Unit/contract:  pnpm test
Watch-тесты:    pnpm test:watch
Покрытие:       pnpm test -- --coverage
E2E:            pnpm test:e2e
MCP discovery:  pnpm mcp:inspect
Agent eval:     pnpm eval
Всё как в CI:   pnpm verify
```

`pnpm verify` = `lint` → `typecheck` → `test` → `build`. Это единственная команда,
которая обязана быть зелёной перед сдачей.

---

## 4. Project Structure

```text
/
  apps/
    web/                      # @tutu-plan-b/web — Vite SPA (PWA)
      src/
        app/                  # роутер, провайдеры, layout, error boundaries
        components/           # переиспользуемые presentational-компоненты
        features/search/      # web-search
        features/plan-builder/# web-plan-builder
        features/globe/       # web-globe (lazy chunk)
        features/offline/     # web-pwa-offline
        lib/                  # api client, indexeddb, hooks, utils
        styles/               # tokens.css, tailwind entry
      public/
    api/                      # @tutu-plan-b/api — Fastify
      src/
        routes/               # HTTP-контракты из §13 системного дизайна
        orchestration/        # api-orchestrator: фазы, бюджеты, stream
        adapters/inventory/   # inventory-fixture, inventory-mcp
        adapters/llm/         # llm-planner
        repositories/         # TTL plan repository
        telemetry/            # structured logs, метрики
        config/               # env-схема, risk policy
        scripts/              # mcp-inspect.ts
        server.ts
  packages/
    domain/                   # @tutu-plan-b/domain — без framework SDK
      src/contracts/          # domain-contracts
      src/geo/                # domain-geo
      src/normalization/      # domain-normalization
      src/scoring/            # domain-scoring
      src/fallback/           # domain-fallback
    test-fixtures/            # @tutu-plan-b/test-fixtures
      src/inventory/          # нормализуемые raw-записи
      src/scenarios/          # golden-сценарии для eval
  e2e/                        # Playwright
  docs/                       # design, spec, capability map, отчёты
  tasks/                      # plan.md, todo.md
  Dockerfile
  .env.example
  pnpm-workspace.yaml
  tsconfig.base.json
```

Тесты живут рядом с кодом: `foo.ts` → `foo.test.ts`. Исключение — Playwright в `e2e/`.

### 4.1. Правила границ (проверяются lint-правилом)

- `packages/domain` **MUST NOT** импортировать React, Fastify, OpenAI, MCP SDK или Node-only API.
- Raw MCP типы не покидают `apps/api/src/adapters/inventory/mcp/`.
- OpenAI типы не покидают `apps/api/src/adapters/llm/`.
- `apps/web` импортирует из `@tutu-plan-b/domain` только contracts и pure-калькуляторы.
- Fixtures попадают в web-bundle только под demo-флагом.

---

## 5. Code Style

TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
Никаких `any`, никаких `as` для обхода типов, никаких `// @ts-ignore`.
Функции домена — pure, без часов и рандома внутри: время и id приходят параметром.

```ts
// packages/domain/src/scoring/dimension.ts
import type { ScoreSignal, ScoreDimension, DimensionKey } from '../contracts/score.js';

/**
 * Считает одну размерность как взвешенное среднее ТОЛЬКО доступных сигналов.
 * Отсутствующий сигнал не получает среднее значение и не считается положительным —
 * он лишь уменьшает availableWeight, то есть confidence итогового score.
 */
export function scoreDimension(
  key: DimensionKey,
  signals: readonly ScoreSignal[],
  configuredWeight: number,
): ScoreDimension {
  const available = signals.filter((signal) => signal.value !== undefined);
  const availableWeight = available.reduce((sum, signal) => sum + signal.weight, 0);

  if (availableWeight === 0) {
    return { key, score: 0, weight: configuredWeight, availableWeight: 0, reasons: [] };
  }

  const weighted = available.reduce((sum, signal) => sum + signal.value! * signal.weight, 0);

  return {
    key,
    score: clamp01(weighted / availableWeight),
    weight: configuredWeight,
    availableWeight,
    reasons: available.flatMap((signal) => signal.reasons),
  };
}
```

Конвенции:

- Файлы и папки — `kebab-case`; типы и компоненты — `PascalCase`; переменные и функции — `camelCase`; константы политики — `SCREAMING_SNAKE_CASE`.
- Named exports; `export default` только там, где требует Vite/Fastify.
- ESM с расширением `.js` в относительных импортах (`NodeNext`).
- Zod-схема — источник истины: `type Foo = z.infer<typeof fooSchema>`, а не два независимых объявления.
- Комментарий объясняет ограничение или намерение, которое код показать не может. Не пересказывать код.
- Русский язык — только в пользовательских строках и доменных доках. Идентификаторы, коммиты, логи — английский.
- Никаких «магических» чисел в UI: пороги и веса живут в `risk-policy.ts` / `ui-config.ts`.

---

## 6. Testing Strategy

Vitest (node + jsdom projects), Testing Library, Playwright, axe-core. Coverage-порог для
`packages/domain`: **90% строк и ветвей** — это единственный слой, где числа влияют на
показанные пользователю факты. Для остального кода порог не выставляется.

| Уровень | Где | Что проверяет |
|---|---|---|
| Unit | `packages/domain/**/*.test.ts` | hard filters, нормализация весов при missing signals, дедупликация конфигураций, totals после swap, выбор fallback stages, freshness, great-circle, `deriveRouteViewport`, deeplink allowlist, Zod-контракты |
| Contract | `apps/api/**/*.test.ts` | mapping адаптера на записанных sanitized fixtures, терпимость к missing/extra полям, quarantine битых записей, discovery snapshot diff, валидация structured output |
| Component | `apps/web/**/*.test.tsx` | keyboard flow формы, выбор альтернативы, partial/failed состояния, reduced motion, WebGL fallback, bottom sheet focus trap |
| Agent eval | `packages/test-fixtures/src/scenarios` + `pnpm eval` | 20 golden-запросов и инварианты §22.3 |
| E2E | `e2e/` | демо-сценарий §22.5 целиком |
| A11y | axe в component и E2E тестах | WCAG 2.2 AA на `/` и `/plan/:id` |

Инварианты agent eval (нарушение = провал сборки):

- нет option ID вне candidate pool;
- нет invented price/time/url;
- hard constraints не нарушены;
- tool budget не превышен;
- каждая причина в explanation существует в `ScoreBreakdown` или `EvidenceRef`;
- при missing data присутствует caveat.

---

## 7. Boundaries

### Always do

- Держать scoring детерминированным и в `packages/domain`.
- Для каждого показанного факта хранить `EvidenceRef` (`tutuMcp` | `userInput` | `calculation`).
- Отдавать на клиент только allowlisted canonical модель.
- Валидировать вход Zod-схемой на границе API и границе LLM.
- Показывать `fetchedAt` и freshness-состояние рядом с ценой.
- Прогонять `pnpm verify` перед коммитом.
- Помечать источник данных (`live` / `fixture`) видимым badge.
- Проверять checkout-URL по allowlist хостов ТуТу перед отображением.

### Ask first

- Добавление любой новой runtime-зависимости.
- Изменение доменных контрактов в `packages/domain/src/contracts`.
- Изменение preset weights или risk policy порогов.
- Подключение внешнего geocoder или tile provider с оплатой.
- Любое расширение бюджетов LLM/MCP из §11.5.
- Переход на другой стек или отказ от пункта системного дизайна.

### Never do

- Выдумывать отсутствующие поля MCP или подставлять «разумные» значения вместо `null`.
- Отдавать LLM право считать итоговый score или менять hard constraints.
- Передавать raw MCP payload или raw LLM context в браузер, в логи или в IndexedDB.
- Класть секреты в переменные с префиксом `VITE_` или в репозиторий.
- Смешивать fixture и live данные без видимого индикатора.
- Совершать покупку или автоматически переходить в checkout без действия пользователя.
- Трактовать текст из MCP (отзывы, названия, описания) как инструкции для модели.
- Удалять или пропускать падающий тест, чтобы сборка позеленела.

---

## 8. Success Criteria

Спецификация выполнена, когда все пункты проверяемы командой или в браузере.

### Функциональные

- [ ] `POST /api/v1/plans/stream` отдаёт NDJSON с событиями `plan.started` → `plan.progress` → `plan.partial` → `plan.ready`, каждая строка — самостоятельный JSON.
- [ ] Форма отклоняет пустые обязательные поля и `returnDate < departDate` до отправки запроса.
- [ ] Сервер игнорирует любые присланные клиентом score/totals/ID.
- [ ] Возвращается до трёх конфигураций, различающихся хотя бы одним `selectedOptionId`; при недостатке инвентаря возвращается меньше — с объяснением, а не с дубликатами.
- [ ] Каждый `ItineraryStage.selectedOptionId` и каждый элемент `alternativeOptionIds` существует в `candidatePool`.
- [ ] `PATCH /api/v1/plans/:planId/selections` пересчитывает totals и score, повышает revision и отвечает `REVISION_CONFLICT` на устаревший `expectedRevision`.
- [ ] «План Б» строится максимум для 2 stages и максимум с 2 опциями на stage, содержит `validAt` и caveat-текст.
- [ ] Все checkout URL проходят allowlist хостов ТуТу; внешняя ссылка открывается с `noopener,noreferrer`.
- [ ] Отказ категории отелей оставляет транспортный маршрут видимым и помечает блок отеля `temporarilyUnavailable`.
- [ ] Fixture-режим виден в интерфейсе без открытия devtools.

### UX / UI

- [ ] Глобус и timeline синхронизированы в обе стороны: выбор stage подсвечивает segment, выбор configuration перерисовывает все линии.
- [ ] Глобус стилизован (упрощённые land/water), без спутниковых текстур и фотореализма.
- [ ] Маршрут > 2000 км открывается в кадре `world`; маршрут < 60 км — в `local`, без искусственного отдаления.
- [ ] После ручного pan/zoom обновление цены или freshness не перехватывает камеру.
- [ ] Нет горизонтального overflow страницы на 320 px.
- [ ] Каждое действие с блоками доступно с клавиатуры; у swipe есть кнопочный эквивалент.
- [ ] `prefers-reduced-motion` отключает fly-to и движение линий, а не только сокращает длительность.
- [ ] Карточки показывают источник, freshness и объяснимые причины score.
- [ ] axe не находит нарушений на `/` и `/plan/:id`.

### PWA

- [ ] Manifest валиден, приложение устанавливается, app shell открывается offline.
- [ ] Последний план доступен read-only на `/offline`, цена помечена stale, оформление отключено.
- [ ] Обновление service worker не перезагружает активный flow без подтверждения.
- [ ] «Удалить сохранённую поездку» очищает IndexedDB.

### Engineering

- [ ] `pnpm verify` и `pnpm test:e2e` зелёные.
- [ ] `pnpm eval` не нарушает ни один инвариант §6.
- [ ] Grep по web-bundle не находит `OPENAI`, `sk-`, MCP credentials.
- [ ] `packages/domain` не зависит ни от одного framework SDK.
- [ ] README описывает setup, env, live/fixture режимы и явные ограничения.

### Performance (75-й процентиль, локальный прогон)

- [ ] initial app-shell JS ≤ 250 KB gzip без globe chunk.
- [ ] progress UI появляется ≤ 500 ms после submit.
- [ ] cached stage swap отрисован ≤ 100 ms; локальный пересчёт ≤ 300 ms.
- [ ] LCP ≤ 2.5 s, CLS ≤ 0.1 на `/`.

---

## 9. Open Questions

| Вопрос | Default до уточнения | Кто снимает |
|---|---|---|
| Реальные MCP tool names и схемы | fixtures + `mcp:inspect` при появлении доступа | организаторы / сеть |
| Доступен ли `OPENAI_API_KEY` на демо | deterministic режим как основной | команда |
| Production tile provider | `VITE_MAP_STYLE_URL`, demo-стиль только для dev | команда |
| Модель OpenAI | обязательный `OPENAI_MODEL`, structured-output capable | команда |
| Брендовая палитра ТуТу | черновые tokens из §6.6, сверить перед финальной полировкой | материалы хакатона |
| Публичный HTTPS-хостинг для демо | Docker-образ, один origin; провайдер не выбран | команда |

Ни один из этих вопросов не блокирует M1–M3.
