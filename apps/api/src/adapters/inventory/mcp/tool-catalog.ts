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
  },
  {
    capability: 'flight',
    include: ['flight', 'avia', 'air', 'plane', 'авиа', 'самол', 'перелет', 'перелёт'],
    exclude: ['airport transfer', 'аэроэкспресс'],
  },
  {
    capability: 'train',
    include: ['train', 'rail', 'поезд', 'жд', 'railway'],
    exclude: ['suburban', 'commuter', 'электрич', 'пригород'],
  },
  {
    capability: 'bus',
    include: ['bus', 'coach', 'автобус'],
    exclude: [],
  },
  {
    capability: 'hotel',
    include: ['hotel', 'accommodation', 'stay', 'lodging', 'отел', 'гостиниц', 'жиль'],
    exclude: ['review', 'отзыв'],
  },
  {
    capability: 'hotelReviews',
    include: ['review', 'отзыв', 'feedback'],
    exclude: [],
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

  for (const tool of tools) {
    if (matchesAny(tool.name, FORBIDDEN_INTENT)) forbidden.push(tool.name);
    else allowed.push(tool);
  }

  const bindings = new Map<CapabilityKey, DiscoveredTool>();
  const reasons = new Map<CapabilityKey, string>();
  const used = new Set<string>();

  for (const matcher of MATCHERS) {
    const candidates = allowed
      .filter((tool) => scoreTool(tool, matcher) > 0)
      // Сортировка по (счёт, имя) делает выбор воспроизводимым: два прогона discovery с
      // одинаковым ответом сервера обязаны дать одинаковый маппинг.
      .sort((left, right) => {
        const diff = scoreTool(right, matcher) - scoreTool(left, matcher);
        return diff !== 0 ? diff : left.name.localeCompare(right.name);
      });

    const chosen = candidates[0];
    if (chosen === undefined) {
      reasons.set(matcher.capability, 'Подходящий MCP tool не найден при discovery');
      continue;
    }

    bindings.set(matcher.capability, chosen);
    used.add(chosen.name);
  }

  return {
    bindings,
    reasons,
    unmatched: allowed
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

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  const lowered = haystack.toLowerCase();
  const normalized = normalizeKey(haystack);
  return needles.some((needle) => lowered.includes(needle) || normalized.includes(needle));
}
