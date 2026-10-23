/**
 * 23/10/2026 — THANH TIẾN TRÌNH ĐƠN cho khách AURELLE (trang "Chi tiết đơn" + nhãn ở "Lịch sử đơn").
 *
 * Trước đây trang đơn chỉ liệt kê các mốc đã xảy ra: mới đặt thì trống trơn, đóng gói mới hiện
 * khối hành trình, giao mới hiện mã vận đơn, cả chặng vận chuyển gộp 1 dòng "Đang giao hàng" —
 * khách thấy mỗi giai đoạn như một màn khác và không biết hàng đang ở đâu. Hàm này dựng 1 thanh
 * CỐ ĐỊNH 7 bước (luôn hiện đủ từ lúc đặt), đánh dấu bước đã qua / hiện tại / chưa tới, và nhánh
 * rẽ (hủy, giao thất bại, hoàn hàng). Hàm thuần — không đọc DB — để BE và test dùng chung.
 *
 * Bước hiện tại lấy từ `tracking_stage` (mốc giao mới nhất đối tác báo, có từ 23/10/2026); đơn cũ
 * không có thì suy từ `fulfillment_status` + các mốc trong hành trình → không cần sửa dữ liệu cũ.
 */

export const PROGRESS_STEPS = [
  { key: 'placed', label: 'Đặt hàng' },
  { key: 'processing', label: 'Đang chuẩn bị' },
  { key: 'packed', label: 'Đã đóng gói' },
  { key: 'shipped', label: 'Chờ hãng lấy hàng' },
  { key: 'in_transit', label: 'Đang vận chuyển' },
  { key: 'out_for_delivery', label: 'Đang giao tới bạn' },
  { key: 'delivered', label: 'Đã nhận hàng' },
] as const;

export type ProgressStepKey = (typeof PROGRESS_STEPS)[number]['key'];
export type ProgressStepState = 'done' | 'current' | 'upcoming' | 'problem' | 'skipped';
export type ProgressTone = 'info' | 'success' | 'warning' | 'danger';

export interface ProgressStep {
  key: ProgressStepKey;
  label: string;
  state: ProgressStepState;
  /** Thời điểm đạt bước (mốc đầu tiên của bước đó); null = chưa tới / không rõ. */
  at: Date | null;
}

export interface ProgressBranch {
  key: 'canceled' | 'failed_delivery' | 'shipped_back' | 'returned';
  label: string;
  reason: string | null;
  at: Date | null;
}

export interface OrderDisplayStatus {
  label: string;
  tone: ProgressTone;
  /** true = đơn đã xong (giao xong / hủy / hoàn xong) — website ngừng tự tải lại. */
  isFinal: boolean;
}

export interface OrderProgress {
  steps: ProgressStep[];
  branch: ProgressBranch | null;
  /** Câu ngắn giải thích bước hiện tại cho khách. */
  hint: string;
  displayStatus: OrderDisplayStatus;
}

export interface ProgressInput {
  status: string; // pending | confirmed | cancelled | completed
  cancelSource?: string | null;
  cancelReason?: string | null;
  fulfillmentStatus: string;
  trackingStage?: string | null;
  placedAt: Date | null;
  events?: { status: string; reason?: string | null; occurredAt: Date }[];
}

const STEP_INDEX: Record<string, number> = {
  placed: 0,
  awaiting_packaging: 0,
  processing: 1,
  packed: 2,
  shipped: 3,
  in_transit: 4,
  out_for_delivery: 5,
  failed_delivery: 5, // giao thất bại xảy ra ở chặng giao tới khách
  delivered: 6,
};

const HINTS: Record<ProgressStepKey, string> = {
  placed: 'Đơn đã được ghi nhận, kho sẽ sớm chuẩn bị hàng cho bạn.',
  processing: 'Kho đang lấy hàng cho đơn của bạn.',
  packed: 'Hàng đã đóng gói xong, đang chờ tạo vận đơn.',
  shipped: 'Đã tạo vận đơn — đơn vị vận chuyển sẽ đến lấy hàng.',
  in_transit: 'Đơn vị vận chuyển đã lấy hàng và đang chuyển tới khu vực của bạn.',
  out_for_delivery: 'Shipper đang giao hàng tới bạn — vui lòng để ý điện thoại.',
  delivered: 'Bạn đã nhận hàng. Cảm ơn bạn đã mua sắm tại AURELLE!',
};

/** Nhãn ngắn cho danh sách đơn / đầu trang chi tiết. */
const STAGE_STATUS: Record<ProgressStepKey, OrderDisplayStatus> = {
  placed: { label: 'Chờ xử lý', tone: 'info', isFinal: false },
  processing: { label: 'Đang chuẩn bị hàng', tone: 'info', isFinal: false },
  packed: { label: 'Đã đóng gói', tone: 'info', isFinal: false },
  shipped: { label: 'Chờ hãng lấy hàng', tone: 'info', isFinal: false },
  in_transit: { label: 'Đang vận chuyển', tone: 'info', isFinal: false },
  out_for_delivery: { label: 'Đang giao tới bạn', tone: 'info', isFinal: false },
  delivered: { label: 'Đã nhận hàng', tone: 'success', isFinal: true },
};

/** Bước hiện tại (0..6) theo dữ liệu đơn; đơn cũ không có tracking_stage → lấy mốc xa nhất đã có. */
function currentIndex(input: ProgressInput): number {
  const fromStage = input.trackingStage ? STEP_INDEX[input.trackingStage] : undefined;
  if (fromStage !== undefined) return fromStage;
  let index = STEP_INDEX[input.fulfillmentStatus] ?? 0;
  for (const event of input.events ?? []) {
    const i = STEP_INDEX[event.status];
    // Đơn cũ: chỉ dùng mốc hành trình để "đẩy tới" khi trạng thái giao vẫn là một bước thường.
    if (i !== undefined && i > index && input.fulfillmentStatus !== 'failed_delivery') index = i;
  }
  return index;
}

function firstAt(events: ProgressInput['events'], statuses: string[]): Date | null {
  const hit = (events ?? []).find((e) => statuses.includes(e.status));
  return hit ? hit.occurredAt : null;
}

function lastOf(events: ProgressInput['events'], status: string): { reason?: string | null; occurredAt: Date } | null {
  const list = (events ?? []).filter((e) => e.status === status);
  return list.length > 0 ? (list[list.length - 1] ?? null) : null;
}

export function buildOrderProgress(input: ProgressInput): OrderProgress {
  const events = [...(input.events ?? [])].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const sorted = { ...input, events };
  const reached = currentIndex(sorted);
  const atOf = (key: ProgressStepKey): Date | null => (key === 'placed' ? input.placedAt : firstAt(events, [key]));

  let branch: ProgressBranch | null = null;
  const cancelled = input.status === 'cancelled';
  if (cancelled) {
    const cancelEvent = lastOf(events, 'canceled') ?? lastOf(events, 'canceled_by_seller');
    branch = {
      key: 'canceled',
      label: input.cancelSource === 'seller' ? 'Người bán đã hủy đơn' : 'Đơn đã hủy',
      reason: input.cancelReason ?? cancelEvent?.reason ?? null,
      at: cancelEvent?.occurredAt ?? null,
    };
  } else if (input.fulfillmentStatus === 'failed_delivery') {
    const failed = lastOf(events, 'failed_delivery');
    branch = { key: 'failed_delivery', label: 'Giao hàng không thành công', reason: failed?.reason ?? null, at: failed?.occurredAt ?? null };
  } else if (input.fulfillmentStatus === 'shipped_back' || input.fulfillmentStatus === 'returned') {
    const key = input.fulfillmentStatus;
    const hit = lastOf(events, key);
    const failed = lastOf(events, 'failed_delivery');
    branch = {
      key,
      label: key === 'shipped_back' ? 'Đang hoàn trả về người bán' : 'Người bán đã nhận lại hàng',
      reason: hit?.reason ?? failed?.reason ?? null,
      at: hit?.occurredAt ?? null,
    };
  }

  // Hoàn hàng: hàng đã đi tới chặng giao (ít nhất "đang vận chuyển") rồi quay về.
  const reachedForBranch = branch?.key === 'shipped_back' || branch?.key === 'returned' ? Math.max(reached, 4) : reached;
  const steps: ProgressStep[] = PROGRESS_STEPS.map((step, index) => {
    let state: ProgressStepState;
    if (branch?.key === 'canceled') state = index <= reached ? 'done' : 'skipped';
    else if (branch?.key === 'failed_delivery') state = index < 5 ? 'done' : index === 5 ? 'problem' : 'upcoming';
    else if (branch) state = index < reachedForBranch ? 'done' : index === reachedForBranch ? 'problem' : 'skipped';
    else if (index < reached || (index === reached && step.key === 'delivered')) state = 'done';
    else state = index === reached ? 'current' : 'upcoming';
    const at = state === 'done' || state === 'current' || state === 'problem' ? atOf(step.key) : null;
    return { key: step.key, label: step.label, state, at };
  });

  const currentKey = PROGRESS_STEPS[reached]?.key ?? 'placed';
  let hint = HINTS[currentKey];
  let displayStatus = STAGE_STATUS[currentKey];
  if (branch?.key === 'canceled') {
    // Lý do đã hiện ở ô nhánh ngay dưới thanh → câu gợi ý nói tiếp chuyện tiền / bước sau.
    hint = 'Đơn sẽ không được giao. Nếu bạn đã thanh toán, tiền sẽ được hoàn theo phương thức thanh toán ban đầu.';
    displayStatus = { label: branch.label, tone: 'danger', isFinal: true };
  } else if (branch?.key === 'failed_delivery') {
    hint = 'Lần giao vừa rồi không thành công — đơn vị vận chuyển sẽ liên hệ để giao lại hoặc hoàn hàng về người bán.';
    displayStatus = { label: branch.label, tone: 'warning', isFinal: false };
  } else if (branch?.key === 'shipped_back') {
    hint = 'Đơn đang được hoàn trả về người bán sau khi giao không thành công.';
    displayStatus = { label: branch.label, tone: 'warning', isFinal: false };
  } else if (branch?.key === 'returned') {
    hint = 'Người bán đã nhận lại hàng hoàn. Nếu bạn đã thanh toán, tiền sẽ được hoàn theo phương thức ban đầu.';
    displayStatus = { label: branch.label, tone: 'danger', isFinal: true };
  }
  return { steps, branch, hint, displayStatus };
}

/** Nhãn ngắn cho danh sách đơn (không cần hành trình chi tiết). */
export function orderDisplayStatus(input: Omit<ProgressInput, 'events'>): OrderDisplayStatus {
  return buildOrderProgress({ ...input, events: [] }).displayStatus;
}
