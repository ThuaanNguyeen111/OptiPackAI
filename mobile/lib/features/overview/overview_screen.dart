import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/mock_providers.dart';
import '../../core/format/deadline.dart';
import '../../shared/widgets.dart';
import 'overview_repository.dart';
import '../../app/colors.dart';

/// Store Owner / Admin: vài thẻ số to, đơn Hỏa Tốc đang chạy, tra cứu đơn.
/// Không vẽ biểu đồ nhiều lớp trên điện thoại — biểu đồ ở lại web.
class OverviewScreen extends ConsumerStatefulWidget {
  const OverviewScreen({super.key});

  @override
  ConsumerState<OverviewScreen> createState() => _OverviewScreenState();
}

class _OverviewScreenState extends ConsumerState<OverviewScreen> {
  final _query = TextEditingController();
  Future<List<OrderLite>>? _orders;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  void _search() {
    final future = ref.read(overviewRepositoryProvider).searchOrders(_query.text);
    // Không dùng mũi tên: setState không được nhận callback trả về Future.
    setState(() {
      _orders = future;
    });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(overviewSummaryProvider);
    return Column(
      children: [
        const MockBanner(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(overviewSummaryProvider),
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => EmptyState(icon: Icons.error_outline, text: '$e'),
              data: (s) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.7,
                    children: [
                      _Kpi('Đơn hôm nay', '${s.ordersToday}', Icons.receipt_long_outlined, AppColors.stagePick),
                      _Kpi('Chờ xử lý', '${s.pending}', Icons.pending_actions_outlined, AppColors.warning),
                      _Kpi('Quá hạn', '${s.overdue}', Icons.timer_off_outlined, AppColors.danger),
                      _Kpi('Hàng hoàn', '${s.returnsOpen}', Icons.assignment_return_outlined, Colors.deepOrange),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.payments_outlined),
                      title: const Text('Doanh thu hôm nay'),
                      trailing: Text(formatVnd(s.revenueVnd),
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text('Hỏa tốc đang chạy', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 8),
                  if (s.express.isEmpty) const Text('Không có đơn hỏa tốc.'),
                  for (final e in s.express) _ExpressRow(item: e),
                  const SizedBox(height: 20),
                  const Text('Tra cứu đơn', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _query,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _search(),
                    decoration: InputDecoration(
                      labelText: 'Mã đơn hoặc tên người nhận',
                      suffixIcon: IconButton(icon: const Icon(Icons.search), onPressed: _search),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (_orders != null)
                    FutureBuilder<List<OrderLite>>(
                      future: _orders,
                      builder: (context, snap) {
                        if (!snap.hasData) {
                          return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
                        }
                        final list = snap.data!;
                        if (list.isEmpty) return const Padding(padding: EdgeInsets.all(16), child: Text('Không tìm thấy đơn.'));
                        return Column(
                          children: [
                            for (final o in list)
                              Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: ListTile(
                                  title: Text(o.code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                                  subtitle: Text('${o.recipient} · ${o.platform}'),
                                  trailing: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(o.status, style: const TextStyle(fontWeight: FontWeight.w600)),
                                      Text(formatVnd(o.totalVnd), style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi(this.label, this.value, this.icon, this.color);

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Row(children: [Icon(icon, size: 18, color: color), const SizedBox(width: 6), Text(label, style: const TextStyle(fontSize: 13))]),
            const SizedBox(height: 4),
            Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: color)),
          ],
        ),
      ),
    );
  }
}

class _ExpressRow extends StatelessWidget {
  const _ExpressRow({required this.item});

  final ExpressItem item;

  @override
  Widget build(BuildContext context) {
    final d = deadlineLabel(item.deadline, DateTime.now(), what: item.stage);
    final color = switch (d.tone) {
      DeadlineTone.late => AppColors.danger,
      DeadlineTone.soon => AppColors.warning,
      DeadlineTone.ok => Colors.deepOrange,
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(Icons.bolt, color: color),
            const SizedBox(width: 12),
            Text(item.shortId, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
            const SizedBox(width: 12),
            // Flexible để nhãn dài tự xuống dòng thay vì tràn khỏi màn hình hẹp.
            Flexible(child: Align(alignment: Alignment.centerRight, child: Pill(d.text, color))),
          ],
        ),
      ),
    );
  }
}
