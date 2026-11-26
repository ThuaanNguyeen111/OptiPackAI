import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../auth/auth_models.dart';

/// Hồ sơ, đổi mật khẩu và xác thực 2 lớp — cho mọi vai trò.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _list = GlobalKey<LoadListState<Map<String, dynamic>>>();

  ApiClient get _api => ref.read(apiClientProvider);
  Future<void> _reload() async => _list.currentState?.reload();

  Future<void> _edit(Map<String, dynamic> me) async {
    final v = await showFormSheet(context,
        title: 'Sửa hồ sơ',
        note: 'Mã nhân viên và phòng ban do Admin sửa.',
        fields: [
          FormFieldSpec('phone', 'Số điện thoại', initial: me['phone'], sendEmpty: true),
          FormFieldSpec('address', 'Địa chỉ', initial: me['address'], sendEmpty: true),
          FormFieldSpec('avatar', 'Ảnh đại diện (URL)', initial: me['avatar']),
        ]);
    if (v == null || !mounted) return;
    if (await runAction(context, () async => _api.patch('/users/me', body: v), success: 'Đã lưu hồ sơ.')) {
      await _reload();
    }
  }

  Future<void> _changePassword() async {
    await changePasswordFlow(context, ref);
  }

  Future<void> _setupMfa(bool enabled) async {
    var reauth = <String, dynamic>{};
    if (enabled) {
      final v = await showFormSheet(context,
          title: 'Cài lại MFA',
          note: 'Nhập mã 6 số hiện tại hoặc mật khẩu. MFA cũ vẫn bật cho tới khi bạn xác nhận mã mới.',
          submitLabel: 'Tiếp tục',
          fields: const [
            FormFieldSpec('current_token', 'Mã 6 số hiện tại'),
            FormFieldSpec('password', 'Hoặc mật khẩu', type: FieldType.password),
          ]);
      if (v == null || !mounted) return;
      reauth = v;
    }
    Map<String, dynamic>? setup;
    await runAction(context, () async {
      setup = asMap(await _api.post('/auth/mfa/setup', body: reauth));
    });
    if (setup == null || !mounted) return;
    final codes = await openPage<List<String>>(context, _MfaVerifyPage(setup: setup!));
    if (codes != null && mounted) {
      await showSecret(context,
          title: 'Mã dự phòng',
          value: codes.join('\n'),
          note: 'Lưu lại ngay. Mỗi mã dùng một lần khi mất điện thoại.');
    }
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Hồ sơ & Bảo mật',
      child: LoadList<Map<String, dynamic>>(
        key: _list,
        load: () async => asMap(await _api.get('/users/me')) ?? {},
        builder: (context, me, _) {
          final mfa = me['mfa_enabled'] == true;
          return [
            RecordCard(
              title: pickString(me, ['name'], '—'),
              lines: [
                pickString(me, ['email']),
                UserRole.fromValue(me['role'])?.label ?? '',
                if (pickString(me, ['employee_code']).isNotEmpty) 'Mã nhân viên: ${me['employee_code']}',
                if (pickString(me, ['department']).isNotEmpty) 'Phòng ban: ${me['department']}',
                'Số điện thoại: ${pickString(me, ['phone'], '—')}',
                'Địa chỉ: ${pickString(me, ['address'], '—')}',
              ],
            ),
            OutlinedButton.icon(
              onPressed: () => _edit(me),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Sửa hồ sơ'),
            ),
            sectionTitle('Đổi mật khẩu'),
            OutlinedButton.icon(
              onPressed: _changePassword,
              icon: const Icon(Icons.lock_reset),
              label: const Text('Đổi mật khẩu'),
            ),
            sectionTitle('Xác thực 2 lớp (MFA)'),
            Row(
              children: [
                Pill(mfa ? 'MFA đang bật' : 'MFA chưa được bật', mfa ? AppColors.good : AppColors.warning),
              ],
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: () => _setupMfa(mfa),
              icon: const Icon(Icons.shield_outlined),
              label: Text(mfa ? 'Cài lại MFA' : 'Thiết lập MFA'),
            ),
          ];
        },
      ),
    );
  }
}

/// Đổi mật khẩu. BE thu hồi mọi phiên sau khi đổi nên app đăng xuất để đăng nhập lại.
Future<void> changePasswordFlow(BuildContext context, WidgetRef ref) async {
  final v = await showFormSheet(context,
      title: 'Đổi mật khẩu',
      note: 'Đổi xong bạn sẽ phải đăng nhập lại.',
      submitLabel: 'Cập nhật mật khẩu',
      fields: const [
        FormFieldSpec('current_password', 'Mật khẩu hiện tại', type: FieldType.password, required: true),
        FormFieldSpec('new_password', 'Mật khẩu mới', type: FieldType.password, required: true),
        FormFieldSpec('confirm', 'Nhập lại mật khẩu mới', type: FieldType.password, required: true),
      ]);
  if (v == null || !context.mounted) return;
  if (v['new_password'] != v.remove('confirm')) {
    showToast(context, 'Mật khẩu xác nhận không khớp.', error: true);
    return;
  }
  final api = ref.read(apiClientProvider);
  final auth = ref.read(authControllerProvider.notifier);
  if (!await runAction(context, () async => api.post('/auth/change-password', body: v),
      success: 'Đã đổi mật khẩu. Hãy đăng nhập lại.')) {
    return;
  }
  if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  await auth.logout();
}

class _MfaVerifyPage extends ConsumerStatefulWidget {
  const _MfaVerifyPage({required this.setup});

  final Map<String, dynamic> setup;

  @override
  ConsumerState<_MfaVerifyPage> createState() => _MfaVerifyPageState();
}

class _MfaVerifyPageState extends ConsumerState<_MfaVerifyPage> {
  final _token = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _token.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final token = _token.text.trim();
    if (token.length != 6) {
      showToast(context, 'Nhập đủ mã 6 số.', error: true);
      return;
    }
    setState(() => _busy = true);
    List<String>? codes;
    await runAction(context, () async {
      final res = asMap(await ref.read(apiClientProvider).post('/auth/mfa/verify', body: {'token': token}));
      final list = res?['backup_codes'];
      codes = [
        if (list is List)
          for (final c in list) '$c',
      ];
    }, success: 'MFA đã được kích hoạt.');
    if (!mounted) return;
    setState(() => _busy = false);
    if (codes != null) Navigator.pop(context, codes);
  }

  @override
  Widget build(BuildContext context) {
    final url = pickString(widget.setup, ['otpauthUrl']);
    final secret = Uri.tryParse(url)?.queryParameters['secret'];
    final data = pickString(widget.setup, ['qrDataUrl']);
    final comma = data.indexOf(',');
    return SubPage(
      title: 'Thiết lập MFA',
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Quét mã QR bằng ứng dụng xác thực (Google Authenticator…) trên máy khác, '
              'hoặc nhập mã bí mật vào ứng dụng trên máy này.'),
          const SizedBox(height: 16),
          if (comma > 0)
            Center(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.all(8),
                child: Image.memory(base64Decode(data.substring(comma + 1)), width: 220, height: 220),
              ),
            ),
          if (secret != null) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => showSecret(context, title: 'Mã bí mật', value: secret),
              icon: const Icon(Icons.vpn_key_outlined),
              label: const Text('Xem mã bí mật để nhập tay'),
            ),
          ],
          const SizedBox(height: 16),
          TextField(
            controller: _token,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(labelText: 'Mã xác thực 6 số'),
          ),
          FilledButton(onPressed: _busy ? null : _verify, child: const Text('Kích hoạt MFA')),
        ],
      ),
    );
  }
}
