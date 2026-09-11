/**
 * ===================================================================
 * addBusinessHours() — Đơn Hỏa Tốc, giờ hành chính 8h-17h, TÍNH CẢ
 * THỨ 7, KHÔNG tính Chủ Nhật (đã xác nhận với user 2026-09-10).
 * ===================================================================
 * KHÔNG được cộng đơn giản `start + hours` — phải bỏ qua giờ ngoài
 * [8h,17h) và Chủ Nhật, cộng dồn sang ngày làm việc tiếp theo nếu
 * tràn giờ trong ngày. Test kỹ case biên (tạo đơn cuối giờ, cuối tuần)
 * — xem `add-business-hours.util.spec.ts`.
 * ===================================================================
 */
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 17;
const SUNDAY = 0;

function isBusinessDay(date: Date): boolean {
  return date.getDay() !== SUNDAY;
}

export function addBusinessHours(start: Date, hoursToAdd: number): Date {
  let remainingMinutes = hoursToAdd * 60;
  const current = new Date(start);

  // Nếu thời điểm bắt đầu NGOÀI giờ hành chính hoặc Chủ Nhật, nhảy
  // tới đúng 8h00 của ngày làm việc gần nhất kế tiếp trước khi cộng.
  const businessStartMinutes = BUSINESS_START_HOUR * 60;
  const businessEndMinutes = BUSINESS_END_HOUR * 60;
  const currentMinutesOfDay = current.getHours() * 60 + current.getMinutes();

  if (!isBusinessDay(current) || currentMinutesOfDay >= businessEndMinutes) {
    advanceToNextBusinessDayStart(current);
  } else if (currentMinutesOfDay < businessStartMinutes) {
    current.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  }

  while (remainingMinutes > 0) {
    const nowMinutesOfDay = current.getHours() * 60 + current.getMinutes();
    const minutesLeftToday = businessEndMinutes - nowMinutesOfDay;

    if (remainingMinutes <= minutesLeftToday) {
      current.setMinutes(current.getMinutes() + remainingMinutes);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= minutesLeftToday;
      advanceToNextBusinessDayStart(current);
    }
  }

  return current;
}

function advanceToNextBusinessDayStart(date: Date): void {
  do {
    date.setDate(date.getDate() + 1);
  } while (!isBusinessDay(date));
  date.setHours(BUSINESS_START_HOUR, 0, 0, 0);
}
