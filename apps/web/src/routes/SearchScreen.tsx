import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { SearchForm } from '../features/search/SearchForm';
import { PlanProgress } from '../features/plan/PlanProgress';
import { Button } from '../components/ui/Button';
import { usePlanStore } from '../store/plan-store';
import { clearLastPlan, loadLastPlan } from '../lib/plan-storage';

export function SearchScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const status = usePlanStore((state) => state.status);
  const phase = usePlanStore((state) => state.phase);
  const progressMessage = usePlanStore((state) => state.progressMessage);
  const error = usePlanStore((state) => state.error);
  const plan = usePlanStore((state) => state.plan);
  const startPlan = usePlanStore((state) => state.startPlan);
  const reset = usePlanStore((state) => state.reset);

  useEffect(() => {
    if (status === 'ready' && plan !== undefined) {
      void navigate(`/plan/${plan.id}`, { replace: true });
    }
  }, [status, plan, navigate]);

  if (status === 'streaming') {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <PlanProgress phase={phase} message={progressMessage} />
        <Button variant="ghost" onClick={reset}>
          Отменить поиск
        </Button>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <section>
        <h1 className="m-0 max-w-[20ch] text-[26px] font-extrabold leading-[1.02] tracking-[-0.04em] text-balance lg:text-[34px]">
          Проверяем маршрут до покупки — и заранее готовим{' '}
          <span className="text-[var(--color-accent)]">План Б</span>
        </h1>
        <p className="mt-3.5 max-w-[52ch] text-[15px] leading-normal text-muted">
          Собираем поездку целиком, считаем, где она разваливается при одной задержке, и находим
          замену для уязвимых этапов.
        </p>

        {error !== undefined && (
          <div role="alert" className="mt-4 rounded-[12px] border border-[var(--color-danger-line)] bg-danger-soft p-3">
            <p className="text-[13px] font-bold text-danger">{error.message}</p>
            {error.retryable && (
              <p className="mt-1 text-[12.5px] text-muted">
                Условия поиска сохранены — можно повторить запрос.
              </p>
            )}
          </div>
        )}

        <div className="card-surface mt-5 p-4">
          <SearchForm onSubmit={startPlan} submitting={false} />
        </div>

        <div className="mt-4">
          <RestoreLastPlan />
        </div>
      </section>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-[112px]">
        <div className="rounded-2xl border border-line bg-[var(--color-surface)] p-4">
          <p className="mb-3 text-xs font-bold tracking-[0.05em] text-muted uppercase">
            Что вы получите
          </p>
          <div className="flex flex-col gap-3">
            <ValuePoint
              mark="71"
              title="Индекс структурной надёжности"
              text="Один балл на весь маршрут, разложенный по четырём размерностям."
            />
            <ValuePoint
              icon="risk"
              title="Точки риска на таймлайне"
              text="Короткие стыки, ночные сегменты и смена вокзала — с числами, а не «возможны риски»."
            />
            <ValuePoint
              icon="shield"
              title="Готовый План Б"
              text="Второй билет на самый уязвимый этап — или честное «замен нет»."
            />
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--color-accent-line)] bg-[var(--color-accent-soft)] px-4 py-3.5">
          <p className="text-[12.5px] leading-normal text-ink">
            Считаем структурную устойчивость по данным Туту. О реальных задержках рейсов мы не знаем.
          </p>
        </div>
      </aside>
    </div>
  );
}

function ValuePoint({
  mark,
  icon,
  title,
  text,
}: {
  readonly mark?: string;
  readonly icon?: 'risk' | 'shield';
  readonly title: string;
  readonly text: string;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={
          icon === 'risk'
            ? 'grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-warning-soft text-warning'
            : icon === 'shield'
              ? 'grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-success-soft text-success'
              : 'grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-[var(--color-accent-soft)] text-[12px] font-extrabold text-[var(--color-accent)]'
        }
      >
        {mark}
        {icon === 'risk' && <RiskIcon />}
        {icon === 'shield' && <ShieldIcon />}
      </span>
      <div>
        <p className="m-0 text-[13.5px] font-bold">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{text}</p>
      </div>
    </div>
  );
}

function RestoreLastPlan(): React.JSX.Element | null {
  const navigate = useNavigate();
  const restoreCached = usePlanStore((state) => state.restoreCached);
  const [saved, setSaved] = useState<SavedPlan | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void loadLastPlan().then((result) => {
      if (active) setSaved(result);
    });

    return (): void => {
      active = false;
    };
  }, []);

  if (saved === undefined) return null;

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-[var(--color-surface)] p-4">
      <p className="text-sm font-bold text-ink">У вас есть сохранённая поездка</p>
      <p className="text-xs text-muted">
        Данные могут быть устаревшими — перед оформлением проверьте актуальность.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            restoreCached(saved.plan, saved.savedAt);
            void navigate(`/plan/${saved.plan.id}`);
          }}
        >
          Открыть
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void clearLastPlan().then(() => setSaved(undefined));
          }}
        >
          Удалить сохранённую поездку
        </Button>
      </div>
    </section>
  );
}

function RiskIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-[15px]" fill="none" aria-hidden="true">
      <path d="M8 2.5l6 11H2l6-11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.4v3M8 11.6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-[15px]" fill="none" aria-hidden="true">
      <path
        d="M8 1.8l5 1.8v4.2c0 3-2.1 5.2-5 6.4-2.9-1.2-5-3.4-5-6.4V3.6l5-1.8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M5.8 8l1.7 1.7 3-3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

type SavedPlan = NonNullable<Awaited<ReturnType<typeof loadLastPlan>>>;
