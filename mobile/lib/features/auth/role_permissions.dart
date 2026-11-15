import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/json.dart';
import 'auth_models.dart';

/// Các trang BE cho bật/tắt theo vai trò (`FEATURE_VALUES` trong `be/src/common/enums/feature.enum.ts`).
const allFeatures = <String>{
  'dashboard',
  'orders',
  'order_groups',
  'returns',
  'order_sync',
  'picking',
  'inventory',
  'packing',
  'shipping',
  'packaging_rules',
  'packaging_materials',
  'staff',
  'analytics',
  'history',
};

/// Bản sao `DEFAULT_ROLE_FEATURES` của BE: dùng khi chưa tải được quyền (mất mạng, BE cũ).
Set<String> defaultFeaturesFor(UserRole role) => switch (role) {
      UserRole.warehouseStaff => const {'picking', 'inventory', 'packaging_materials', 'history'},
      UserRole.packagingStaff => const {'packing', 'packaging_materials', 'history'},
      UserRole.shippingCoordinator => const {'shipping', 'history'},
      UserRole.storeOwner => const {
          'dashboard',
          'orders',
          'order_groups',
          'returns',
          'order_sync',
          'packaging_rules',
          'packaging_materials',
          'staff',
          'analytics',
          'history',
        },
      UserRole.admin => allFeatures,
    };

/// Đọc `{ role, features: [...] }` của `GET /role-permissions/me`. Sai dạng → null.
Set<String>? parseFeatures(Object? response) {
  final list = asMap(response)?['features'];
  if (list is! List) return null;
  return {for (final f in list) if (f is String) f};
}

/// Trang người dùng được mở, theo cấu hình Admin trên web (BE kiểm lại ở mọi API — đây chỉ để ẩn tab).
/// Admin luôn đủ quyền. Lỗi / mất mạng → dùng mặc định của vai trò.
final myFeaturesProvider = FutureProvider<Set<String>>((ref) async {
  final user = ref.watch(authControllerProvider.select((s) => s.user));
  if (user == null) return const {};
  if (user.role == UserRole.admin) return allFeatures;
  try {
    final res = await ref.read(apiClientProvider).get('/role-permissions/me');
    return parseFeatures(res) ?? defaultFeaturesFor(user.role);
  } catch (_) {
    return defaultFeaturesFor(user.role);
  }
});
