import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapMouseEvent,
} from 'maplibre-gl';
import type { FeatureCollection, LineString, Point } from 'geojson';
import type { RouteGeometry } from '@tutu-plan-b/domain';
import { DEFAULT_ROUTE_VIEWPORT_CONFIG, deriveRouteViewport } from '@tutu-plan-b/domain';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GLOBE_STYLE, ROUTE_COLORS } from './globe-style';

export interface RouteGlobeProps {
  readonly geometry: RouteGeometry;
  readonly selectedStageId: string | undefined;
  readonly onSelectStage: (stageId: string | undefined) => void;
  readonly reducedMotion: boolean;
}

const SOURCE_SEGMENTS = 'route-segments';
const SOURCE_MARKERS = 'route-markers';

/**
 * Глобус маршрута.
 *
 * Императивный слой намеренно изолирован в одном компоненте: MapLibre владеет своим
 * состоянием, и попытка синхронизировать его через React-рендеры приводит к дёрганию
 * камеры. Поэтому React здесь отвечает только за передачу данных, а камера
 * пересчитывается доменной функцией `deriveRouteViewport` — детерминированно и
 * одинаково на всех экранах (§15.2).
 */
export default function RouteGlobe({
  geometry,
  selectedStageId,
  onSelectStage,
  reducedMotion,
}: RouteGlobeProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const [ready, setReady] = useState(false);
  /**
   * Пользователь двигал камеру сам — автоматические перелёты приостановлены до явной
   * команды «Показать весь маршрут» или выбора этапа (§6.7). Без этого карта отбирала бы
   * управление у пользователя при каждом обновлении цены.
   */
  const cameraOverriddenRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const map = new MapLibreMap({
      container,
      style: GLOBE_STYLE,
      center: [60, 57],
      zoom: 2,
      attributionControl: false,
      // Вращение и наклон отключены: это иллюстрация маршрута, а не GIS-инструмент,
      // и лишние степени свободы только теряют ориентацию пользователя.
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: false,
      maxZoom: 12,
    });

    mapRef.current = map;

    const resize = (): void => {
      map.resize();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    map.on('load', () => {
      resize();
      map.addSource(SOURCE_SEGMENTS, { type: 'geojson', data: emptyCollection() });
      map.addSource(SOURCE_MARKERS, { type: 'geojson', data: emptyCollection() });

      map.addLayer({
        id: 'segment-line',
        type: 'line',
        source: SOURCE_SEGMENTS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', 'selected'], false],
            ROUTE_COLORS.selected,
            ROUTE_COLORS.main,
          ],
          // Толщина, а не только цвет: §19 запрещает делать цвет единственным носителем
          // состояния, и на глобусе это правило действует так же, как в карточках.
          'line-width': ['case', ['boolean', ['get', 'selected'], false], 5, 3],
          'line-opacity': 0.95,
        },
      });

      map.addLayer({
        id: 'marker-circle',
        type: 'circle',
        source: SOURCE_MARKERS,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 9, 7],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });

      setReady(true);
    });

    map.on('dragstart', () => {
      cameraOverriddenRef.current = true;
    });
    map.on('zoomstart', (event: { originalEvent?: unknown }) => {
      // Программный зум не считается вмешательством пользователя.
      if (event.originalEvent !== undefined) cameraOverriddenRef.current = true;
    });

    map.on('click', 'segment-line', (event: MapMouseEvent & { features?: GeoJsonFeature[] }) => {
      const stageId = event.features?.[0]?.properties?.['stageId'];
      if (typeof stageId === 'string') onSelectStage(stageId);
    });
    map.on('mouseenter', 'segment-line', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'segment-line', () => {
      map.getCanvas().style.cursor = '';
    });

    return (): void => {
      observer.disconnect();
      map.remove();
      mapRef.current = undefined;
      setReady(false);
    };
    // Обработчики читают колбэк через замыкание один раз: пересоздавать карту при
    // изменении пропсов недопустимо — это стоит полной перерисовки и потери камеры.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map === undefined || !ready) return;

    setData(map, SOURCE_SEGMENTS, segmentsToGeoJson(geometry, selectedStageId));
    setData(map, SOURCE_MARKERS, markersToGeoJson(geometry, selectedStageId));
  }, [geometry, selectedStageId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === undefined || !ready) return;

    const container = containerRef.current;
    if (container === null) return;

    // При выборе этапа кадрируем именно его, иначе — весь маршрут (§15.2).
    const points =
      selectedStageId === undefined
        ? geometry.points
        : (geometry.segments.find((segment) => segment.stageId === selectedStageId)?.path ??
          geometry.points);

    if (selectedStageId === undefined && cameraOverriddenRef.current) return;
    cameraOverriddenRef.current = false;

    const viewport = deriveRouteViewport(
      points,
      { width: container.clientWidth, height: container.clientHeight },
      DEFAULT_ROUTE_VIEWPORT_CONFIG,
    );
    if (viewport === undefined) return;

    const [west, south, east, north] = viewport.bounds;
    map.fitBounds([west, south, east, north] as LngLatBoundsLike, {
      padding: viewport.padding,
      maxZoom: viewport.maxZoom,
      // §19: reduced-motion означает отсутствие движения, а не более быструю анимацию.
      duration: reducedMotion ? 0 : 640,
    });
  }, [geometry, selectedStageId, ready, reducedMotion]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-hidden="true" />

      {/* Текстовый эквивалент карты (§19). Скрыт визуально, но доступен скринридеру:
          глобус — усиление, а не единственный источник информации. */}
      <p className="visually-hidden">
        Схема маршрута: {geometry.markers.map((marker) => marker.place.name).join(', ')}.
      </p>
    </div>
  );
}

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

interface GeoJsonFeature {
  readonly properties?: Record<string, unknown> | null;
}

function setData(map: MapLibreMap, sourceId: string, data: FeatureCollection): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

function segmentsToGeoJson(
  geometry: RouteGeometry,
  selectedStageId: string | undefined,
): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: geometry.segments.map((segment) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: segment.path.map((point) => [point.lon, point.lat]),
      },
      properties: {
        stageId: segment.stageId,
        selected: segment.stageId === selectedStageId,
      },
    })),
  };
}

const MARKER_COLORS: Record<string, string> = {
  origin: ROUTE_COLORS.markerOrigin,
  destination: ROUTE_COLORS.markerDestination,
  waypoint: ROUTE_COLORS.markerWaypoint,
  hotel: ROUTE_COLORS.markerHotel,
};

function markersToGeoJson(
  geometry: RouteGeometry,
  selectedStageId: string | undefined,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: geometry.markers.map((marker) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [marker.point.lon, marker.point.lat] },
      properties: {
        stageId: marker.stageId,
        color: MARKER_COLORS[marker.role] ?? ROUTE_COLORS.markerWaypoint,
        selected: marker.stageId === selectedStageId,
      },
    })),
  };
}
