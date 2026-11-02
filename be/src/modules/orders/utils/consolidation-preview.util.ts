import type { ConsolidationRule } from '../order-sync-policy';
import { computeRuleKey, isRuleExemptOrder } from './consolidation-rule.util';
import type { RuleKeyOrderInput } from './consolidation-rule.util';

/**
 * ===================================================================
 * XEM TRƯỚC QUY TẮC GỘP (31/10/2026) — mô phỏng trong bộ nhớ, KHÔNG ghi DB
 * ===================================================================
 * Duyệt đơn theo `created_at` tăng dần, mỗi đơn tìm đơn CŨ NHẤT trước nó cùng
 * platform + shop trùng khoá cơ bản (trong giới hạn chung) HOẶC trùng khoá của 1
 * quy tắc (trong giới hạn của quy tắc) — đúng thứ tự và điều kiện của
 * `OrdersService.tryConsolidate`. Bỏ qua điều kiện "nhóm còn mở" và việc nhóm cũ
 * không bị đổi → kết quả là ƯỚC LƯỢNG khi áp bộ quy tắc từ đầu trên tập đơn hiện có.
 * ===================================================================
 */

export interface PreviewOrderInput extends RuleKeyOrderInput {
  shop_id: string;
  consolidation_key: string;
  created_at: Date;
}

export interface SimulationOptions {
  enabled: boolean;
  timeWindowHours: number | null;
  rules: readonly ConsolidationRule[];
}

export interface PreviewExample {
  ruleNames: string[];
  platformOrderIds: string[];
  /** 3 số cuối SĐT (khác nhau) của các đơn trong nhóm; "***" khi bị che. */
  phoneLast3: string[];
}

export interface SimulationResult {
  groups: number;
  /** Số nhóm có ít nhất 1 đơn gộp vào NHỜ quy tắc (không trùng khoá cơ bản). */
  groupsMergedByRules: number;
  /** Theo rule.id: số đơn áp dụng được quy tắc nhưng thiếu/bị che dữ liệu → quy tắc bỏ qua. */
  skippedMissingData: Record<string, number>;
  examples: PreviewExample[];
}

interface IndexEntry {
  at: number;
  group: number;
}

const HOUR_MS = 3_600_000;
const MAX_EXAMPLES = 10;
const MAX_IDS_PER_EXAMPLE = 10;

function phoneLast3(phone: string | null | undefined): string {
  const raw = phone ?? '';
  if (raw.includes('*')) return '***';
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(-3) : '***';
}

/** Đơn cũ nhất trong `entries` (đã tăng dần theo at) có at ≥ since. */
function oldestSince(entries: IndexEntry[] | undefined, since: number): IndexEntry | null {
  if (!entries) return null;
  for (const e of entries) if (e.at >= since) return e;
  return null;
}

export function simulateConsolidation(ordersInput: readonly PreviewOrderInput[], opts: SimulationOptions): SimulationResult {
  const orders = [...ordersInput].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  const activeRules = opts.rules.filter((r) => r.enabled);
  const skipped: Record<string, number> = Object.fromEntries(activeRules.map((r) => [r.id, 0]));

  const index = new Map<string, IndexEntry[]>();
  const push = (key: string, entry: IndexEntry): void => {
    const list = index.get(key);
    if (list) list.push(entry);
    else index.set(key, [entry]);
  };
  const groupMembers: number[][] = [];
  const groupRules: Set<string>[] = [];

  orders.forEach((o, i) => {
    const at = o.created_at.getTime();
    const scope = `${o.platform}|${o.shop_id}`;
    const sinceFor = (hours: number | null): number => (hours === null ? -Infinity : at - hours * HOUR_MS);

    const ruleKeys: { rule: ConsolidationRule; key: string }[] = [];
    for (const rule of activeRules) {
      const key = computeRuleKey(o, rule);
      if (key !== null) ruleKeys.push({ rule, key: `${scope}|${key}` });
      else if (!isRuleExemptOrder(o) && (rule.platforms.length === 0 || rule.platforms.includes(o.platform))) {
        skipped[rule.id] = (skipped[rule.id] ?? 0) + 1;
      }
    }
    const baseKey = `${scope}|base|${o.consolidation_key}`;

    let best: IndexEntry | null = null;
    let viaRule: string | null = null;
    if (opts.enabled) {
      best = oldestSince(index.get(baseKey), sinceFor(opts.timeWindowHours));
      for (const { rule, key } of ruleKeys) {
        const hit = oldestSince(index.get(key), sinceFor(rule.maxWindowHours ?? opts.timeWindowHours));
        if (hit && (!best || hit.at < best.at)) {
          best = hit;
          viaRule = rule.name;
        }
      }
    }

    let group: number;
    if (best) {
      group = best.group;
      groupMembers[group]?.push(i);
      if (viaRule !== null) groupRules[group]?.add(viaRule);
    } else {
      group = groupMembers.length;
      groupMembers.push([i]);
      groupRules.push(new Set());
    }
    const entry = { at, group };
    push(baseKey, entry);
    for (const { key } of ruleKeys) push(key, entry);
  });

  const examples: PreviewExample[] = [];
  let groupsMergedByRules = 0;
  groupMembers.forEach((members, g) => {
    const rules = groupRules[g];
    if (!rules || rules.size === 0) return;
    groupsMergedByRules += 1;
    if (examples.length >= MAX_EXAMPLES) return;
    const groupOrders = members.map((i) => orders[i]).filter((o): o is PreviewOrderInput => o !== undefined);
    examples.push({
      ruleNames: [...rules],
      platformOrderIds: groupOrders.slice(0, MAX_IDS_PER_EXAMPLE).map((o) => o.platform_order_id),
      phoneLast3: [...new Set(groupOrders.map((o) => phoneLast3(o.recipient.phone)))],
    });
  });

  return { groups: groupMembers.length, groupsMergedByRules, skippedMissingData: skipped, examples };
}
