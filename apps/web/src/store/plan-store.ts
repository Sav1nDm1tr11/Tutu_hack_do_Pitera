import { create } from 'zustand';
import type {
  PlanPhase,
  PlanStreamEvent,
  RoutePlan,
  SelectionPatch,
  TravelRequest,
} from '@tutu-plan-b/domain';
import { ApiError, patchSelection, streamPlan } from '../lib/api-client';
import { saveLastPlan } from '../lib/plan-storage';

export type PlanStatus = 'idle' | 'streaming' | 'ready' | 'error';

export interface PlanErrorState {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

interface PlanState {
  status: PlanStatus;
  phase: PlanPhase | undefined;
  progressMessage: string | undefined;
  plan: RoutePlan | undefined;
  /** Помечает план как восстановленный из локального хранилища (§5.4). */
  fromCache: boolean;
  cachedAt: string | undefined;
  error: PlanErrorState | undefined;
  activeConfigurationId: string | undefined;
  selectedStageId: string | undefined;
  swappingStageId: string | undefined;
  /** Текст для aria-live: изменения цены и оценки объявляются неинтрузивно (§19). */
  announcement: string;

  startPlan: (request: TravelRequest) => Promise<void>;
  cancel: () => void;
  setActiveConfiguration: (configurationId: string) => void;
  selectStage: (stageId: string | undefined) => void;
  swapOption: (stageId: string, optionId: string) => Promise<void>;
  restoreCached: (plan: RoutePlan, savedAt: string) => void;
  reset: () => void;
}

const PHASE_LABELS: Record<PlanPhase, string> = {
  planning: 'Разбираем условия поездки',
  searchingTransport: 'Ищем варианты транспорта',
  searchingHotels: 'Проверяем отели и отзывы',
  normalizing: 'Приводим данные к единому виду',
  scoring: 'Сравниваем варианты',
  buildingFallback: 'Готовим план Б',
  explaining: 'Формулируем объяснения',
};

let controller: AbortController | undefined;

export const usePlanStore = create<PlanState>((set, get) => ({
  status: 'idle',
  phase: undefined,
  progressMessage: undefined,
  plan: undefined,
  fromCache: false,
  cachedAt: undefined,
  error: undefined,
  activeConfigurationId: undefined,
  selectedStageId: undefined,
  swappingStageId: undefined,
  announcement: '',

  async startPlan(request) {
    controller?.abort();
    controller = new AbortController();

    set({
      status: 'streaming',
      phase: 'planning',
      progressMessage: PHASE_LABELS.planning,
      plan: undefined,
      fromCache: false,
      cachedAt: undefined,
      error: undefined,
      activeConfigurationId: undefined,
      selectedStageId: undefined,
      announcement: 'Начали собирать маршрут',
    });

    try {
      for await (const event of streamPlan(request, controller.signal)) {
        applyEvent(event, set, get);
      }

      // Поток закрылся без plan.ready и без plan.error — это тоже отказ, и молчать о нём
      // нельзя: пользователь остался бы на экране прогресса навсегда.
      if (get().status === 'streaming') {
        set({
          status: 'error',
          error: {
            code: 'STREAM_INCOMPLETE',
            message: 'Соединение прервалось до готовности плана. Попробуйте повторить поиск.',
            retryable: true,
          },
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;

      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError('NETWORK_ERROR', 'Не удалось связаться с сервером.', true);

      set({
        status: 'error',
        error: { code: apiError.code, message: apiError.message, retryable: apiError.retryable },
      });
    }
  },

  cancel() {
    controller?.abort();
    set({ status: 'idle', phase: undefined, progressMessage: undefined });
  },

  setActiveConfiguration(configurationId) {
    const plan = get().plan;
    const configuration = plan?.configurations.find((item) => item.id === configurationId);
    if (configuration === undefined) return;

    set({
      activeConfigurationId: configurationId,
      selectedStageId: undefined,
      announcement: `Выбран вариант «${describeLabels(configuration.labels)}»`,
    });
  },

  selectStage(stageId) {
    set({ selectedStageId: stageId });
  },

  async swapOption(stageId, optionId) {
    const { plan, activeConfigurationId } = get();
    if (plan === undefined || activeConfigurationId === undefined) return;

    const patch: SelectionPatch = {
      configurationId: activeConfigurationId,
      stageId,
      selectedOptionId: optionId,
      expectedRevision: plan.revision,
    };

    set({ swappingStageId: stageId });

    try {
      const result = await patchSelection(plan.id, patch);
      set({
        plan: result.plan,
        swappingStageId: undefined,
        announcement: describeChange(plan, result.plan),
      });
      void saveLastPlan(result.plan, new Date().toISOString());
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError('NETWORK_ERROR', 'Не удалось применить замену.', true);

      // План остаётся прежним: показать пользователю маршрут, который не подтвердил
      // сервер, значит соврать о его состоянии.
      set({
        swappingStageId: undefined,
        error: { code: apiError.code, message: apiError.message, retryable: apiError.retryable },
        announcement: `Замена не применена: ${apiError.message}`,
      });
    }
  },

  restoreCached(plan, savedAt) {
    set({
      status: 'ready',
      plan,
      fromCache: true,
      cachedAt: savedAt,
      activeConfigurationId: plan.configurations[0]?.id,
      phase: undefined,
      progressMessage: undefined,
      error: undefined,
    });
  },

  reset() {
    controller?.abort();
    set({
      status: 'idle',
      phase: undefined,
      progressMessage: undefined,
      plan: undefined,
      fromCache: false,
      cachedAt: undefined,
      error: undefined,
      activeConfigurationId: undefined,
      selectedStageId: undefined,
      swappingStageId: undefined,
      announcement: '',
    });
  },
}));

type SetState = (partial: Partial<PlanState>) => void;

function applyEvent(event: PlanStreamEvent, set: SetState, get: () => PlanState): void {
  switch (event.type) {
    case 'plan.started':
      set({ announcement: 'Поиск запущен' });
      return;

    case 'plan.progress':
      set({
        phase: event.phase,
        progressMessage: event.message,
      });
      return;

    case 'plan.partial':
      set({
        announcement: `Часть данных получена: ${event.configurationCount} вариантов`,
      });
      return;

    case 'plan.ready': {
      const first = event.plan.configurations[0];
      set({
        status: 'ready',
        plan: event.plan,
        phase: undefined,
        progressMessage: undefined,
        activeConfigurationId: first?.id,
        announcement:
          event.plan.configurations.length === 0
            ? 'Подходящих вариантов не найдено'
            : `Готово: ${event.plan.configurations.length} вариантов маршрута`,
      });
      void saveLastPlan(event.plan, new Date().toISOString());
      return;
    }

    case 'plan.error':
      set({
        status: 'error',
        error: { code: event.code, message: event.message, retryable: event.retryable },
        phase: undefined,
        progressMessage: undefined,
      });
      return;

    default:
      // Неизвестный тип события игнорируется (§13.1).
      void get;
  }
}

const PRESET_NAMES: Record<string, string> = {
  reliable: 'Надёжный',
  balanced: 'Сбалансированный',
  budget: 'Бюджетный',
};

export function describeLabels(labels: readonly string[]): string {
  return labels.map((label) => PRESET_NAMES[label] ?? label).join(' и ');
}

/** Объявление для aria-live: что именно изменилось после замены варианта (§19). */
function describeChange(before: RoutePlan, after: RoutePlan): string {
  const beforeTotals = before.configurations[0]?.totals;
  const afterTotals = after.configurations[0]?.totals;

  if (beforeTotals?.price === undefined || afterTotals?.price === undefined) {
    return 'Вариант заменён, маршрут пересчитан';
  }

  const delta = afterTotals.price.amount - beforeTotals.price.amount;
  if (delta === 0) return 'Вариант заменён, цена не изменилась';

  const formatted = Math.abs(delta).toLocaleString('ru-RU');
  return delta > 0
    ? `Вариант заменён, цена выросла на ${formatted} рублей`
    : `Вариант заменён, цена снизилась на ${formatted} рублей`;
}
