import type { PlanPhase } from '@tutu-plan-b/domain';

const PHASE_ORDER: readonly PlanPhase[] = [
  'planning',
  'searchingTransport',
  'searchingHotels',
  'normalizing',
  'scoring',
  'buildingFallback',
  'explaining',
];

const PHASE_TITLES: Record<PlanPhase, string> = {
  planning: 'Разбираем условия',
  searchingTransport: 'Ищем варианты транспорта',
  searchingHotels: 'Проверяем отели и отзывы',
  normalizing: 'Приводим данные к единому виду',
  scoring: 'Сравниваем варианты',
  buildingFallback: 'Готовим план Б',
  explaining: 'Формулируем объяснения',
};

export interface PlanProgressProps {
  readonly phase: PlanPhase | undefined;
  readonly message: string | undefined;
}

/**
 * Экран прогресса (§13.1).
 *
 * Показывает названные фазы, а не безликий спиннер: сборка плана занимает секунды, и
 * пользователю важно видеть, что происходит именно сейчас, иначе ожидание читается как
 * зависание. Пройденные фазы остаются на экране — это и есть доказательство движения.
 */
export function PlanProgress({ phase, message }: PlanProgressProps): React.JSX.Element {
  const currentIndex = phase === undefined ? 0 : PHASE_ORDER.indexOf(phase);

  return (
    <section className="progress-board mx-auto flex w-full max-w-3xl flex-col gap-5 p-6" data-intro>
      <div className="flex flex-col gap-1">
        <h2 className="text-navy text-xl font-extrabold">Собираем маршрут</h2>
        <p className="text-muted text-sm">{message ?? 'Начинаем поиск'}</p>
      </div>

      <ol className="progress-phases flex flex-col gap-2">
        {PHASE_ORDER.map((item, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;

          return (
            <li key={item} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={
                  done
                    ? 'bg-success grid size-5 shrink-0 place-items-center rounded-full text-white'
                    : active
                      ? 'border-violet bg-info-soft size-5 shrink-0 rounded-full border-2'
                      : 'border-line size-5 shrink-0 rounded-full border-2'
                }
              >
                {done && (
                  <svg viewBox="0 0 16 16" className="size-3" fill="none">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>

              <span
                className={active ? 'text-ink text-[15px] font-medium' : 'text-muted text-[15px]'}
              >
                {PHASE_TITLES[item]}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Прогресс дублируется для скринридера одним сообщением: озвучивать каждый пункт
          списка заново на каждой фазе значило бы забивать канал шумом (§19). */}
      <p aria-live="polite" className="visually-hidden">
        {message ?? ''}
      </p>
    </section>
  );
}
