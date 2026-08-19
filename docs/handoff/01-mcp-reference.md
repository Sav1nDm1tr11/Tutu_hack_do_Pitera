# 02. База знаний по Tutu MCP (проверено вживую 19.08.2026, 14:47 МСК)

Всё в этом файле получено прямым запросом к `https://mcp.tutu.ru/mcp`, а не из
догадок. Сырые ответы лежат в `fixtures/mcp_tools_list.raw.json` и
`fixtures/multitransport_msk_spb.json`. **Если поля нет здесь — считай, что его нет.**

- Сервер: `tutu-mcp-server`, версия `0.38.0`, протокол MCP `2025-06-18`.
- Транспорт: Streamable HTTP, обычный `POST` JSON-RPC 2.0.
  Заголовки: `Content-Type: application/json`,
  `Accept: application/json, text/event-stream`. Авторизация **не требуется**.
- Возможности: `tools`, `resources`, `prompts` (все `listChanged: false`).

## Как дёрнуть руками (для отладки)

```bash
curl -s -X POST https://mcp.tutu.ru/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 2000
```

Полезная нагрузка инструмента приходит строкой JSON внутри
`result.content[0].text` — её надо распарсить второй раз.

## Инструменты (16 штук, все read-only)

| Инструмент | Назначение | Ключевые аргументы |
|---|---|---|
| `search_multitransport` | **наш главный** — сравнение авиа/ж-д/автобус/электричка одним запросом | `origin`, `destination`, `departure_date`, `adults`, `modes`, `optimize_for: price\|time`, `price_max`, `direct_only`, `carriers`, `page`, `page_size`, `view` |
| `search_avia` | рейсы | + `return_date`, `service_class`, `children`, `infants`, `flight_numbers`, `sort` |
| `search_rail` | поезда | + `passengers`, `seat_categories`, `train_numbers` |
| `search_bus` | автобусы | + `children` |
| `search_etrain` | электрички | базовый набор |
| `search_hotels` | отели | `city_name`/`geo_id`, `check_in`, `check_out`, `adults`, `children_ages`, `stars`, `min_rating`, `free_cancellation`, `breakfast_included`, `meals`, `hotel_types`, `hotel_amenities`, `room_amenities`, `price_max` |
| `get_offer_details` | карточка оффера/отеля, отзывы | `product_type` (req), `details_ref`, `review_limit`, `review_sort`, `review_topics`, `view: compact\|full\|rules` |
| `get_rail_seatmap` | схема вагонов и мест | `details_ref` (req), `car_number`, `task`, `seats_together` |
| `create_checkout_link` | **единственная точка handoff** — чистый билдер URL | `product_type`, `transport` + поля из `checkout_ref` оффера |
| `get_{avia,rail,bus,etrain,hotels,multitransport}_instructions` | плейбук по домену (progressive disclosure) | без аргументов |
| `fetch_resource` | ресурсы `tutu://…` | `uri` |

Ресурсы: `tutu://help/overview`, `tutu://geo` (id городов),
`tutu://amenities/dictionary`, `tutu://status`, `tutu://special-offers`
(экспериментальные, **не источник правды**), `tutu://version`.

## Реальная форма ответа `search_multitransport`

Запрос: Москва → Санкт-Петербург, 2026-09-05, 1 взрослый, `page_size=5`.

```jsonc
{
  "variants": [ { /* см. ниже */ } ],
  "meta": {
    "from": {"name":"Москва","geo_id":"2657260","region":"…","iata":"MOW"},
    "to":   {"name":"Санкт-Петербург","geo_id":"2656915","region":"…","iata":"LED"},
    "optimize_for": "price",
    "modes_requested": ["avia","railway","bus","etrain"],
    "modes_summary": {
      "avia":    {"count":7,"min_price":4663.0,"min_duration_min":80},
      "railway": {"count":7,"min_price":1620.82,"min_duration_min":320,
                  "cashback":{"rate_pct":3.0,"applies_to":"all_fares","scope":"mode_page"}},
      "bus":     {"count":7,"min_price":1650.0,"min_duration_min":510},
      "etrain":  {"count":0,"min_price":null,"min_duration_min":null}
    },
    "unavailable": [], "page":1, "page_size":5, "total_returned":5, "has_more":true
  }
}
```

Один `variant`:

```jsonc
{
  "offer_id":"255d7ca0…", "transport":"railway",
  "price":{"amount":1620.82,"currency":"RUB"},
  "duration_min":320, "segments_count":1, "carriers":["ФПК"],
  "departure_at":"2026-09-05T17:45:00+03:00",
  "arrival_at":"2026-09-05T23:05:00+03:00",
  "search_results_url":"https://www.tutu.ru/poezda/rasp_d.php?…",
  "checkout_url":"https://www.tutu.ru/poezda/order/?…",
  "legs":[{"label":"outbound","from":"Москва — Ленинградский вокзал (2006004)",
           "to":"Санкт-Петербург — Московский вокзал (2004001)",
           "departure_at":"…","arrival_at":"…","duration_min":320,
           "segments":[{"from":"…","to":"…","departure_at":"…","arrival_at":"…",
             "duration_min":320,"carrier":"ФПК","voyage_no":"746У",
             "from_geo_point_id":2958868,"to_geo_point_id":2958266,
             "vehicle_meta":{"name":"АВРОРА","is_premium":true,"is_double_decker":true}}]}],
  "checkout_ref":{ /* всё, что нужно передать в create_checkout_link */ },
  "details_ref":{ /* всё, что нужно передать в get_offer_details */ },
  "review_summary":{"rating":9.4,"review_count":69,"label":"⭐ 9.4/10 · 69 отзывов",
                    "scope":"train","subject":"746У","scale":10},
  "fares":{"count":20,"price_from":1620.82,"price_to":10624.94,"currency":"RUB",
           "refundable_count":15,"changeable_count":0,
           "seat_categories":{"SEDENTARY":{"count":7,"price_from":1620.82},
                              "COMPARTMENT":{"count":12,"price_from":3663.45},
                              "LUX":{"count":1,"price_from":10624.94}}}
}
```

**Это золото для нашего продукта.** Из этих полей считается весь Индекс
устойчивости, ни одного внешнего источника не нужно — см. `docs/06-scoring.md`.

## Правила сервера, которые обязаны соблюдать (из `instructions` MCP)

Нарушение = минус к доверию судей, они читают инструкции сервера.

1. **Никаких выдуманных опций.** Не описываем отель/рейс/поезд, которого нет в
   текущем ответе.
2. **Нет поля — так и пишем:** «Туту не вернул это поле в текущем ответе». Это
   прямая цитата из инструкций сервера, самый частый провал агентов.
3. **URL непрозрачны.** `checkout_url` / `search_results_url` показываем ровно
   как вернул инструмент: не пересобираем, не перекодируем, не режем параметры.
4. **Цены не округляем**, рендерим `amount` + `currency` как есть.
   Цена отеля (`price_basis="stay_total"`) — **уже за весь период**, умножать
   на `stay.nights` нельзя.
5. **Отзывы цитируем дословно** (1–2 коротких фрагмента + дата отзыва), не
   пересказываем. Указываем диапазон дат использованных отзывов.
6. **Дизамбигуация городов.** В `meta.from` / `meta.to` приходит то, что сервер
   реально распознал (`name` + `geo_id` + `region`), плюс `also_named[]`, если
   был омоним. Показываем пользователю, какой город и область выбраны.
   Топоним отправляем как написал пользователь — «Питер»/«Мск» резолвятся сами.
7. **Кэшбек — не скидка.** `cashback.rate_pct` = баллы после оплаты, `price`
   остаётся полной суммой.
8. **Фильтр по перевозчику — только по `meta.carriers_available`**, не по
   догадке о написании («aeroflot» ≠ «Аэрофлот»).
9. **Пагинация:** `page` ≤ 10, `page_size` 1..30 (дефолт 10), перед следующей
   страницей смотреть `meta.has_more`. Фильтры применяются server-side по
   всему пулу, `meta.total_matched` честный.
10. **`view`:** дефолт `compact` — им и выбираем. `full` берём только для 1–3
    офферов, которые пользователь реально сравнивает. `full` не добавляет
    фактов, только раскрывает подробности.
11. Перед первой работой с доменом сервер просит вызвать
    `get_<domain>_instructions`. Мы делаем это один раз на старте и **кладём
    ответ в `fixtures/`**, чтобы не тратить время в рантайме.

## Что важно про checkout (модель handoff)

- Побочных эффектов нет: `create_checkout_link` — чистый билдер ссылки.
  Корзина создаётся **в браузере пользователя**, серверная корзина 404-ится.
- avia: `kind="deeplink"` работает только если у пользователя уже есть сессия
  tutu; холодный/Telegram-webview пользователь попадёт на поиск.
  Обязательно прокидывать `passengers_full/child/infant` из `checkout_ref`,
  иначе корзина откроется на одного взрослого и сумма не сойдётся с нашей.
  Round-trip с пересадками деградирует в `kind="search_redirect"`.
  Флаг `is_multi_pnr` = разные билеты / self-transfer → **у нас это прямой
  минус к устойчивости**, показываем `multi_pnr_note`.
- rail/bus: дефолт — ссылка на выбор мест. Если пользователь явно выбрал места
  (`car_number` + `seat_numbers`), ссылка минтит корзину с местами
  (`kind="checkout_deeplink"`, работает и в холодном браузере).
- hotels: дефолт — страница отеля; со `offerpack_hash` конкретного **номера**
  (из `get_offer_details`) — сразу корзина. `best_offer.offerpack_hash` из
  выдачи корзину НЕ минтит.
- etrain: только ссылка на расписание.

## Замеренные особенности и риски

| Наблюдение | Следствие для кода |
|---|---|
| `search_multitransport` по МСК→СПб отвечает секундами, не мгновенно | таймаут 30 с, скелетоны в UI, серверный кэш на 5 мин по ключу запроса |
| `required: []` почти у всех инструментов | валидируем аргументы у себя, иначе получим мусорный ответ вместо ошибки |
| ответ = JSON-строка внутри `content[0].text` | один хелпер `callTool()` с двойным парсингом, больше нигде |
| `etrain.count = 0` на дальнем плече | «мода недоступна» — нормальное состояние, рисуем явно |
| `has_more: true` при `page_size=5` | для скоринга тянем `page_size=30`, показываем топ-3 |

## Неподтверждённое (не обещать на питче)

- Real-time статусы задержек и отмен — **в MCP нет**.
- Автоматический rebooking — нет, покупка только через handoff-ссылку.
- Данные о доступности среды (пандусы и т.п.) — нет.
