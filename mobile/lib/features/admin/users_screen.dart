import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../auth/auth_models.dart';

final _roleOptions = {for (final r in UserRole.values) '${r.value}': r.label};

/// Quản lý người dùng — cùng thao tác với trang Người dùng của admin trên web.
class UsersScreen extends ConsumerStatefulWidget {
  const UsersScreen({super.key});

  @override
  ConsumerState<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends ConsumerState<UsersScreen> {
  final _list = GlobalKey<LoadListState<List<Map<String, dynamic>>>>();
  String _search = '';
  int? _role;

  ApiClient get _api => ref.read(apiClientProvider);

  Future<List<Map<String, dynamic>>> _load() async =>
      rowsOf(await _api.get('/users', query: {'page': 1, 'limit': 100, 'role': _role}));

  Future<void> _reload() async => _list.currentState?.reload();

  Future<void> _create() async {
    final v = await showFormSheet(context, title: 'Tạo người dùng', submitLabel: 'Tạo', fields: [
      const FormFieldSpec('name', 'Họ và tên', required: true),
      const FormFieldSpec('email', 'Email công việc', required: true),
      FormFieldSpec('role', 'Vai trò', type: FieldType.choice, required: true, options: _roleOptions),
    ]);
    if (v == null || !mounted) return;
    v['role'] = int.parse(v['role'] as String);
    try {
      final res = asMap(await _api.post('/users', body: v));
      await _reload();
      if (!mounted) return;
      await _showPassword(pickString(res, ['temporary_password']));
    } on ApiException catch (e) {
      if (!mounted) return;
      // Email trùng tài khoản đã vô hiệu hóa: đề nghị kích hoạt lại, không tạo mới.
      final existing = pickStringOrNull(asMap(e.details), ['existingUserId']);
      if (e.errorCode == 'USER_EMAIL_INACTIVE' && existing != null) {
        final ok = await confirmDialog(context,
            title: 'Email thuộc tài khoản đã vô hiệu hóa',
            message: '${e.message}\nKích hoạt lại tài khoản cũ?',
            confirmLabel: 'Kích hoạt lại');
        if (ok && mounted) await _act(() => _api.post('/users/$existing/reactivate'), 'Đã kích hoạt lại.');
      } else {
        showToast(context, e.message, error: true);
      }
    }
  }

  Future<void> _showPassword(String password) => showSecret(
        context,
        title: 'Mật khẩu tạm',
        value: password,
        note: 'Chỉ hiện một lần. Người dùng phải đổi mật khẩu trong 72 giờ.',
      );

  Future<void> _act(Future<Object?> Function() call, String success) async {
    if (await runAction(context, () async => call(), success: success)) await _reload();
  }

  Future<void> _confirmAct(String title, String message, Future<Object?> Function() call, String success) async {
    if (await confirmDialog(context, title: title, message: message) && mounted) await _act(call, success);
  }

  Future<void> _edit(Map<String, dynamic> u, String id) async {
    final v = await showFormSheet(context, title: 'Sửa người dùng', fields: [
      FormFieldSpec('name', 'Họ và tên', required: true, initial: u['name']),
      FormFieldSpec('role', 'Vai trò',
          type: FieldType.choice, required: true, options: _roleOptions, initial: u['role']),
      FormFieldSpec('phone', 'Số điện thoại', initial: u['phone'], sendEmpty: true),
      FormFieldSpec('address', 'Địa chỉ', initial: u['address'], sendEmpty: true),
      FormFieldSpec('employee_code', 'Mã nhân viên', initial: u['employee_code']),
      FormFieldSpec('department', 'Phòng ban', initial: u['department'], sendEmpty: true),
    ]);
    if (v == null || !mounted) return;
    v['role'] = int.parse(v['role'] as String);
    await _act(() => _api.patch('/users/$id', body: v), 'Đã lưu.');
  }

  Future<void> _resetPassword(String id, String name) async {
    final ok = await confirmDialog(context,
        title: 'Đặt lại mật khẩu?', message: 'Tạo mật khẩu tạm mới cho $name.');
    if (!ok || !mounted) return;
    String? password;
    await runAction(context, () async {
      password = pickString(asMap(await _api.post('/users/$id/reset-password')), ['temporary_password']);
    });
    if (password != null && mounted) await _showPassword(password!);
    await _reload();
  }

  Future<void> _leave(String id, bool onLeave) async {
    if (onLeave) {
      await _act(() => _api.patch('/users/$id/leave', body: {'on_leave': false}), 'Đã cho đi làm lại.');
      return;
    }
    final v = await showFormSheet(context, title: 'Cho nghỉ phép', fields: const [
      FormFieldSpec('until', 'Đến ngày (YYYY-MM-DD)', hint: 'Để trống nếu chưa biết ngày đi làm lại'),
      FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    await _act(() => _api.patch('/users/$id/leave', body: {'on_leave': true, ...v}), 'Đã đánh dấu nghỉ phép.');
  }

  Widget _card(Map<String, dynamic> u, String? myId) {
    final id = pickString(u, ['id', '_id']);
    final name = pickString(u, ['name'], '—');
    final active = u['is_active'] != false;
    final mfa = u['mfa_enabled'] == true;
    final onLeave = u['on_leave'] == true;
    final role = UserRole.fromValue(u['role']);
    final mustChange = u['must_change_password'] == true;
    return RecordCard(
      title: id == myId ? '$name (bạn)' : name,
      lines: [
        pickString(u, ['email']),
        [role?.label ?? '', pickString(u, ['employee_code']), pickString(u, ['department'])]
            .where((s) => s.isNotEmpty)
            .join(' · '),
      ],
      pills: [
        if (!active) Pill('Đã vô hiệu hóa', AppColors.danger),
        if (mfa) Pill('MFA', AppColors.good),
        if (mustChange) Pill('Chưa đổi mật khẩu tạm', AppColors.warning),
        if (onLeave) Pill('Đang nghỉ', AppColors.warning),
      ],
      actions: [
        CardAction('Sửa thông tin', () => _edit(u, id), icon: Icons.edit_outlined),
        CardAction('Đặt lại mật khẩu', () => _resetPassword(id, name), icon: Icons.key_outlined),
        if (mfa)
          CardAction(
            'Tắt MFA hộ',
            () => _confirmAct('Tắt MFA?', 'Tắt xác thực 2 lớp của $name. Người này sẽ được thông báo.',
                () => _api.post('/users/$id/disable-mfa'), 'Đã tắt MFA.'),
            icon: Icons.phonelink_erase_outlined,
          ),
        if (active && role != UserRole.admin && role != UserRole.storeOwner)
          CardAction(onLeave ? 'Đi làm lại' : 'Cho nghỉ phép', () => _leave(id, onLeave),
              icon: Icons.beach_access_outlined),
        if (!active)
          CardAction('Kích hoạt lại', () => _act(() => _api.post('/users/$id/reactivate'), 'Đã kích hoạt lại.'),
              icon: Icons.restart_alt)
        else if (id != myId)
          CardAction(
            'Vô hiệu hóa',
            () => _confirmAct('Vô hiệu hóa tài khoản?', '$name sẽ không đăng nhập được nữa.',
                () => _api.delete('/users/$id'), 'Đã vô hiệu hóa.'),
            icon: Icons.block,
            danger: true,
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final myId = ref.watch(authControllerProvider.select((s) => s.user?.id));
    return SubPage(
      title: 'Người dùng',
      floatingAction: FloatingActionButton.extended(
        onPressed: _create,
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Thêm'),
      ),
      child: LoadList<List<Map<String, dynamic>>>(
        key: _list,
        load: _load,
        header: [
          TextField(
            onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            decoration: const InputDecoration(
                hintText: 'Tìm theo tên hoặc email', prefixIcon: Icon(Icons.search), isDense: true),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final entry in [(null, 'Tất cả'), for (final r in UserRole.values) (r.value, r.label)])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(entry.$2),
                      selected: _role == entry.$1,
                      onSelected: (_) {
                        setState(() => _role = entry.$1);
                        _reload();
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
        builder: (context, users, _) {
          final shown = users
              .where((u) => '${u['name']} ${u['email']}'.toLowerCase().contains(_search))
              .toList();
          return [
            if (shown.isEmpty) emptyNote('Không có người dùng nào khớp.'),
            for (final u in shown) _card(u, myId),
          ];
        },
      ),
    );
  }
}
