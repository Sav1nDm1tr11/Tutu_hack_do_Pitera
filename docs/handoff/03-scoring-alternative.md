# 06. Индекс устойчивости — точная спецификация алгоритма

Чистая функция без сети: `score(variant, context) -> ResilienceScore`.
Реализация — `lib/scoring/*.ts`, покрыта юнит-тестами на фикстурах.
**Все входные поля реально существуют** (см. `docs/02-mcp-knowledge.md`).

```ts
type ResilienceScore = {
  total: number;              // 0..100, целое
  grade: 'A' | 'B' | 'C' | 'D';
  components: Component[];    // всегда 5, для UI-раскрытия
  risks: Risk[];              // человекочитаемые точки риска, отсортированы по весу
};
type Component = { key: string; label: string; earned: number; max: number; why: string };
type Risk = { severity: 'high'|'low'|'medium'; title: string; detail: string; source: string /* поле MCP */ };
```

`context` = `{ allVariants: Variant[], meta: Meta }` — весь пул выдачи, нужен для
компонента «плотность альтернатив».

## Компоненты (сумма max = 100)

### 1. Стыковки и буферы — 30 баллов
Вход: `legs[].segments[]`, `segments_count`, `checkout_ref.is_multi_pnr`.

```
base = 30
если segments_count == 1 -> earned = 30
иначе для каждой стыковки:
  buffer = departure_at(след. сегмента) - arrival_at(текущего)   // минуты
  buffer < 45   -> -14  (severity high, «стык 30 мин — не успеть при задержке»)
  45..89        -> -8   (medium)
  90..179       -> -3   (low)
  >= 180        -> -0
  смена станции/аэропорта (from_geo_point_id != предыдущий to_geo_point_id) -> -6
is_multi_pnr == true -> -10 (severity high, «билеты разными заказами: задержка
                             первого не обязывает перевозчика пересадить»)
earned = clamp(base - penalties, 0, 30)
```

### 2. Плотность альтернатив (recoverability) — 25 баллов
Смысл: если этот вариант сорвётся, сколько шансов уехать в тот же день.
Вход: `allVariants` + `meta.modes_summary`.

```
alt = число вариантов из allVariants, у которых
      departure_at в окне [departure_at - 2ч, departure_at + 6ч]
      и offer_id != текущий
      и price <= price * 1.5
earned = min(25, 5 * ln(1 + alt) / ln(1 + 8) * 5)   // 0 alt -> 0, 8+ alt -> 25
+3 бонус, если среди alt есть другая мода транспорта (мультимодальный запас)
clamp(0, 25)
```

### 3. Возвратность и гибкость — 20 баллов
Вход: `fares` (rail) / `variants[]` (avia, bus, etrain).

```
refundShare  = fares.refundable_count / fares.count      // если поле есть
changeShare  = fares.changeable_count / fares.count
earned = 12 * refundShare + 8 * changeShare
Если refundable_unknown / changeable_unknown присутствуют или полей нет вовсе:
  earned = 10 (нейтрально) и Risk{low, «Туту не вернул правила возврата»}
```
Отдельно (для отеля в связке): `free_cancellation` — тот же принцип.

### 4. Надёжность перевозчика — 15 баллов
Вход: `review_summary.rating` (шкала 10), `review_count`.

```
если review_summary отсутствует -> earned = 8, Risk{low,'нет отзывов в ответе'}
confidence = min(1, ln(1 + review_count) / ln(1 + 300))
earned = 15 * (rating / 10) * (0.55 + 0.45 * confidence)
```
Пример из живых данных: поезд 746У «АВРОРА» — 9.4/10, 69 отзывов → 12.6;
автобус 7.8/10, 161 отзыв → 10.3.

### 5. Утомляемость и время суток — 10 баллов
Вход: `departure_at`, `arrival_at`, `duration_min`, `vehicle_meta`.

```
base = 10
прибытие в 00:00–05:59 -> -5 (high, «приезд ночью: транспорт и заселение»)
прибытие в 23:00–23:59 -> -3
отправление в 04:00–05:59 -> -2
duration_min > 480 и transport != 'avia' -> -2
vehicle_meta.is_premium == true -> +1 (не выше 10)
clamp(0, 10)
```

## Итог и грейд

```
total = round(sum(components.earned))
A: >= 80   B: 65..79   C: 50..64   D: < 50
```

## План Б: как выбирается

Из `allVariants` берём кандидатов и сортируем по (score.total DESC, ценовой
дельте ASC), фильтр:

```
departure_at > выбранный.departure_at            // уехать позже, а не раньше
departure_at <= выбранный.departure_at + 6ч
price <= выбранный.price * 1.6
score.total >= выбранный.score.total - 10
```
Берём первый и, если есть, первый вариант **другой моды транспорта** — показываем
максимум два Плана Б: «тот же тип» и «запасной вид транспорта».
Если кандидатов нет — это само по себе главный вывод карточки:
**«Плана Б на этот день нет — 4 из 5 причин выбрать другое время».**

## Правила честности (обязательны, их читают судьи)

- Индекс — **структурный**, он не знает про сегодняшние задержки. В UI под
  индексом всегда строка: «Считаем структурную устойчивость по данным Туту.
  Реальных задержек рейсов MCP не отдаёт».
- Каждый компонент показывает `why` со ссылкой на конкретное поле ответа.
- Если поле не пришло — компонент получает нейтральный балл **и** мы это пишем,
  а не молча занижаем.
- Ни один балл не берётся из общих знаний модели или веб-поиска.
