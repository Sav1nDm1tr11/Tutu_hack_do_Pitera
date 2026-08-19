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
  searchingTransport: 'Ищем варианты дороги',
  searchingHotels: 'Подбираем проживание',
  normalizing: 'Приводим данные к единому виду',
  scoring: 'Сравниваем',
  buildingFallback: 'Готовим план Б',
  explaining: 'Формулируем объяснения',
};

export interface PlanProgressProps {
  readonly phase: PlanPhase | undefined;
  readonly message: string | undefined;
}

export function PlanProgress({ phase, message }: PlanProgressProps): React.JSX.Element {
  const currentIndex = phase === undefined ? 0 : PHASE_ORDER.indexOf(phase);
  const ratio = PHASE_ORDER.length === 0 ? 0 : Math.round((currentIndex / PHASE_ORDER.length) * 100);

  return (
    <section className="card-surface mx-auto flex w-full max-w-[640px] flex-col p-[22px]">
      <h2 className="m-0 text-2xl font-extrabold tracking-[-0.03em]">Собираем маршрут</h2>
      <p className="m-0 mt-1 text-[13.5px] text-muted">{message ?? 'Начинаем поиск'}</p>

      <div className="my-[18px] h-1.5 overflow-hidden rounded-full bg-[var(--color-track)]">
        <div
          className="h-full rounded-full bg-[var(--color-primary)]"
          style={{ width: `${String(ratio)}%`, transition: 'width .4s ease' }}
        />
      </div>

      <ol className="m-0 flex list-none flex-col gap-[11px] p-0">
        {PHASE_ORDER.map((item, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;

          return (
            <li key={item} className="flex items-center gap-[11px]">
              <span
                aria-hidden="true"
                className={
                  done
                    ? 'grid size-5 shrink-0 place-items-center rounded-full bg-[var(--color-grade-a)] text-white'
                    : active
                      ? 'size-5 shrink-0 rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-accent-soft)]'
                      : 'size-5 shrink-0 rounded-full border-2 border-line'
                }
              >
                {done && (
                  <svg viewBox="0 0 16 16" className="size-[11px]" fill="none">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span
                className={
                  active || done
                    ? 'text-sm font-bold text-ink'
                    : 'text-sm font-medium text-muted'
                }
              >
                {PHASE_TITLES[item]}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-col gap-2">
        <div className="skeleton h-[52px]" />
        <div className="skeleton h-[52px]" style={{ animationDelay: '0.2s' }} />
      </div>

      <p aria-live="polite" className="visually-hidden">
        {message ?? ''}
      </p>
    </section>
  );
}
