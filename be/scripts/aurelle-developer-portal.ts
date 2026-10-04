import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';

interface DeveloperApp {
  app_key: string;
  app_secret: string;
  name: string;
  redirect_uri: string;
  created_at: string;
}

const directory = path.resolve(__dirname, '../.aurelle-local');
const filename = path.join(directory, 'apps.json');
let applications: DeveloperApp[] = existsSync(filename)
  ? JSON.parse(readFileSync(filename, 'utf8')) as DeveloperApp[]
  : [];

export function findDeveloperApp(key: string): DeveloperApp | undefined {
  return applications.find((application) => application.app_key === key);
}

export function mountDeveloperPortal(server: Express): void {
  server.use('/developer', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  server.get('/', (_req, res) => { res.redirect('/developer'); });
  server.get('/developer', (_req, res) => {
    res.sendFile(path.join(__dirname, 'aurelle-portal/index.html'));
  });
  server.get('/developer/style.css', (_req, res) => { res.sendFile(path.join(__dirname, 'aurelle-portal/style.css')); });
  server.get('/developer/portal.js', (_req, res) => { res.sendFile(path.join(__dirname, 'aurelle-portal/portal.js')); });
  server.get('/developer/api/apps', (_req, res) => {
    res.json(applications.map(({ app_secret: _secret, ...application }) => application));
  });
  server.post('/developer/api/apps', (req, res) => {
    // Same-origin browser requests only: another website cannot create credentials.
    const expectedOrigin = `http://${req.headers.host ?? ''}`;
    if (req.headers.origin !== expectedOrigin) {
      res.status(403).json({ message: 'Yêu cầu phải được gửi từ Developer Console.' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const redirect = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ message: 'Tên ứng dụng phải có từ 2 đến 80 ký tự.' });
      return;
    }
    try {
      const url = new URL(redirect);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash
        || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Invalid URL');
    } catch {
      res.status(400).json({ message: 'Callback cần dùng HTTPS hoặc HTTP trên localhost, không chứa mật khẩu hay fragment.' });
      return;
    }
    const application: DeveloperApp = {
      app_key: randomBytes(12).toString('hex'),
      app_secret: randomBytes(32).toString('hex'),
      name,
      redirect_uri: redirect,
      created_at: new Date().toISOString(),
    };
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(`${filename}.tmp`, JSON.stringify([...applications, application], null, 2), { encoding: 'utf8', mode: 0o600 });
      renameSync(`${filename}.tmp`, filename);
      applications = [...applications, application];
      res.status(201).json(application);
    } catch {
      res.status(500).json({ message: 'Không lưu được ứng dụng. Vui lòng thử lại.' });
    }
  });
}

export function secretsMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
