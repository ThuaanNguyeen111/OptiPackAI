import { readFileSync } from 'fs';
import { join } from 'path';
import { inspectGlb } from './glb-inspect';

const MODELS = join(__dirname, '../../../../fe/public/models');
const read = (file: string): Buffer => readFileSync(join(MODELS, file));

describe('inspectGlb (AOFP-352)', () => {
  it.each(['tshirt.glb', 'somi.glb', 'pants.glb', 'shorts.glb', 'dress.glb', 'bomber.glb'])(
    '%s: mô hình quần áo có sẵn đủ rig gập + túi zip',
    (file) => {
      const result = inspectGlb(read(file));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.hasFoldRig).toBe(true);
    },
  );

  it.each(['shoepack.glb', 'handbag.glb', 'materials/accessory_case.glb', 'materials/bubble_wrap.glb'])(
    '%s: hàng cứng không có rig gập, khối bao trong khoảng 1 cm – 2 m',
    (file) => {
      const result = inspectGlb(read(file));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.hasFoldRig).toBe(false);
      for (const v of [result.bbox.x, result.bbox.y, result.bbox.z]) {
        expect(v).toBeGreaterThan(0.005);
        expect(v).toBeLessThan(2);
      }
    },
  );

  it('từ chối file không phải GLB', () => {
    expect(inspectGlb(Buffer.from('not a model at all, just text'))).toEqual({ ok: false, reason: 'not_glb' });
  });

  it('từ chối glTF phiên bản khác 2', () => {
    const buf = Buffer.alloc(20);
    buf.write('glTF', 0, 'latin1');
    buf.writeUInt32LE(1, 4);
    expect(inspectGlb(buf)).toEqual({ ok: false, reason: 'bad_version' });
  });

  it('từ chối GLB không có mesh', () => {
    const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, nodes: [{ name: 'empty' }] }).padEnd(48, ' '));
    const head = Buffer.alloc(20);
    head.write('glTF', 0, 'latin1');
    head.writeUInt32LE(2, 4);
    head.writeUInt32LE(20 + json.length, 8);
    head.writeUInt32LE(json.length, 12);
    head.writeUInt32LE(0x4e4f534a, 16);
    expect(inspectGlb(Buffer.concat([head, json]))).toEqual({ ok: false, reason: 'no_mesh' });
  });
});
