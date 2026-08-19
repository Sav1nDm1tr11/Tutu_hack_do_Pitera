import { describe, expect, it } from 'vitest';
import type { GeoPoint } from '../contracts/common';
import { boundsCrossAntimeridian, haversineKm, routeBounds, unwrapPath } from './great-circle';
import { DEFAULT_ROUTE_VIEWPORT_CONFIG, deriveCameraMode, deriveRouteViewport } from './viewport';

const EKB: GeoPoint = { lon: 60.5975, lat: 56.8389 };
const SPB: GeoPoint = { lon: 30.3141, lat: 59.9386 };
const MSK: GeoPoint = { lon: 37.6173, lat: 55.7558 };
const NOVGOROD: GeoPoint = { lon: 31.2694, lat: 58.5213 };
const VLADIVOSTOK: GeoPoint = { lon: 131.8855, lat: 43.1155 };
const ANADYR: GeoPoint = { lon: 177.5093, lat: 64.7314 };
const NOME: GeoPoint = { lon: -165.4064, lat: 64.5011 };

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

describe('haversineKm', () => {
  it('считает известные расстояния с разумной точностью', () => {
    expect(haversineKm(MSK, SPB)).toBeGreaterThan(620);
    expect(haversineKm(MSK, SPB)).toBeLessThan(660);
    expect(haversineKm(EKB, SPB)).toBeGreaterThan(1700);
    expect(haversineKm(EKB, SPB)).toBeLessThan(1850);
  });

  it('расстояние до самой точки равно нулю', () => {
    expect(haversineKm(MSK, MSK)).toBeCloseTo(0, 6);
  });
});

describe('deriveCameraMode', () => {
  // §15.2: показывать целую Землю для поездки на 40 км запрещено.
  it('выбирает масштаб по протяжённости маршрута', () => {
    expect(deriveCameraMode(6500)).toBe('world');
    expect(deriveCameraMode(1780)).toBe('continent');
    expect(deriveCameraMode(150)).toBe('region');
    expect(deriveCameraMode(40)).toBe('local');
  });

  it('границы режимов не оставляют дыр', () => {
    const { world, continent, region } = DEFAULT_ROUTE_VIEWPORT_CONFIG.modeThresholdsKm;
    expect(deriveCameraMode(world)).toBe('continent');
    expect(deriveCameraMode(world + 1)).toBe('world');
    expect(deriveCameraMode(continent)).toBe('continent');
    expect(deriveCameraMode(continent - 1)).toBe('region');
    expect(deriveCameraMode(region)).toBe('region');
    expect(deriveCameraMode(region - 1)).toBe('local');
  });
});

describe('deriveRouteViewport', () => {
  it('дальний маршрут открывается в мировом кадре', () => {
    const viewport = deriveRouteViewport([MSK, VLADIVOSTOK], DESKTOP);
    expect(viewport?.mode).toBe('world');
    expect(viewport?.maxZoom).toBe(DEFAULT_ROUTE_VIEWPORT_CONFIG.maxZoomByMode.world);
  });

  it('маршрут Екатеринбург — Петербург открывается в континентальном кадре', () => {
    expect(deriveRouteViewport([EKB, SPB], DESKTOP)?.mode).toBe('continent');
  });

  it('короткий маршрут не отдаляется искусственно', () => {
    expect(deriveRouteViewport([SPB, NOVGOROD], DESKTOP)?.mode).toBe('region');
  });

  // Нулевая площадь рамки увела бы fitBounds в максимальный зум.
  it('одна точка даёт локальный кадр с минимальной ненулевой рамкой', () => {
    const viewport = deriveRouteViewport([MSK], DESKTOP);
    expect(viewport?.mode).toBe('local');
    expect(viewport!.bounds[2] - viewport!.bounds[0]).toBeGreaterThan(0);
    expect(viewport!.bounds[3] - viewport!.bounds[1]).toBeGreaterThan(0);
  });

  it('совпадающие точки обрабатываются как одна', () => {
    const viewport = deriveRouteViewport([MSK, { ...MSK }], DESKTOP);
    expect(viewport?.mode).toBe('local');
    expect(viewport!.bounds[2]).toBeGreaterThan(viewport!.bounds[0]);
  });

  it('без координат геометрии нет — вместо приблизительной рамки возвращается undefined', () => {
    expect(deriveRouteViewport([], DESKTOP)).toBeUndefined();
  });

  it('на mobile снизу остаётся место под bottom sheet', () => {
    const mobile = deriveRouteViewport([EKB, SPB], MOBILE)!;
    const desktop = deriveRouteViewport([EKB, SPB], DESKTOP)!;
    expect(mobile.padding.bottom).toBeGreaterThan(mobile.padding.top);
    expect(desktop.padding.right).toBeGreaterThan(mobile.padding.right);
  });

  // Desktop-набор отступов на узком экране дал бы отрицательную область для fitBounds.
  it('отступы ужимаются под размер viewport', () => {
    const tiny = deriveRouteViewport([EKB, SPB], { width: 320, height: 480 })!;
    expect(tiny.padding.left + tiny.padding.right).toBeLessThan(320);
    expect(tiny.padding.top + tiny.padding.bottom).toBeLessThan(480);
  });

  it('детерминирован при одинаковом входе', () => {
    expect(deriveRouteViewport([EKB, SPB, MSK], DESKTOP)).toEqual(
      deriveRouteViewport([EKB, SPB, MSK], DESKTOP),
    );
  });
});

describe('антимеридиан', () => {
  // Наивный min/max по долготе дал бы рамку через полмира.
  it('рамка через 180° не растягивается на весь глобус', () => {
    const bounds = routeBounds([ANADYR, NOME])!;
    expect(boundsCrossAntimeridian(bounds)).toBe(true);
    expect(bounds[2] - bounds[0]).toBeLessThan(30);
  });

  it('обычная рамка не помечается как пересекающая антимеридиан', () => {
    expect(boundsCrossAntimeridian(routeBounds([EKB, SPB])!)).toBe(false);
  });

  it('путь через антимеридиан остаётся непрерывным по долготе', () => {
    const path = unwrapPath([ANADYR, { lon: -179, lat: 64.6 }, NOME]);
    for (let index = 1; index < path.length; index += 1) {
      expect(Math.abs(path[index]!.lon - path[index - 1]!.lon)).toBeLessThan(180);
    }
  });

  it('кадр для короткого маршрута через антимеридиан остаётся локальным', () => {
    const viewport = deriveRouteViewport(
      [
        { lon: 179.9, lat: 64.5 },
        { lon: -179.9, lat: 64.5 },
      ],
      DESKTOP,
    );
    expect(viewport?.mode).toBe('local');
  });
});
