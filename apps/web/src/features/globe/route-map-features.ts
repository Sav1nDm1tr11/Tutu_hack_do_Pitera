import type { FeatureCollection, LineString, Point } from 'geojson';
import type { MarkerRole, RouteGeometry } from '@tutu-plan-b/domain';
import { ROUTE_COLORS } from './globe-style';

export interface RouteSegmentProperties {
  readonly stageId: string;
  readonly selected: boolean;
}

export interface RouteMarkerProperties {
  readonly stageId: string;
  readonly placeName: string;
  readonly role: MarkerRole;
  readonly color: string;
  readonly selected: boolean;
}

const MARKER_COLORS: Record<MarkerRole, string> = {
  origin: ROUTE_COLORS.markerOrigin,
  destination: ROUTE_COLORS.markerDestination,
  waypoint: ROUTE_COLORS.markerWaypoint,
  hotel: ROUTE_COLORS.markerHotel,
};

export function segmentsToFeatureCollection(
  geometry: RouteGeometry,
  selectedStageId: string | undefined,
): FeatureCollection<LineString, RouteSegmentProperties> {
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

export function markersToFeatureCollection(
  geometry: RouteGeometry,
  selectedStageId: string | undefined,
): FeatureCollection<Point, RouteMarkerProperties> {
  return {
    type: 'FeatureCollection',
    features: geometry.markers.map((marker) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        // GeoJSON and MapLibre always use longitude first. Never swap for display.
        coordinates: [marker.point.lon, marker.point.lat],
      },
      properties: {
        stageId: marker.stageId,
        placeName: marker.place.name,
        role: marker.role,
        color: MARKER_COLORS[marker.role],
        selected: marker.stageId === selectedStageId,
      },
    })),
  };
}
