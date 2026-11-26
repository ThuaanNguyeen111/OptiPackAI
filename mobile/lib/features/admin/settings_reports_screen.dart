import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';

/// Cài đặt đóng gói & kết nối AI.
class PackingSettingsScreen extends ConsumerStatefulWidget {
  const PackingSettingsScreen({super.key});

  @override
  ConsumerState<PackingSettingsScreen> createState() => _PackingSettingsScreenState();
}

class _PackingSettingsScreenState extends ConsumerState<PackingSettingsScreen> {
  final _list = GlobalKey<LoadListState<(Map<String, dynamic>, Map<String, dynamic>?)>>();

  ApiClient get _api => ref.read(apiClientProvider);

  /// BE bọc dữ liệu trong `{ settings }` ở một số route.
  static Map<String, dynamic> _unwrap(Object? raw) {
    final m = asMap(raw) ?? {};
    return asMap(m['settings']) ?? m;
  }

  Future<(Map<String, dynamic>, Map<String, dynamic>?)> _load() async {
    final packing = _unwrap(await _api.get('/packing/settings'));
    Map<String, dynamic>? ai;
    try {
      ai = _unwrap(await _api.get('/ai-settings'));
    } catch (_) {}
    return (packing, ai);
  }

  Future<void> _run(Future<Object?> Function() call, String success) async {
    await runAction(context, () async => call(), success: success);
    await _list.currentState?.reload();
  }

  /// Khóa BE trả về (camelCase) → khóa gửi lên (snake_case).
  static const _numberFields = [
    ('abnormalWeightThreshold', 'abnormal_weight_threshold', 'Ngưỡng lệch cân (0,2 = 20%)', FieldType.decimal),
    ('fragileCushionMm', 'fragile_cushion_mm', 'Đệm hàng dễ vỡ (mm mỗi bên)', FieldType.integer),
    ('maxParcelsPerOrder', 'max_parcels_per_order', 'Số kiện tối đa mỗi đơn', FieldType.integer),
    ('mailerMarginWidthMm', 'mailer_margin_width_mm', 'Túi niêm phong: chừa rộng (mm)', FieldType.integer),
    ('mailerMarginLengthMm', 'mailer_margin_length_mm', 'Túi niêm phong: chừa dài (mm)', FieldType.integer),
    ('mailerMaxThicknessMm', 'mailer_max_thickness_mm', 'Túi niêm phong: dày tối đa (mm)', FieldType.integer),
    ('splitMinSavingVnd', 'split_min_saving_vnd', 'Chỉ tách kiện khi tiết kiệm từ (đ)', FieldType.integer),
    ('estFeeFirstStepVnd', 'est_fee_first_step_vnd', 'Cước ước tính nấc đầu (đ)', FieldType.integer),
    ('estFeePerExtraStepVnd', 'est_fee_per_extra_step_vnd', 'Cước mỗi nấc thêm (đ)', FieldType.integer),
  ];

  static const _toggles = [
    ('requireScan', 'require_scan', 'Bắt quét khi đóng gói'),
    ('requireSealPhoto', 'require_seal_photo', 'Bắt chụp ảnh khi niêm phong'),
    ('allowReusedBoxForFragile', 'allow_reused_box_for_fragile', 'Cho dùng thùng tái sử dụng với hàng dễ vỡ'),
    ('mailerEnabled', 'mailer_enabled', 'Dùng túi niêm phong'),
  ];

  Future<void> _editPacking(Map<String, dynamic> s) async {
    final v = await showFormSheet(context, title: 'Cài đặt đóng gói', fields: [
      for (final (camel, snake, label, type) in _numberFields)
        if (s.containsKey(camel)) FormFieldSpec(snake, label, type: type, initial: s[camel]),
      for (final (camel, snake, label) in _toggles)
        if (s.containsKey(camel)) FormFieldSpec(snake, label, type: FieldType.toggle, initial: s[camel]),
      FormFieldSpec('default_prefer', 'Mục tiêu mặc định',
          type: FieldType.choice,
          options: const {'fewest_parcels': 'Ít kiện nhất', 'cheapest': 'Rẻ nhất'},
          initial: s['defaultPrefer']),
      FormFieldSpec('guide_style_prompt', 'Văn phong hướng dẫn AI',
          type: FieldType.multiline,
          initial: s['guideStylePromptIsDefault'] == true ? '' : s['guideStylePrompt'],
          hint: 'Để trống = giữ nguyên'),
    ]);
    if (v == null || !mounted) return;
    // Để trống "số kiện tối đa" = bỏ giới hạn.
    if (s.containsKey('maxParcelsPerOrder')) v.putIfAbsent('max_parcels_per_order', () => null);
    await _run(() => _api.put('/packing/settings', body: {...v, 'expected_version': s['version']}), 'Đã lưu cài đặt.');
  }

  Future<void> _editAi(Map<String, dynamic> ai) async {
    final presets = <String, String>{
      for (final p in rowsOf(ai['presets']))
        pickString(p, ['key', 'provider']): pickString(p, ['label', 'name'], pickString(p, ['key', 'provider'])),
      if (ai['provider'] != null) '${ai['provider']}': '${ai['provider']}',
    };
    final v = await showFormSheet(context, title: 'Kết nối AI', fields: [
      FormFieldSpec('provider', 'Nhà cung cấp', type: FieldType.choice, options: presets, initial: ai['provider']),
      FormFieldSpec('base_url', 'Địa chỉ API', initial: ai['baseUrl']),
      FormFieldSpec('model', 'Model', initial: ai['model']),
      FormFieldSpec('vision_model', 'Model đọc ảnh (trống = dùng chung)', initial: ai['visionModel']),
      const FormFieldSpec('api_key', 'API key mới (trống = giữ key cũ)', type: FieldType.password),
      FormFieldSpec('timeout_ms', 'Thời gian chờ (ms)', type: FieldType.integer, initial: ai['timeoutMs']),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.put('/ai-settings', body: v), 'Đã lưu kết nối AI.');
  }

  Future<void> _testAi() async {
    await runAction(context, () async {
      final res = asMap(await _api.post('/ai-settings/test', body: {}));
      final r = asMap(res?['result']) ?? res;
      if (!mounted) return;
      final ok = r?['ok'] == true || r?['success'] == true;
      showToast(context, ok ? 'Kết nối AI hoạt động.' : 'Lỗi: ${r?['message'] ?? r?['error'] ?? 'không kết nối được'}',
          error: !ok);
    });
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Cài đặt đóng gói & AI',
      child: LoadList<(Map<String, dynamic>, Map<String, dynamic>?)>(
        key: _list,
        load: _load,
        builder: (context, data, _) {
          final (packing, ai) = data;
          return [
            RecordCard(
              title: 'Đóng gói',
              lines: [
                for (final (camel, _, label, _) in _numberFields)
                  if (packing[camel] != null) '$label: ${packing[camel]}',
                for (final (camel, _, label) in _toggles)
                  if (packing.containsKey(camel)) '$label: ${packing[camel] == true ? 'bật' : 'tắt'}',
              ],
              onTap: () => _editPacking(packing),
              actions: [CardAction('Sửa', () => _editPacking(packing), icon: Icons.edit_outlined)],
            ),
            if (ai != null) ...[
              RecordCard(
                title: 'Kết nối AI',
                lines: [
                  '${ai['provider']} · ${ai['model']}',
                  pickString(ai, ['baseUrl']),
                  ai['hasApiKey'] == true
                      ? 'Đã có API key${ai['apiKeyLast4'] == null ? '' : ' …${ai['apiKeyLast4']}'}'
                      : 'Chưa có API key',
                ],
                onTap: () => _editAi(ai),
                actions: [CardAction('Sửa', () => _editAi(ai), icon: Icons.edit_outlined)],
              ),
              OutlinedButton.icon(onPressed: _testAi, icon: const Icon(Icons.bolt), label: const Text('Thử kết nối AI')),
            ],
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text('Người gửi và hãng vận chuyển nằm ở Quản lý vận chuyển.',
                  style: TextStyle(color: AppColors.inkSubtle, fontSize: 12)),
            ),
          ];
        },
      ),
    );
  }
}

const _reportLabels = <String, String>{
  'plans': 'Số kế hoạch',
  'parcels': 'Số kiện',
  'waitingMinutes': 'Thời gian chờ (phút)',
  'packingMinutes': 'Thời gian đóng (phút)',
  'abnormalRate': 'Tỉ lệ lệch cân',
  'approvedUnchangedRate': 'Tỉ lệ duyệt nguyên vẹn',
  'lowerBoundRate': 'Tỉ lệ đạt cận dưới',
  'scanRate': 'Tỉ lệ có quét',
  'cost': 'Chi phí',
  'issues': 'Sự cố',
  'byStaff': 'Theo nhân viên',
  'totalSavingVnd': 'Tiền tiết kiệm (đ)',
  'suggestions': 'Đề xuất cải thiện',
};

/// "camelCase" → "camel case" cho khóa chưa có nhãn.
String _keyLabel(String key) =>
    _reportLabels[key] ??
    key.replaceAllMapped(RegExp('[A-Z]'), (m) => ' ${m[0]!.toLowerCase()}').replaceAll('_', ' ');

/// Hiển thị một khối số liệu bất kỳ của BE thành các dòng "nhãn: giá trị".
List<Widget> reportWidgets(String title, Object? value, [int depth = 0]) {
  final map = asMap(value);
  if (map != null) {
    final flat = <String>[];
    final nested = <Widget>[];
    for (final e in map.entries) {
      if (e.value is Map || e.value is List) {
        if (depth < 2) nested.addAll(reportWidgets(_keyLabel(e.key), e.value, depth + 1));
      } else if (e.value != null) {
        final v = e.value;
        flat.add('${_keyLabel(e.key)}: ${v is double ? v.toStringAsFixed(2) : v}');
      }
    }
    return [if (flat.isNotEmpty) RecordCard(title: title, lines: flat) else if (nested.isNotEmpty) sectionTitle(title), ...nested];
  }
  if (value is List) {
    if (value.isEmpty) return const [];
    return [
      sectionTitle(title),
      for (final row in value.take(30))
        if (asMap(row) case final m?)
          RecordCard(
            title: '${m['name'] ?? m['staffName'] ?? m['code'] ?? m['sku'] ?? m['type'] ?? title}',
            lines: [
              for (final e in m.entries)
                if (e.value != null && e.value is! Map && e.value is! List) '${_keyLabel(e.key)}: ${e.value}',
            ],
          )
        else
          RecordCard(title: '$row'),
    ];
  }
  return [RecordCard(title: title, lines: ['$value'])];
}

/// Báo cáo: đóng gói, đề xuất cải thiện và tiền tiết kiệm bao bì.
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  int _days = 30;

  Future<List<(String, Object?, String?)>> _load() async {
    final api = ref.read(apiClientProvider);
    final from = DateTime.now().subtract(Duration(days: _days)).toUtc().toIso8601String();
    Future<(String, Object?, String?)> part(String title, String path, [Map<String, dynamic>? query]) async {
      try {
        return (title, await api.get(path, query: query), null);
      } catch (e) {
        return (title, null, errorText(e));
      }
    }

    return [
      await part('Đóng gói', '/packing/reports/summary', {'from': from}),
      await part('Đề xuất cải thiện', '/packing/reports/feedback'),
      await part('Tiết kiệm bao bì', '/packaging-materials/savings'),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Báo cáo',
      child: LoadList<List<(String, Object?, String?)>>(
        resetKey: _days,
        load: _load,
        header: [
          chipRow<int>(const [(7, '7 ngày'), (30, '30 ngày'), (90, '90 ngày')], _days,
              (d) => setState(() => _days = d)),
        ],
        builder: (context, parts, _) => [
          for (final (title, data, error) in parts) ...[
            sectionTitle(title),
            if (error != null) emptyNote(error) else ...reportWidgets('Số liệu', data),
          ],
        ],
      ),
    );
  }
}
