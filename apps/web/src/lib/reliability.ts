export interface ReliabilityGrade {
  readonly letter: 'A' | 'B' | 'C' | 'D';
  readonly color: string;
  readonly caption: string;
}

const GRADES: readonly (ReliabilityGrade & { readonly min: number })[] = [
  {
    min: 80,
    letter: 'A',
    color: '#10B981',
    caption: 'A — маршрут держит одну задержку без потери связки',
  },
  {
    min: 65,
    letter: 'B',
    color: '#84CC16',
    caption: 'B — держится, но один стык требует внимания',
  },
  {
    min: 50,
    letter: 'C',
    color: '#F59E0B',
    caption: 'C — при задержке связка рвётся, План Б обязателен',
  },
  {
    min: 0,
    letter: 'D',
    color: '#EF4444',
    caption: 'D — маршрут разваливается от одного сбоя',
  },
];

/** Балл 0..100 → буква шкалы. Цвет дублируется буквой, сам по себе смысла не несёт. */
export function reliabilityGrade(score: number): ReliabilityGrade {
  const rounded = Math.round(score);
  return GRADES.find((grade) => rounded >= grade.min) ?? GRADES[GRADES.length - 1]!;
}

export const DIMENSION_LABELS = {
  resilience: 'Устойчивость',
  price: 'Цена',
  duration: 'Время',
  comfort: 'Комфорт',
} as const;
