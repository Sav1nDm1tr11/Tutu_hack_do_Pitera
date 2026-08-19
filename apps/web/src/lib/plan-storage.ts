import { openDB, type IDBPDatabase } from 'idb';
import { routePlanSchema, type RoutePlan } from '@tutu-plan-b/domain';

const DB_NAME = 'tutu-plan-b';
const STORE = 'lastPlan';
const KEY = 'current';

interface StoredEntry {
  readonly plan: unknown;
  readonly savedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | undefined;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

/**
 * Хранится ровно один последний план (§14.2).
 *
 * История не ведётся сознательно: это персональные данные поездки, и держать их дольше
 * необходимого — не бережливость, а лишний риск. Удаление доступно пользователю (§16.4).
 */
export async function saveLastPlan(plan: RoutePlan, savedAt: string): Promise<void> {
  try {
    const database = await db();
    await database.put(STORE, { plan, savedAt } satisfies StoredEntry, KEY);
  } catch {
    // Отказ хранилища (приватный режим, переполнение) не должен ломать основной сценарий:
    // offline-режим — это улучшение, а не условие работы приложения.
  }
}

export async function loadLastPlan(): Promise<{ plan: RoutePlan; savedAt: string } | undefined> {
  try {
    const database = await db();
    const entry = (await database.get(STORE, KEY)) as StoredEntry | undefined;
    if (entry === undefined) return undefined;

    // Валидация при чтении обязательна: в хранилище мог остаться план от прошлой версии
    // схемы, и молча отрендерить его — значит показать сломанный экран.
    const parsed = routePlanSchema.safeParse(entry.plan);
    if (!parsed.success) {
      await database.delete(STORE, KEY);
      return undefined;
    }

    return { plan: parsed.data, savedAt: entry.savedAt };
  } catch {
    return undefined;
  }
}

export async function clearLastPlan(): Promise<void> {
  try {
    const database = await db();
    await database.delete(STORE, KEY);
  } catch {
    // Нечего удалять или хранилище недоступно — оба случая безопасны.
  }
}
