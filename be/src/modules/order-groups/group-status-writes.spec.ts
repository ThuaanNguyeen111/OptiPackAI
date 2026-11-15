import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

//!=============================================
// 13/11/2026 — Trạng thái nhóm đơn chỉ được đổi qua
// OrderGroupsService.transitionFulfillmentStatus(): hàm đó kiểm bảng
// allowed-status-transitions, cập nhật có điều kiện theo __v, ghi lịch sử thao
// tác và xếp hàng báo trạng thái về sàn. Ghi thẳng `fulfillment_status` ở chỗ
// khác là bỏ qua cả 4 việc đó.
// Test quét mọi file .ts (trừ spec) trong src/ và chỉ cho phép các chỗ ghi
// trong ALLOWED. Thêm chỗ mới vào ALLOWED phải có lý do ghi ngay bên cạnh.
//!=============================================

/** "file:hàm" → lý do được ghi thẳng. */
const ALLOWED: Record<string, string> = {
  'modules/order-groups/order-groups.service.ts:transitionFulfillmentStatus': 'chính là cổng chuyển trạng thái',
  'modules/order-groups/order-group-regroup.service.ts:mergeGroups':
    'nhóm nguồn bị gộp → canceled cùng merged_into_group_id trong 1 transaction; assertRegroupable chỉ cho chờ/đang lấy, cả hai đều được sang canceled',
  'modules/order-groups/order-group-picking.service.ts:decidePartial':
    'thiếu hàng, chọn lấy lại: sang picking cùng pick_round + 1 trong 1 transaction; đã kiểm isValidStatusTransition ngay trước',
};

const SRC = join(__dirname, '..', '..');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) tsFiles(path, out);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(path);
  }
  return out;
}

// Ghi qua update ($set: { …fulfillment_status: … }) hoặc gán lên document rồi save().
// `query.fulfillment_status = …` là dựng bộ lọc đọc, không phải ghi.
const WRITE_PATTERNS = [/\$set\s*:\s*\{[^}]*?\bfulfillment_status\s*:/g, /(?<!\bquery)\.fulfillment_status\s*=(?!=)/g];

/** Tên method/hàm gần nhất phía trên vị trí ghi. */
function enclosingFunction(source: string, index: number): string {
  const before = source.slice(0, index);
  const re = /^\s*(?:(?:public|private|protected|static|async|export|function)\s+)*(\w+)\s*(?:<[^>\n]*>)?\s*\([^;\n]*$/gm;
  let name = '?';
  for (let m = re.exec(before); m; m = re.exec(before)) {
    const fn = m[1] ?? '?';
    if (!['if', 'for', 'while', 'switch', 'catch', 'return', 'await'].includes(fn)) name = fn;
  }
  return name;
}

function findWrites(): string[] {
  const found: string[] = [];
  for (const file of tsFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('fulfillment_status')) continue;
    const rel = relative(SRC, file).split(sep).join('/');
    for (const pattern of WRITE_PATTERNS) {
      for (const m of source.matchAll(pattern)) found.push(`${rel}:${enclosingFunction(source, m.index)}`);
    }
  }
  return found;
}

describe('ghi fulfillment_status của nhóm đơn', () => {
  const writes = findWrites();

  it('chỉ đi qua transitionFulfillmentStatus hoặc các chỗ đã ghi lý do', () => {
    expect(writes.filter((w) => !(w in ALLOWED))).toEqual([]);
  });

  it('mọi mục ALLOWED vẫn còn trong code (xoá mục đã hết dùng)', () => {
    expect(Object.keys(ALLOWED).filter((k) => !writes.includes(k))).toEqual([]);
  });
});

describe('mẫu nhận diện chỗ ghi', () => {
  const hits = (s: string): number => WRITE_PATTERNS.reduce((n, p) => n + [...s.matchAll(p)].length, 0);

  it('bắt được $set và gán lên document, bỏ qua lọc và so sánh', () => {
    expect(hits(`updateOne({ _id }, { $set: { note: 'x',\n fulfillment_status: 'packed' } })`)).toBe(1);
    expect(hits(`group.fulfillment_status = GroupFulfillmentStatus.PACKED;`)).toBe(1);
    expect(hits(`find({ fulfillment_status: 'picked' })`)).toBe(0);
    expect(hits(`query.fulfillment_status = filter.fulfillmentStatus;`)).toBe(0);
    expect(hits(`if (group.fulfillment_status === 'picked') {}`)).toBe(0);
  });
});
