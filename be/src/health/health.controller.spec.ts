import type { Response } from 'express';
import type { Connection } from 'mongoose';
import type { RedisCacheService } from '../common/redis/redis-cache.service';
import { HealthController } from './health.controller';

interface Setup {
  controller: HealthController;
  res: Response;
  status: jest.Mock;
}

function setup(opts: {
  readyState: number;
  mongoPing?: () => Promise<unknown>;
  redisUp: boolean;
}): Setup {
  const ping = jest.fn(opts.mongoPing ?? (() => Promise.resolve({ ok: 1 })));
  const connection = {
    readyState: opts.readyState,
    db: { admin: () => ({ ping }) },
  } as unknown as Connection;
  const redis = {
    ping: jest.fn().mockResolvedValue(opts.redisUp),
  } as unknown as RedisCacheService;
  const status = jest.fn();
  const res = { status } as unknown as Response;
  return { controller: new HealthController(connection, redis), res, status };
}

describe('HealthController', () => {
  it('Mongo + Redis đều trả lời → 200 ok', async () => {
    const { controller, res, status } = setup({ readyState: 1, redisUp: true });
    const body = await controller.check(res);
    expect(body).toMatchObject({ status: 'ok', mongo: 'up', redis: 'up' });
    expect(status).not.toHaveBeenCalled();
  });

  it('Redis lỗi → 503 degraded', async () => {
    const { controller, res, status } = setup({
      readyState: 1,
      redisUp: false,
    });
    const body = await controller.check(res);
    expect(body).toMatchObject({
      status: 'degraded',
      mongo: 'up',
      redis: 'down',
    });
    expect(status).toHaveBeenCalledWith(503);
  });

  it('Mongo chưa kết nối → 503, không gọi ping', async () => {
    const { controller, res, status } = setup({ readyState: 0, redisUp: true });
    const body = await controller.check(res);
    expect(body.mongo).toBe('down');
    expect(status).toHaveBeenCalledWith(503);
  });

  it('Mongo ping lỗi → down', async () => {
    const { controller, res } = setup({
      readyState: 1,
      redisUp: true,
      mongoPing: () => Promise.reject(new Error('x')),
    });
    expect((await controller.check(res)).mongo).toBe('down');
  });
});
