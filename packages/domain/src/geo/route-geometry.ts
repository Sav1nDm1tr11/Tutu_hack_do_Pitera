import type { GeoPoint, PlaceRef } from '../contracts/common';
import type { CandidatePool } from '../contracts/candidate';
import type { PlanConfiguration } from '../contracts/plan';
import { isHotelOption, isTransportOption } from '../contracts/candidate';
import { greatCirclePoints } from './great-circle';

export type MarkerRole = 'origin' | 'destination' | 'waypoint' | 'hotel';

export interface RouteMarker {
  readonly id: string;
  readonly stageId: string;
  readonly place: PlaceRef;
  readonly point: GeoPoint;
  readonly role: MarkerRole;
}

export interface RouteSegmentGeometry {
  readonly stageId: string;
  readonly from: GeoPoint;
  readonly to: GeoPoint;
  readonly path: readonly GeoPoint[];
}

export interface RouteGeometry {
  readonly segments: readonly RouteSegmentGeometry[];
  readonly markers: readonly RouteMarker[];
  readonly points: readonly GeoPoint[];
  /**
   * `false` означает, что часть этапов не имеет координат. Мы не достраиваем их
   * геокодером и не рисуем приблизительную линию (§15.3) — UI показывает предупреждение.
   */
  readonly hasCompleteCoordinates: boolean;
}

/**
 * Переводит выбранную конфигурацию в геометрию для глобуса. Этапы без координат
 * пропускаются, а не аппроксимируются: выдуманная точка на карте читается
 * пользователем как факт.
 */
export function buildRouteGeometry(
  configuration: PlanConfiguration,
  pool: CandidatePool,
  arcSteps = 48,
): RouteGeometry {
  const segments: RouteSegmentGeometry[] = [];
  const markers: RouteMarker[] = [];
  let missingCoordinates = false;
  let firstDeparturePlaceId: string | undefined;

  const transportStages = configuration.stages.filter((stage) => stage.kind === 'transport');

  for (const [index, stage] of transportStages.entries()) {
    const option = pool[stage.selectedOptionId];
    if (option === undefined || !isTransportOption(option)) {
      missingCoordinates = true;
      continue;
    }

    const from = option.departure.place.point;
    const to = option.arrival.place.point;
    if (from === undefined || to === undefined) {
      missingCoordinates = true;
      continue;
    }

    segments.push({
      stageId: stage.id,
      from,
      to,
      path: greatCirclePoints(from, to, arcSteps),
    });

    const isFirst = index === 0;
    if (isFirst) firstDeparturePlaceId = option.departure.place.id;

    markers.push({
      id: `${stage.id}:from`,
      stageId: stage.id,
      place: option.departure.place,
      point: from,
      role: isFirst ? 'origin' : 'waypoint',
    });
    markers.push({
      id: `${stage.id}:to`,
      stageId: stage.id,
      place: option.arrival.place,
      point: to,
      // В поездке «туда и обратно» последнее прибытие — это возвращение в исходный город,
      // и помечать его как пункт назначения было бы неверно. Признак — совпадение места,
      // а не позиция этапа: у поездки в одну сторону последний этап заканчивается именно
      // в пункте назначения.
      role: option.arrival.place.id === firstDeparturePlaceId ? 'origin' : 'destination',
    });
  }

  // Отель — отдельный маркер, а не звено линии: между отелем и вокзалом мы не обещаем
  // маршрут городского транспорта (не-цель MVP).
  for (const stage of configuration.stages) {
    if (stage.kind !== 'hotel') continue;
    const option = pool[stage.selectedOptionId];
    if (option === undefined || !isHotelOption(option)) continue;

    const point = option.place?.point;
    if (point === undefined || option.place === undefined) {
      missingCoordinates = true;
      continue;
    }

    markers.push({
      id: `${stage.id}:hotel`,
      stageId: stage.id,
      place: option.place,
      point,
      role: 'hotel',
    });
  }

  const points = dedupePoints(markers.map((marker) => marker.point));

  return {
    segments,
    markers: dedupeMarkers(markers),
    points,
    hasCompleteCoordinates: !missingCoordinates && points.length > 0,
  };
}

function dedupePoints(points: readonly GeoPoint[]): GeoPoint[] {
  const seen = new Set<string>();
  const result: GeoPoint[] = [];
  for (const point of points) {
    const key = `${point.lon.toFixed(5)}:${point.lat.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(point);
  }
  return result;
}

/**
 * Прибытие одного этапа и отправление следующего — одна и та же точка пересадки.
 * Два маркера в одной координате на глобусе выглядят как артефакт рендера.
 */
function dedupeMarkers(markers: readonly RouteMarker[]): RouteMarker[] {
  const byPlace = new Map<string, RouteMarker>();
  for (const marker of markers) {
    const key = `${marker.place.id}:${marker.point.lon.toFixed(5)}:${marker.point.lat.toFixed(5)}`;
    const existing = byPlace.get(key);
    if (existing === undefined || rolePriority(marker.role) > rolePriority(existing.role)) {
      byPlace.set(key, marker);
    }
  }
  return [...byPlace.values()];
}

function rolePriority(role: MarkerRole): number {
  switch (role) {
    case 'origin':
      return 3;
    case 'destination':
      return 2;
    case 'hotel':
      return 1;
    case 'waypoint':
      return 0;
  }
}
