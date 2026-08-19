import { useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import type { RouteGeometry } from '@tutu-plan-b/domain';
import landTopology from 'world-atlas/land-110m.json';
import { ROUTE_COLORS } from './globe-style';
import { segmentsToFeatureCollection } from './route-map-features';

export interface RouteGlobeProps {
  readonly geometry: RouteGeometry;
  readonly selectedStageId: string | undefined;
  readonly onSelectStage: (stageId: string | undefined) => void;
  readonly reducedMotion: boolean;
}

const VIEW_SIZE = 600;
const BASE_SCALE = 284;
const DRAG_SENSITIVITY = 0.24;

const LAND = feature(
  landTopology as unknown as Parameters<typeof feature>[0],
  (landTopology as unknown as { objects: { land: never } }).objects.land,
) as unknown as FeatureCollection<MultiPolygon>;

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly rotation: readonly [number, number, number];
}

/**
 * Интерактивная ортографическая планета без сетевых тайлов.
 *
 * D3 проектирует реальные координаты на сферу, а world-atlas даёт контуры материков.
 * Поэтому маркеры нельзя «подвинуть для красоты»: их экранная позиция всегда является
 * результатом проекции `PlaceRef.point` в порядке `[lon, lat]`.
 */
export default function RouteGlobe({
  geometry,
  selectedStageId,
  onSelectStage,
  reducedMotion,
}: RouteGlobeProps): React.JSX.Element {
  const center = useMemo(() => routeCenter(geometry), [geometry]);
  const defaultRotation = useMemo(() => [-center[0], -center[1], 0] as const, [center]);
  const [rotation, setRotation] = useState<readonly [number, number, number]>(defaultRotation);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<DragState | undefined>(undefined);

  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([VIEW_SIZE / 2, VIEW_SIZE / 2])
        .scale(BASE_SCALE * zoom)
        .clipAngle(90)
        .precision(0.35)
        .rotate([...rotation]),
    [rotation, zoom],
  );
  const path = useMemo(() => geoPath(projection), [projection]);
  const landPath = useMemo(() => path(LAND) ?? '', [path]);
  const graticulePath = useMemo(() => path(geoGraticule10()) ?? '', [path]);
  const segmentFeatures = useMemo(
    () => segmentsToFeatureCollection(geometry, selectedStageId),
    [geometry, selectedStageId],
  );
  const projectedMarkers = geometry.markers.flatMap((marker) => {
    const point = projection([marker.point.lon, marker.point.lat]);
    if (point === null) return [];
    return [{ marker, x: point[0], y: point[1] }];
  });

  const resetView = (): void => {
    setRotation(defaultRotation);
    setZoom(1);
    onSelectStage(undefined);
  };

  return (
    <div
      className="route-planet"
      role="region"
      aria-label="Интерактивная карта маршрута"
      onWheel={(event) => {
        event.preventDefault();
        setZoom((current) => clamp(current - event.deltaY * 0.001, 0.82, 1.45));
      }}
    >
      <svg
        className="route-planet__svg"
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        aria-hidden="true"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            rotation,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag === undefined || drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          setRotation([
            drag.rotation[0] + dx * DRAG_SENSITIVITY,
            clamp(drag.rotation[1] - dy * DRAG_SENSITIVITY, -82, 82),
            0,
          ]);
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
        }}
        onPointerCancel={() => {
          dragRef.current = undefined;
        }}
      >
        <defs>
          <clipPath id="route-planet-clip">
            <circle cx="300" cy="300" r="284" />
          </clipPath>
          <radialGradient id="route-ocean" cx="34%" cy="27%" r="78%">
            <stop offset="0" stopColor="#8ce4f7" />
            <stop offset="0.58" stopColor="#56bfe8" />
            <stop offset="1" stopColor="#2d91ce" />
          </radialGradient>
          <filter id="route-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="9" stdDeviation="12" floodColor="#143c75" floodOpacity="0.2" />
          </filter>
        </defs>

        <circle
          cx="300"
          cy="300"
          r="284"
          fill="url(#route-ocean)"
          filter="url(#route-soft-shadow)"
        />
        <g clipPath="url(#route-planet-clip)">
          <path d={graticulePath} className="route-planet__graticule" />
          <path d={landPath} className="route-planet__land" />
          {segmentFeatures.features.map((segment) => {
            const routePath = path(segment) ?? '';
            const selected = segment.properties.selected;
            return (
              <g key={segment.properties.stageId}>
                <path d={routePath} className="route-planet__route-halo" />
                <path
                  d={routePath}
                  className="route-planet__route"
                  data-selected={selected ? 'true' : undefined}
                  stroke={selected ? ROUTE_COLORS.selected : ROUTE_COLORS.main}
                  onClick={() => onSelectStage(segment.properties.stageId)}
                />
              </g>
            );
          })}
          <ellipse className="route-planet__shine" cx="213" cy="156" rx="118" ry="54" />
        </g>
        <circle cx="300" cy="300" r="284" className="route-planet__rim" />
      </svg>

      {projectedMarkers.map(({ marker, x, y }) => (
        <button
          key={marker.id}
          type="button"
          className="route-map-marker"
          data-role={marker.role}
          data-selected={marker.stageId === selectedStageId ? 'true' : undefined}
          style={{ left: `${(x / VIEW_SIZE) * 100}%`, top: `${(y / VIEW_SIZE) * 100}%` }}
          aria-label={`${marker.place.name}: показать этап маршрута`}
          onClick={() => onSelectStage(marker.stageId)}
        >
          <span className="route-map-marker__dot" />
          <span className="route-map-marker__label">
            {shortPlaceName(marker.place.name, marker.role)}
          </span>
        </button>
      ))}

      <button type="button" className="route-planet__reset" onClick={resetView}>
        {reducedMotion ? 'Сбросить вид' : 'Вернуть маршрут'}
      </button>
      <p className="visually-hidden">
        Схема маршрута: {geometry.markers.map((marker) => marker.place.name).join(', ')}.
      </p>
    </div>
  );
}

function routeCenter(geometry: RouteGeometry): readonly [number, number] {
  const points = geometry.points;
  if (points.length === 0) return [45, 58];
  const longitude = points.reduce((sum, point) => sum + point.lon, 0) / points.length;
  const latitude = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  return [longitude, latitude];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function shortPlaceName(name: string, role: string): string {
  if (role === 'hotel') return 'Отель';
  return name.split(',')[0] ?? name;
}
