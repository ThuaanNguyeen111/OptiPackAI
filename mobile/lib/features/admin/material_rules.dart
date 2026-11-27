/// Luật chọn vật tư chèn: nhãn, thân gửi lên BE và câu diễn giải. Giống web
/// (`PackagingMaterialsPage.tsx`) — sửa web thì sửa cả đây.
library;

import '../../core/json.dart';

const materialTypeLabels = {
  'foam_corner': 'Góc xốp',
  'corrugated_divider': 'Vách ngăn carton',
  'air_pillow': 'Túi khí',
  'bubble_wrap': 'Xốp hơi',
  'fragile_tape': 'Băng keo hàng dễ vỡ',
  'kraft_paper': 'Giấy kraft',
  'tissue_paper': 'Giấy pelure',
};

const ruleScopes = {
  'fragile': 'Hàng dễ vỡ',
  'shoes': 'Giày dép',
  'fragile_or_shoes': 'Dễ vỡ hoặc giày dép',
  'any': 'Mọi đơn',
  'bag': 'Túi xách',
  'dress_or_bag': 'Váy đầm hoặc túi xách',
};

const _ruleScopeNouns = {
  'fragile': 'hàng dễ vỡ',
  'shoes': 'giày dép',
  'fragile_or_shoes': 'hàng dễ vỡ hoặc giày dép',
  'any': 'hàng',
  'bag': 'túi xách',
  'dress_or_bag': 'váy đầm hoặc túi xách',
};

const ruleBases = {
  'per_unit': 'Theo mỗi món',
  'per_extra_unit': 'Theo mỗi món thêm',
  'per_carton': 'Theo mỗi thùng',
  'void_band': 'Theo độ trống thùng',
  'void_fill': 'Chèn kín theo thể tích',
};

/// AOFP-344: mặc định khi chọn chèn kín — kín 90%, gối hơi 800 ml.
const defaultTargetFillRatio = 0.9;
const defaultUnitFillMl = 800;

double _fillRatioOf(Map<String, dynamic> r) =>
    r['targetFillRatio'] is num ? (r['targetFillRatio'] as num).toDouble() : defaultTargetFillRatio;

int _unitFillOf(Map<String, dynamic> r) =>
    r['unitFillMl'] is num ? (r['unitFillMl'] as num).round() : defaultUnitFillMl;

int _percent(double ratio) => (ratio * 100).round();

/// Luật BE trả (camelCase) → thân gửi lên `PUT /packaging/materials/rules` (snake_case).
/// BE bắt buộc hai thông số chèn kín khi `basis = void_fill`.
Map<String, dynamic> ruleBody(Map<String, dynamic> r) => {
      'material_type': r['materialType'],
      'applies_to': r['appliesTo'],
      'min_units': r['minUnits'] ?? 1,
      'basis': r['basis'],
      'quantity': r['quantity'] ?? 0,
      if (r['basis'] == 'void_band')
        'void_bands': [
          for (final b in rowsOfBands(r))
            {'min_void_ratio': b['minVoidRatio'], 'quantity': b['quantity']},
        ],
      if (r['basis'] == 'void_fill') ...{
        'target_fill_ratio': _fillRatioOf(r),
        'unit_fill_ml': _unitFillOf(r),
      },
    };

List<Map<String, dynamic>> rowsOfBands(Map<String, dynamic>? r) => [
      if (r?['voidBands'] is List)
        for (final b in r!['voidBands'] as List) ?asMap(b),
    ];

/// Diễn giải một luật thành câu, khớp cách BE tính số lượng (material-selector.ts).
String describeRule(Map<String, dynamic> r) {
  final type = pickString(r, ['materialType']);
  final material = (materialTypeLabels[type] ?? type).toLowerCase();
  final scope = pickString(r, ['appliesTo']);
  final noun = _ruleScopeNouns[scope] ?? scope;
  final parcel = scope == 'any' ? 'Mỗi kiện' : 'Kiện có $noun';
  final quantity = pickInt(r, ['quantity']);
  var text = switch (pickString(r, ['basis'])) {
    'per_unit' => 'Mỗi món $noun dùng $quantity $material.',
    'per_extra_unit' => 'Từ món $noun thứ 2 trở đi, mỗi món thêm $quantity $material.',
    'per_carton' => '$parcel dùng $quantity $material.',
    'void_band' => _describeBands(parcel, material, rowsOfBands(r)),
    'void_fill' => '$parcel: chèn $material đến khi thùng kín ${_percent(_fillRatioOf(r))}%, '
        'mỗi cái lấp ${_unitFillOf(r)} ml.',
    _ => '',
  };
  final minUnits = pickInt(r, ['minUnits'], 1);
  if (minUnits > 1) text += ' Chỉ áp dụng khi kiện có từ $minUnits món $noun.';
  return text;
}

String _describeBands(String parcel, String material, List<Map<String, dynamic>> bands) {
  if (bands.isEmpty) return '$parcel: chưa khai mức độ trống.';
  final sorted = [...bands]..sort((a, b) => pickDouble(a, ['minVoidRatio']).compareTo(pickDouble(b, ['minVoidRatio'])));
  final steps = [
    for (final b in sorted)
      'trống từ ${_percent(pickDouble(b, ['minVoidRatio']))}% dùng ${pickInt(b, ['quantity'])} $material',
  ].join('; ');
  return '$parcel: thùng $steps. Trống dưới ${_percent(pickDouble(sorted.first, ['minVoidRatio']))}% thì không dùng.';
}
