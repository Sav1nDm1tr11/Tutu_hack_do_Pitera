import type { CapabilityKey } from '@tutu-plan-b/domain';
import type { DiscoveredTool } from './session';
import { normalizeKey } from './fields';

/**
 * Сопоставление логических возможностей с реальными tool'ами MCP.
 *
 * Имена tool'ов не захардкожены сознательно: spike не состоялся, и любой список имён в
 * коде был бы догадкой (§3.3 системного дизайна). Поэтому связь строится из ответа
 * `tools/list` по ключевым словам, а всё несопоставленное честно объявляется недоступным —
 * приложение деградирует до найденных категорий, а не падает и не выдумывает данные.
 */

interface CapabilityMatcher {
  readonly capability: CapabilityKey;
  /** Слова, по которым категория узнаётся. Проверяются и в имени, и в описании. */
  readonly include: readonly string[];
  /** Слова, снимающие совпадение: без них «suburban train» победил бы в категории поездов. */
  readonly exclude: readonly string[];
  /**
   * Категория обслуживается поисковым tool'ом. При равном счёте выигрывает имя с `search`:
   * у справочных и детализирующих tool'ов описание часто повторяет те же слова.
   */
  readonly prefersSearchTool: boolean;
}

/**
 * Справочники (`*_instructions`) описывают, как пользоваться поиском, и повторяют его
 * ключевые слова — из-за этого `get_bus_instructions` и `get_hotels_instructions`
 * выигрывали у `search_bus` и `search_hotels`. Инвентарь они не отдают, поэтому в
 * кандидаты не попадают вовсе.
 */
function isReferenceTool(name: string): boolean {
  return name.toLowerCase().endsWith('_instructions');
}

const SEARCH_INTENT = [
  'search',
  'find',
  'list',
  'query',
  'lookup',
  'offers',
  'schedule',
  'timetable',
  'poisk',
  'поиск',
  'найти',
  'расписан',
  'варианты',
  'review',
  'reviews',
  'отзыв',
] as const;

/**
 * Tool'ы, которые нельзя вызывать ни при каких условиях.
 *
 * Приложение доводит пользователя до оформления на tutu.ru и никогда не оформляет само
 * (§2.2 системного дизайна). Deny-list существует, чтобы эвристика сопоставления не могла
 * случайно связать категорию поиска с покупкой: «похоже на поиск отелей» не должно
 * когда-либо означать «создать заказ».
 */
const FORBIDDEN_INTENT = [
  'book',
  'booking',
  'order',
  'buy',
  'purchase',
  'pay',
  'payment',
  'checkout',
  'reserve',
  'cancel',
  'refund',
  'delete',
  'create',
  'update',
  'заказ',
  'купить',
  'оплат',
  'брониров',
  'отмен',
  'возврат',
] as const;

const MATCHERS: readonly CapabilityMatcher[] = [
  {
    capability: 'suburbanTrain',
    include: ['suburban', 'electrichka', 'elektrichka', 'commuter', 'электрич', 'пригород'],
    exclude: [],
    prefersSearchTool: true,
  },
  {
    capability: 'flight',
    include: ['flight', 'avia', 'air', 'plane', 'авиа', 'самол', 'перелет', 'перелёт'],
    exclude: ['airport transfer', 'аэроэкспресс'],
    prefersSearchTool: true,
  },
  {
    capability: 'train',
    include: ['train', 'rail', 'поезд', 'жд', 'railway'],
    exclude: ['suburban', 'commuter', 'электрич', 'пригород'],
    prefersSearchTool: true,
  },
  {
    capability: 'bus',
    include: ['bus', 'coach', 'автобус'],
    exclude: [],
    prefersSearchTool: true,
  },
  {
    // «review» здесь не исключается: описание любого поискового tool'а упоминает отзывы,
    // и запрет снимал совпадение с search_hotels целиком. Отделяет поиск от отзывов
    // приоритет имени с `search`, а не запретное слово.
    capability: 'hotel',
    include: ['hotel', 'accommodation', 'stay', 'lodging', 'отел', 'гостиниц', 'жиль'],
    exclude: [],
    prefersSearchTool: true,
  },
  {
    // Отзывы отдаёт детализирующий tool, а не поиск, поэтому приоритета `search` тут нет.
    capability: 'hotelReviews',
    include: ['review', 'отзыв', 'feedback'],
    exclude: [],
    prefersSearchTool: false,
  },
];

export interface ToolCatalog {
  /** Найденные соответствия. Отсутствие ключа означает «категория недоступна». */
  readonly bindings: ReadonlyMap<CapabilityKey, DiscoveredTool>;
  /** Почему категория не сопоставлена. Текст доезжает до пользователя как причина. */
  readonly reasons: ReadonlyMap<CapabilityKey, string>;
  /** Tool'ы, не отнесённые ни к одной категории. Нужны для отчёта `mcp:inspect`. */
  readonly unmatched: readonly string[];
  /** Tool'ы, отклонённые deny-list'ом. Выводятся отдельно: это важный факт для ревью. */
  readonly forbidden: readonly string[];
}

export function buildToolCatalog(tools: readonly DiscoveredTool[]): ToolCatalog {
  const allowed: DiscoveredTool[] = [];
  const forbidden: string[] = [];

  const reference: DiscoveredTool[] = [];

  for (const tool of tools) {
    if (matchesAny(tool.name, FORBIDDEN_INTENT)) forbidden.push(tool.name);
    else if (isReferenceTool(tool.name)) reference.push(tool);
    else allowed.push(tool);
  }

  const bindings = new Map<CapabilityKey, DiscoveredTool>();
  const reasons = new Map<CapabilityKey, string>();
  const used = new Set<string>();

  for (const matcher of MATCHERS) {
    const scored = allowed.filter((tool) => scoreTool(tool, matcher) > 0);

    // Категорию инвентаря обслуживает поиск, а не карточка отзывов. Если поисковый tool
    // для категории есть, остальные кандидаты выбывают ДО сравнения счёта: описание
    // `hotel_reviews` содержит и «отель», и «отзыв», поэтому по очкам обгоняло
    // `search_hotels` и уводило категорию в tool, который инвентарь не отдаёт.
    const searchOnly = scored.filter((tool) => tool.name.toLowerCase().includes('search'));
    const pool = matcher.prefersSearchTool && searchOnly.length > 0 ? searchOnly : scored;

    const candidates = pool
      // Сортировка по (счёт, имя) делает выбор воспроизводимым: два прогона discovery с
      // одинаковым ответом сервера обязаны дать одинаковый маппинг.
      .sort((left, right) => {
        const diff = scoreTool(right, matcher) - scoreTool(left, matcher);
        if (diff !== 0) return diff;
        const byIntent = searchRank(left, matcher) - searchRank(right, matcher);
        return byIntent !== 0 ? byIntent : left.name.localeCompare(right.name);
      });

    const chosen = candidates[0];
    if (chosen === undefined) {
      const onlyReference = reference.some((tool) => scoreTool(tool, matcher) > 0);
      reasons.set(
        matcher.capability,
        onlyReference
          ? 'Найден только справочный MCP tool (*_instructions), поиска для категории нет'
          : 'Подходящий MCP tool не найден при discovery',
      );
      continue;
    }

    bindings.set(matcher.capability, chosen);
    used.add(chosen.name);
  }

  return {
    bindings,
    reasons,
    unmatched: [...allowed, ...reference]
      .filter((tool) => !used.has(tool.name))
      .map((tool) => tool.name)
      .sort(),
    forbidden: forbidden.sort(),
  };
}

/**
 * Счёт совпадения. Имя весит больше описания: описание часто перечисляет соседние
 * категории («в отличие от поездов…»), а имя обозначает назначение tool'а.
 */
function scoreTool(tool: DiscoveredTool, matcher: CapabilityMatcher): number {
  const name = tool.name.toLowerCase();
  const description = tool.description.toLowerCase();
  const haystack = `${name} ${description}`;

  if (matchesAny(haystack, matcher.exclude)) return 0;

  let score = 0;
  for (const word of matcher.include) {
    if (name.includes(word)) score += 3;
    else if (description.includes(word)) score += 1;
  }
  if (score === 0) return 0;

  // Без признака поиска tool может оказаться справочником или действием: такие не
  // используются для инвентаря, даже если категория узнана.
  if (!matchesAny(haystack, SEARCH_INTENT)) return 0;

  return score;
}

/** 0 — имя выглядит поисковым, 1 — нет. Меньше значит выше в сортировке. */
function searchRank(tool: DiscoveredTool, matcher: CapabilityMatcher): number {
  if (!matcher.prefersSearchTool) return 0;
  return tool.name.toLowerCase().includes('search') ? 0 : 1;
}

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  const lowered = haystack.toLowerCase();
  const normalized = normalizeKey(haystack);
  return needles.some((needle) => lowered.includes(needle) || normalized.includes(needle));
}
