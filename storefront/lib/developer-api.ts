import type {
  CreateAppInput,
  DeveloperAppItem,
  UpdateAppInput,
} from '@/types/developer';

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => null)) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(data?.message ?? `Yêu cầu thất bại với mã trạng thái ${response.status}`);
  }

  return data as T;
}

export async function fetchDeveloperApps(): Promise<DeveloperAppItem[]> {
  return apiRequest<DeveloperAppItem[]>('/api/developer/apps');
}

export async function createDeveloperApp(input: CreateAppInput): Promise<DeveloperAppItem> {
  return apiRequest<DeveloperAppItem>('/api/developer/apps', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateDeveloperApp(
  appKey: string,
  input: UpdateAppInput,
): Promise<DeveloperAppItem> {
  return apiRequest<DeveloperAppItem>(`/api/developer/apps/${encodeURIComponent(appKey)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteDeveloperApp(
  appKey: string,
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(
    `/api/developer/apps/${encodeURIComponent(appKey)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function revokeDeveloperKey(appKey: string): Promise<DeveloperAppItem> {
  return apiRequest<DeveloperAppItem>(
    `/api/developer/apps/${encodeURIComponent(appKey)}/revoke`,
    {
      method: 'POST',
    },
  );
}

export async function reactivateDeveloperKey(appKey: string): Promise<DeveloperAppItem> {
  return apiRequest<DeveloperAppItem>(
    `/api/developer/apps/${encodeURIComponent(appKey)}/reactivate`,
    {
      method: 'POST',
    },
  );
}

export async function rotateDeveloperSecret(appKey: string): Promise<DeveloperAppItem> {
  return apiRequest<DeveloperAppItem>(
    `/api/developer/apps/${encodeURIComponent(appKey)}/rotate-secret`,
    {
      method: 'POST',
    },
  );
}
