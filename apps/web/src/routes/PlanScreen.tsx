import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatWallClockTime, type RoutePlan } from '@tutu-plan-b/domain';
import { PlanProgress } from '../features/plan/PlanProgress';
import { PlanView } from '../features/plan/PlanView';
import { fetchPlan } from '../lib/api-client';
import { loadLastPlan } from '../lib/plan-storage';
import { useOnlineStatus } from '../lib/use-online-status';
import { usePlanStore } from '../store/plan-store';

export function PlanScreen(): React.JSX.Element {
  const { planId } = useParams<{ planId: string }>();
  const online = useOnlineStatus();

  const status = usePlanStore((state) => state.status);
  const phase = usePlanStore((state) => state.phase);
  const progressMessage = usePlanStore((state) => state.progressMessage);
  const plan = usePlanStore((state) => state.plan);
  const fromCache = usePlanStore((state) => state.fromCache);
  const cachedAt = usePlanStore((state) => state.cachedAt);
  const error = usePlanStore((state) => state.error);
  const restoreCached = usePlanStore((state) => state.restoreCached);

  const [loadFailed, setLoadFailed] = useState(false);

  /**
   * Прямое открытие ссылки на план: в памяти его нет, поэтому сначала спрашиваем сервер,
   * а при неудаче — локальную копию. Порядок именно такой: серверная версия актуальнее,
   * а локальная всегда помечается как возможно устаревшая (§5.4).
   */
  useEffect(() => {
    if (planId === undefined) return;
    if (plan?.id === planId) return;
    if (status === 'streaming') return;

    let active = true;
    const controller = new AbortController();

    void fetchPlan(planId, controller.signal)
      .then((loaded: RoutePlan) => {
        if (!active) return;
        restoreCached(loaded, loaded.validAt);
        usePlanStore.setState({ fromCache: false });
      })
      .catch(async () => {
        if (!active) return;

        const cached = await loadLastPlan();
        if (!active) return;

        if (cached !== undefined && cached.plan.id === planId) {
          restoreCached(cached.plan, cached.savedAt);
          return;
        }

        setLoadFailed(true);
      });

    return (): void => {
      active = false;
      controller.abort();
    };
  }, [planId, plan?.id, status, restoreCached]);

  if (status === 'streaming') {
    return <PlanProgress phase={phase} message={progressMessage} />;
  }

  if (plan === undefined) {
    if (loadFailed) {
      return (
        <section className="card-surface mx-auto flex max-w-lg flex-col gap-3 p-6">
          <h1 className="text-lg font-semibold text-ink">План не найден</h1>
          <p className="text-sm text-muted">
            Планы хранятся ограниченное время, а цены и расписания быстро устаревают. Запустите
            поиск заново — так вы увидите актуальные варианты.
          </p>
          <Link
            to="/"
            className="tap-target inline-flex w-fit items-center rounded-[12px] bg-[var(--color-primary)] px-4 font-bold text-white"
          >
            Новый поиск
          </Link>
        </section>
      );
    }

    return <div className="skeleton h-64 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {!online && (
        <p className="rounded-[14px] bg-warning-soft px-3.5 py-2.5 text-[13px] font-semibold text-warning">
          Данные сохранены в {formatWallClockTime(cachedAt ?? plan.validAt)}, сеть недоступна.
          Показан последний собранный план, оформление отключено.
        </p>
      )}

      {fromCache && online && (
        <p className="rounded-[14px] bg-warning-soft px-3.5 py-2.5 text-[13px] font-semibold text-warning">
          Показана сохранённая копия: данные могут быть устаревшими. Оформление отключено до
          обновления.
        </p>
      )}

      {error !== undefined && (
        <p role="alert" className="rounded-[16px] bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {error.message}
        </p>
      )}

      <PlanView plan={plan} offline={fromCache || !online} />
    </div>
  );
}
