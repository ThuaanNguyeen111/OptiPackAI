import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { Reflector } from '@nestjs/core';
import { CONFIGURABLE_ROLES, DEFAULT_ROLE_FEATURES, type Feature } from '../../common/enums/feature.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { FEATURES_KEY, resolveFeatureGate } from './feature-scope';

describe('resolveFeatureGate', () => {
  it('endpoint của nhân viên đóng gói → trang packing', () => {
    expect(resolveFeatureGate([UserRole.PACKAGING_STAFF, UserRole.ADMIN], ['packing', 'picking'])).toEqual(['packing']);
  });

  it('endpoint dùng chung nhiều trang → mọi trang khớp', () => {
    expect(
      resolveFeatureGate(
        [UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.ADMIN],
        ['packing', 'picking', 'shipping'],
      ),
    ).toEqual(['packing', 'picking']);
  });

  it('chỉ Admin → null (giữ @Roles)', () => {
    expect(resolveFeatureGate([UserRole.ADMIN], ['packing'])).toBeNull();
  });

  it('có role không trang nào trong phạm vi phủ được → null (giữ @Roles)', () => {
    expect(resolveFeatureGate([UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN], ['packing'])).toBeNull();
  });
});

/** Mọi controller thật: với ma trận mặc định, cổng trang phải cho đúng các role @Roles cũ. */
describe('Feature gate trên controller thật', () => {
  const reflector = new Reflector();

  function controllerFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return controllerFiles(full);
      return name.endsWith('.controller.ts') ? [full] : [];
    });
  }

  interface HandlerInfo {
    id: string;
    roles: UserRole[];
    gate: Feature[] | null;
  }

  const handlers: HandlerInfo[] = [];
  for (const file of controllerFiles(join(__dirname, '..'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const scope = reflector.get<Feature[] | undefined>(FEATURES_KEY, exported);
      if (!scope) continue;
      const proto = (exported as { prototype: object }).prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = Object.getOwnPropertyDescriptor(proto, name)?.value as unknown;
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const roles = reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [handler, exported]);
        if (!roles?.length) continue;
        handlers.push({ id: `${exported.name}.${name}`, roles, gate: resolveFeatureGate(roles, scope) });
      }
    }
  }

  it('tìm thấy endpoint gắn trang', () => {
    expect(handlers.filter((h) => h.gate).length).toBeGreaterThan(100);
  });

  it('ma trận mặc định không đổi quyền API của bất kỳ endpoint nào', () => {
    for (const h of handlers) {
      const gate = h.gate;
      if (!gate) continue;
      const allowed = CONFIGURABLE_ROLES.filter((r) => gate.some((f) => DEFAULT_ROLE_FEATURES[r].includes(f)));
      const before = h.roles.filter((r) => r !== UserRole.ADMIN);
      expect({ id: h.id, roles: [...allowed].sort() }).toEqual({ id: h.id, roles: [...before].sort() });
    }
  });

  // Endpoint có role không phải Admin mà không suy được trang → tắt trang không chặn được API này.
  // Danh sách cố định để thay đổi @Roles/@Features nào làm lọt endpoint khỏi cổng đều phải nhìn lại.
  it('các endpoint còn theo @Roles cứng (không bật/tắt được) là có chủ đích', () => {
    const ungated = handlers
      .filter((h) => !h.gate && h.roles.some((r) => r !== UserRole.ADMIN))
      .map((h) => `${h.id} [${h.roles.filter((r) => r !== UserRole.ADMIN).map((r) => UserRole[r]).join(',')}]`)
      .sort();
    expect(ungated).toMatchSnapshot();
  });
});
