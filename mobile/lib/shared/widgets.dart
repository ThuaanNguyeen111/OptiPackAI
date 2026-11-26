import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/colors.dart';
import '../app/mock_providers.dart';
import '../core/network/api_exception.dart';

/// Biểu ngữ "Dữ liệu mẫu": chỉ hiện khi app chạy dữ liệu giả (`USE_MOCK_DATA=true`, hoặc trong test).
class MockBanner extends ConsumerWidget {
  const MockBanner({super.key, this.text = 'Dữ liệu mẫu — chưa nối BE'});

  final String text;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(useMockDataProvider)) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      color: AppColors.warningBg,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Icon(Icons.science_outlined, size: 16, color: AppColors.warningText),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: AppColors.warningText,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Chức năng cần BE hỗ trợ (ảnh bằng chứng, push…). Nút bị khoá, ghi rõ lý do.
class WaitingBackendButton extends StatelessWidget {
  const WaitingBackendButton({
    super.key,
    required this.label,
    this.icon = Icons.photo_camera_outlined,
  });

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Chờ BE hỗ trợ',
      child: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
        onPressed: null,
        icon: Icon(icon),
        label: Text('$label (chờ BE)'),
      ),
    );
  }
}

class Pill extends StatelessWidget {
  const Pill(this.text, this.color, {super.key, this.icon});

  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 13, color: color), const SizedBox(width: 4)],
          Flexible(
            child: Text(
              text,
              style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

/// Thẻ nổi có dải màu theo bước xử lý ở bên trái (lấy hàng, đóng gói, giao hàng, hoàn hàng…) và bóng nhẹ.
/// Màu luôn đi kèm chữ / icon bên trong thẻ, không đứng một mình.
class StageCard extends StatelessWidget {
  const StageCard({super.key, required this.accent, required this.child, this.onTap, this.icon});

  final Color accent;
  final Widget child;
  final VoidCallback? onTap;

  /// Icon trong ô màu ở đầu thẻ (tuỳ chọn).
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(16);
    return Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        color: AppColors.surface,
        border: Border.all(color: AppColors.hairline),
        boxShadow: [
          BoxShadow(color: accent.withValues(alpha: 0.16), blurRadius: 14, offset: const Offset(0, 5)),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 6, color: accent),
                  if (icon != null)
                    Padding(
                      padding: const EdgeInsets.only(left: 12, top: 14),
                      child: Align(
                        alignment: Alignment.topCenter,
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: accent.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(icon, color: accent, size: 22),
                        ),
                      ),
                    ),
                  Expanded(child: child),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.primary.withValues(alpha: 0.22), AppColors.primary.withValues(alpha: 0.06)],
                ),
              ),
              child: Icon(icon, size: 44, color: AppColors.primary),
            ),
            const SizedBox(height: 16),
            Text(text, textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkSubtle, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

/// Màn lỗi khi tải dữ liệu: câu dễ hiểu (không in `ApiException(...)`), biểu tượng theo loại lỗi,
/// nút "Thử lại". Kéo xuống để tải lại cũng được (nằm trong `RefreshIndicator`).
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  static ({IconData icon, String title, String message}) describe(Object error) {
    if (error is ApiException) {
      if (error.isNetwork) {
        return (icon: Icons.cloud_off_outlined, title: 'Không kết nối được máy chủ', message: error.message);
      }
      if (error.isForbidden) {
        return (icon: Icons.lock_outline, title: 'Bạn không có quyền xem mục này', message: error.message);
      }
      return (icon: Icons.error_outline, title: 'Không tải được dữ liệu', message: error.message);
    }
    return (icon: Icons.error_outline, title: 'Không tải được dữ liệu', message: error.toString());
  }

  @override
  Widget build(BuildContext context) {
    final d = describe(error);
    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: box.maxHeight.isFinite ? box.maxHeight : 0),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(d.icon, size: 56, color: AppColors.inkTertiary),
                  const SizedBox(height: 12),
                  Text(d.title, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 6),
                  Text(d.message, textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkSubtle)),
                  if (onRetry != null) ...[
                    const SizedBox(height: 16),
                    OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Thử lại')),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Xác nhận',
  bool danger = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
        FilledButton(
          style: FilledButton.styleFrom(
              minimumSize: const Size(0, 44), backgroundColor: danger ? AppColors.danger : null),
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok == true;
}

void showToast(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : null,
      ),
    );
}

/// `dd/MM HH:mm`.
String formatDateTime(DateTime time) {
  // BE trả giờ UTC: phải đổi sang giờ máy trước khi hiển thị.
  final t = time.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(t.day)}/${two(t.month)} ${two(t.hour)}:${two(t.minute)}';
}

/// Số tiền kiểu Việt Nam: `125.000 đ`.
String formatVnd(num value) {
  final digits = value.round().abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write('.');
    buf.write(digits[i]);
  }
  return '${value < 0 ? '-' : ''}$buf đ';
}
