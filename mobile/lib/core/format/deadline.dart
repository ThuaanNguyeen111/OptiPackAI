enum DeadlineTone { ok, soon, late }

class DeadlineLabel {
  const DeadlineLabel(this.text, this.tone);
  final String text;
  final DeadlineTone tone;
}

String formatRemain(Duration d) {
  final minutes = d.inSeconds.abs() <= 0 ? 1 : (d.inSeconds.abs() / 60).ceil();
  if (minutes < 60) return '$minutes phút';
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  return rest == 0 ? '$hours giờ' : '$hours giờ $rest phút';
}

/// Đếm ngược tới hạn đóng gói của đơn Hỏa Tốc. Còn ≤ 15 phút thì "soon", quá hạn thì "late".
DeadlineLabel deadlineLabel(DateTime deadline, DateTime now, {String what = 'đóng'}) {
  final remain = deadline.difference(now);
  final amount = formatRemain(remain);
  if (remain.inSeconds <= 0) {
    return DeadlineLabel('Quá hạn $what $amount', DeadlineTone.late);
  }
  final soon = remain <= const Duration(minutes: 15);
  return DeadlineLabel(
    'Còn $amount để $what',
    soon ? DeadlineTone.soon : DeadlineTone.ok,
  );
}
