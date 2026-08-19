import { useMemo, useState } from 'react';
import type { CandidateOption, PlanConfiguration, RoutePlan } from '@tutu-plan-b/domain';
import {
  FALLBACK_CAVEAT,
  deriveFreshness,
  formatPrice,
  formatWallClockDate,
  formatWallClockTime,
  isCheckoutAllowedForFreshness,
  isHotelOption,
  isTransportOption,
  pluralizeRu,
} from '@tutu-plan-b/domain';
import { GlobePanel } from '../globe/GlobePanel';
import { ConfigurationSwitcher } from './ConfigurationSwitcher';
import { OptionListSheet } from './OptionListSheet';
import { PlanSummary } from './PlanSummary';
import { PlanWarnings } from './PlanWarnings';
import { ScoreSheet } from './ScoreSheet';
import { StageCard } from './StageCard';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { usePlanStore } from '../../store/plan-store';

export interface PlanViewProps {
  readonly plan: RoutePlan;
  readonly offline: boolean;
}

type SheetState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'alternatives'; readonly stageId: string }
  | { readonly kind: 'fallback'; readonly stageId: string }
  | { readonly kind: 'score' }
  | { readonly kind: 'checkout' };

export function PlanView({ plan, offline }: PlanViewProps): React.JSX.Element {
  const activeConfigurationId = usePlanStore((state) => state.activeConfigurationId);
  const selectedStageId = usePlanStore((state) => state.selectedStageId);
  const swappingStageId = usePlanStore((state) => state.swappingStageId);
  const setActiveConfiguration = usePlanStore((state) => state.setActiveConfiguration);
  const selectStage = usePlanStore((state) => state.selectStage);
  const swapOption = usePlanStore((state) => state.swapOption);

  const [sheet, setSheet] = useState<SheetState>({ kind: 'closed' });

  const configuration: PlanConfiguration | undefined =
    plan.configurations.find((item) => item.id === activeConfigurationId) ?? plan.configurations[0];

  const fallbackByStageId = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    for (const fallback of plan.fallbackPlans) {
      if (fallback.configurationId !== configuration?.id) continue;
      if (fallback.status !== 'available') continue;
      map.set(fallback.targetStageId, fallback.optionIds);
    }
    return map;
  }, [plan.fallbackPlans, configuration?.id]);

  if (configuration === undefined) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="card-surface flex flex-col gap-3 p-6">
          <h2 className="text-lg font-extrabold">Подходящих вариантов не нашлось</h2>
          <p className="text-sm text-muted">
            Мы не показываем маршруты, которые нарушают ваши ограничения. Попробуйте ослабить одно
            из условий — например, увеличить бюджет или разрешить пересадку.
          </p>
        </div>
        <PlanWarnings warnings={plan.warnings} />
      </section>
    );
  }

  const checkoutRows = checkoutLinks(configuration, plan, offline);
  const checkoutBlocked = offline || checkoutRows.every((row) => !row.allowed);
  const checkoutNote = offline
    ? 'Нет сети. Кнопка заблокирована: цену нельзя проверить.'
    : checkoutBlocked
      ? 'Цена устарела. Кнопка заблокирована до обновления.'
      : 'Откроется официальная страница Туту. Мы не бронируем и не принимаем оплату.';

  const sheetStage =
    sheet.kind === 'alternatives' || sheet.kind === 'fallback'
      ? configuration.stages.find((stage) => stage.id === sheet.stageId)
      : undefined;
  const selectedOption =
    sheetStage === undefined ? undefined : plan.candidatePool[sheetStage.selectedOptionId];

  return (
    <div className="flex flex-col">
      <header className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.035em] leading-[1.05] lg:text-[30px]">
            {plan.request.origin.name} <span className="text-[var(--color-accent)]">→</span>{' '}
            {plan.request.destination.name}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">{tripMeta(plan)}</p>
        </div>
        <span className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--color-accent)]">
          Версия {plan.revision + 1} · собран в {formatWallClockTime(plan.validAt)}
        </span>
      </header>

      <div className="sticky top-[57px] z-20 -mx-4 mb-3 bg-[var(--color-bg)]/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <PlanSummary
          configuration={configuration}
          pool={plan.candidatePool}
          budgetAmount={plan.request.budget.amount}
          checkoutBlocked={checkoutBlocked}
          checkoutNote={checkoutNote}
          compact
          onOpenScore={() => setSheet({ kind: 'score' })}
          onCheckout={() => setSheet({ kind: 'checkout' })}
        />
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[224px_minmax(0,1fr)_280px]">
        <aside className="order-1">
          <p className="mb-2 text-[11px] font-bold tracking-[0.07em] text-muted uppercase">
            Конфигурации
          </p>
          <ConfigurationSwitcher
            configurations={plan.configurations}
            activeId={configuration.id}
            onChange={setActiveConfiguration}
          />
        </aside>

        <section className="order-2 overflow-hidden rounded-2xl border border-line bg-[var(--color-surface)]">
          <GlobePanel
            configuration={configuration}
            pool={plan.candidatePool}
            selectedStageId={selectedStageId}
            onSelectStage={(stageId) =>
              selectStage(stageId === selectedStageId ? undefined : stageId)
            }
          />
        </section>

        <aside className="order-3 hidden rounded-2xl border border-line bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] lg:sticky lg:top-[112px] lg:block">
          <PlanSummary
            configuration={configuration}
            pool={plan.candidatePool}
            budgetAmount={plan.request.budget.amount}
            checkoutBlocked={checkoutBlocked}
            checkoutNote={checkoutNote}
            onOpenScore={() => setSheet({ kind: 'score' })}
            onCheckout={() => setSheet({ kind: 'checkout' })}
          />
        </aside>
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-[var(--color-surface)] p-3.5">
        <div className="mb-3 flex items-baseline justify-between gap-2.5">
          <div>
            <h2 className="m-0 text-base font-extrabold tracking-[-0.02em]">Этапы маршрута</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              У каждого этапа свои факты. Там, где есть замена, показываем План Б.
            </p>
          </div>
          <span className="whitespace-nowrap text-[11.5px] font-bold text-muted">
            {configuration.stages.length}{' '}
            {pluralizeRu(configuration.stages.length, 'этап', 'этапа', 'этапов')}
          </span>
        </div>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0 lg:flex-row lg:overflow-x-auto lg:pb-1.5">
          {configuration.stages.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              pool={plan.candidatePool}
              selected={stage.id === selectedStageId}
              busy={stage.id === swappingStageId}
              offline={offline}
              now={plan.validAt}
              alternativesCount={stage.alternativeOptionIds.length}
              fallbackCount={fallbackByStageId.get(stage.id)?.length ?? 0}
              onSelect={() => selectStage(stage.id === selectedStageId ? undefined : stage.id)}
              onOpenAlternatives={() => setSheet({ kind: 'alternatives', stageId: stage.id })}
              onOpenFallback={() => setSheet({ kind: 'fallback', stageId: stage.id })}
            />
          ))}
        </ol>
      </section>

      <div className="mt-3">
        <PlanWarnings warnings={plan.warnings} />
      </div>

      <div className="mt-3 lg:hidden">
        <PlanSummary
          configuration={configuration}
          pool={plan.candidatePool}
          budgetAmount={plan.request.budget.amount}
          checkoutBlocked={checkoutBlocked}
          checkoutNote={checkoutNote}
          onOpenScore={() => setSheet({ kind: 'score' })}
          onCheckout={() => setSheet({ kind: 'checkout' })}
        />
      </div>

      {sheet.kind === 'score' && (
        <ScoreSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet({ kind: 'closed' });
          }}
          configuration={configuration}
        />
      )}

      {sheetStage !== undefined && (
        <OptionListSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet({ kind: 'closed' });
          }}
          title={sheet.kind === 'fallback' ? 'План Б' : 'Альтернативы и План Б'}
          description={sheetStage.title}
          optionIds={
            sheet.kind === 'fallback'
              ? (fallbackByStageId.get(sheetStage.id) ?? [])
              : sheetStage.alternativeOptionIds
          }
          pool={plan.candidatePool}
          selectedOptionId={sheetStage.selectedOptionId}
          selectedPrice={selectedOption?.price}
          busy={swappingStageId === sheetStage.id}
          caveat={sheet.kind === 'fallback' ? FALLBACK_CAVEAT : undefined}
          onPick={(optionId) => {
            void swapOption(sheetStage.id, optionId).then(() => {
              setSheet({ kind: 'closed' });
            });
          }}
        />
      )}

      {sheet.kind === 'checkout' && (
        <BottomSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet({ kind: 'closed' });
          }}
          title="Оформление"
          description="Каждый этап оформляется отдельно на Туту."
        >
          {checkoutRows.length === 0 ? (
            <p className="text-sm text-muted">
              Туту не вернул ссылки на оформление для выбранных этапов.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-line">
              {checkoutRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2.5 border-b border-line bg-[var(--color-input)] px-3.5 py-2.5 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold">{row.title}</span>
                    <span className="block text-[11.5px] text-muted">{row.meta}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular text-sm font-extrabold">{row.price}</span>
                    {row.url !== undefined && row.allowed ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12.5px] font-bold text-[var(--color-accent)]"
                      >
                        Открыть на Туту
                      </a>
                    ) : (
                      <span className="text-[11.5px] text-muted">Ссылка недоступна</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs leading-normal text-muted">
            Приложение не бронирует и не принимает оплату. Цена и наличие проверяются на страницах
            Туту.
          </p>
        </BottomSheet>
      )}
    </div>
  );
}

function tripMeta(plan: RoutePlan): string {
  const parts = [
    formatWallClockDate(plan.request.departDate),
    plan.request.returnDate === undefined ? undefined : formatWallClockDate(plan.request.returnDate),
  ].filter((part): part is string => part !== undefined);

  const adults = plan.request.travelers.adults;
  const children = plan.request.travelers.children.length;
  const people = `${adults} ${pluralizeRu(adults, 'взрослый', 'взрослых', 'взрослых')}`;
  const kids =
    children === 0 ? undefined : `${children} ${pluralizeRu(children, 'ребёнок', 'ребёнка', 'детей')}`;
  const trip = plan.request.tripType === 'roundTrip' ? 'туда и обратно' : 'в одну сторону';

  return [parts.join(' – '), people, kids, trip].filter(Boolean).join(' · ');
}

function checkoutLinks(
  configuration: PlanConfiguration,
  plan: RoutePlan,
  offline: boolean,
) {
  return configuration.stages.flatMap((stage) => {
    const option = plan.candidatePool[stage.selectedOptionId];
    if (option === undefined || option.kind === 'calculated') return [];
    if (option.checkoutUrl === undefined && option.price === undefined) return [];
    return [checkoutRow(stage.id, stage.title, option, plan.validAt, offline)];
  });
}

function checkoutRow(
  id: string,
  title: string,
  option: CandidateOption,
  now: string,
  offline: boolean,
) {
  const freshness = deriveFreshness({
    fetchedAt: option.fetchedAt,
    expiresAt: option.expiresAt,
    now,
    isOffline: offline,
  });
  return {
    id,
    title,
    meta: optionMeta(option),
    price: formatPrice(option.price),
    url: option.checkoutUrl,
    allowed: option.checkoutUrl !== undefined && isCheckoutAllowedForFreshness(freshness),
  };
}

function optionMeta(option: CandidateOption): string {
  if (isTransportOption(option)) {
    return `${option.departure.place.name} → ${option.arrival.place.name}`;
  }
  if (isHotelOption(option)) {
    return option.name;
  }
  return 'Рассчитанный этап';
}
