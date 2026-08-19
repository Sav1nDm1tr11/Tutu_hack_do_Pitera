import { useMemo, useState } from 'react';
import type { PlanConfiguration, RoutePlan } from '@tutu-plan-b/domain';
import { FALLBACK_CAVEAT } from '@tutu-plan-b/domain';
import { GlobePanel } from '../globe/GlobePanel';
import { ConfigurationSwitcher } from './ConfigurationSwitcher';
import { OptionListSheet } from './OptionListSheet';
import { PlanSummary } from './PlanSummary';
import { PlanWarnings } from './PlanWarnings';
import { StageCard } from './StageCard';
import { usePlanStore } from '../../store/plan-store';

export interface PlanViewProps {
  readonly plan: RoutePlan;
  readonly offline: boolean;
}

type SheetState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'alternatives'; readonly stageId: string }
  | { readonly kind: 'fallback'; readonly stageId: string };

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
          <h2 className="text-lg font-semibold text-ink">Подходящих вариантов не нашлось</h2>
          <p className="text-sm text-muted">
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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_400px] lg:items-start lg:gap-6">
      {/* На мобильном сводка липкая и стоит первой (§6.3): цена и оценка должны быть
          видны во время прокрутки этапов, иначе сравнение вариантов требует памяти. */}
      <div className="sticky top-0 z-20 -mx-4 bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <PlanSummary configuration={configuration} compact />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div
          className="h-[var(--globe-height-mobile)] w-full lg:h-[min(45vh,460px)]"
          style={{ contain: 'layout paint' }}
        >
          <GlobePanel
            configuration={configuration}
            pool={plan.candidatePool}
            selectedStageId={selectedStageId}
            onSelectStage={(stageId) => selectStage(stageId === selectedStageId ? undefined : stageId)}
          />
        </div>

        <ConfigurationSwitcher
          configurations={plan.configurations}
          activeId={configuration.id}
          onChange={setActiveConfiguration}
        />

        <Explanation configuration={configuration} />

        {/* Этапы — семантически упорядоченный список (§19): порядок здесь несёт смысл. */}
        <ol className="flex flex-col gap-3" aria-label="Этапы маршрута">
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

        <PlanWarnings warnings={plan.warnings} />
      </div>

      <aside className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4">
        <div className="card-surface p-5">
          <h2 className="mb-3 text-base font-semibold text-ink">Итог поездки</h2>
          <PlanSummary configuration={configuration} />
        </div>
      </aside>

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
      <h2 className="text-[15px] font-semibold text-ink">{explanation.headline}</h2>

      {explanation.bullets.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {explanation.bullets.map((bullet) => (
            <li key={bullet.reasonCode} className="flex items-start gap-2 text-sm text-ink">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet" />
              <span>{bullet.text}</span>
            </li>
          ))}
        </ul>
      )}

      {explanation.caveats.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-2">
          {explanation.caveats.map((caveat) => (
            <li key={caveat} className="text-xs text-muted">
              {caveat}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
