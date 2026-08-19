import { describe, expect, it } from 'vitest';
import type { RouteGeometry } from '@tutu-plan-b/domain';
import { markersToFeatureCollection, segmentsToFeatureCollection } from './route-map-features';

const geometry: RouteGeometry = {
  hasCompleteCoordinates: true,
  points: [
    { lon: 60.5975, lat: 56.8389 },
    { lon: 30.3141, lat: 59.9386 },
  ],
  markers: [
    {
      id: 'stage-out:from',
      stageId: 'stage-out',
      role: 'origin',
      place: {
        id: 'ekb',
        name: 'Екатеринбург',
        kind: 'city',
        point: { lon: 60.5975, lat: 56.8389 },
      },
      point: { lon: 60.5975, lat: 56.8389 },
    },
    {
      id: 'stage-out:to',
      stageId: 'stage-out',
      role: 'destination',
      place: {
        id: 'spb',
        name: 'Санкт-Петербург',
        kind: 'city',
        point: { lon: 30.3141, lat: 59.9386 },
      },
      point: { lon: 30.3141, lat: 59.9386 },
    },
  ],
  segments: [
    {
      stageId: 'stage-out',
      from: { lon: 60.5975, lat: 56.8389 },
      to: { lon: 30.3141, lat: 59.9386 },
      path: [
        { lon: 60.5975, lat: 56.8389 },
        { lon: 30.3141, lat: 59.9386 },
      ],
    },
  ],
};

describe('route map features', () => {
  it('keeps real city coordinates in MapLibre longitude-latitude order', () => {
    const data = markersToFeatureCollection(geometry, undefined);

    expect(data.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          geometry: { type: 'Point', coordinates: [60.5975, 56.8389] },
          properties: expect.objectContaining({
            placeName: 'Екатеринбург',
            role: 'origin',
          }),
        }),
        expect.objectContaining({
          geometry: { type: 'Point', coordinates: [30.3141, 59.9386] },
          properties: expect.objectContaining({
            placeName: 'Санкт-Петербург',
            role: 'destination',
          }),
        }),
      ]),
    );
  });

  it('keeps the route path in longitude-latitude order and marks the active stage', () => {
    const data = segmentsToFeatureCollection(geometry, 'stage-out');

    expect(data.features[0]).toMatchObject({
      geometry: {
        type: 'LineString',
        coordinates: [
          [60.5975, 56.8389],
          [30.3141, 59.9386],
        ],
      },
      properties: { stageId: 'stage-out', selected: true },
    });
  });
});
