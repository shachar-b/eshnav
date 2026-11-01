import type {
  AdjustStarsBody,
  AdjustStarsResponse,
  AdminSessionResponse,
  ApiError,
  BoardResponse,
  CompletePoolChoreResponse,
  CreatePersonalChoreBody,
  CreatePoolChoreBody,
  CreateProfileBody,
  CreateRoutineBody,
  HistoryResponse,
  PersonalChore,
  PersonalChoreToggleResponse,
  PoolChore,
  Profile,
  PublicSettings,
  RoutineTemplate,
  RoutineToggleResponse,
  ToggleHistoryRoutineResponse,
  UndoPoolCompletionResponse,
  UpdatePersonalChoreBody,
  UpdatePoolChoreBody,
  UpdateProfileBody,
  UpdateRoutineBody,
  UpdateSettingsBody,
} from '@eshnav/shared';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errPayload = json as Partial<ApiError> | null;
    const code = errPayload?.error?.code ?? 'INTERNAL_ERROR';
    const message = errPayload?.error?.message ?? 'אירעה שגיאה בתקשורת עם השרת';
    throw new ApiClientError(code, message, res.status);
  }

  return json as T;
}

export const api = {
  // Public Board & Kid Actions
  getBoard: () => request<BoardResponse>('/api/v1/board'),

  toggleRoutine: (routineId: number) =>
    request<RoutineToggleResponse>(`/api/v1/routines/${routineId}/toggle`, { method: 'POST' }),

  togglePersonalChore: (choreId: number) =>
    request<PersonalChoreToggleResponse>(`/api/v1/personal-chores/${choreId}/toggle`, { method: 'POST' }),

  completePoolChore: (poolChoreId: number, profileId: number) =>
    request<CompletePoolChoreResponse>(`/api/v1/pool-chores/${poolChoreId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ profileId }),
    }),

  undoPoolCompletion: (poolCompletionId: number) =>
    request<UndoPoolCompletionResponse>(`/api/v1/pool-completions/${poolCompletionId}/undo`, { method: 'POST' }),

  getHistory: (date?: string) =>
    request<HistoryResponse>(date ? `/api/v1/history?date=${encodeURIComponent(date)}` : '/api/v1/history'),

  // Parent Session
  getAdminSession: () => request<AdminSessionResponse>('/api/v1/admin/session'),

  unlockAdmin: (pin: string) =>
    request<AdminSessionResponse>('/api/v1/admin/unlock', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  lockAdmin: () => request<AdminSessionResponse>('/api/v1/admin/lock', { method: 'POST' }),

  // Protected Admin Endpoints
  updateSettings: (body: UpdateSettingsBody) =>
    request<PublicSettings>('/api/v1/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  listProfiles: () => request<Profile[]>('/api/v1/admin/profiles'),
  createProfile: (body: CreateProfileBody) =>
    request<Profile>('/api/v1/admin/profiles', { method: 'POST', body: JSON.stringify(body) }),
  updateProfile: (id: number, body: UpdateProfileBody) =>
    request<Profile>(`/api/v1/admin/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProfile: (id: number) =>
    request<void>(`/api/v1/admin/profiles/${id}`, { method: 'DELETE' }),
  adjustProfileStars: (id: number, body: AdjustStarsBody) =>
    request<AdjustStarsResponse>(`/api/v1/admin/profiles/${id}/adjust-stars`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listRoutines: () => request<RoutineTemplate[]>('/api/v1/admin/routines'),
  createRoutine: (body: CreateRoutineBody) =>
    request<RoutineTemplate>('/api/v1/admin/routines', { method: 'POST', body: JSON.stringify(body) }),
  updateRoutine: (id: number, body: UpdateRoutineBody) =>
    request<RoutineTemplate>(`/api/v1/admin/routines/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRoutine: (id: number) =>
    request<void>(`/api/v1/admin/routines/${id}`, { method: 'DELETE' }),

  listPersonalChores: () => request<PersonalChore[]>('/api/v1/admin/personal-chores'),
  createPersonalChore: (body: CreatePersonalChoreBody) =>
    request<PersonalChore>('/api/v1/admin/personal-chores', { method: 'POST', body: JSON.stringify(body) }),
  updatePersonalChore: (id: number, body: UpdatePersonalChoreBody) =>
    request<PersonalChore>(`/api/v1/admin/personal-chores/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePersonalChore: (id: number) =>
    request<void>(`/api/v1/admin/personal-chores/${id}`, { method: 'DELETE' }),

  listPoolChores: () => request<PoolChore[]>('/api/v1/admin/pool-chores'),
  createPoolChore: (body: CreatePoolChoreBody) =>
    request<PoolChore>('/api/v1/admin/pool-chores', { method: 'POST', body: JSON.stringify(body) }),
  updatePoolChore: (id: number, body: UpdatePoolChoreBody) =>
    request<PoolChore>(`/api/v1/admin/pool-chores/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePoolChore: (id: number) =>
    request<void>(`/api/v1/admin/pool-chores/${id}`, { method: 'DELETE' }),
  togglePoolChoreActive: (id: number, isActive: boolean) =>
    request<PoolChore>(`/api/v1/admin/pool-chores/${id}/toggle-active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),
  resetPoolChoreCooldown: (id: number) =>
    request<PoolChore>(`/api/v1/admin/pool-chores/${id}/reset-cooldown`, { method: 'POST' }),

  toggleHistoryRoutine: (routineId: number, logicalDate: string) =>
    request<ToggleHistoryRoutineResponse>('/api/v1/admin/history/toggle-routine', {
      method: 'POST',
      body: JSON.stringify({ routineId, logicalDate }),
    }),
};
