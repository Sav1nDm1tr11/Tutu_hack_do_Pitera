import {
  planStreamEventSchema,
  routePlanSchema,
  type CapabilitySnapshot,
  type PlaceRef,
  type PlanStreamEvent,
  type RoutePlan,
  type SelectionPatch,
  type TravelRequest,
} from '@tutu-plan-b/domain';
import { z } from 'zod';
import { readNdjson } from './ndjson';

const API_BASE = import.meta.env['VITE_API_BASE_URL'] ?? '';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
});

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = errorBodySchema.parse(await response.json());
    return new ApiError(parsed.error.code, parsed.error.message, parsed.error.retryable);
  } catch {
    return new ApiError(
      'INTERNAL_ERROR',
      'Сервер ответил неожиданным образом. Попробуйте повторить запрос.',
      true,
    );
  }
}

/**
 * Поток построения плана.
 *
 * Неизвестные типы событий пропускаются, а не роняют поток (§13.1): сервер может начать
 * присылать новую фазу раньше, чем обновится клиент, и это не повод терять уже
 * полученный результат.
 */
export async function* streamPlan(
  request: TravelRequest,
  signal: AbortSignal,
): AsyncGenerator<PlanStreamEvent> {
  const response = await fetch(`${API_BASE}/api/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) throw await toApiError(response);

  for await (const raw of readNdjson(response, signal)) {
    const parsed = planStreamEventSchema.safeParse(raw);
    if (parsed.success) yield parsed.data;
  }
}

/**
 * `exactOptionalPropertyTypes` не позволяет передать `signal: undefined`: у `RequestInit`
 * поле допускает `null`, но не отсутствие значения. Поэтому init собирается явно.
 */
function requestInit(signal: AbortSignal | undefined): RequestInit {
  return signal === undefined ? {} : { signal };
}

export async function fetchPlan(planId: string, signal?: AbortSignal): Promise<RoutePlan> {
  const response = await fetch(
    `${API_BASE}/api/plan/${encodeURIComponent(planId)}`,
    requestInit(signal),
  );
  if (!response.ok) throw await toApiError(response);

  const parsed = z.object({ plan: routePlanSchema }).parse(await response.json());
  return parsed.plan;
}

export async function patchSelection(
  planId: string,
  patch: SelectionPatch,
): Promise<{ plan: RoutePlan; changedStageId: string }> {
  const response = await fetch(`${API_BASE}/api/plan/${encodeURIComponent(planId)}/selection`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });

  if (!response.ok) throw await toApiError(response);

  return z
    .object({ plan: routePlanSchema, changedStageId: z.string() })
    .parse(await response.json());
}

const capabilitiesResponseSchema = z.object({
  capabilities: z.custom<CapabilitySnapshot>(),
  plannerMode: z.enum(['llm', 'deterministic']),
});

export async function fetchCapabilities(signal?: AbortSignal): Promise<{
  capabilities: CapabilitySnapshot;
  plannerMode: 'llm' | 'deterministic';
}> {
  const response = await fetch(`${API_BASE}/api/capabilities`, requestInit(signal));
  if (!response.ok) throw await toApiError(response);
  return capabilitiesResponseSchema.parse(await response.json());
}

const placesResponseSchema = z.object({
  places: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      point: z.object({ lon: z.number(), lat: z.number() }).optional(),
      timezone: z.string().optional(),
    }),
  ),
});

export async function fetchPlaces(query: string, signal?: AbortSignal): Promise<PlaceRef[]> {
  const response = await fetch(
    `${API_BASE}/api/places?q=${encodeURIComponent(query)}`,
    requestInit(signal),
  );
  if (!response.ok) throw await toApiError(response);

  const parsed = placesResponseSchema.parse(await response.json());
  return parsed.places.map((place) => ({
    id: place.id,
    name: place.name,
    kind: 'city',
    ...(place.point === undefined ? {} : { point: place.point }),
    ...(place.timezone === undefined ? {} : { timezone: place.timezone }),
  }));
}
