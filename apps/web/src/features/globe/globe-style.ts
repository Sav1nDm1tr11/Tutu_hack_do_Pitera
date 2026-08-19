import type { StyleSpecification } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import { feature } from 'topojson-client';
import landTopology from 'world-atlas/land-110m.json';

/**
 * Стиль глобуса (§6.6, §15.3).
 *
 * Стиль собирается локально, без внешнего провайдера тайлов, по двум причинам.
 * Во-первых, §6.6 требует стилизованной иллюстрации, а не GIS-карты: спутниковые
 * текстуры и рельеф прямо запрещены. Во-вторых, приложение обязано остаться работоспособным,
 * когда провайдер тайлов недоступен (§15.5) — а стиль без сетевых зависимостей превращает
 * этот сценарий из отказа в норму.
 *
 * Данные суши — `land-110m` из world-atlas: контуры реальные, но сильно упрощённые, что
 * совпадает с требованием «география визуально упрощена, но пространственно корректна».
 * Цена решения — отсутствие подписей городов из тайлов; названия мы рисуем сами по
 * маркерам маршрута, то есть только там, где координаты подтверждены.
 */
function landFeatureCollection(): FeatureCollection<MultiPolygon> {
  const topology = landTopology as unknown as Parameters<typeof feature>[0];
  return feature(topology, topology.objects['land'] as never) as unknown as FeatureCollection<MultiPolygon>;
}

export const GLOBE_STYLE: StyleSpecification = {
  version: 8,
  name: 'tutu-plan-b-globe',
  sources: {
    land: {
      type: 'geojson',
      data: landFeatureCollection(),
    },
  },
  layers: [
    {
      id: 'ocean',
      type: 'background',
      paint: { 'background-color': '#ede9fe' },
    },
    {
      id: 'land-fill',
      type: 'fill',
      source: 'land',
      paint: { 'fill-color': '#ddd6fe' },
    },
    {
      id: 'land-outline',
      type: 'line',
      source: 'land',
      paint: { 'line-color': '#c4b5fd', 'line-width': 0.8 },
    },
  ],
};

/** Цвета линий и маркеров маршрута. Держим рядом со стилем, чтобы палитра была одна. */
export const ROUTE_COLORS = {
  main: '#6D28D9',
  selected: '#F59E0B',
  muted: '#C4B5FD',
  markerOrigin: '#6D28D9',
  markerDestination: '#6D28D9',
  markerWaypoint: '#F59E0B',
  markerHotel: '#10B981',
} as const;
