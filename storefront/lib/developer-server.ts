import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CreateAppInput, DeveloperAppItem, UpdateAppInput } from '@/types/developer';

const MOCK_SERVER_URL = process.env.AURELLE_MOCK_SERVER_URL ?? 'http://localhost:4000';
const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), '../be/.aurelle-local');
const LOCAL_STORAGE_FILE = path.join(LOCAL_STORAGE_DIR, 'apps.json');

function readLocalApps(): DeveloperAppItem[] {
  try {
    if (!existsSync(LOCAL_STORAGE_FILE)) return [];
    const content = readFileSync(LOCAL_STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(content) as (DeveloperAppItem & { status?: 'active' | 'revoked' })[];
    return parsed.map((app) => ({
      ...app,
      status: app.status ?? 'active',
      revoked_at: app.revoked_at ?? null,
    }));
  } catch {
    return [];
  }
}

function writeLocalApps(apps: DeveloperAppItem[]): boolean {
  try {
    mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    writeFileSync(`${LOCAL_STORAGE_FILE}.tmp`, JSON.stringify(apps, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(`${LOCAL_STORAGE_FILE}.tmp`, LOCAL_STORAGE_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function serverListApps(): Promise<DeveloperAppItem[]> {
  try {
    const res = await fetch(`${MOCK_SERVER_URL}/developer/api/apps`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      return (await res.json()) as DeveloperAppItem[];
    }
  } catch {
    // Fallback to local disk file
  }
  return readLocalApps().map(({ app_secret: _s, ...app }) => app);
}

export async function serverCreateApp(input: CreateAppInput): Promise<DeveloperAppItem> {
  try {
    const res = await fetch(`${MOCK_SERVER_URL}/developer/api/apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
    if (res.ok) {
      return (await res.json()) as DeveloperAppItem;
    }
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    if (err?.message) throw new Error(err.message);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('fetch failed')) {
      throw error;
    }
  }

  // Fallback direct creation
  const apps = readLocalApps();
  const newApp: DeveloperAppItem = {
    app_key: randomBytes(12).toString('hex'),
    app_secret: randomBytes(32).toString('hex'),
    name: input.name.trim(),
    redirect_uri: input.redirect_uri.trim(),
    status: 'active',
    created_at: new Date().toISOString(),
  };
  writeLocalApps([...apps, newApp]);
  return newApp;
}

export async function serverUpdateApp(
  key: string,
  input: UpdateAppInput,
): Promise<DeveloperAppItem> {
  try {
    const res = await fetch(`${MOCK_SERVER_URL}/developer/api/apps/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
    if (res.ok) {
      return (await res.json()) as DeveloperAppItem;
    }
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    if (err?.message) throw new Error(err.message);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('fetch failed')) {
      throw error;
    }
  }

  // Fallback direct update
  const apps = readLocalApps();
  const index = apps.findIndex((a) => a.app_key === key);
  if (index === -1) throw new Error('Không tìm thấy ứng dụng.');
  const current = apps[index];
  if (!current) throw new Error('Không tìm thấy ứng dụng.');
  const updated: DeveloperAppItem = {
    ...current,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : current.name,
    redirect_uri:
      typeof input.redirect_uri === 'string' && input.redirect_uri.trim()
        ? input.redirect_uri.trim()
        : current.redirect_uri,
    updated_at: new Date().toISOString(),
  };
  apps[index] = updated;
  writeLocalApps(apps);
  const { app_secret: _s, ...safe } = updated;
  return safe;
}

export async function serverDeleteApp(key: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${MOCK_SERVER_URL}/developer/api/apps/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      cache: 'no-store',
    });
    if (res.ok) {
      return (await res.json()) as { success: boolean; message: string };
    }
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    if (err?.message) throw new Error(err.message);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('fetch failed')) {
      throw error;
    }
  }

  // Fallback direct delete
  const apps = readLocalApps();
  const filtered = apps.filter((a) => a.app_key !== key);
  if (filtered.length === apps.length) {
    throw new Error('Không tìm thấy ứng dụng cần xóa.');
  }
  writeLocalApps(filtered);
  return { success: true, message: 'Đã xóa ứng dụng thành công.' };
}

export async function serverRevokeKey(key: string): Promise<DeveloperAppItem> {
  try {
    const res = await fetch(
      `${MOCK_SERVER_URL}/developer/api/apps/${encodeURIComponent(key)}/revoke`,
      {
        method: 'POST',
        cache: 'no-store',
      },
    );
    if (res.ok) {
      return (await res.json()) as DeveloperAppItem;
    }
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    if (err?.message) throw new Error(err.message);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('fetch failed')) {
      throw error;
    }
  }

  const apps = readLocalApps();
  const index = apps.findIndex((a) => a.app_key === key);
  if (index === -1) throw new Error('Không tìm thấy ứng dụng.');
  const current = apps[index];
  if (!current) throw new Error('Không tìm thấy ứng dụng.');
  const now = new Date().toISOString();
  const updated: DeveloperAppItem = {
    ...current,
    status: 'revoked',
    revoked_at: now,
    updated_at: now,
  };
  apps[index] = updated;
  writeLocalApps(apps);
  const { app_secret: _s, ...safe } = updated;
  return safe;
}

export async function serverReactivateKey(key: string): Promise<DeveloperAppItem> {
  try {
    const res = await fetch(
      `${MOCK_SERVER_URL}/developer/api/apps/${encodeURIComponent(key)}/reactivate`,
      {
        method: 'POST',
        cache: 'no-store',
      },
    );
    if (res.ok) {
      return (await res.json()) as DeveloperAppItem;
    }
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    if (err?.message) throw new Error(err.message);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('fetch failed')) {
      throw error;
    }
  }

  const apps = readLocalApps();
  const index = apps.findIndex((a) => a.app_key === key);
  if (index === -1) throw new Error('Không tìm thấy ứng dụng.');
  const current = apps[index];
  if (!current) throw new Error('Không tìm thấy ứng dụng.');
  const now = new Date().toISOString();
  const updated: DeveloperAppItem = {
    ...current,
    status: 'active',
    revoked_at: null,
    updated_at: now,
  };
  apps[index] = updated;
  writeLocalApps(apps);
  const { app_secret: _s, ...safe } = updated;
  return safe;
}

export async function serverRotateSecret(key: string): Promise<DeveloperAppItem> {
  try {
    const res = await fetch(
      `${MOCK_SERVER_URL}/developer/api/apps/${encodeURIComponent(key)}/rotate-secret`,
      {
        method: 'POST',
        cache: 'no-store',
      },
    );
    if (res.ok) {
      return (await res.json()) as DeveloperAppItem;
    }
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    if (err?.message) throw new Error(err.message);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('fetch failed')) {
      throw error;
    }
  }

  const apps = readLocalApps();
  const index = apps.findIndex((a) => a.app_key === key);
  if (index === -1) throw new Error('Không tìm thấy ứng dụng.');
  const current = apps[index];
  if (!current) throw new Error('Không tìm thấy ứng dụng.');
  const now = new Date().toISOString();
  const updated: DeveloperAppItem = {
    ...current,
    app_secret: randomBytes(32).toString('hex'),
    updated_at: now,
  };
  apps[index] = updated;
  writeLocalApps(apps);
  return updated;
}
