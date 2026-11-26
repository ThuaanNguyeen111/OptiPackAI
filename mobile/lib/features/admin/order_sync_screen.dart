import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'marketplace_screen.dart';

const _rulesBase = '/order-sync-settings/rules';

/// `{value, label}` của BE → bản đồ giá trị → nhãn. Giá trị đang lưu mà BE không liệt kê vẫn hiện.
Map<String, String> optionMap(Object? raw, [Iterable<Object?> current = const []]) {
  final out = <String, String>{};
  if (raw is List) {
    for (final row in raw) {
      if (row is String) {
        out[row] = row;
      } else if (asMap(row) case final m?) {
        final value = pickString(m, ['value', 'code', 'key']);
        if (value.isNotEmpty) out[value] = pickString(m, ['label', 'name'], value);
      }
    }
  }
  for (final v in current) {
    if (v is String) out.putIfAbsent(v, () => v);
  }
  return out;
}

List<String> _strings(Object? raw) => [
      if (raw is List)
        for (final v in raw)
          if (v is String) v,
    ];

class _SyncData {
  const _SyncData(this.settings, this.history, this.rules);
  final Map<String, dynamic> settings;
  final List<Map<String, dynamic>> history;
  final Map<String, dynamic> rules;
}

/// Cấu hình đồng bộ đơn và quy tắc gộp đơn.
class OrderSyncScreen extends ConsumerStatefulWidget {
  const OrderSyncScreen({super.key});

  @override
  ConsumerState<OrderSyncScreen> createState() => _OrderSyncScreenState();
}

class _OrderSyncScreenState extends ConsumerState<OrderSyncScreen> {
  final _list = GlobalKey<LoadListState<_SyncData>>();

  ApiClient get _api => ref.read(apiClientProvider);
  Future<void> _reload() async => _list.currentState?.reload();

  Future<_SyncData> _load() async {
    final settings = asMap(await _api.get('/order-sync-settings')) ?? {};
    var history = <Map<String, dynamic>>[];
    var rules = <String, dynamic>{};
    try {
      history = rowsOf(await _api.get('/order-sync-settings/history', query: {'limit': 10}));
    } catch (_) {}
    try {
      rules = asMap(await _api.get(_rulesBase)) ?? {};
    } catch (_) {}
    return _SyncData(settings, history, rules);
  }

  Future<void> _put(Map<String, dynamic> s, Map<String, dynamic> patch) async {
    if (await runAction(context,
        () async => _api.put('/order-sync-settings', body: {'expected_version': s['version'], ...patch}),
        success: 'Đã lưu cấu hình.')) {
      await _reload();
    }
  }

  Future<void> _editSync(Map<String, dynamic> s) async {
    final sync = asMap(s['sync']) ?? {};
    final platforms = rowsOf(sync['platforms']);
    final v = await showFormSheet(context, title: 'Đồng bộ tự động', fields: [
      FormFieldSpec('platforms', 'Sàn tự đồng bộ',
          type: FieldType.multi,
          options: platformNames,
          initial: [for (final p in platforms) if (p['autoSyncEnabled'] == true) p['platform']]),
      FormFieldSpec('interval_minutes', 'Chu kỳ (phút, 5–1440)',
          type: FieldType.integer, required: true, initial: sync['intervalMinutes']),
      FormFieldSpec('first_sync_lookback_days', 'Lần đầu lấy đơn trong (ngày, 1–90)',
          type: FieldType.integer, required: true, initial: sync['firstSyncLookbackDays']),
      FormFieldSpec('sync_failed_cooldown_minutes', 'Giãn cách báo lỗi đồng bộ (phút)',
          type: FieldType.integer, required: true, initial: sync['syncFailedCooldownMinutes']),
      const FormFieldSpec('note', 'Ghi chú thay đổi'),
    ]);
    if (v == null || !mounted) return;
    final enabled = (v['platforms'] as List).toSet();
    v['platforms'] = [
      for (final p in platformNames.keys) {'platform': p, 'auto_sync_enabled': enabled.contains(p)},
    ];
    await _put(s, v);
  }

  Future<void> _editConsolidation(Map<String, dynamic> s) async {
    final c = asMap(s['consolidation']) ?? {};
    final st = asMap(s['statuses']) ?? {};
    final o = asMap(s['options']) ?? {};
    final v = await showFormSheet(context, title: 'Gộp đơn & trạng thái', fields: [
      FormFieldSpec('consolidation_enabled', 'Bật gộp đơn', type: FieldType.toggle, initial: c['enabled']),
      FormFieldSpec('consolidation_key_fields', 'Trường dùng để gộp',
          type: FieldType.multi,
          required: true,
          initial: c['keyFields'],
          options: optionMap(o['keyFields'], _strings(c['keyFields']))),
      FormFieldSpec('consolidation_time_window_hours', 'Chỉ gộp trong (giờ)',
          type: FieldType.integer, initial: c['timeWindowHours'], hint: 'Để trống = không giới hạn'),
      FormFieldSpec('open_group_statuses', 'Nhóm còn nhận thêm đơn khi',
          type: FieldType.multi,
          required: true,
          initial: c['openGroupStatuses'],
          options: optionMap(o['openGroupStatuses'], _strings(c['openGroupStatuses']))),
      FormFieldSpec('consolidatable_statuses', 'Trạng thái đơn được gộp',
          type: FieldType.multi,
          required: true,
          initial: st['consolidatable'],
          options: optionMap(o['consolidatableStatuses'], _strings(st['consolidatable']))),
      FormFieldSpec('not_packable_statuses', 'Trạng thái đơn không đóng gói',
          type: FieldType.multi,
          required: true,
          initial: st['notPackable'],
          options: optionMap(o['notPackableStatuses'], _strings(st['notPackable']))),
      const FormFieldSpec('note', 'Ghi chú thay đổi'),
    ]);
    if (v == null || !mounted) return;
    v.putIfAbsent('consolidation_time_window_hours', () => null);
    await _put(s, v);
  }

  Future<void> _editRule(Map<String, dynamic> state, Map<String, dynamic>? rule,
      [Map<String, dynamic>? draft]) async {
    final options = asMap(state['options']) ?? {};
    final source = rule ?? draft;
    final fields = rowsOf(source?['fields']);
    final matches = optionMap(options['matches'], const ['normalized', 'exact']);
    final fieldOptions = optionMap(options['fields'], [for (final f in fields) f['field']]);
    final v = await showFormSheet(context, title: rule == null ? 'Thêm quy tắc gộp' : 'Sửa quy tắc', fields: [
      FormFieldSpec('name', 'Tên quy tắc', required: true, initial: source?['name']),
      FormFieldSpec('fields', 'Gộp khi trùng các trường',
          type: FieldType.multi,
          required: true,
          options: fieldOptions,
          initial: [for (final f in fields) f['field']]),
      FormFieldSpec('match', 'Cách so khớp',
          type: FieldType.choice,
          required: true,
          options: matches,
          initial: fields.isEmpty ? 'normalized' : fields.first['match']),
      FormFieldSpec('platforms', 'Chỉ áp cho sàn',
          type: FieldType.multi,
          options: platformNames,
          initial: source?['platforms'],
          hint: 'Không chọn = mọi sàn'),
      FormFieldSpec('max_window_hours', 'Giới hạn thời gian riêng (giờ)',
          type: FieldType.integer, initial: source?['maxWindowHours'] ?? source?['max_window_hours']),
      FormFieldSpec('enabled', 'Đang bật', type: FieldType.toggle, initial: source?['enabled'] ?? true),
    ]);
    if (v == null || !mounted) return;
    final match = v.remove('match');
    final body = {
      ...v,
      'fields': [for (final f in v['fields'] as List) {'field': f, 'match': match}],
      'max_window_hours': v['max_window_hours'],
      'source_text': source?['sourceText'] ?? source?['source_text'],
      'expected_version': state['version'],
    };
    final id = pickStringOrNull(rule, ['id']);
    if (await runAction(
        context,
        () async => id == null ? _api.post(_rulesBase, body: body) : _api.put('$_rulesBase/$id', body: body),
        success: 'Đã lưu quy tắc.')) {
      await _reload();
    }
  }

  Future<void> _translate(Map<String, dynamic> state) async {
    final v = await showFormSheet(context,
        title: 'Tạo quy tắc từ câu mô tả',
        submitLabel: 'Dịch',
        fields: const [FormFieldSpec('text', 'VD: gộp đơn cùng số điện thoại và phường', type: FieldType.multiline, required: true)]);
    if (v == null || !mounted) return;
    Map<String, dynamic>? res;
    await runAction(context, () async => res = asMap(await _api.post('$_rulesBase/translate', body: v)));
    if (res == null || !mounted) return;
    final warnings = [..._strings(res!['unsupported']), ..._strings(res!['warnings'])];
    final draft = asMap(res!['rule']);
    if (warnings.isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          scrollable: true,
          title: const Text('Lưu ý khi dịch'),
          content: Text(warnings.join('\n')),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng'))],
        ),
      );
    }
    if (draft == null || !mounted) return;
    await _editRule(state, null, draft);
  }

  Future<void> _preview(List<Map<String, dynamic>> rules) async {
    final body = [
      for (final r in rules)
        {
          'name': r['name'],
          'source_text': r['sourceText'],
          'fields': r['fields'],
          'platforms': r['platforms'],
          'max_window_hours': r['maxWindowHours'],
          'enabled': r['enabled'],
        },
    ];
    Map<String, dynamic>? res;
    await runAction(context, () async => res = asMap(await _api.post('$_rulesBase/preview', body: {'rules': body})));
    if (res == null || !mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xem trước kết quả gộp'),
        content: Text('Đã quét ${pickInt(res, ['ordersScanned'])} đơn.\n'
            'Hiện có ${pickInt(res, ['currentGroups'])} nhóm, theo quy tắc này còn '
            '${pickInt(res, ['projectedGroups'])} nhóm (gộp thêm ${pickInt(res, ['groupsMergedByRules'])}).'),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng'))],
      ),
    );
  }

  Future<void> _deleteRule(Map<String, dynamic> state, Map<String, dynamic> rule) async {
    final ok = await confirmDialog(context, title: 'Xóa quy tắc?', message: '${rule['name']}');
    if (!ok || !mounted) return;
    if (await runAction(context,
        () async => _api.delete('$_rulesBase/${rule['id']}?expected_version=${state['version']}'),
        success: 'Đã xóa.')) {
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Đồng bộ đơn',
      child: LoadList<_SyncData>(
        key: _list,
        load: _load,
        builder: (context, data, _) {
          final s = data.settings;
          final sync = asMap(s['sync']) ?? {};
          final c = asMap(s['consolidation']) ?? {};
          final rules = rowsOf(data.rules['rules']);
          return [
            RecordCard(
              title: 'Đồng bộ tự động',
              lines: [
                'Chu kỳ ${pickInt(sync, ['intervalMinutes'])} phút · lần đầu ${pickInt(sync, ['firstSyncLookbackDays'])} ngày',
                for (final p in rowsOf(sync['platforms']))
                  '${platformNames[p['platform']] ?? p['platform']}: ${p['autoSyncEnabled'] == true ? 'bật' : 'tắt'}',
              ],
              actions: [CardAction('Sửa', () => _editSync(s), icon: Icons.edit_outlined)],
              onTap: () => _editSync(s),
            ),
            RecordCard(
              title: 'Gộp đơn & trạng thái',
              lines: [
                c['enabled'] == true ? 'Đang bật gộp đơn' : 'Đang tắt gộp đơn',
                'Trường gộp: ${_strings(c['keyFields']).join(', ')}',
                c['timeWindowHours'] == null ? 'Không giới hạn thời gian' : 'Trong ${c['timeWindowHours']} giờ',
              ],
              actions: [CardAction('Sửa', () => _editConsolidation(s), icon: Icons.edit_outlined)],
              onTap: () => _editConsolidation(s),
            ),
            sectionTitle('Quy tắc gộp'),
            if (data.rules.isEmpty) emptyNote('Không tải được quy tắc gộp.'),
            for (final r in rules)
              RecordCard(
                title: pickString(r, ['name']),
                lines: [
                  [for (final f in rowsOf(r['fields'])) '${f['field']} (${f['match']})'].join(' + '),
                ],
                pills: [Pill(r['enabled'] == true ? 'Đang bật' : 'Đang tắt', r['enabled'] == true ? AppColors.good : AppColors.inkSubtle)],
                actions: [
                  CardAction('Sửa', () => _editRule(data.rules, r), icon: Icons.edit_outlined),
                  CardAction('Xóa', () => _deleteRule(data.rules, r), icon: Icons.delete_outline, danger: true),
                ],
              ),
            if (data.rules.isNotEmpty)
              Wrap(
                spacing: 8,
                children: [
                  FilledButton.tonal(onPressed: () => _editRule(data.rules, null), child: const Text('Thêm quy tắc')),
                  OutlinedButton(onPressed: () => _translate(data.rules), child: const Text('Tạo từ câu mô tả')),
                  if (rules.isNotEmpty)
                    OutlinedButton(onPressed: () => _preview(rules), child: const Text('Xem trước')),
                ],
              ),
            sectionTitle('Lịch sử cấu hình'),
            for (final h in data.history)
              RecordCard(
                title: 'Phiên bản ${h['version']}${h['isActive'] == true ? ' (đang dùng)' : ''}',
                lines: [dateTimeText(h['createdAt']), pickString(h, ['note'])],
              ),
          ];
        },
      ),
    );
  }
}
