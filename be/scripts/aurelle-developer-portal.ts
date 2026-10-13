import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response, NextFunction } from 'express';

export type AppStatus = 'active' | 'revoked';

export interface DeveloperApp {
  app_key: string;
  app_secret: string;
  name: string;
  redirect_uri: string;
  status: AppStatus;
  created_at: string;
  updated_at?: string;
  revoked_at?: string | null;
}

const directory = path.resolve(__dirname, '../.aurelle-local');
const filename = path.join(directory, 'apps.json');

export function getApplications(): DeveloperApp[] {
  try {
    if (!existsSync(filename)) return [];
    const raw = readFileSync(filename, 'utf8');
    const parsed = JSON.parse(raw) as (DeveloperApp & { status?: AppStatus })[];
    // Chuẩn hóa bản ghi cũ: nếu chưa có status thì mặc định là 'active'
    return parsed.map((app) => ({
      ...app,
      status: app.status ?? 'active',
      revoked_at: app.revoked_at ?? null,
    }));
  } catch {
    return [];
  }
}

export function saveApplications(apps: DeveloperApp[]): boolean {
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(`${filename}.tmp`, JSON.stringify(apps, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(`${filename}.tmp`, filename);
    return true;
  } catch (error) {
    console.error('Lỗi lưu danh sách ứng dụng Aurelle:', error);
    return false;
  }
}

export function findDeveloperApp(key: string): DeveloperApp | undefined {
  const apps = getApplications();
  return apps.find((app) => app.app_key === key);
}

export function validateRedirectUri(redirect: string): boolean {
  try {
    const url = new URL(redirect);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
      return false;
    }
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function createDeveloperApp(name: string, redirect_uri: string): DeveloperApp {
  const apps = getApplications();
  const application: DeveloperApp = {
    app_key: randomBytes(12).toString('hex'),
    app_secret: randomBytes(32).toString('hex'),
    name: name.trim(),
    redirect_uri: redirect_uri.trim(),
    status: 'active',
    created_at: new Date().toISOString(),
  };
  saveApplications([...apps, application]);
  return application;
}

export function updateDeveloperApp(
  key: string,
  data: { name?: string; redirect_uri?: string },
): DeveloperApp | null {
  const apps = getApplications();
  const index = apps.findIndex((app) => app.app_key === key);
  if (index === -1) return null;

  const current = apps[index];
  if (!current) return null;
  const updated: DeveloperApp = {
    ...current,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : current.name,
    redirect_uri:
      typeof data.redirect_uri === 'string' && data.redirect_uri.trim()
        ? data.redirect_uri.trim()
        : current.redirect_uri,
    updated_at: new Date().toISOString(),
  };

  apps[index] = updated;
  saveApplications(apps);
  return updated;
}

export function deleteDeveloperApp(key: string): boolean {
  const apps = getApplications();
  const filtered = apps.filter((app) => app.app_key !== key);
  if (filtered.length === apps.length) return false;
  return saveApplications(filtered);
}

export function revokeDeveloperKey(key: string): DeveloperApp | null {
  const apps = getApplications();
  const index = apps.findIndex((app) => app.app_key === key);
  if (index === -1) return null;

  const current = apps[index];
  if (!current) return null;
  const now = new Date().toISOString();
  const updated: DeveloperApp = {
    ...current,
    status: 'revoked',
    revoked_at: now,
    updated_at: now,
  };

  apps[index] = updated;
  saveApplications(apps);
  return updated;
}

export function reactivateDeveloperKey(key: string): DeveloperApp | null {
  const apps = getApplications();
  const index = apps.findIndex((app) => app.app_key === key);
  if (index === -1) return null;

  const current = apps[index];
  if (!current) return null;
  const now = new Date().toISOString();
  const updated: DeveloperApp = {
    ...current,
    status: 'active',
    revoked_at: null,
    updated_at: now,
  };

  apps[index] = updated;
  saveApplications(apps);
  return updated;
}

export function rotateDeveloperSecret(key: string): DeveloperApp | null {
  const apps = getApplications();
  const index = apps.findIndex((app) => app.app_key === key);
  if (index === -1) return null;

  const current = apps[index];
  if (!current) return null;
  const now = new Date().toISOString();
  const updated: DeveloperApp = {
    ...current,
    app_secret: randomBytes(32).toString('hex'),
    updated_at: now,
  };

  apps[index] = updated;
  saveApplications(apps);
  return updated;
}

export function mountDeveloperPortal(server: Express): void {
  // CORS & Security headers for Developer Portal API
  server.use('/developer', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    // Cho phép gọi từ Storefront (:3001) hoặc chính mock server (:4000)
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Chuyển hướng / và /developer sang Storefront (:3001/developer)
  server.get('/', (_req, res) => {
    res.redirect('http://localhost:3001/developer');
  });

  server.get('/developer', (req, res) => {
    // Nếu có query ?legacy=true thì vẫn mở portal tĩnh cũ để dự phòng
    if (req.query.legacy === 'true') {
      res.sendFile(path.join(__dirname, 'aurelle-portal/index.html'));
      return;
    }
    res.redirect('http://localhost:3001/developer');
  });

  server.get('/developer/style.css', (_req, res) => {
    res.sendFile(path.join(__dirname, 'aurelle-portal/style.css'));
  });

  server.get('/developer/portal.js', (_req, res) => {
    res.sendFile(path.join(__dirname, 'aurelle-portal/portal.js'));
  });

  // GET /developer/api/apps — Lấy danh sách (ẩn app_secret)
  server.get('/developer/api/apps', (_req, res) => {
    const apps = getApplications();
    res.json(apps.map(({ app_secret: _secret, ...application }) => application));
  });

  // POST /developer/api/apps — Tạo ứng dụng mới
  server.post('/developer/api/apps', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const redirect = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';

    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ message: 'Tên ứng dụng phải có từ 2 đến 80 ký tự.' });
      return;
    }

    if (!validateRedirectUri(redirect)) {
      res.status(400).json({
        message: 'Callback cần dùng HTTPS hoặc HTTP trên localhost, không chứa mật khẩu hay fragment.',
      });
      return;
    }

    try {
      const application = createDeveloperApp(name, redirect);
      res.status(201).json(application);
    } catch {
      res.status(500).json({ message: 'Không lưu được ứng dụng. Vui lòng thử lại.' });
    }
  });

  // PATCH /developer/api/apps/:key — Sửa thông tin ứng dụng
  server.patch('/developer/api/apps/:key', (req, res) => {
    const { key } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const redirect = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : undefined;

    if (name !== undefined && (name.length < 2 || name.length > 80)) {
      res.status(400).json({ message: 'Tên ứng dụng phải có từ 2 đến 80 ký tự.' });
      return;
    }

    if (redirect !== undefined && !validateRedirectUri(redirect)) {
      res.status(400).json({
        message: 'Callback cần dùng HTTPS hoặc HTTP trên localhost, không chứa mật khẩu hay fragment.',
      });
      return;
    }

    const updated = updateDeveloperApp(key, { name, redirect_uri: redirect });
    if (!updated) {
      res.status(404).json({ message: 'Không tìm thấy ứng dụng với App Key đã cho.' });
      return;
    }

    const { app_secret: _secret, ...safeApp } = updated;
    res.json(safeApp);
  });

  // DELETE /developer/api/apps/:key — Xóa ứng dụng
  server.delete('/developer/api/apps/:key', (req, res) => {
    const { key } = req.params;
    const success = deleteDeveloperApp(key);
    if (!success) {
      res.status(404).json({ message: 'Không tìm thấy ứng dụng cần xóa.' });
      return;
    }
    res.json({ success: true, message: 'Đã xóa ứng dụng thành công.' });
  });

  // POST /developer/api/apps/:key/revoke — Thu hồi khóa API
  server.post('/developer/api/apps/:key/revoke', (req, res) => {
    const { key } = req.params;
    const updated = revokeDeveloperKey(key);
    if (!updated) {
      res.status(404).json({ message: 'Không tìm thấy ứng dụng.' });
      return;
    }
    const { app_secret: _secret, ...safeApp } = updated;
    res.json(safeApp);
  });

  // POST /developer/api/apps/:key/reactivate — Kích hoạt lại khóa API
  server.post('/developer/api/apps/:key/reactivate', (req, res) => {
    const { key } = req.params;
    const updated = reactivateDeveloperKey(key);
    if (!updated) {
      res.status(404).json({ message: 'Không tìm thấy ứng dụng.' });
      return;
    }
    const { app_secret: _secret, ...safeApp } = updated;
    res.json(safeApp);
  });

  // POST /developer/api/apps/:key/rotate-secret — Cấp lại Secret mới
  server.post('/developer/api/apps/:key/rotate-secret', (req, res) => {
    const { key } = req.params;
    const updated = rotateDeveloperSecret(key);
    if (!updated) {
      res.status(404).json({ message: 'Không tìm thấy ứng dụng.' });
      return;
    }
    // Trả về cả app_secret mới để người dùng cập nhật cấu hình
    res.json(updated);
  });
}

export function secretsMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
