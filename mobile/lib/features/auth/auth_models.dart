import 'dart:convert';

import '../../core/json.dart';

/// `role` BE là **số** (INTEGRATION_GUIDE.md mục 3), không dùng chuỗi.
enum UserRole {
  storeOwner(0, 'Chủ shop'),
  warehouseStaff(1, 'Nhân viên kho'),
  packagingStaff(2, 'Nhân viên đóng gói'),
  shippingCoordinator(3, 'Điều phối giao hàng'),
  admin(4, 'Quản trị viên');

  const UserRole(this.value, this.label);

  final int value;
  final String label;

  static UserRole? fromValue(Object? value) {
    if (value is! num) return null;
    for (final role in UserRole.values) {
      if (role.value == value.toInt()) return role;
    }
    return null;
  }
}

class CurrentUser {
  const CurrentUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.onLeave = false,
  });

  final String id;
  final String name;
  final String email;
  final UserRole role;
  final bool onLeave;

  /// Đợt 1 của mobile chỉ làm cho kho và đóng gói (MOBILE_UPDATE_CHECKLIST).
  bool get isWarehouse => role == UserRole.warehouseStaff || role == UserRole.admin;
  bool get isPackaging => role == UserRole.packagingStaff || role == UserRole.admin;

  factory CurrentUser.fromJson(Map<String, dynamic> json) {
    final role = UserRole.fromValue(json['role']);
    if (role == null) {
      throw const FormatException('Thiếu role trong hồ sơ người dùng');
    }
    return CurrentUser(
      id: pickString(json, ['id', '_id']),
      name: pickString(json, ['name'], 'Người dùng'),
      email: pickString(json, ['email']),
      role: role,
      onLeave: pickBool(json, ['on_leave', 'onLeave']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'role': role.value,
        'on_leave': onLeave,
      };

  String encode() => jsonEncode(toJson());

  static CurrentUser? tryDecode(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = asMap(jsonDecode(raw));
      return map == null ? null : CurrentUser.fromJson(map);
    } on FormatException {
      return null;
    }
  }
}

/// Kết quả `POST /auth/login`: thành công ngay, hoặc cần thêm mã MFA.
sealed class LoginOutcome {
  const LoginOutcome();
}

class LoginSuccess extends LoginOutcome {
  const LoginSuccess({required this.mustChangePassword});
  final bool mustChangePassword;
}

class LoginMfaRequired extends LoginOutcome {
  const LoginMfaRequired();
}
