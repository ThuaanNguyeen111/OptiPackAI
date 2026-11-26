import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/json.dart';
import '../../shared/admin_kit.dart';
import '../auth/auth_models.dart';
import '../auth/role_permissions.dart';

/// Tên trang, giống `FEATURE_LABELS` của web.
const featureLabels = <String, String>{
  'dashboard': 'Tổng quan',
  'orders': 'Đơn đa kênh',
  'order_groups': 'Nhóm đơn & Hỏa tốc',
  'returns': 'Trả hàng',
  'order_sync': 'Đồng bộ đơn',
  'picking': 'Lấy hàng trong kho',
  'inventory': 'Tình trạng kho',
  'packing': 'Đóng gói',
  'shipping': 'Vận chuyển',
  'packaging_rules': 'Cài đặt đóng gói & AI',
  'packaging_materials': 'Vật liệu đóng gói',
  'staff': 'Nhân viên',
  'analytics': 'Báo cáo',
  'history': 'Lịch sử thao tác',
};

/// Phân quyền: bật / tắt trang theo vai trò (Admin luôn đủ quyền nên không chỉnh được).
class RolePermissionsScreen extends ConsumerStatefulWidget {
  const RolePermissionsScreen({super.key});

  @override
  ConsumerState<RolePermissionsScreen> createState() => _RolePermissionsScreenState();
}

class _RolePermissionsScreenState extends ConsumerState<RolePermissionsScreen> {
  final _list = GlobalKey<LoadListState<Map<String, dynamic>>>();
  UserRole _role = UserRole.warehouseStaff;

  /// Bản đang sửa, `null` = chưa đổi gì so với máy chủ.
  Set<String>? _draft;
  bool _saving = false;

  static Set<String> _featuresIn(Object? matrix, UserRole role) {
    final list = asMap(matrix)?['${role.value}'];
    return {
      if (list is List)
        for (final f in list)
          if (f is String) f,
    };
  }

  Future<void> _save(Set<String> features) async {
    setState(() => _saving = true);
    final ok = await runAction(context, () async {
      await ref.read(apiClientProvider).put('/role-permissions/${_role.value}', body: {
        'features': [for (final f in allFeatures) if (features.contains(f)) f],
      });
    }, success: 'Đã lưu quyền của ${_role.label}.');
    if (!mounted) return;
    setState(() {
      _saving = false;
      if (ok) _draft = null;
    });
    if (ok) await _list.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Phân quyền',
      child: LoadList<Map<String, dynamic>>(
        key: _list,
        load: () async => asMap(await ref.read(apiClientProvider).get('/role-permissions')) ?? {},
        header: [
          Wrap(
            spacing: 8,
            children: [
              for (final role in UserRole.values.where((r) => r != UserRole.admin))
                ChoiceChip(
                  label: Text(role.label),
                  selected: _role == role,
                  onSelected: (_) => setState(() {
                    _role = role;
                    _draft = null;
                  }),
                ),
            ],
          ),
        ],
        builder: (context, data, _) {
          final saved = _featuresIn(data['matrix'], _role);
          final current = _draft ?? saved;
          final defaults = _featuresIn(data['defaults'], _role);
          return [
            for (final f in allFeatures)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(featureLabels[f] ?? f),
                subtitle: defaults.contains(f) ? const Text('Bật theo mặc định') : null,
                value: current.contains(f),
                onChanged: _saving
                    ? null
                    : (v) => setState(() => _draft = v ? {...current, f} : ({...current}..remove(f))),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _draft == null || _saving ? null : () => _save(current),
              child: Text(_saving ? 'Đang lưu…' : 'Lưu quyền'),
            ),
            if (defaults.isNotEmpty)
              TextButton(
                onPressed: _saving ? null : () => setState(() => _draft = {...defaults}),
                child: const Text('Khôi phục mặc định'),
              ),
          ];
        },
      ),
    );
  }
}
