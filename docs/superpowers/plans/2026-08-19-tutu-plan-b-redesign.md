# «Туту План Б» Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить существующий full demo-flow в адаптивный анимированный PWA «Павильон навигации» с центральной интерактивной планетой и географически точным маршрутом, затем развернуть проверанную production-сборку на предоставленном сервере.

**Architecture:** Доменные контракты, Fastify API, Zustand store и доступные пользовательские сценарии сохраняются. В `apps/web` появляется чистый адаптер геометрии карты, затем переиспользуемые визуальные узлы, новый responsive layout и локально scoped GSAP-анимации; MapLibre остаётся единственным владельцем камеры и WebGL-контекста.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4, MapLibre GL 6, GSAP 3.13 + `@gsap/react` 2.1, Vitest, Playwright, Fastify, Docker/Nginx deployment.

**Spec:** `docs/superpowers/specs/2026-08-19-tutu-plan-b-redesign-design.md`

## Global Constraints

- Все маркеры и подписи используют только подтверждённые `PlaceRef.point`; MapLibre получает координаты строго в порядке `[lon, lat]`.
- При отсутствии координат или WebGL сохраняется текстовая `RouteScheme`, координаты не угадываются.
- WCAG 2.2 AA, цели нажатия не меньше 44×44 px, видимый focus, keyboard radiogroup и `aria-live` сохраняются.
- GSAP анимирует transform, opacity, clip-path и filter; MapLibre самостоятельно управляет camera animation.
- При `prefers-reduced-motion: reduce` существенное движение отключается.
- Пользовательские изменения в `apps/api/src/http/routes/plan-routes.ts` и `apps/web/vite.config.ts` не перезаписываются.
- Production-публикация выполняется только после успешных lint, typecheck, test, build и проверки ключевого flow.

---

### Task 1: Географически точный адаптер карты

**Files:**

- Create: `apps/web/src/features/globe/route-map-features.ts`
- Test: `apps/web/src/features/globe/route-map-features.test.ts`
- Modify: `apps/web/src/features/globe/RouteGlobe.tsx`
- Modify: `apps/web/src/features/globe/globe-style.ts`

**Interfaces:**

- Consumes: `RouteGeometry`, `selectedStageId: string | undefined`.
- Produces: `segmentsToFeatureCollection(geometry, selectedStageId)` и `markersToFeatureCollection(geometry, selectedStageId)` с GeoJSON `[longitude, latitude]`, place-name и marker-role properties.

- [ ] **Step 1: Write the failing test**

```ts
it('keeps real city coordinates in MapLibre longitude-latitude order', () => {
  const data = markersToFeatureCollection(routeGeometry, undefined);
  expect(data.features).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        geometry: { type: 'Point', coordinates: [60.5975, 56.8389] },
        properties: expect.objectContaining({ placeName: 'Екатеринбург' }),
      }),
      expect.objectContaining({
        geometry: { type: 'Point', coordinates: [30.3141, 59.9386] },
        properties: expect.objectContaining({ placeName: 'Санкт-Петербург' }),
      }),
    ]),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/web/src/features/globe/route-map-features.test.ts`
Expected: FAIL because `route-map-features.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function markersToFeatureCollection(
  geometry: RouteGeometry,
  selectedStageId: string | undefined,
): FeatureCollection<Point, RouteMarkerProperties> {
  return {
    type: 'FeatureCollection',
    features: geometry.markers.map((marker) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [marker.point.lon, marker.point.lat] },
      properties: {
        stageId: marker.stageId,
        placeName: marker.place.name,
        role: marker.role,
        selected: marker.stageId === selectedStageId,
      },
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/web/src/features/globe/route-map-features.test.ts`
Expected: PASS; both city names retain their source coordinates.

- [ ] **Step 5: Wire the adapter into MapLibre and commit**

Add local label and marker layers after `marker-circle`, keep `buildRouteGeometry` as the sole source of geographic facts, then run the focused test and commit `feat: preserve geographic truth on the route globe`.

### Task 2: Navigation-pavilion design system and search flow

**Files:**

- Create: `apps/web/src/components/brand/BrandMark.tsx`
- Create: `apps/web/src/components/brand/TransportIcon.tsx`
- Create: `apps/web/src/lib/use-page-intro.ts`
- Test: `apps/web/src/components/brand/TransportIcon.test.tsx`
- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/app/AppShell.tsx`
- Modify: `apps/web/src/routes/SearchScreen.tsx`
- Modify: `apps/web/src/features/search/SearchForm.tsx`
- Modify: `apps/web/src/features/plan/PlanProgress.tsx`
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**

- Consumes: existing `SearchFormProps`, `PlanProgressProps`, online/source state.
- Produces: `TransportIcon({ mode, size })` and `usePageIntro(scopeRef, dependencies)` with scoped `useGSAP` cleanup and reduced-motion handling.

- [ ] **Step 1: Write the failing icon semantics test**

```tsx
it('renders transport graphics as decorative SVG', () => {
  render(<TransportIcon mode="train" />);
  expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm vitest run apps/web/src/components/brand/TransportIcon.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add dependencies and visual primitives**

Pin `gsap@3.13.0` and `@gsap/react@2.1.2`, remove the unused `motion` dependency, add authored SVG icons and a wordmark-safe `BrandMark`; do not embed text or city positions in raster assets.

- [ ] **Step 4: Recompose shell, search and progress**

Use the approved copy «Маршрут, который не развалится от одного сбоя», a single travel-search surface, source/offline status, restored-trip strip and sequential progress board. Apply one scoped GSAP entrance with `power3.out`, `autoAlpha`, `y` and `stagger`, guarded by reduced motion.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run apps/web/src/components/brand/TransportIcon.test.tsx`
Expected: PASS with no React accessibility warnings. Commit `feat: build the navigation pavilion search experience`.

### Task 3: Responsive plan constructor

**Files:**

- Create: `apps/web/src/features/plan/PlanHeroLayout.tsx`
- Create: `apps/web/src/features/plan/RouteStageRail.tsx`
- Test: `apps/web/src/features/plan/RouteStageRail.test.tsx`
- Modify: `apps/web/src/features/plan/PlanView.tsx`
- Modify: `apps/web/src/features/plan/ConfigurationSwitcher.tsx`
- Modify: `apps/web/src/features/plan/PlanSummary.tsx`
- Modify: `apps/web/src/features/plan/StageCard.tsx`
- Modify: `apps/web/src/features/plan/OptionListSheet.tsx`

**Interfaces:**

- Consumes: `RoutePlan`, active `PlanConfiguration`, candidate pool, selected stage and existing store actions.
- Produces: `PlanHeroLayout` slots for configuration rail, globe, summary and stages; `RouteStageRail` renders an ordered list and forwards selection/alternative/fallback actions.

- [ ] **Step 1: Write the failing ordered-route test**

```tsx
it('keeps route stages ordered and exposes the active stage', () => {
  render(<RouteStageRail {...props} selectedStageId="stage-out" />);
  expect(screen.getByRole('list', { name: 'Этапы маршрута' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Екатеринбург.*Санкт-Петербург/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm vitest run apps/web/src/features/plan/RouteStageRail.test.tsx`
Expected: FAIL because `RouteStageRail` does not exist.

- [ ] **Step 3: Build desktop and mobile compositions**

Desktop uses configuration plates left, globe center, one summary right and the connected ordered route below. Mobile uses sticky summary, horizontal configuration controls, a 240–280 px globe, vertical stages and a bottom checkout action that respects safe-area insets.

- [ ] **Step 4: Add state transitions without changing state ownership**

Use scoped `useGSAP` with `revertOnUpdate: true` for selected configuration, stage and summary transitions; animate only `x`, `y`, `scale`, `autoAlpha`, `clipPath` and shadow. Existing Zustand actions remain the only mutation path.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run apps/web/src/features/plan/RouteStageRail.test.tsx`
Expected: PASS; list semantics and active state remain accessible. Commit `feat: recompose the interactive plan constructor`.

### Task 4: Planet finish, responsive QA and degraded modes

**Files:**

- Modify: `apps/web/src/features/globe/GlobePanel.tsx`
- Modify: `apps/web/src/features/globe/RouteGlobe.tsx`
- Modify: `apps/web/src/features/globe/RouteScheme.tsx`
- Modify: `apps/web/src/styles/global.css`
- Create: `DESIGN.md`
- Create: `apps/web/src/features/globe/GlobePanel.test.tsx`

**Interfaces:**

- Consumes: geometry from Task 1 and `PlanHeroLayout` sizing from Task 3.
- Produces: a framed illustrative globe with atmosphere, accurate labels, active arc emphasis, explicit «Весь маршрут» reset and semantic fallback.

- [ ] **Step 1: Write the failing fallback test**

```tsx
it('shows a truthful text route when coordinates are incomplete', () => {
  render(<GlobePanel {...propsWithMissingCoordinates} />);
  expect(screen.getByText(/не для всех этапов известны координаты/i)).toBeInTheDocument();
  expect(screen.getByRole('list')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm RED against the new fixture**

Run: `pnpm vitest run apps/web/src/features/globe/GlobePanel.test.tsx`
Expected: FAIL until the missing-coordinate fixture and accessible fallback contract are wired.

- [ ] **Step 3: Finish the globe and fallback**

Keep one WebGL context, add ocean/land atmosphere and route-label hierarchy, preserve manual camera override, and keep every fallback action usable from keyboard. Document the final visual world, tokens and motion contract in `DESIGN.md`.

- [ ] **Step 4: Run automated verification**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all commands exit 0; the MapLibre chunk remains lazy.

- [ ] **Step 5: Run visual and accessibility verification**

Start the production preview, verify 320, 768, 1024 and 1440 px, keyboard order, reduced motion, online/offline and WebGL fallback. Capture desktop/mobile screenshots, run axe, then commit `feat: finish the Tutu Plan B visual system`.

### Task 5: Server deployment and smoke test

**Files:**

- Modify only if required by the discovered server runtime: `Dockerfile`, `.env.example`, or deployment documentation in `README.md`.
- Never create a credential file in the repository.

**Interfaces:**

- Consumes: exact verified Git tree and production build from Task 4.
- Produces: HTTPS application at `https://tutu.strannyedela.site` with `/api/health`, SPA routes and PWA assets served from the same release.

- [ ] **Step 1: Inspect the host read-only**

Check OS, available Docker/Node/Nginx, current virtual host, certificate status, running services and deployment directory without stopping or deleting anything.

- [ ] **Step 2: Choose the smallest compatible release path**

Prefer the repository Dockerfile when Docker and the existing reverse proxy are present; otherwise use Node 22 + pnpm with a systemd service and the existing Nginx site. Preserve unrelated services and current TLS configuration.

- [ ] **Step 3: Upload and activate atomically**

Upload a versioned release, build or install in that directory, switch a `current` symlink only after health checks pass, and keep the previous release available for rollback. Credentials stay in the SSH session and environment, not in files committed to Git.

- [ ] **Step 4: Smoke-test the public site**

Verify `https://tutu.strannyedela.site`, `/about-data`, one direct `/plan/:planId` navigation behavior, manifest/service-worker delivery and `/api/health`. Confirm geography by checking the EKB→SPB marker data in the built application.

- [ ] **Step 5: Report the deployed result**

Return the public URL, verified flows and any environment limits. Do not print passwords, private environment values or temporary deployment credentials.
