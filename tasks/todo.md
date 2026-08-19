# Task list: «ТуТу План Б»

**Plan:** `tasks/plan.md` · **Spec:** `docs/SPEC.md`
Отметка `[x]` ставится только после прохождения шага **Verify**.

---

## Этап 1 — Skeleton

- [ ] **1.1 Monorepo bootstrap**
  - Acceptance: `pnpm-workspace.yaml`, root `package.json` со скриптами из SPEC §3, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, NodeNext), `.gitignore`, `.env.example`
  - Verify: `pnpm install` завершается без ошибок
  - Files: корневые конфиги
- [ ] **1.2 Lint / format / test harness**
  - Acceptance: ESLint (flat config) с правилом запрета framework-импортов в `packages/domain`, Prettier, Vitest workspace projects (node + jsdom)
  - Verify: `pnpm verify` зелёный на пустом проекте
  - Files: `eslint.config.js`, `.prettierrc`, `vitest.config.ts`
- [ ] **1.3 Проверка окружения OneDrive/кириллица**
  - Acceptance: dev-сервер поднимается, HMR реагирует на правку файла
  - Verify: `pnpm dev` → правка → перезагрузка в браузере

## Этап 2 — `domain-contracts` + `domain-geo`

- [ ] **2.1 Contracts**
  - Acceptance: Zod-схемы `TravelRequest`, `PlaceRef`, `RoutePlan`, `PlanConfiguration`, `ItineraryStage`, `CandidateOption` (transport/hotel/calculated), `EvidenceRef`, `ScoreBreakdown`, `FallbackPlan`, `PlanWarning`, `CapabilitySnapshot`, `ApiError`; типы через `z.infer`
  - Verify: unit-тесты на валидный/невалидный request, отказ при `returnDate < departDate`
  - Files: `packages/domain/src/contracts/*`
- [ ] **2.2 Freshness + deeplink allowlist**
  - Acceptance: `deriveFreshness(fetchedAt, expiresAt, now)` → `fresh|aging|stale`; `isAllowedCheckoutUrl` по allowlist хостов ТуТу
  - Verify: unit-тесты, включая попытку обхода allowlist (`tutu.ru.evil.com`, `//`, `javascript:`)
- [ ] **2.3 Geo**
  - Acceptance: `greatCirclePoints`, `haversineKm`, `normalizeAntimeridian`, `deriveRouteViewport`
  - Verify: unit-тесты на дальний маршрут, короткий, одну точку, антимеридиан, mobile viewport (§22.1)
  - Files: `packages/domain/src/geo/*`

## Этап 3 — `domain-normalization` + `inventory-fixture`

- [ ] **3.1 Normalizer**
  - Acceptance: raw → canonical с `EvidenceRef` на каждое поле, `dataCompleteness`, quarantine невалидных записей с причиной; отсутствующее поле остаётся `undefined`, а не подставляется
  - Verify: contract-тесты на missing/extra поля и на битую запись
- [ ] **3.2 Fixtures**
  - Acceptance: сценарии `happyPath` (Екатеринбург → СПб, взрослый + ребёнок), `noHotels`, `nightSegmentsOnly`, `tightTransfer`, `missingCoordinates`, `promptInjectionReview`, `noValidRoute`
  - Verify: каждый сценарий проходит normalizer без исключений
  - Files: `packages/test-fixtures/src/*`
- [ ] **3.3 `FixtureInventoryGateway`**
  - Acceptance: реализует `TravelInventoryGateway`, детерминирован при том же seed, отдаёт `CapabilitySnapshot`
  - Verify: два одинаковых запроса → идентичный pool

## Этап 4 — `domain-scoring` + `domain-fallback`

- [ ] **4.1 Hard filters**
  - Acceptance: исключение по бюджету, ночному интервалу, лимиту пересадок, дедлайну прибытия, запрещённому mode, датам; при недостатке данных — группа `needsVerification`, а не «подходит»
  - Verify: unit-тест на каждое ограничение + тест на `needsVerification`
- [ ] **4.2 Scoring engine**
  - Acceptance: взвешенное среднее только доступных сигналов; `confidence = availableWeight / configuredWeight`; preset weights в `risk-policy.ts`
  - Verify: тест «меньше известных сигналов → не выше score, только ниже confidence»
- [ ] **4.3 Конфигурации**
  - Acceptance: до 3 конфигураций, дедупликация по набору `selectedOptionId` с объединением labels, отсутствие искусственного добивания до трёх
  - Verify: тесты на 3 разных, на 2 совпадающих, на дефицит инвентаря
- [ ] **4.4 Пересчёт после swap**
  - Acceptance: `recomputeConfiguration` пересчитывает totals, score и время stages
  - Verify: unit-тест на swap outbound-опции
- [ ] **4.5 Bounded fallback**
  - Acceptance: ≤ 2 stages, ≤ 2 опции на stage, выбор по правилам §10.2, `status: notAvailable` с причиной при отсутствии
  - Verify: тесты на выбор уязвимого stage и на отсутствие альтернатив

## Этап 5 — `api-orchestrator`

- [ ] **5.1 Fastify skeleton**
  - Acceptance: env-схема Zod, security headers, rate limit, structured logs без raw payload, раздача статики web-билда
  - Verify: `GET /api/v1/health` → 200; заголовки безопасности присутствуют
- [ ] **5.2 TTL plan repository**
  - Acceptance: in-memory с TTL 24 ч, revision, `PLAN_NOT_FOUND` по истечении
  - Verify: unit-тест на истечение и на инкремент revision
- [ ] **5.3 NDJSON stream**
  - Acceptance: `POST /api/v1/plans/stream` с фазами `plan.started` / `plan.progress` / `plan.partial` / `plan.ready` / `plan.error`; бюджеты и таймауты §11.5; partial при отказе категории
  - Verify: интеграционный тест — каждая строка парсится как JSON, порядок фаз корректен
- [ ] **5.4 Остальные маршруты**
  - Acceptance: `GET /plans/:id`, `PATCH /plans/:id/selections` (optimistic concurrency), `POST /plans/:id/replan`, `GET /capabilities`
  - Verify: тест на `REVISION_CONFLICT` и на игнорирование клиентских score

## Этап 6 — `web-search`

- [ ] **6.1 App shell**
  - Acceptance: Vite + React 19 + Tailwind 4, `tokens.css` из §6.6, роутер `/`, `/plan/:id`, `/offline`, `/about-data`, 404; error boundary
  - Verify: `pnpm --filter @tutu-plan-b/web build` проходит, app-shell JS ≤ 250 KB gzip
- [ ] **6.2 Search form**
  - Acceptance: origin/destination с подсказками из fixture-справочника, tripType, даты, взрослые/дети, бюджет, чипы ограничений, панель предпочтений; общая с сервером Zod-схема
  - Verify: component-тест keyboard flow + валидация дат; axe без нарушений
- [ ] **6.3 Progress screen**
  - Acceptance: чтение NDJSON, отображение фаз, появление ≤ 500 ms после submit, один retry соединения
  - Verify: component-тест на партиальный поток и на обрыв

## Этап 7 — `web-plan-builder`

- [ ] **7.1 Plan layout**
  - Acceptance: desktop (глобус 40–45% + timeline + floating summary) и mobile (sticky summary, вертикальные этапы, bottom sheet, закреплённая кнопка)
  - Verify: нет горизонтального overflow на 320/768/1024/1440
- [ ] **7.2 Configuration switcher**
  - Acceptance: три preset с score, ценой, длительностью и confidence; объяснение, если конфигураций меньше трёх
  - Verify: component-тест переключения
- [ ] **7.3 Stage cards**
  - Acceptance: `TransportStageCard`, `HotelStageCard`, `TransferOrWaitCard` — только доступные поля, `calculated`-маркировка, source + freshness, risk signals текстом и иконкой
  - Verify: тест «отсутствующее поле не отображается и не подставляется»
- [ ] **7.4 Alternatives**
  - Acceptance: prev/next кнопки, полный список, swipe с кнопочным эквивалентом, optimistic swap с откатом при ошибке, `aria-live` на цену и score
  - Verify: тест клавиатурного переключения и отката при `REVISION_CONFLICT`
- [ ] **7.5 План Б**
  - Acceptance: раскрываемый блок с caveat-текстом §10.3, `notAvailable` с причиной
  - Verify: component-тест обоих состояний
- [ ] **7.6 Checkout handoff**
  - Acceptance: явная кнопка, allowlist-проверка URL, `noopener,noreferrer`, отключение в offline/stale
  - Verify: тест на отклонение постороннего хоста

## Этап 8 — `web-globe`

- [ ] **8.1 Lazy MapLibre**
  - Acceptance: dynamic import после interactive shell, один WebGL context, стилизованные land/water, остановка анимации на скрытой вкладке
  - Verify: globe отсутствует в initial chunk; замер FPS
- [ ] **8.2 Route geometry**
  - Acceptance: главная линия, приглушённые альтернативы, крупные маркеры, подсветка выбранного stage, батчинг обновлений
  - Verify: визуальная проверка + тест синхронизации selection
- [ ] **8.3 Adaptive camera**
  - Acceptance: `deriveRouteViewport` управляет кадром, «Весь маршрут» восстанавливает общий вид, пауза автокамеры после ручного pan/zoom, без полётов при reduced motion
  - Verify: тест «обновление цены не перехватывает камеру»
- [ ] **8.4 Fallback matrix**
  - Acceptance: поведение §15.5 для WebGL off, low-power, tile provider down, отсутствия координат
  - Verify: тест с отключённым WebGL — полный функционал через карточки

## Этап 9 — `llm-planner`

- [ ] **9.1 Адаптер и схемы**
  - Acceptance: Responses API, `store: false`, Structured Outputs для `SearchPlan` и `ExplanationBlock`, canonical functions §11.3, один repair, бюджет 2 вызова, модель из `OPENAI_MODEL`
  - Verify: contract-тест на записанном structured output
- [ ] **9.2 Deterministic planner**
  - Acceptance: полный happy path без ключа; шаблонные объяснения строятся из `ScoreBreakdown`
  - Verify: E2E без `OPENAI_API_KEY`
- [ ] **9.3 Injection и eval**
  - Acceptance: текст MCP как data block с делимитерами и лимитом длины; `pnpm eval` на 20 golden-запросах
  - Verify: сценарий `promptInjectionReview` не меняет поведение агента; инварианты §22.3 зелёные

## Этап 10 — `inventory-mcp`

- [ ] **10.1 `mcp:inspect`**
  - Acceptance: официальный SDK, initialize + `tools/list`, sanitized snapshot в `docs/mcp-tools.snapshot.json`, non-zero exit при отказе
  - Verify: команда корректно падает на недостижимом endpoint (текущее состояние)
- [ ] **10.2 Live gateway**
  - Acceptance: runtime discovery capability → tool name, таймаут 8 s, backoff только для retryable, circuit breaker per capability, raw payload не выходит за адаптер
  - Verify: contract-тесты на записанных fixtures; отказ одной категории не ломает остальные
- [ ] **10.3 Live/fixture индикатор**
  - Acceptance: badge источника данных в UI, `GET /capabilities` отдаёт allowlisted snapshot
  - Verify: визуальная проверка в обоих режимах

## Этап 11 — `web-pwa-offline` + hardening

- [ ] **11.1 PWA**
  - Acceptance: manifest, иконки, `registerType: 'prompt'`, кэш-политики §14.1
  - Verify: приложение устанавливается, app shell открывается offline
- [ ] **11.2 IndexedDB last plan**
  - Acceptance: schemaVersion, allowlisted поля, `generatedAt/validAt/expiresAt`, источник; кнопка удаления
  - Verify: перезагрузка offline → read-only план со stale-меткой
- [ ] **11.3 `/about-data` и `/offline`**
  - Acceptance: происхождение данных, ограничения, приватность; offline read-only без оформления
  - Verify: ручная проверка обоих экранов
- [ ] **11.4 Observability**
  - Acceptance: `requestId`/`traceId`/`toolCallId`/`planId`+`revision`, метрики §20.2, логи без raw prompt/payload
  - Verify: grep логов на отсутствие payload
- [ ] **11.5 E2E + аудиты**
  - Acceptance: Playwright сценарий §22.5, axe на `/` и `/plan/:id`, замер бюджетов §18.1
  - Verify: `pnpm test:e2e` зелёный
- [ ] **11.6 Документация**
  - Acceptance: README (setup, env, live/fixture, ограничения), architecture notes, `.env.example`
  - Verify: чистый клон поднимается по README

## Финальный гейт

- [ ] `pnpm verify` и `pnpm test:e2e` зелёные
- [ ] `pnpm eval` без нарушения инвариантов
- [ ] Секретов в bundle и репозитории нет
- [ ] Все чекбоксы Success Criteria из `docs/SPEC.md` §8 закрыты
