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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
          Проверьте план поездки до покупки
        </h1>
        <p className="max-w-2xl text-[15px] text-muted">
          Мы собираем маршрут целиком — дорога, проживание, обратный путь — и показываем, где он
          ломается: тесные пересадки, ночные сегменты, этапы без замены. Для уязвимых мест готовим
          план Б из вариантов, которые действительно есть в поиске.
        </p>
      </section>

      {error !== undefined && (
        <div role="alert" className="card-surface flex flex-col gap-3 p-4">
          <p className="text-sm font-medium text-danger">{error.message}</p>
          {error.retryable && (
            <p className="text-sm text-muted">Условия поиска сохранены — можно повторить запрос.</p>
          )}
        </div>
      )}

      <section className="card-surface p-5 sm:p-6">
        <SearchForm onSubmit={startPlan} submitting={false} />
      </section>

      <RestoreLastPlan />
    </div>
  );
}

/**
 * Ссылка на сохранённый план. Появляется только если он действительно есть в хранилище:
 * кнопка, ведущая в пустоту, хуже её отсутствия.
 */
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
    <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-white/60 p-4">
      <p className="text-sm font-medium text-ink">У вас есть сохранённая поездка</p>
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

type SavedPlan = NonNullable<Awaited<ReturnType<typeof loadLastPlan>>>;
