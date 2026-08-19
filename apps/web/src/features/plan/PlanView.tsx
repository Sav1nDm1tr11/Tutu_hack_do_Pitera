import { useMemo, useRef, useState } from 'react';
import type { PlanConfiguration, RoutePlan } from '@tutu-plan-b/domain';
import { FALLBACK_CAVEAT } from '@tutu-plan-b/domain';
import { GlobePanel } from '../globe/GlobePanel';
import { ConfigurationSwitcher } from './ConfigurationSwitcher';
import { OptionListSheet } from './OptionListSheet';
import { PlanSummary } from './PlanSummary';
import { PlanWarnings } from './PlanWarnings';
import { StageCard } from './StageCard';
import { usePlanStore } from '../../store/plan-store';
import { usePageIntro } from '../../lib/use-page-intro';

export interface PlanViewProps {
  readonly plan: RoutePlan;
  readonly offline: boolean;
}

type SheetState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'alternatives'; readonly stageId: string }
  | { readonly kind: 'fallback'; readonly stageId: string };

export function PlanView({ plan, offline }: PlanViewProps): React.JSX.Element {
  const pageRef = useRef<HTMLDivElement>(null);
  const activeConfigurationId = usePlanStore((state) => state.activeConfigurationId);
  const selectedStageId = usePlanStore((state) => state.selectedStageId);
  const swappingStageId = usePlanStore((state) => state.swappingStageId);
  const setActiveConfiguration = usePlanStore((state) => state.setActiveConfiguration);
  const selectStage = usePlanStore((state) => state.selectStage);
  const swapOption = usePlanStore((state) => state.swapOption);

  const [sheet, setSheet] = useState<SheetState>({ kind: 'closed' });

  const configuration: PlanConfiguration | undefined =
    plan.configurations.find((item) => item.id === activeConfigurationId) ?? plan.configurations[0];
  usePageIntro(pageRef);

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
          <h2 className="text-ink text-lg font-semibold">Подходящих вариантов не нашлось</h2>
          <p className="text-muted text-sm">
            Мы не показываем маршруты, которые нарушают ваши ограничения. Попробуйте ослабить одно
            из условий — например, увеличить бюджет или разрешить пересадку.
          </p>
        </div>
        <PlanWarnings warnings={plan.warnings} />
      </section>
    );
  }

  const sheetStage =
    sheet.kind === 'closed'
      ? undefined
      : configuration.stages.find((stage) => stage.id === sheet.stageId);

  return (
    <div ref={pageRef} className="plan-page">
      <header className="plan-title" data-intro>
        <div>
          <h1>
            {plan.request.origin.name} <span aria-hidden="true">→</span>{' '}
            {plan.request.destination.name}
          </h1>
          <p>Маршрут собран, проверен на сбои и готов к сравнению.</p>
        </div>
        <span className="plan-revision">Версия {plan.revision + 1}</span>
      </header>

      {/* На мобильном сводка липкая и стоит первой (§6.3): цена и оценка должны быть
          видны во время прокрутки этапов, иначе сравнение вариантов требует памяти. */}
      <div
        className="plan-mobile-summary sticky top-[65px] z-20 -mx-4 px-4 py-3 backdrop-blur lg:hidden"
        data-intro
      >
        <PlanSummary configuration={configuration} compact />
      </div>

      <div className="plan-hero-grid">
        <aside className="configuration-zone" aria-label="Режим поездки" data-intro>
          <div className="zone-heading">
            <h2>Режим поездки</h2>
            <p>Переключите приоритет — весь маршрут пересчитается.</p>
          </div>
          <ConfigurationSwitcher
            configurations={plan.configurations}
            activeId={configuration.id}
            onChange={setActiveConfiguration}
          />
        </aside>

        <div className="globe-zone" style={{ contain: 'layout paint' }} data-intro>
          <div className="globe-zone__label">
            <strong>Живая карта маршрута</strong>
            <span>Нажмите на дугу или этап</span>
          </div>
          <GlobePanel
            configuration={configuration}
            pool={plan.candidatePool}
            selectedStageId={selectedStageId}
            onSelectStage={(stageId) =>
              selectStage(stageId === selectedStageId ? undefined : stageId)
            }
          />
        </div>

        <aside className="summary-zone" aria-label="Итог поездки" data-intro>
          <div className="zone-heading">
            <h2>Итог поездки</h2>
            <p>Стоимость, время и запас прочности.</p>
          </div>
          <PlanSummary configuration={configuration} />
        </aside>
      </div>

      <div data-intro>
        <Explanation configuration={configuration} />
      </div>

      <section id="route-stages" className="route-rail" data-intro>
        <div className="route-rail__heading">
          <div>
            <h2>Маршрут по шагам</h2>
            <p>Выберите этап, чтобы приблизить его на планете или заменить вариант.</p>
          </div>
          <span>{configuration.stages.length} этапов</span>
        </div>

        {/* Этапы — семантически упорядоченный список (§19): порядок здесь несёт смысл. */}
        <ol className="route-stage-list" aria-label="Этапы маршрута">
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

      <div data-intro>
        <PlanWarnings warnings={plan.warnings} />
      </div>

      {sheetStage !== undefined && (
        <OptionListSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet({ kind: 'closed' });
          }}
          title={sheet.kind === 'fallback' ? 'План Б' : 'Другие варианты'}
          description={sheetStage.title}
          optionIds={
            sheet.kind === 'fallback'
              ? (fallbackByStageId.get(sheetStage.id) ?? [])
              : sheetStage.alternativeOptionIds
          }
          pool={plan.candidatePool}
          selectedOptionId={sheetStage.selectedOptionId}
          busy={swappingStageId === sheetStage.id}
          caveat={sheet.kind === 'fallback' ? FALLBACK_CAVEAT : undefined}
          onPick={(optionId) => {
            void swapOption(sheetStage.id, optionId).then(() => {
              setSheet({ kind: 'closed' });
            });
          }}
        />
      )}
    </div>
  );
}

/**
 * Объяснение выбора (§11.4). Каждый пункт привязан к коду причины из расчёта, поэтому
 * список нельзя дополнить «общими словами» — здесь это гарантируется данными, а не
 * дисциплиной разработчика.
 */
function Explanation({
  configuration,
}: {
  readonly configuration: PlanConfiguration;
}): React.JSX.Element {
  const { explanation } = configuration;

  return (
    <section className="card-surface flex flex-col gap-2.5 p-4">
      <h2 className="text-ink text-[15px] font-semibold">{explanation.headline}</h2>

      {explanation.bullets.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {explanation.bullets.map((bullet) => (
            <li key={bullet.reasonCode} className="text-ink flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className="bg-violet mt-1.5 size-1.5 shrink-0 rounded-full"
              />
              <span>{bullet.text}</span>
            </li>
          ))}
        </ul>
      )}

      {explanation.caveats.length > 0 && (
        <ul className="border-line flex flex-col gap-1 border-t pt-2">
          {explanation.caveats.map((caveat) => (
            <li key={caveat} className="text-muted text-xs">
              {caveat}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
