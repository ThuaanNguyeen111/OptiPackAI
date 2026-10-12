import { ExecutionContext, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { StorefrontAdminAuthService } from './storefront-admin-auth.service';
import { StorefrontAdminGuard, StorefrontAdminOriginGuard } from './storefront-admin.guard';

const secret = 'test-admin-secret-at-least-32-characters';
const email = 'admin@example.com';

function context(request: object): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
}

describe('storefront admin authentication', () => {
  const jwt = new JwtService();
  let auth: StorefrontAdminAuthService;

  beforeAll(async () => {
    auth = new StorefrontAdminAuthService(new ConfigService({ storefront: { admin: {
      email, passwordHash: await bcrypt.hash('admin-password', 4), jwtSecret: secret,
    } } }), jwt);
  });

  it('logs in with the configured account and verifies its session', async () => {
    const result = await auth.login(' ADMIN@example.com ', 'admin-password');
    expect(auth.verify(result.token)).toEqual({ email });
  });

  it('rejects incorrect passwords and emails', async () => {
    await expect(auth.login(email, 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.login('customer@example.com', 'admin-password')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not enable login without explicit configuration', async () => {
    const disabled = new StorefrontAdminAuthService(new ConfigService(), jwt);
    await expect(disabled.login(email, 'anything')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects expired, tampered, customer, and internal user tokens', () => {
    for (const type of ['customer', 'user']) {
      const token = jwt.sign({ sub: email, type }, { secret, audience: 'storefront-admin' });
      expect(() => auth.verify(token)).toThrow(UnauthorizedException);
    }
    const expired = jwt.sign({ sub: email, type: 'storefront-admin' }, { secret, audience: 'storefront-admin', expiresIn: -1 });
    const foreign = jwt.sign({ sub: email, type: 'storefront-admin' }, { secret: 'different-secret', audience: 'storefront-admin' });
    expect(() => auth.verify(expired)).toThrow(UnauthorizedException);
    expect(() => auth.verify(foreign)).toThrow(UnauthorizedException);
  });

  it('requires the dedicated admin cookie', async () => {
    const guard = new StorefrontAdminGuard(auth);
    const result = await auth.login(email, 'admin-password');
    expect(() => guard.canActivate(context({ headers: {} }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context({ headers: { cookie: `storefront_access_token=${result.token}` } }))).toThrow(UnauthorizedException);
    expect(guard.canActivate(context({ headers: { cookie: `storefront_admin_access_token=${result.token}` } }))).toBe(true);
  });

  it('allows trusted origins and rejects missing or hostile origins for writes', () => {
    const guard = new StorefrontAdminOriginGuard(new ConfigService({ NODE_ENV: 'production', CORS_ORIGIN: 'https://shop.example.com' }));
    expect(guard.canActivate(context({ method: 'GET', headers: {} }))).toBe(true);
    expect(guard.canActivate(context({ method: 'POST', headers: { origin: 'https://shop.example.com' } }))).toBe(true);
    expect(() => guard.canActivate(context({ method: 'POST', headers: {} }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({ method: 'DELETE', headers: { origin: 'https://evil.example.com' } }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({ method: 'POST', headers: { origin: 'http://localhost:3001' } }))).toThrow(ForbiddenException);
  });
});
