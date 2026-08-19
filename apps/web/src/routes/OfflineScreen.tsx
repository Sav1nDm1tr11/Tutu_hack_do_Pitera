import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';
import { loadLastPlan } from '../lib/plan-storage';
import { usePlanStore } from '../store/plan-store';

/**
 * Экран без сети (§5.4, §6.1).
 *
 * Показывает сохранённую поездку только для чтения. Новый поиск и оформление отсюда
 * недоступны — не из-за технической невозможности, а потому что без свежих данных обе
 * операции ввели бы пользователя в заблуждение.
 */
export function OfflineScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const restoreCached = usePlanStore((state) => state.restoreCached);
  const [saved, setSaved] = useState<
    NonNullable<Awaited<ReturnType<typeof loadLastPlan>>> | undefined
  >(undefined);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void loadLastPlan().then((result) => {
      if (!active) return;
      setSaved(result);
      setChecked(true);
    });

    return (): void => {
      active = false;
    };
  }, []);

  return (
    <section className="card-surface mx-auto flex max-w-lg flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold text-ink">Нет соединения</h1>

      {!checked ? (
        <div className="skeleton h-20 w-full" />
      ) : saved === undefined ? (
        <p className="text-sm text-muted">
          Сохранённых поездок нет. Как только соединение вернётся, соберите маршрут заново.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Доступна последняя собранная поездка. Данные могут быть устаревшими: цены и наличие мест
            не проверялись с момента сохранения.
          </p>
          <Button
            className="w-fit"
            onClick={() => {
              restoreCached(saved.plan, saved.savedAt);
              void navigate(`/plan/${saved.plan.id}`);
            }}
          >
            Открыть сохранённую поездку
          </Button>
        </>
      )}

      <Link to="/" className="text-sm font-medium text-navy underline underline-offset-4">
        Вернуться к поиску
      </Link>
    </section>
  );
}
