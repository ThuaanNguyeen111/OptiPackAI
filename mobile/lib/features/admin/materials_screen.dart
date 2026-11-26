import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/format/units.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'intake_sheet.dart';

const materialTypeLabels = {
  'foam_corner': 'Góc xốp',
  'corrugated_divider': 'Vách ngăn carton',
  'air_pillow': 'Túi khí',
  'bubble_wrap': 'Xốp hơi',
  'fragile_tape': 'Băng keo hàng dễ vỡ',
  'kraft_paper': 'Giấy kraft',
  'tissue_paper': 'Giấy pelure',
};

const _ruleScopes = {
  'fragile': 'Hàng dễ vỡ',
  'shoes': 'Giày',
  'fragile_or_shoes': 'Dễ vỡ hoặc giày',
  'any': 'Mọi hàng',
  'bag': 'Túi xách',
  'dress_or_bag': 'Đầm hoặc túi xách',
};

const _ruleBases = {
  'per_unit': 'Theo từng món',
  'per_extra_unit': 'Theo món thêm',
  'per_carton': 'Theo thùng',
  'void_band': 'Theo tỉ lệ khoảng trống',
};

enum _Tab { boxes, bags, cushions, reuse, rules }

const _tabLabels = {
  _Tab.boxes: 'Thùng',
  _Tab.bags: 'Túi zip',
  _Tab.cushions: 'Vật tư chèn',
  _Tab.reuse: 'Kho tái sử dụng',
  _Tab.rules: 'Quy tắc chọn',
};

/// Vật liệu đóng gói: thùng, túi, vật tư chèn, kho tái sử dụng và quy tắc chọn vật tư.
class MaterialsScreen extends ConsumerStatefulWidget {
  const MaterialsScreen({super.key});

  @override
  ConsumerState<MaterialsScreen> createState() => _MaterialsScreenState();
}

class _MaterialsScreenState extends ConsumerState<MaterialsScreen> {
  final _list = GlobalKey<LoadListState<Map<String, dynamic>>>();
  _Tab _tab = _Tab.boxes;

  ApiClient get _api => ref.read(apiClientProvider);
  Future<void> _reload() async => _list.currentState?.reload();

  Future<Map<String, dynamic>> _load() async {
    switch (_tab) {
      case _Tab.boxes:
        return {'rows': rowsOf(await _api.get('/packaging/boxes', query: {'active': 'false'}))};
      case _Tab.bags:
        return {'rows': rowsOf(await _api.get('/packaging/bags', query: {'active': 'false'}))};
      case _Tab.cushions:
        return {'rows': rowsOf(await _api.get('/packaging/materials', query: {'active': 'false'}))};
      case _Tab.reuse:
        Object? savings;
        try {
          savings = await _api.get('/packaging-materials/savings');
        } catch (_) {}
        return {
          'rows': rowsOf(await _api.get('/packaging-materials', query: {'include_inactive': 'true'})),
          'savings': savings,
        };
      case _Tab.rules:
        return asMap(await _api.get('/packaging/materials/rules')) ?? {};
    }
  }

  Future<void> _run(Future<Object?> Function() call, String success) async {
    if (await runAction(context, () async => call(), success: success)) await _reload();
  }

  static Map<String, num> _size(Map<String, dynamic> v, String prefix) => {
        'length_mm': ((v.remove('${prefix}_l') as num) * 10).round(),
        'width_mm': ((v.remove('${prefix}_w') as num) * 10).round(),
        'height_mm': ((v.remove('${prefix}_h') as num) * 10).round(),
      };

  static List<FormFieldSpec> _sizeFields(String prefix, String label, Map<String, dynamic>? d) {
    Object? cm(String key) => d == null ? null : pickDouble(d, [key]) / 10;
    return [
      FormFieldSpec('${prefix}_l', '$label: dài (cm)', type: FieldType.decimal, required: true, initial: cm('lengthMm')),
      FormFieldSpec('${prefix}_w', '$label: rộng (cm)', type: FieldType.decimal, required: true, initial: cm('widthMm')),
      FormFieldSpec('${prefix}_h', '$label: cao (cm)', type: FieldType.decimal, required: true, initial: cm('heightMm')),
    ];
  }

  Future<void> _editBox(Map<String, dynamic>? b) async {
    final v = await showFormSheet(context, title: b == null ? 'Thêm thùng' : 'Sửa thùng ${b['code']}', fields: [
      if (b == null) const FormFieldSpec('code', 'Mã thùng', required: true),
      FormFieldSpec('name', 'Tên', required: true, initial: b?['name']),
      ..._sizeFields('inner', 'Lòng trong', asMap(b?['inner'])),
      ..._sizeFields('outer', 'Phủ ngoài', asMap(b?['outer'])),
      FormFieldSpec('tare', 'Bì thùng (kg)',
          type: FieldType.decimal, required: true, initial: b == null ? null : pickDouble(b, ['tareG']) / 1000),
      FormFieldSpec('load', 'Tải tối đa (kg)',
          type: FieldType.decimal, required: true, initial: b == null ? null : pickDouble(b, ['maxLoadG']) / 1000),
      FormFieldSpec('price_vnd', 'Giá (đ)', type: FieldType.integer, initial: b?['priceVnd']),
      FormFieldSpec('reorder_level', 'Mức cảnh báo tồn', type: FieldType.integer, initial: b?['reorderLevel']),
      FormFieldSpec('storage_location', 'Vị trí cất', initial: b?['storageLocation']),
    ]);
    if (v == null || !mounted) return;
    final body = {
      ...v,
      'inner': _size(v, 'inner'),
      'outer': _size(v, 'outer'),
      'tare_g': ((v['tare'] as num) * 1000).round(),
      'max_load_g': ((v['load'] as num) * 1000).round(),
    }
      ..removeWhere((k, _) => k == 'tare' || k == 'load' || k.startsWith('inner_') || k.startsWith('outer_'));
    await _run(() => b == null ? _api.post('/packaging/boxes', body: body) : _api.patch('/packaging/boxes/${b['id']}', body: body),
        'Đã lưu thùng.');
  }

  Future<void> _editBag(Map<String, dynamic>? b) async {
    final v = await showFormSheet(context, title: b == null ? 'Thêm túi zip' : 'Sửa túi ${b['code']}', fields: [
      if (b == null) const FormFieldSpec('code', 'Mã túi', required: true),
      FormFieldSpec('name', 'Tên', required: true, initial: b?['name']),
      FormFieldSpec('width', 'Rộng khi trải phẳng (cm)',
          type: FieldType.decimal, required: true, initial: b == null ? null : pickDouble(b, ['widthMm']) / 10),
      FormFieldSpec('length', 'Dài khi trải phẳng (cm)',
          type: FieldType.decimal, required: true, initial: b == null ? null : pickDouble(b, ['lengthMm']) / 10),
      FormFieldSpec('price_vnd', 'Giá (đ)', type: FieldType.integer, initial: b?['priceVnd']),
      FormFieldSpec('reorder_level', 'Mức cảnh báo tồn', type: FieldType.integer, initial: b?['reorderLevel']),
    ]);
    if (v == null || !mounted) return;
    v['width_mm'] = ((v.remove('width') as num) * 10).round();
    v['length_mm'] = ((v.remove('length') as num) * 10).round();
    await _run(() => b == null ? _api.post('/packaging/bags', body: v) : _api.patch('/packaging/bags/${b['id']}', body: v),
        'Đã lưu túi.');
  }

  Future<void> _editCushion(Map<String, dynamic>? m) async {
    final v = await showFormSheet(context, title: m == null ? 'Thêm vật tư chèn' : 'Sửa ${m['code']}', fields: [
      if (m == null) ...[
        const FormFieldSpec('code', 'Mã vật tư', required: true),
        const FormFieldSpec('type', 'Loại', type: FieldType.choice, required: true, options: materialTypeLabels),
      ],
      FormFieldSpec('name', 'Tên', required: true, initial: m?['name']),
      FormFieldSpec('unit', 'Đơn vị', required: true, initial: m?['unit'] ?? 'cái'),
      FormFieldSpec('weight', 'Khối lượng 1 đơn vị (kg)',
          type: FieldType.decimal, required: true, initial: m == null ? null : pickDouble(m, ['weightGPerUnit']) / 1000),
      FormFieldSpec('price_vnd_per_unit', 'Giá 1 đơn vị (đ)',
          type: FieldType.integer, required: true, initial: m?['priceVndPerUnit']),
      FormFieldSpec('reorder_level', 'Mức cảnh báo tồn', type: FieldType.integer, initial: m?['reorderLevel']),
      FormFieldSpec('storage_location', 'Vị trí cất', initial: m?['storageLocation']),
      FormFieldSpec('reusable', 'Tái sử dụng được', type: FieldType.toggle, initial: m?['reusable']),
    ]);
    if (v == null || !mounted) return;
    v['weight_g_per_unit'] = ((v.remove('weight') as num) * 1000).round();
    await _run(
        () => m == null ? _api.post('/packaging/materials', body: v) : _api.patch('/packaging/materials/${m['id']}', body: v),
        'Đã lưu vật tư.');
  }

  Future<void> _stockIn(String path, String name) async {
    final body = await showIntakeSheet(context, title: 'Nhập $name');
    if (body == null || !mounted) return;
    await _run(() => _api.post(path, body: body), 'Đã nhập kho.');
  }

  Future<void> _movements(String path, String name) => openPage(
        context,
        SubPage(
          title: 'Sổ xuất nhập $name',
          child: LoadList<List<Map<String, dynamic>>>(
            load: () async => rowsOf(await _api.get(path), 'movements'),
            builder: (_, rows, _) => [
              if (rows.isEmpty) emptyNote('Chưa có dòng nào.'),
              for (final r in rows)
                RecordCard(
                  title: '${pickInt(r, ['delta', 'quantity']) > 0 ? '+' : ''}${pickInt(r, ['delta', 'quantity'])} · '
                      '${pickString(r, ['reason', 'type'])}',
                  lines: [
                    if (r['balanceAfter'] != null) 'Còn ${r['balanceAfter']}',
                    pickString(r, ['note']),
                    dateTimeText(r['createdAt']),
                  ],
                ),
            ],
          ),
        ),
      );

  Widget _stockCard(Map<String, dynamic> r, List<String> lines, String base, Future<void> Function() edit) {
    final active = r['isActive'] != false;
    final id = pickString(r, ['id']);
    final onHand = pickInt(r, ['quantityOnHand']);
    final low = onHand <= pickInt(r, ['reorderLevel']);
    return RecordCard(
      title: '${r['code']} · ${r['name']}',
      lines: [...lines, 'Tồn $onHand · mức cảnh báo ${pickInt(r, ['reorderLevel'])}'],
      pills: [
        if (!active) Pill('Đã tắt', AppColors.inkSubtle),
        if (active && low) Pill(onHand == 0 ? 'Hết hàng' : 'Sắp hết', onHand == 0 ? AppColors.danger : AppColors.warning),
      ],
      actions: [
        CardAction('Nhập kho', () => _stockIn('$base/$id/stock-in', '${r['code']}'), icon: Icons.add_box_outlined),
        CardAction('Sửa', edit, icon: Icons.edit_outlined),
        CardAction('Sổ xuất nhập', () => _movements('$base/$id/movements', '${r['code']}'), icon: Icons.list_alt),
        CardAction(active ? 'Tắt' : 'Bật lại',
            () => _run(() => _api.patch('$base/$id', body: {'is_active': !active}), active ? 'Đã tắt.' : 'Đã bật lại.'),
            icon: active ? Icons.toggle_off_outlined : Icons.toggle_on_outlined, danger: active),
      ],
    );
  }

  Future<void> _reuseForm(Map<String, dynamic> m, String action) async {
    final code = Uri.encodeComponent(pickString(m, ['code']));
    if (action == 'purchase') {
      await _stockIn('/packaging-materials/$code/purchase', '${m['code']}');
      return;
    }
    final v = await showFormSheet(context, title: 'Xuất dùng nội bộ (hạng B)', fields: const [
      FormFieldSpec('quantity', 'Số lượng', type: FieldType.integer, required: true),
      FormFieldSpec('purpose', 'Mục đích', required: true),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.post('/packaging-materials/$code/internal-use', body: v), 'Đã ghi xuất dùng.');
  }

  Future<void> _editReorder(Map<String, dynamic> m) async {
    final v = await showFormSheet(context, title: 'Sửa ${m['code']}', fields: [
      FormFieldSpec('name', 'Tên', required: true, initial: m['name']),
      FormFieldSpec('unit_cost_vnd', 'Đơn giá mua mới (đ)',
          type: FieldType.integer, required: true, initial: m['unitCostVnd']),
      FormFieldSpec('reorder_level', 'Mức cảnh báo tồn', type: FieldType.integer, initial: m['reorderLevel']),
      FormFieldSpec('max_reuse_cycles', 'Số lần tái sử dụng tối đa',
          type: FieldType.integer, initial: m['maxReuseCycles']),
      FormFieldSpec('reusable', 'Tái sử dụng được', type: FieldType.toggle, initial: m['reusable']),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.patch('/packaging-materials/${Uri.encodeComponent('${m['code']}')}', body: v), 'Đã lưu.');
  }

  // ---- Quy tắc chọn vật tư ----

  static Map<String, dynamic> _ruleBody(Map<String, dynamic> r) => {
        'material_type': r['materialType'],
        'applies_to': r['appliesTo'],
        'min_units': r['minUnits'],
        'basis': r['basis'],
        'quantity': r['quantity'],
        if (r['basis'] == 'void_band')
          'void_bands': [
            for (final b in rowsOf(r['voidBands']))
              {'min_void_ratio': b['minVoidRatio'], 'quantity': b['quantity']},
          ],
      };

  Future<void> _saveRules(List<Map<String, dynamic>> bodies) =>
      _run(() => _api.put('/packaging/materials/rules', body: {'rules': bodies}), 'Đã lưu quy tắc.');

  Future<void> _editRule(List<Map<String, dynamic>> rules, int? index) async {
    final r = index == null ? null : rules[index];
    final bands = [
      for (final b in rowsOf(r?['voidBands']))
        '${(pickDouble(b, ['minVoidRatio']) * 100).round()}:${pickInt(b, ['quantity'])}',
    ].join(', ');
    final v = await showFormSheet(context, title: index == null ? 'Thêm quy tắc' : 'Sửa quy tắc', fields: [
      FormFieldSpec('material_type', 'Vật tư',
          type: FieldType.choice, required: true, options: materialTypeLabels, initial: r?['materialType']),
      FormFieldSpec('applies_to', 'Áp cho', type: FieldType.choice, required: true, options: _ruleScopes, initial: r?['appliesTo']),
      FormFieldSpec('basis', 'Cách tính', type: FieldType.choice, required: true, options: _ruleBases, initial: r?['basis']),
      FormFieldSpec('quantity', 'Số lượng', type: FieldType.integer, initial: r?['quantity']),
      FormFieldSpec('min_units', 'Áp khi có ít nhất (món)', type: FieldType.integer, initial: r?['minUnits']),
      FormFieldSpec('bands', 'Dải khoảng trống (chỉ cho cách tính theo khoảng trống)',
          initial: bands, hint: 'Dạng %:số lượng, VD 50:2, 70:4'),
    ]);
    if (v == null || !mounted) return;
    final text = (v.remove('bands') as String?) ?? '';
    if (v['basis'] == 'void_band') {
      final parsed = <Map<String, dynamic>>[];
      for (final part in text.split(',')) {
        final pair = part.split(':');
        final ratio = pair.length == 2 ? num.tryParse(pair[0].trim()) : null;
        final qty = pair.length == 2 ? int.tryParse(pair[1].trim()) : null;
        if (ratio == null || qty == null) {
          showToast(context, 'Dải khoảng trống phải theo dạng 50:2, 70:4.', error: true);
          return;
        }
        parsed.add({'min_void_ratio': ratio / 100, 'quantity': qty});
      }
      v['void_bands'] = parsed;
    }
    final bodies = [for (final x in rules) _ruleBody(x)];
    if (index == null) {
      bodies.add(v);
    } else {
      bodies[index] = v;
    }
    await _saveRules(bodies);
  }

  List<Widget> _content(Map<String, dynamic> data) {
    final rows = rowsOf(data['rows']);
    switch (_tab) {
      case _Tab.boxes:
        return [
          for (final b in rows)
            _stockCard(b, [
              'Lòng ${_dims(asMap(b['inner']))} · phủ ngoài ${_dims(asMap(b['outer']))}',
              'Bì ${formatGAsKg(pickInt(b, ['tareG']))} · tải ${formatGAsKg(pickInt(b, ['maxLoadG']))}'
                  '${b['priceVnd'] == null ? '' : ' · ${formatVnd(pickDouble(b, ['priceVnd']))}'}',
              if (b['reserved'] != null) 'Giữ chỗ ${b['reserved']} · còn dùng được ${b['available']}',
              pickString(b, ['storageLocation']),
            ], '/packaging/boxes', () => _editBox(b)),
        ];
      case _Tab.bags:
        return [
          for (final b in rows)
            _stockCard(b, [
              'Trải phẳng ${formatCm(pickDouble(b, ['widthMm']) / 10)} × ${formatCm(pickDouble(b, ['lengthMm']) / 10)} cm',
            ], '/packaging/bags', () => _editBag(b)),
        ];
      case _Tab.cushions:
        return [
          for (final m in rows)
            _stockCard(m, [
              materialTypeLabels[m['type']] ?? '${m['type']}',
              '${formatGAsKg(pickDouble(m, ['weightGPerUnit']))}/${m['unit']} · ${formatVnd(pickDouble(m, ['priceVndPerUnit']))}',
              'Mới ${pickInt(m, ['quantityNew'])} · tái sử dụng ${pickInt(m, ['quantityReused'])}',
            ], '/packaging/materials', () => _editCushion(m)),
        ];
      case _Tab.reuse:
        final savings = asMap(data['savings']);
        return [
          if (savings != null)
            RecordCard(
              title: 'Tiết kiệm nhờ tái sử dụng',
              lines: [
                for (final e in savings.entries)
                  if (e.value is num) '${e.key}: ${e.value}',
              ],
            ),
          for (final m in rows)
            RecordCard(
              title: '${m['code']} · ${m['name']}',
              lines: [
                'Mới ${pickInt(m, ['qtyNew'])} · tái sử dụng ${pickInt(m, ['qtyReused'])} · nội bộ ${pickInt(m, ['qtyInternal'])}',
                'Mức cảnh báo ${pickInt(m, ['reorderLevel'])}',
              ],
              pills: [if (m['isActive'] == false) Pill('Đã tắt', AppColors.inkSubtle)],
              actions: [
                CardAction('Mua thêm', () => _reuseForm(m, 'purchase'), icon: Icons.add_box_outlined),
                CardAction('Xuất dùng nội bộ', () => _reuseForm(m, 'internal'), icon: Icons.outbox_outlined),
                CardAction('Sửa', () => _editReorder(m), icon: Icons.edit_outlined),
                CardAction(
                  m['isActive'] == false ? 'Bật lại' : 'Tắt',
                  () => _run(
                      () => m['isActive'] == false
                          ? _api.post('/packaging-materials/${m['code']}/reactivate')
                          : _api.delete('/packaging-materials/${m['code']}'),
                      'Đã cập nhật.'),
                  icon: Icons.power_settings_new,
                ),
              ],
            ),
        ];
      case _Tab.rules:
        final rules = rowsOf(data['rules']);
        return [
          Text(data['isDefault'] == true ? 'Đang dùng bộ quy tắc mặc định.' : 'Phiên bản ${data['version']}',
              style: TextStyle(color: AppColors.inkSubtle)),
          const SizedBox(height: 8),
          for (var i = 0; i < rules.length; i++)
            RecordCard(
              title: materialTypeLabels[rules[i]['materialType']] ?? '${rules[i]['materialType']}',
              lines: [
                '${_ruleScopes[rules[i]['appliesTo']] ?? rules[i]['appliesTo']} · '
                    '${_ruleBases[rules[i]['basis']] ?? rules[i]['basis']}'
                    '${rules[i]['quantity'] == null ? '' : ' · ${rules[i]['quantity']}'}',
              ],
              actions: [
                CardAction('Sửa', () => _editRule(rules, i), icon: Icons.edit_outlined),
                CardAction(
                    'Xóa',
                    () => _saveRules([
                          for (var j = 0; j < rules.length; j++)
                            if (j != i) _ruleBody(rules[j]),
                        ]),
                    icon: Icons.delete_outline,
                    danger: true),
              ],
            ),
          FilledButton.tonal(onPressed: () => _editRule(rules, null), child: const Text('Thêm quy tắc')),
        ];
    }
  }

  static String _dims(Map<String, dynamic>? d) => formatDimsCm(
      pickDouble(d, ['lengthMm']) / 10, pickDouble(d, ['widthMm']) / 10, pickDouble(d, ['heightMm']) / 10);

  @override
  Widget build(BuildContext context) {
    final addable = const {_Tab.boxes, _Tab.bags, _Tab.cushions}.contains(_tab);
    return SubPage(
      title: 'Vật liệu đóng gói',
      floatingAction: addable
          ? FloatingActionButton.extended(
              onPressed: () => switch (_tab) {
                _Tab.boxes => _editBox(null),
                _Tab.bags => _editBag(null),
                _ => _editCushion(null),
              },
              icon: const Icon(Icons.add),
              label: const Text('Thêm'),
            )
          : null,
      child: LoadList<Map<String, dynamic>>(
        key: _list,
        resetKey: _tab,
        load: _load,
        header: [
          chipRow<_Tab>(
              [for (final e in _tabLabels.entries) (e.key, e.value)], _tab, (t) => setState(() => _tab = t)),
          const SizedBox(height: 8),
        ],
        builder: (context, data, _) => _content(data),
      ),
    );
  }
}
