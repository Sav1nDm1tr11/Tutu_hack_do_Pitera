import type { GeoPoint } from '@tutu-plan-b/domain';

/**
 * Каталог городов для демо-режима.
 *
 * Координаты городов, аэропортов и вокзалов реальные — иначе глобус показывал бы
 * неверную географию. Всё остальное в fixture-режиме синтезируется и помечается
 * источником `fixture`, чтобы демо-данные нельзя было спутать с ответом инвентаря.
 */
export interface FixtureTerminal {
  readonly id: string;
  readonly name: string;
  readonly point: GeoPoint;
}

export interface FixtureCity {
  readonly id: string;
  readonly name: string;
  /** Варианты написания для поиска по вводу пользователя. */
  readonly aliases: readonly string[];
  readonly point: GeoPoint;
  /** Смещение от UTC в минутах: без него расчёт «ночных» сегментов был бы неверным. */
  readonly utcOffsetMinutes: number;
  readonly airports: readonly FixtureTerminal[];
  readonly railStations: readonly FixtureTerminal[];
  readonly busStations: readonly FixtureTerminal[];
  /** Является ли город авиахабом: через такие города строятся пересадки. */
  readonly isHub: boolean;
}

const city = (
  id: string,
  name: string,
  lon: number,
  lat: number,
  utcOffsetHours: number,
  options: {
    aliases?: readonly string[];
    airports?: readonly FixtureTerminal[];
    railStations?: readonly FixtureTerminal[];
    isHub?: boolean;
  } = {},
): FixtureCity => ({
  id,
  name,
  aliases: options.aliases ?? [],
  point: { lon, lat },
  utcOffsetMinutes: utcOffsetHours * 60,
  airports: options.airports ?? [
    { id: `${id}:air`, name: `Аэропорт ${name}`, point: { lon, lat } },
  ],
  railStations: options.railStations ?? [
    { id: `${id}:rail`, name: `Ж/д вокзал ${name}`, point: { lon, lat } },
  ],
  busStations: [{ id: `${id}:bus`, name: `Автовокзал ${name}`, point: { lon, lat } }],
  isHub: options.isHub ?? false,
});

export const FIXTURE_CITIES: readonly FixtureCity[] = [
  city('msk', 'Москва', 37.6173, 55.7558, 3, {
    aliases: ['москва', 'moscow', 'мск'],
    isHub: true,
    airports: [
      { id: 'msk:svo', name: 'Шереметьево', point: { lon: 37.4146, lat: 55.9726 } },
      { id: 'msk:dme', name: 'Домодедово', point: { lon: 37.9063, lat: 55.4088 } },
      { id: 'msk:vko', name: 'Внуково', point: { lon: 37.2615, lat: 55.5915 } },
    ],
    railStations: [
      { id: 'msk:rail-lnd', name: 'Ленинградский вокзал', point: { lon: 37.6552, lat: 55.7761 } },
      { id: 'msk:rail-kaz', name: 'Казанский вокзал', point: { lon: 37.656, lat: 55.7736 } },
      { id: 'msk:rail-kur', name: 'Курский вокзал', point: { lon: 37.6603, lat: 55.7573 } },
    ],
  }),
  city('spb', 'Санкт-Петербург', 30.3141, 59.9386, 3, {
    aliases: ['санкт-петербург', 'спб', 'питер', 'saint petersburg', 'петербург'],
    isHub: true,
    airports: [{ id: 'spb:led', name: 'Пулково', point: { lon: 30.2625, lat: 59.8003 } }],
    railStations: [
      { id: 'spb:rail-msk', name: 'Московский вокзал', point: { lon: 30.3626, lat: 59.9296 } },
      { id: 'spb:rail-lad', name: 'Ладожский вокзал', point: { lon: 30.4394, lat: 59.933 } },
    ],
  }),
  city('ekb', 'Екатеринбург', 60.5975, 56.8389, 5, {
    aliases: ['екатеринбург', 'екб', 'yekaterinburg'],
    isHub: true,
    airports: [{ id: 'ekb:svx', name: 'Кольцово', point: { lon: 60.8027, lat: 56.7431 } }],
    railStations: [
      {
        id: 'ekb:rail',
        name: 'Екатеринбург-Пассажирский',
        point: { lon: 60.5983, lat: 56.8583 },
      },
    ],
  }),
  city('kzn', 'Казань', 49.1064, 55.7963, 3, {
    aliases: ['казань', 'kazan'],
    isHub: true,
    airports: [{ id: 'kzn:kzn', name: 'Аэропорт Казань', point: { lon: 49.2787, lat: 55.6062 } }],
    railStations: [{ id: 'kzn:rail', name: 'Казань-Пассажирская', point: { lon: 49.0862, lat: 55.7853 } }],
  }),
  city('ovb', 'Новосибирск', 82.9346, 55.0084, 7, {
    aliases: ['новосибирск', 'novosibirsk', 'нск'],
    isHub: true,
    airports: [{ id: 'ovb:ovb', name: 'Толмачёво', point: { lon: 82.6507, lat: 55.0126 } }],
    railStations: [
      { id: 'ovb:rail', name: 'Новосибирск-Главный', point: { lon: 82.8975, lat: 55.0361 } },
    ],
  }),
  city('aer', 'Сочи', 39.7303, 43.6028, 3, {
    aliases: ['сочи', 'sochi', 'адлер'],
    airports: [{ id: 'aer:aer', name: 'Аэропорт Сочи', point: { lon: 39.9416, lat: 43.4499 } }],
    railStations: [{ id: 'aer:rail', name: 'Сочи', point: { lon: 39.7247, lat: 43.5855 } }],
  }),
  city('goj', 'Нижний Новгород', 44.0059, 56.3269, 3, {
    aliases: ['нижний новгород', 'нижний', 'nizhny novgorod'],
    airports: [{ id: 'goj:goj', name: 'Стригино', point: { lon: 43.784, lat: 56.23 } }],
    railStations: [
      { id: 'goj:rail', name: 'Нижний Новгород-Московский', point: { lon: 43.9412, lat: 56.3241 } },
    ],
  }),
  city('kuf', 'Самара', 50.15, 53.1959, 4, {
    aliases: ['самара', 'samara'],
    airports: [{ id: 'kuf:kuf', name: 'Курумоч', point: { lon: 50.1642, lat: 53.5046 } }],
    railStations: [{ id: 'kuf:rail', name: 'Самара', point: { lon: 50.1258, lat: 53.1837 } }],
  }),
  city('ufa', 'Уфа', 55.9721, 54.7351, 5, { aliases: ['уфа', 'ufa'] }),
  city('pee', 'Пермь', 56.2295, 58.0105, 5, { aliases: ['пермь', 'perm'] }),
  city('cek', 'Челябинск', 61.4368, 55.1644, 5, { aliases: ['челябинск', 'chelyabinsk'] }),
  city('krr', 'Краснодар', 38.9769, 45.0355, 3, { aliases: ['краснодар', 'krasnodar'] }),
  city('rov', 'Ростов-на-Дону', 39.7015, 47.2357, 3, {
    aliases: ['ростов-на-дону', 'ростов', 'rostov'],
  }),
  city('vog', 'Волгоград', 44.5133, 48.708, 3, { aliases: ['волгоград', 'volgograd'] }),
  city('vor', 'Воронеж', 39.2003, 51.672, 3, { aliases: ['воронеж', 'voronezh'] }),
  city('kgd', 'Калининград', 20.5101, 54.7104, 2, { aliases: ['калининград', 'kaliningrad'] }),
  city('mmk', 'Мурманск', 33.0827, 68.9585, 3, { aliases: ['мурманск', 'murmansk'] }),
  city('ikt', 'Иркутск', 104.2807, 52.287, 8, { aliases: ['иркутск', 'irkutsk'] }),
  city('vvo', 'Владивосток', 131.8855, 43.1155, 10, { aliases: ['владивосток', 'vladivostok'] }),
  city('kja', 'Красноярск', 92.8672, 56.0153, 7, { aliases: ['красноярск', 'krasnoyarsk'] }),
  city('tjm', 'Тюмень', 65.5343, 57.1522, 5, { aliases: ['тюмень', 'tyumen'] }),
  city('psk', 'Псков', 28.3336, 57.8194, 3, { aliases: ['псков', 'pskov'] }),
  city('nvg', 'Великий Новгород', 31.2694, 58.5213, 3, {
    aliases: ['великий новгород', 'новгород'],
  }),
  city('ptz', 'Петрозаводск', 34.3469, 61.7849, 3, { aliases: ['петрозаводск'] }),
  city('arh', 'Архангельск', 40.5433, 64.5401, 3, { aliases: ['архангельск', 'arkhangelsk'] }),
  city('iar', 'Ярославль', 39.8737, 57.6261, 3, { aliases: ['ярославль', 'yaroslavl'] }),
  city('tul', 'Тула', 37.6182, 54.1961, 3, { aliases: ['тула', 'tula'] }),
  city('asf', 'Астрахань', 48.0408, 46.3497, 4, { aliases: ['астрахань', 'astrakhan'] }),
  city('oms', 'Омск', 73.3686, 54.9885, 6, { aliases: ['омск', 'omsk'] }),
  city('tof', 'Томск', 84.9483, 56.4846, 7, { aliases: ['томск', 'tomsk'] }),
  city('rtw', 'Саратов', 46.0154, 51.5336, 4, { aliases: ['саратов', 'saratov'] }),
  city('ijk', 'Ижевск', 53.2045, 56.8527, 4, { aliases: ['ижевск', 'izhevsk'] }),
  city('kvx', 'Киров', 49.6601, 58.6035, 3, { aliases: ['киров', 'kirov'] }),
  city('vgd', 'Вологда', 39.8978, 59.2205, 3, { aliases: ['вологда', 'vologda'] }),
  city('kld', 'Калуга', 36.2637, 54.5293, 3, { aliases: ['калуга', 'kaluga'] }),
  city('smo', 'Смоленск', 32.0401, 54.7818, 3, { aliases: ['смоленск', 'smolensk'] }),
  city('mrv', 'Минеральные Воды', 43.135, 44.21, 3, { aliases: ['минеральные воды', 'минводы'] }),
  city('bax', 'Барнаул', 83.7636, 53.3548, 7, { aliases: ['барнаул', 'barnaul'] }),
  city('kem', 'Кемерово', 86.0872, 55.3547, 7, { aliases: ['кемерово', 'kemerovo'] }),
  city('ren', 'Оренбург', 55.0904, 51.7727, 5, { aliases: ['оренбург', 'orenburg'] }),
  city('ula', 'Улан-Удэ', 107.5842, 51.8335, 8, { aliases: ['улан-удэ', 'ulan-ude'] }),
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

/** Поиск города по id или по названию/алиасу. Возвращает `undefined`, если города нет в каталоге. */
export function findCity(query: string): FixtureCity | undefined {
  const needle = normalize(query);

  return FIXTURE_CITIES.find((candidate) => {
    if (candidate.id === needle) return true;
    if (normalize(candidate.name) === needle) return true;
    return candidate.aliases.some((alias) => normalize(alias) === needle);
  });
}

/** Подсказки для автодополнения в форме поиска. */
export function suggestCities(query: string, limit = 8): FixtureCity[] {
  const needle = normalize(query);
  if (needle === '') return FIXTURE_CITIES.slice(0, limit);

  const startsWith: FixtureCity[] = [];
  const contains: FixtureCity[] = [];

  for (const candidate of FIXTURE_CITIES) {
    const haystack = [candidate.name, ...candidate.aliases].map(normalize);
    if (haystack.some((value) => value.startsWith(needle))) startsWith.push(candidate);
    else if (haystack.some((value) => value.includes(needle))) contains.push(candidate);
  }

  return [...startsWith, ...contains].slice(0, limit);
}

/** Ближайший авиахаб, годный для пересадки между двумя городами. */
export function pickHub(originId: string, destinationId: string): FixtureCity | undefined {
  return FIXTURE_CITIES.find(
    (candidate) => candidate.isHub && candidate.id !== originId && candidate.id !== destinationId,
  );
}
