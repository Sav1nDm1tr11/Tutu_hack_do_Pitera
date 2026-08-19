import { Link } from 'react-router';

export function NotFoundScreen(): React.JSX.Element {
  return (
    <section className="card-surface mx-auto flex max-w-lg flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold text-ink">Такой страницы нет</h1>
      <p className="text-sm text-muted">
        Возможно, ссылка устарела или в адресе опечатка. Поиск маршрута всегда доступен на главной.
      </p>
      <Link
        to="/"
        className="tap-target inline-flex w-fit items-center rounded-[12px] bg-[var(--color-primary)] px-4 font-bold text-white"
      >
        Перейти к поиску
      </Link>
    </section>
  );
}
