import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { SearchForm } from '../features/search/SearchForm';
import { PlanProgress } from '../features/plan/PlanProgress';
import { Button } from '../components/ui/Button';
import { usePlanStore } from '../store/plan-store';
import { clearLastPlan, loadLastPlan } from '../lib/plan-storage';
import { usePageIntro } from '../lib/use-page-intro';

export function SearchScreen(): React.JSX.Element {
  const screenRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const status = usePlanStore((state) => state.status);
  const phase = usePlanStore((state) => state.phase);
  const progressMessage = usePlanStore((state) => state.progressMessage);
  const error = usePlanStore((state) => state.error);
  const plan = usePlanStore((state) => state.plan);
  const startPlan = usePlanStore((state) => state.startPlan);
  const reset = usePlanStore((state) => state.reset);
  usePageIntro(screenRef, [status]);

  useEffect(() => {
    if (status === 'ready' && plan !== undefined) {
      void navigate(`/plan/${plan.id}`, { replace: true });
    }
  }, [status, plan, navigate]);

  if (status === 'streaming') {
    return (
      <div ref={screenRef} className="search-progress flex flex-col items-center gap-4 py-6">
        <PlanProgress phase={phase} message={progressMessage} />
        <Button variant="ghost" onClick={reset}>
          Отменить поиск
        </Button>
      </div>
    );
  }

  return (
    <div ref={screenRef} className="search-page">
      <section className="search-intro" data-intro>
        <h1>
          Маршрут, который не развалится <span>от одного сбоя</span>
        </h1>
        <p>
          Соберём поездку целиком, стресс-тестируем пересадки и заранее найдём реальные замены для
          уязвимых этапов.
        </p>
      </section>

      {error !== undefined && (
        <div role="alert" className="route-alert flex flex-col gap-3 p-4" data-intro>
          <p className="text-danger text-sm font-medium">{error.message}</p>
          {error.retryable && (
            <p className="text-muted text-sm">Условия поиска сохранены — можно повторить запрос.</p>
          )}
        </div>
      )}

      <div className="search-stage">
        <section className="search-console" data-intro>
          <div className="search-console-head">
            <div>
              <h2>Куда строим путь?</h2>
              <p>Укажите поездку — риски и запасные варианты посчитаем сами.</p>
            </div>
            <span className="search-console-status">Стресс-тест включён</span>
          </div>
          <SearchForm onSubmit={startPlan} submitting={false} />
        </section>

        <aside className="search-planet" aria-hidden="true" data-intro>
          <RoutePreview />
          <p>Собираем транспорт, жильё и План Б в одну живую схему.</p>
        </aside>
      </div>

      <div data-intro>
        <RestoreLastPlan />
      </div>
    </div>
  );
}

function RoutePreview(): React.JSX.Element {
  return (
    <div className="preview-orbit">
      <div className="preview-planet">
        <span className="preview-land preview-land-one" />
        <span className="preview-land preview-land-two" />
        <span className="preview-route" />
        <span className="preview-point preview-point-a" />
        <span className="preview-point preview-point-b" />
      </div>
      <span className="preview-badge preview-badge-train">Поезд</span>
      <span className="preview-badge preview-badge-plan">План Б готов</span>
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
    <section className="saved-trip">
      <p className="text-ink text-sm font-medium">У вас есть сохранённая поездка</p>
      <p className="text-muted text-xs">
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
