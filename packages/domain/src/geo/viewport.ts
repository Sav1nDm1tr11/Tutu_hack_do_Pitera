import type { GeoPoint } from '../contracts/common';
import { routeBounds, routeExtentKm, type Bounds } from './great-circle';

export type CameraMode = 'world' | 'continent' | 'region' | 'local';

export interface ViewportPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface RouteViewport {
  readonly mode: CameraMode;
  readonly bounds: Bounds;
  readonly padding: ViewportPadding;
  readonly maxZoom: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Пороговые значения — UI-config, а не доменная логика (§15.2), поэтому они
 * инжектируются, а не зашиты в функцию. Сама функция обязана быть детерминированной.
 */
export interface RouteViewportConfig {
  /** Границы режимов по протяжённости маршрута в километрах, по убыванию. */
  readonly modeThresholdsKm: { readonly world: number; readonly continent: number; readonly region: number };
  readonly maxZoomByMode: Record<CameraMode, number>;
  /** Ниже этой ширины применяется mobile-набор отступов. */
  readonly mobileBreakpointPx: number;
  readonly mobilePadding: ViewportPadding;
  readonly desktopPadding: ViewportPadding;
  /** Половина минимальной рамки в градусах для одной точки или совпадающих точек. */
  readonly singlePointHalfSpanDeg: number;
}

export const DEFAULT_ROUTE_VIEWPORT_CONFIG: RouteViewportConfig = {
  modeThresholdsKm: { world: 2000, continent: 300, region: 60 },
  maxZoomByMode: { world: 4.5, continent: 7, region: 9.5, local: 12 },
  mobileBreakpointPx: 768,
  // Снизу оставлено место под bottom sheet, справа на desktop — под floating summary,
  // чтобы маршрут не уезжал под оверлей (§15.2).
  mobilePadding: { top: 28, right: 20, bottom: 96, left: 20 },
  desktopPadding: { top: 48, right: 360, bottom: 56, left: 56 },
  singlePointHalfSpanDeg: 0.08,
};

/**
 * Решение о кадре принимается по протяжённости маршрута, а не по «красоте эффекта»:
 * показывать целую Землю для поездки на 40 км запрещено (§15.2).
 *
 * Возвращает `undefined`, если ни у одной точки маршрута нет подтверждённых координат —
 * в этом случае UI обязан показать текстовую схему, а не выдуманную геометрию.
 */
export function deriveRouteViewport(
  points: readonly GeoPoint[],
  viewport: ViewportSize,
  config: RouteViewportConfig = DEFAULT_ROUTE_VIEWPORT_CONFIG,
): RouteViewport | undefined {
  const bounds = routeBounds(points);
  if (bounds === undefined) return undefined;

  const extentKm = routeExtentKm(points);
  const mode = deriveCameraMode(extentKm, config);
  const padding =
    viewport.width < config.mobileBreakpointPx ? config.mobilePadding : config.desktopPadding;

  return {
    mode,
    bounds: expandDegenerateBounds(bounds, config.singlePointHalfSpanDeg),
    padding: clampPaddingToViewport(padding, viewport),
    maxZoom: config.maxZoomByMode[mode],
  };
}

export function deriveCameraMode(
  extentKm: number,
  config: RouteViewportConfig = DEFAULT_ROUTE_VIEWPORT_CONFIG,
): CameraMode {
  if (extentKm > config.modeThresholdsKm.world) return 'world';
  if (extentKm >= config.modeThresholdsKm.continent) return 'continent';
  if (extentKm >= config.modeThresholdsKm.region) return 'region';
  return 'local';
}

/**
 * Одна точка или несколько совпадающих дают рамку нулевой площади, на которой
 * `fitBounds` уходит в максимальный зум. Расширяем до минимального локального бокса.
 */
export function expandDegenerateBounds(bounds: Bounds, halfSpanDeg: number): Bounds {
  const [west, south, east, north] = bounds;
  const lonSpan = east - west;
  const latSpan = north - south;

  const lonPad = lonSpan < halfSpanDeg * 2 ? halfSpanDeg : 0;
  const latPad = latSpan < halfSpanDeg * 2 ? halfSpanDeg : 0;
  if (lonPad === 0 && latPad === 0) return bounds;

  return [
    west - lonPad,
    Math.max(-90, south - latPad),
    east + lonPad,
    Math.min(90, north + latPad),
  ];
}

/**
 * На узком экране desktop-отступы могут превысить сам viewport, и `fitBounds` получит
 * отрицательную область. Ужимаем до безопасной доли размера.
 */
function clampPaddingToViewport(
  padding: ViewportPadding,
  viewport: ViewportSize,
): ViewportPadding {
  const maxHorizontal = Math.max(0, viewport.width * 0.35);
  const maxVertical = Math.max(0, viewport.height * 0.35);

  return {
    top: Math.min(padding.top, maxVertical),
    bottom: Math.min(padding.bottom, maxVertical),
    left: Math.min(padding.left, maxHorizontal),
    right: Math.min(padding.right, maxHorizontal),
  };
}
