/**
 * AOFP-352 — đọc file GLB (glTF 2.0 nhị phân) chỉ từ phần JSON, không cần WebGL hay thư viện ngoài.
 * glTF bắt buộc accessor POSITION có min/max nên khối bao tính được từ JSON + biến đổi của node.
 * Quy ước rig quần áo lấy từ các file có sẵn (fe/public/models/*.glb) và `clipPhases` ở FE.
 */

/** Node trong file quần áo bị ẩn trong thùng — trùng GARMENT_HIDDEN_NODES ở FE (product-models.ts). */
export const GARMENT_HIDDEN_NODES = new Set([
  'hand_press',
  'nilon_bag',
  'nilon_flap',
  'tape_doc',
  'tape_ngang',
  'shipping_label',
  'label_barcode',
]);
/** Túi zip trong file quần áo — trùng ZIPBAG_ROOT_NODE ở FE. */
export const ZIPBAG_ROOT_NODE = 'zipbag_bottom';

/** glTF dùng mét: nhỏ hơn 1 cm hoặc lớn hơn 2 m gần như chắc chắn là sai đơn vị. */
export const MIN_MODEL_SIZE_M = 0.01;
export const MAX_MODEL_SIZE_M = 2;

export type GlbInspection =
  | { ok: true; bbox: { x: number; y: number; z: number }; meshCount: number; hasFoldRig: boolean }
  | { ok: false; reason: 'not_glb' | 'bad_version' | 'bad_json' | 'no_mesh' };

type Mat = number[]; // 4x4 cột chính như glTF
interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
interface Gltf {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
  skins?: unknown[];
  animations?: { channels?: { target?: { node?: number; path?: string } }[] }[];
}

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat, b: Mat): Mat {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function localMatrix(node: GltfNode): Mat {
  if (node.matrix?.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [qx, qy, qz, qw] = [x ?? 0, y ?? 0, z ?? 0, w ?? 1];
  const [kx, ky, kz] = [sx ?? 1, sy ?? 1, sz ?? 1];
  return [
    (1 - 2 * (qy * qy + qz * qz)) * kx, 2 * (qx * qy + qz * qw) * kx, 2 * (qx * qz - qy * qw) * kx, 0,
    2 * (qx * qy - qz * qw) * ky, (1 - 2 * (qx * qx + qz * qz)) * ky, 2 * (qy * qz + qx * qw) * ky, 0,
    2 * (qx * qz + qy * qw) * kz, 2 * (qy * qz - qx * qw) * kz, (1 - 2 * (qx * qx + qy * qy)) * kz, 0,
    tx ?? 0, ty ?? 0, tz ?? 0, 1,
  ];
}

function transformPoint(m: Mat, p: [number, number, number]): [number, number, number] {
  const [x, y, z] = p;
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
  ];
}

function readJson(buffer: Buffer): Gltf | 'not_glb' | 'bad_version' | 'bad_json' {
  if (buffer.length < 20 || buffer.toString('latin1', 0, 4) !== 'glTF') return 'not_glb';
  if (buffer.readUInt32LE(4) !== 2) return 'bad_version';
  const chunkLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a || 20 + chunkLength > buffer.length) return 'bad_json'; // 'JSON'
  try {
    return JSON.parse(buffer.toString('utf8', 20, 20 + chunkLength)) as Gltf;
  } catch {
    return 'bad_json';
  }
}

/**
 * Rig quần áo = có skin, có clip xoay xương gập (mọi node trừ parcel, root, zip…, node ẩn — tên xương khác nhau
 * theo file: fold_*, fold1_*, S1L_N…) và có node túi zip. Khớp cách FE `clipPhases` tìm mốc gập/túi.
 */
function hasFoldRig(gltf: Gltf): boolean {
  const nodes = gltf.nodes ?? [];
  if ((gltf.skins ?? []).length === 0) return false;
  if (!nodes.some((n) => n.name === ZIPBAG_ROOT_NODE)) return false;
  return (gltf.animations ?? []).some((anim) =>
    (anim.channels ?? []).some((ch) => {
      if (ch.target?.path !== 'rotation' || ch.target.node === undefined) return false;
      const name = nodes[ch.target.node]?.name ?? '';
      return name !== 'parcel' && name !== 'root' && !name.startsWith('zip') && !GARMENT_HIDDEN_NODES.has(name);
    }),
  );
}

export function inspectGlb(buffer: Buffer): GlbInspection {
  const gltf = readJson(buffer);
  if (typeof gltf === 'string') return { ok: false, reason: gltf };
  const nodes = gltf.nodes ?? [];
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let meshCount = 0;
  const visit = (index: number, parent: Mat, depth: number): void => {
    const node = nodes[index];
    if (!node || depth > 64 || GARMENT_HIDDEN_NODES.has(node.name ?? '')) return;
    const world = multiply(parent, localMatrix(node));
    for (const prim of node.mesh === undefined ? [] : (gltf.meshes?.[node.mesh]?.primitives ?? [])) {
      const acc = prim.attributes?.POSITION === undefined ? undefined : gltf.accessors?.[prim.attributes.POSITION];
      if (!acc?.min || !acc.max) continue;
      meshCount += 1;
      for (const cx of [acc.min[0] ?? 0, acc.max[0] ?? 0]) {
        for (const cy of [acc.min[1] ?? 0, acc.max[1] ?? 0]) {
          for (const cz of [acc.min[2] ?? 0, acc.max[2] ?? 0]) {
            const p = transformPoint(world, [cx, cy, cz]);
            for (let k = 0; k < 3; k++) {
              min[k] = Math.min(min[k] ?? Infinity, p[k] ?? 0);
              max[k] = Math.max(max[k] ?? -Infinity, p[k] ?? 0);
            }
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  for (const root of roots) visit(root, IDENTITY, 0);
  if (meshCount === 0) return { ok: false, reason: 'no_mesh' };
  const size = (k: number): number => Math.round(((max[k] ?? 0) - (min[k] ?? 0)) * 10000) / 10000;
  return { ok: true, bbox: { x: size(0), y: size(1), z: size(2) }, meshCount, hasFoldRig: hasFoldRig(gltf) };
}
