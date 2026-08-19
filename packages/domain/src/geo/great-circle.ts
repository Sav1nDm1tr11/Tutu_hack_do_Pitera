import type { GeoPoint } from '../contracts/common';

const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Дуга большого круга как визуализация связи двух точек. Это НЕ фактическая траектория
 * рейса или поезда (§15.3), и UI обязан подписывать её соответствующим образом.
 *
 * Долгота возвращается «развёрнутой» (может выходить за ±180), чтобы линия через
 * антимеридиан не превращалась в полосу через весь экран.
 */
export function greatCirclePoints(from: GeoPoint, to: GeoPoint, steps = 48): GeoPoint[] {
  if (steps < 1) return [from, to];

  const lat1 = toRadians(from.lat);
  const lon1 = toRadians(from.lon);
  const lat2 = toRadians(to.lat);
  const lon2 = toRadians(unwrapLongitude(from.lon, to.lon));

  const angularDistance =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((lat2 - lat1) / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
      ),
    );

  // Совпадающие или почти совпадающие точки: интерполировать нечего.
  if (angularDistance < 1e-9) return [from, to];

  const points: GeoPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const fraction = index / steps;
    const a = Math.sin((1 - fraction) * angularDistance) / Math.sin(angularDistance);
    const b = Math.sin(fraction * angularDistance) / Math.sin(angularDistance);

    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);

    points.push({
      lat: toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
      lon: toDegrees(Math.atan2(y, x)),
    });
  }

  return unwrapPath(points);
}

/** Приводит `to` к представлению, ближайшему к `from`, чтобы не рисовать линию вокруг Земли. */
export function unwrapLongitude(fromLon: number, toLon: number): number {
  let unwrapped = toLon;
  while (unwrapped - fromLon > 180) unwrapped -= 360;
  while (unwrapped - fromLon < -180) unwrapped += 360;
  return unwrapped;
}

/** Делает последовательность долгот непрерывной, устраняя разрывы на ±180. */
export function unwrapPath(points: readonly GeoPoint[]): GeoPoint[] {
  const result: GeoPoint[] = [];
  let previousLon: number | undefined;

  for (const point of points) {
    const lon = previousLon === undefined ? point.lon : unwrapLongitude(previousLon, point.lon);
    result.push({ lat: point.lat, lon });
    previousLon = lon;
  }

  return result;
}

export type Bounds = readonly [west: number, south: number, east: number, north: number];

/**
 * Bounding box по всем точкам маршрута.
 *
 * Наивный `min/max` по долготе даёт рамку через полмира, если маршрут пересекает
 * антимеридиан. Поэтому долготы рассматриваются как точки на окружности: ищется
 * самый большой разрыв между соседними, и рамкой становится его дополнение.
 * При пересечении антимеридиана `east` возвращается больше 180.
 */
export function routeBounds(points: readonly GeoPoint[]): Bounds | undefined {
  if (points.length === 0) return undefined;

  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }

  const lons = points
    .map((point) => normalizeLongitude(point.lon))
    .sort((left, right) => left - right);

  let widestGap = -1;
  let gapStartIndex = 0;
  for (let index = 0; index < lons.length; index += 1) {
    const current = lons[index]!;
    const next = index === lons.length - 1 ? lons[0]! + 360 : lons[index + 1]!;
    const gap = next - current;
    if (gap > widestGap) {
      widestGap = gap;
      gapStartIndex = index;
    }
  }

  const west = lons[(gapStartIndex + 1) % lons.length]!;
  const eastRaw = lons[gapStartIndex]!;
  const east = eastRaw >= west ? eastRaw : eastRaw + 360;

  return [west, south, east, north];
}

export function normalizeLongitude(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

export function boundsCrossAntimeridian(bounds: Bounds): boolean {
  return bounds[2] > 180;
}

/** Максимальное расстояние между любыми двумя точками — протяжённость маршрута. */
export function routeExtentKm(points: readonly GeoPoint[]): number {
  if (points.length < 2) return 0;

  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      max = Math.max(max, haversineKm(points[i]!, points[j]!));
    }
  }
  return max;
}
