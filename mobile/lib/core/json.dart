/// Đọc JSON từ BE một cách chịu lỗi. BE trả camelCase nhưng một số route còn snake_case,
/// nên hàm nhận nhiều khoá và lấy khoá đầu tiên có giá trị.
Map<String, dynamic>? asMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : null;

String? pickStringOrNull(Map<String, dynamic>? row, List<String> keys) {
  if (row == null) return null;
  for (final key in keys) {
    final v = row[key];
    if (v is String && v.isNotEmpty) return v;
  }
  return null;
}

String pickString(Map<String, dynamic>? row, List<String> keys, [String fallback = '']) =>
    pickStringOrNull(row, keys) ?? fallback;

int pickInt(Map<String, dynamic>? row, List<String> keys, [int fallback = 0]) {
  if (row == null) return fallback;
  for (final key in keys) {
    final v = row[key];
    if (v is num) return v.toInt();
  }
  return fallback;
}

double pickDouble(Map<String, dynamic>? row, List<String> keys, [double fallback = 0]) {
  if (row == null) return fallback;
  for (final key in keys) {
    final v = row[key];
    if (v is num) return v.toDouble();
  }
  return fallback;
}

bool pickBool(Map<String, dynamic>? row, List<String> keys) {
  if (row == null) return false;
  for (final key in keys) {
    if (row[key] == true) return true;
  }
  return false;
}

DateTime? pickDate(Map<String, dynamic>? row, List<String> keys) {
  final s = pickStringOrNull(row, keys);
  return s == null ? null : DateTime.tryParse(s);
}
