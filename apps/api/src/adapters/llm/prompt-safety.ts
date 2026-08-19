/**
 * Инвентарь — недоверенный ввод (§15.2). Названия отелей и описания приходят от внешнего
 * источника и попадают в промпт, поэтому обрабатываются как данные, а не как инструкции.
 *
 * Санитайзер не пытается «понять» намерение текста: он ограничивает длину, срезает
 * управляющие символы и разметку, которой модель могла бы приписать структурный смысл.
 * Основная защита не здесь, а в том, что вывод модели валидируется схемой и сверяется
 * с уже посчитанными фактами.
 */
// Управляющие символы здесь — цель проверки, а не опечатка: именно их и нужно вырезать.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MARKUP_LIKE = /[<>`]/g;

export function sanitizeUntrusted(value: string, maxLength = 120): string {
  return value
    .replace(CONTROL_CHARACTERS, '')
    .replace(MARKUP_LIKE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Фразы, характерные для попыток переопределить инструкции. Наличие такой фразы — не
 * повод отбросить запись (мы не судим о содержании), но повод отметить её в логах:
 * без этого сигнала подобные случаи остаются невидимыми до инцидента.
 */
const INJECTION_MARKERS: readonly RegExp[] = [
  /ignore\s+(all\s+)?previous/i,
  /disregard\s+(all\s+)?(previous|prior)/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /игнорируй\s+(все\s+)?предыдущие/i,
  /новая\s+инструкция/i,
];

export function looksLikeInjection(value: string): boolean {
  return INJECTION_MARKERS.some((pattern) => pattern.test(value));
}
