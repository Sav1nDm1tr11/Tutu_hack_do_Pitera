import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import { fetchCapabilities } from '../lib/api-client';
import { clearLastPlan } from '../lib/plan-storage';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

const CAPABILITY_NAMES: Record<string, string> = {
  flight: 'Авиабилеты',
  train: 'Поезда',
  bus: 'Автобусы',
  suburbanTrain: 'Электрички',
  hotel: 'Отели',
  hotelReviews: 'Отзывы об отелях',
};

const STATUS_LABELS = {
  available: { label: 'Доступно', tone: 'success' },
  degraded: { label: 'Ограниченно', tone: 'warning' },
  unavailable: { label: 'Недоступно', tone: 'danger' },
} as const;

/**
 * Экран о данных (§6.1).
 *
 * Существует, потому что продукт даёт советы о деньгах: пользователь имеет право знать,
 * откуда взялась каждая цифра, что мы посчитали сами и чего не знаем вовсе. Здесь же
 * управление сохранённой копией — удаление своих данных не должно требовать чистки
 * хранилища браузера (§16.4).
 */
export function AboutDataScreen(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<
    Awaited<ReturnType<typeof fetchCapabilities>> | undefined
  >(undefined);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCapabilities(controller.signal)
      .then(setSnapshot)
      .catch(() => setSnapshot(undefined));

    return (): void => {
      controller.abort();
    };
  }, []);

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-ink">Откуда данные и что мы считаем сами</h1>
        <p className="text-[15px] text-muted">
          Мы не изобретаем цены и расписания. Всё, что показано в карточках, приходит из инвентаря
          ТуТу либо честно помечено как наш расчёт.
        </p>
      </header>

      <section className="card-surface flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold text-ink">Источник инвентаря</h2>

        {snapshot === undefined ? (
          <p className="text-sm text-muted">Не удалось получить состояние источников данных.</p>
        ) : (
          <>
            <p className="text-sm text-ink">
              {snapshot.capabilities.source === 'fixture'
                ? 'Сейчас используются демо-данные: live Tutu MCP недоступен из этой среды. Цены и расписания синтетические и не годятся для покупки.'
                : 'Сейчас используется live Tutu MCP.'}
            </p>

            <ul className="flex flex-col gap-2">
              {Object.entries(snapshot.capabilities.capabilities).map(([key, status]) => {
                if (status === undefined) return null;
                const meta = STATUS_LABELS[status.status];

                return (
                  <li key={key} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink">{CAPABILITY_NAMES[key] ?? key}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {status.reason !== undefined && (
                      <span className="text-xs text-muted">{status.reason}</span>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="text-sm text-muted">
              Пояснения к вариантам:{' '}
              {snapshot.plannerMode === 'llm'
                ? 'формулирует языковая модель по уже посчитанным фактам.'
                : 'детерминированные шаблоны, языковая модель не используется.'}
            </p>
          </>
        )}
      </section>

      <section className="card-surface flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold text-ink">Чего мы не делаем</h2>
        <ul className="flex flex-col gap-2 text-sm text-ink">
          <Item>Не покупаем билеты за вас: оформление всегда происходит на стороне ТуТу.</Item>
          <Item>
            Не отслеживаем задержки в реальном времени. Мы проверяем структуру маршрута до покупки,
            а не сопровождаем поездку.
          </Item>
          <Item>
            Не обещаем, что альтернатива из плана Б будет доступна в момент сбоя — она была
            доступна на момент поиска.
          </Item>
          <Item>Не достраиваем координаты геокодером: без данных показываем текстовую схему.</Item>
          <Item>Не подставляем ноль вместо неизвестной цены — показываем «нет данных».</Item>
        </ul>
      </section>

      <section className="card-surface flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold text-ink">Ваши данные</h2>
        <p className="text-sm text-muted">
          В браузере хранится только последний собранный план — чтобы открыть его без сети. История
          поездок не ведётся, свободный текст запроса не логируется.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void clearLastPlan().then(() => setCleared(true));
            }}
          >
            Удалить сохранённую поездку
          </Button>
          {cleared && <span className="text-sm text-success">Удалено</span>}
        </div>
      </section>

      <Link to="/" className="text-sm font-medium text-navy underline underline-offset-4">
        Вернуться к поиску
      </Link>
    </article>
  );
}

function Item({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet" />
      <span>{children}</span>
    </li>
  );
}
