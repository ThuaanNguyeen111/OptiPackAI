/// Hiển thị đơn vị theo quy ước chung với web: kích thước **cm** (tối đa 1 chữ số lẻ),
/// khối lượng **kg** (tối đa 2 chữ số lẻ), dấu phẩy thập phân (`0,15 kg`).
/// API/DB giữ nguyên mm và g; riêng picking list BE đã trả cm/kg.
String _trim(double value, int decimals) {
  var text = value.toStringAsFixed(decimals);
  if (text.contains('.')) {
    text = text.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  }
  return text.replaceAll('.', ',');
}

String formatCm(double cm) => _trim(cm, 1);

String formatKg(double kg) {
  // Số dương nhỏ làm tròn ra 0 thì giữ 3 chữ số lẻ để không hiện "0 kg".
  if (kg > 0 && double.parse(kg.toStringAsFixed(2)) == 0) return '${_trim(kg, 3)} kg';
  return '${_trim(kg, 2)} kg';
}

String formatDimsCm(double l, double w, double h) =>
    '${formatCm(l)} × ${formatCm(w)} × ${formatCm(h)} cm';

String formatGAsKg(num grams) => formatKg(grams / 1000);
