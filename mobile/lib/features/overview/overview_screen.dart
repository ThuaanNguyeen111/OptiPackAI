import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/mock_providers.dart';
import '../../core/format/deadline.dart';
import '../../core/network/api_exception.dart';
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

  Future<void> _openOrder(OrderLite order) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _OrderDetailSheet(order: order),
    );
    // Hỏa Tốc có thể vừa đổi: tải lại danh sách "Hỏa tốc đang chạy".
    ref.invalidate(overviewSummaryProvider);
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
              error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(overviewSummaryProvider)),
              data: (s) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  const _FilterBar(),
                  const SizedBox(height: 14),
                  if (s.actions.isNotEmpty) ...[
                    _ActionQueue(actions: s.actions),
                    const SizedBox(height: 14),
                  ],
                  _RevenueCard(summary: s),
                  const SizedBox(height: 12),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.7,
                    children: [
                      _Kpi('Đơn nhận', '${s.ordersToday}', Icons.receipt_long_outlined, AppColors.stagePick,
                          change: s.ordersChange),
                      _Kpi('Chờ xử lý', '${s.pending}', Icons.pending_actions_outlined, AppColors.warning),
                      _Kpi('Hỏa Tốc quá hạn', '${s.overdue}', Icons.timer_off_outlined, AppColors.danger),
                      _Kpi('Hàng hoàn', '${s.returnsOpen}', Icons.assignment_return_outlined, Colors.deepOrange),
                    ],
                  ),
                  if (s.daily.length > 1) ...[
                    const SizedBox(height: 12),
                    _DailyChart(points: s.daily),
                  ],
                  if (s.byPlatform.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _PlatformBlock(items: s.byPlatform, total: s.revenueVnd),
                  ],
                  const SizedBox(height: 12),
                  _OpsBlock(summary: s),
                  if (s.shortageSkuCount > 0 || s.outOfStockSkuCount > 0 || s.materialsLow.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _WarehouseBlock(summary: s),
                  ],
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
                                  onTap: () => _openOrder(o),
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
  const _Kpi(this.label, this.value, this.icon, this.color, {this.change});

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final double? change;

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
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: color)),
                const SizedBox(width: 8),
                Padding(padding: const EdgeInsets.only(bottom: 4), child: _Delta(change)),
              ],
            ),
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

/// Chi tiết 1 đơn (chỉ đọc) + nút đánh dấu / bỏ Hỏa Tốc cho nhóm đơn chứa nó.
class _OrderDetailSheet extends ConsumerStatefulWidget {
  const _OrderDetailSheet({required this.order});

  final OrderLite order;

  @override
  ConsumerState<_OrderDetailSheet> createState() => _OrderDetailSheetState();
}

class _OrderDetailSheetState extends ConsumerState<_OrderDetailSheet> {
  late Future<OrderDetail> _detail = ref.read(overviewRepositoryProvider).orderDetail(widget.order);
  bool _busy = false;
  OrderDetail? _shown;

  Future<void> _toggleExpress(OrderDetail d) async {
    final groupId = d.groupId;
    if (groupId == null) return;
    final express = !d.groupExpress;
    final ok = await confirmDialog(
      context,
      title: express ? 'Đánh dấu Hỏa Tốc?' : 'Bỏ Hỏa Tốc?',
      message: express
          ? 'Nhóm đơn này sẽ được ưu tiên, hạn đóng gói 4 giờ làm việc (8h–17h, tính cả thứ 7).'
          : 'Nhóm đơn trở về mức bình thường, không còn hạn Hỏa Tốc.',
      confirmLabel: express ? 'Đánh dấu' : 'Bỏ Hỏa Tốc',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(overviewRepositoryProvider).setExpress(groupId, express);
      if (!mounted) return;
      setState(() => _shown = d.withExpress(express));
      showToast(context, express ? 'Đã đánh dấu Hỏa Tốc.' : 'Đã bỏ Hỏa Tốc.');
    } on ApiException catch (e) {
      // VD ORD_GROUP_PRIORITY_LOCKED: đơn Hỏa Tốc của website do khách chọn, không đổi tay được.
      if (mounted) showToast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: FutureBuilder<OrderDetail>(
          future: _detail,
          builder: (context, snap) {
            if (snap.hasError) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ErrorState(
                    error: snap.error!,
                    onRetry: () => setState(() {
                      _detail = ref.read(overviewRepositoryProvider).orderDetail(widget.order);
                    }),
                  ),
                ],
              );
            }
            final d = _shown ?? snap.data;
            if (d == null) {
              return const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()));
            }
            return SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(d.code,
                            style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 16)),
                      ),
                      Pill(d.status, AppColors.stagePick),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(d.platform, style: TextStyle(color: AppColors.inkSubtle)),
                  if (d.needCancelConfirm) ...[
                    const SizedBox(height: 8),
                    Pill('Khách yêu cầu hủy — chờ xác nhận', AppColors.warning),
                  ],
                  const SizedBox(height: 12),
                  Text(d.recipient, style: const TextStyle(fontWeight: FontWeight.w700)),
                  if (d.phone.isNotEmpty) Text(d.phone),
                  if (d.address.isNotEmpty) Text(d.address, style: TextStyle(color: AppColors.inkSubtle)),
                  const Divider(height: 24),
                  for (final l in d.items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${l.quantity} × ', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(l.name.isEmpty ? l.sku : l.name),
                                Text(l.sku,
                                    style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.inkSubtle)),
                              ],
                            ),
                          ),
                          Text(formatVnd(l.lineTotalVnd)),
                        ],
                      ),
                    ),
                  const Divider(height: 24),
                  Row(
                    children: [
                      const Expanded(child: Text('Tổng tiền', style: TextStyle(fontWeight: FontWeight.w700))),
                      Text(formatVnd(d.totalVnd), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (d.groupId == null)
                    Text('Đơn chưa được gom vào nhóm nên chưa đánh dấu Hỏa Tốc được.',
                        style: TextStyle(fontSize: 12, color: AppColors.inkSubtle))
                  else
                    SizedBox(
                      width: double.infinity,
                      child: d.groupExpress
                          ? OutlinedButton.icon(
                              onPressed: _busy ? null : () => _toggleExpress(d),
                              icon: const Icon(Icons.flash_off_outlined),
                              label: const Text('Bỏ Hỏa Tốc'),
                            )
                          : FilledButton.icon(
                              onPressed: _busy ? null : () => _toggleExpress(d),
                              icon: const Icon(Icons.flash_on_outlined),
                              label: const Text('Đánh dấu Hỏa Tốc'),
                            ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

String _percent(double ratio, {bool signed = false}) {
  final v = ratio * 100;
  final text = v.abs() >= 10 ? v.abs().toStringAsFixed(0) : v.abs().toStringAsFixed(1).replaceAll('.', ',');
  final sign = signed ? (v > 0 ? '+' : (v < 0 ? '-' : '')) : '';
  return '$sign$text%';
}

/// Mũi tên + % thay đổi so với kỳ trước (xanh khi tăng, đỏ khi giảm; kèm mũi tên nên không chỉ dựa vào màu).
class _Delta extends StatelessWidget {
  const _Delta(this.change);
  final double? change;

  @override
  Widget build(BuildContext context) {
    final c = change;
    if (c == null) return const SizedBox.shrink();
    final up = c >= 0;
    final color = up ? AppColors.good : AppColors.danger;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(up ? Icons.trending_up : Icons.trending_down, size: 14, color: color),
        const SizedBox(width: 3),
        Text(_percent(c, signed: true), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: color)),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text, {this.icon});
  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          if (icon != null) ...[Icon(icon, size: 18, color: AppColors.primary), const SizedBox(width: 6)],
          Text(text, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        ],
      );
}

String _platformName(String p) => switch (p.toLowerCase()) {
      'lazada' => 'Lazada',
      'tiktok' => 'TikTok',
      'tiki' => 'Tiki',
      'aurelle' => 'AURELLE',
      '' => 'Khác',
      _ => p,
    };

/// Chọn khoảng ngày và sàn; đổi là tải lại số liệu.
class _FilterBar extends ConsumerWidget {
  const _FilterBar();

  static const _platforms = ['lazada', 'tiki', 'aurelle'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(overviewFilterProvider);
    void set(OverviewFilter f) => ref.read(overviewFilterProvider.notifier).state = f;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: double.infinity,
          child: SegmentedButton<OverviewRange>(
            showSelectedIcon: false,
            segments: [for (final r in OverviewRange.values) ButtonSegment(value: r, label: Text(r.label))],
            selected: {filter.range},
            onSelectionChanged: (v) => set(filter.copyWith(range: v.first)),
          ),
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              ChoiceChip(
                label: const Text('Mọi sàn'),
                selected: filter.platform == null,
                onSelected: (_) => set(filter.copyWith(clearPlatform: true)),
              ),
              for (final p in _platforms) ...[
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(_platformName(p)),
                  selected: filter.platform == p,
                  onSelected: (_) => set(filter.copyWith(platform: p)),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// "Cần xử lý ngay": các hàng việc có số > 0, việc nghiêm trọng lên đầu.
class _ActionQueue extends StatelessWidget {
  const _ActionQueue({required this.actions});
  final List<ActionItem> actions;

  Color _color(ActionSeverity s) => switch (s) {
        ActionSeverity.danger => AppColors.danger,
        ActionSeverity.warning => AppColors.warning,
        ActionSeverity.info => AppColors.stagePick,
      };

  IconData _icon(ActionSeverity s) => switch (s) {
        ActionSeverity.danger => Icons.priority_high,
        ActionSeverity.warning => Icons.warning_amber_rounded,
        ActionSeverity.info => Icons.pending_actions_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final sorted = [...actions]..sort((a, b) => b.severity.index.compareTo(a.severity.index));
    final worst = sorted.first.severity;
    return StageCard(
      accent: _color(worst),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionTitle('Cần xử lý ngay', icon: Icons.notifications_active_outlined),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final a in sorted) Pill('${a.label}: ${a.count}', _color(a.severity), icon: _icon(a.severity)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RevenueCard extends StatelessWidget {
  const _RevenueCard({required this.summary});
  final OverviewSummary summary;

  @override
  Widget build(BuildContext context) {
    Widget line(String label, int vnd, double? change, {bool big = false}) => Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TextStyle(fontSize: 13, color: AppColors.inkSubtle, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(formatVnd(vnd),
                      style: TextStyle(fontSize: big ? 26 : 18, fontWeight: FontWeight.w800, color: AppColors.ink)),
                ],
              ),
            ),
            _Delta(change),
          ],
        );
    return StageCard(
      accent: AppColors.stageShip,
      icon: Icons.payments_outlined,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            line('Doanh thu đặt hàng', summary.revenueVnd, summary.revenueChange, big: true),
            const SizedBox(height: 10),
            Divider(height: 1, color: AppColors.hairline),
            const SizedBox(height: 10),
            line('Doanh thu đã giao', summary.revenueDeliveredVnd, summary.revenueDeliveredChange),
            const SizedBox(height: 6),
            Text('So với kỳ liền trước cùng độ dài.', style: TextStyle(fontSize: 11, color: AppColors.inkTertiary)),
          ],
        ),
      ),
    );
  }
}

/// Biểu đồ cột doanh thu theo ngày (vẽ tay, không thêm thư viện).
class _DailyChart extends StatelessWidget {
  const _DailyChart({required this.points});
  final List<DailyPoint> points;

  @override
  Widget build(BuildContext context) {
    final maxV = points.fold<int>(0, (m, p) => p.revenueVnd > m ? p.revenueVnd : m);
    // 30 ngày: chỉ ghi nhãn vài cột để không chen chúc.
    final step = points.length > 10 ? (points.length / 5).ceil() : 1;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionTitle('Doanh thu theo ngày', icon: Icons.bar_chart_rounded),
            const SizedBox(height: 12),
            SizedBox(
              height: 130,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < points.length; i++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 1.5),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Flexible(
                              child: FractionallySizedBox(
                                heightFactor: maxV == 0 ? 0.02 : (points[i].revenueVnd / maxV).clamp(0.02, 1.0),
                                child: Container(
                                  decoration: BoxDecoration(
                                    borderRadius: const BorderRadius.vertical(top: Radius.circular(5)),
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      colors: [AppColors.primary, AppColors.primary.withValues(alpha: 0.45)],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            SizedBox(
                              height: 14,
                              child: i % step == 0
                                  ? Text(
                                      points[i].date.length >= 10 ? points[i].date.substring(8, 10) : '',
                                      style: TextStyle(fontSize: 10, color: AppColors.inkSubtle),
                                    )
                                  : null,
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Text('Cao nhất: ${formatVnd(maxV)} · số dưới cột là ngày trong tháng',
                style: TextStyle(fontSize: 11, color: AppColors.inkTertiary)),
          ],
        ),
      ),
    );
  }
}

class _PlatformBlock extends StatelessWidget {
  const _PlatformBlock({required this.items, required this.total});
  final List<PlatformSales> items;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionTitle('Theo sàn', icon: Icons.storefront_outlined),
            const SizedBox(height: 10),
            for (final p in items) ...[
              Row(
                children: [
                  Expanded(child: Text(_platformName(p.platform), style: const TextStyle(fontWeight: FontWeight.w700))),
                  Text('${p.orders} đơn · ${formatVnd(p.revenueVnd)}', style: TextStyle(color: AppColors.inkSubtle)),
                ],
              ),
              const SizedBox(height: 5),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  minHeight: 7,
                  value: total == 0 ? 0 : (p.revenueVnd / total).clamp(0.0, 1.0),
                  backgroundColor: AppColors.surface3,
                ),
              ),
              const SizedBox(height: 10),
            ],
          ],
        ),
      ),
    );
  }
}

/// Giao hàng + chi phí + hoàn hàng + Hỏa Tốc: các tỉ lệ vận hành, chỉ hiện chỉ số BE có số liệu.
class _OpsBlock extends StatelessWidget {
  const _OpsBlock({required this.summary});
  final OverviewSummary summary;

  @override
  Widget build(BuildContext context) {
    final s = summary;
    final rows = <(IconData, String, String)>[
      if (s.firstAttemptRate != null) (Icons.check_circle_outline, 'Giao thành công lần đầu', _percent(s.firstAttemptRate!)),
      if (s.avgDeliveryHours != null)
        (Icons.schedule, 'Thời gian giao trung bình', '${s.avgDeliveryHours!.toStringAsFixed(1).replaceAll('.', ',')} giờ'),
      if (s.expressOnTimeRate != null) (Icons.bolt, 'Hỏa Tốc đúng hạn', _percent(s.expressOnTimeRate!)),
      if (s.returnRate != null) (Icons.assignment_return_outlined, 'Tỷ lệ hoàn hàng', _percent(s.returnRate!)),
      if (s.shippingCostPerOrderVnd != null)
        (Icons.local_shipping_outlined, 'Phí ship / đơn', formatVnd(s.shippingCostPerOrderVnd!)),
      if (s.packagingCostPerOrderVnd != null)
        (Icons.inventory_2_outlined, 'Bao bì / đơn', formatVnd(s.packagingCostPerOrderVnd!)),
      if (s.fulfillmentCostRate != null)
        (Icons.percent, 'Chi phí ship + bao bì / doanh thu', _percent(s.fulfillmentCostRate!)),
    ];
    if (rows.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionTitle('Vận hành', icon: Icons.speed_outlined),
            const SizedBox(height: 8),
            for (final r in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    Icon(r.$1, size: 18, color: AppColors.inkSubtle),
                    const SizedBox(width: 10),
                    Expanded(child: Text(r.$2)),
                    Text(r.$3, style: const TextStyle(fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _WarehouseBlock extends StatelessWidget {
  const _WarehouseBlock({required this.summary});
  final OverviewSummary summary;

  @override
  Widget build(BuildContext context) {
    final s = summary;
    return StageCard(
      accent: AppColors.warning,
      icon: Icons.warehouse_outlined,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionTitle('Cảnh báo kho'),
            const SizedBox(height: 8),
            if (s.shortageSkuCount > 0)
              Text('${s.shortageSkuCount} SKU đang thiếu so với đơn chờ lấy',
                  style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
            for (final k in s.shortageSkus)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text('• ${k.sku}: thiếu ${k.shortage}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5)),
              ),
            if (s.outOfStockSkuCount > 0) ...[
              const SizedBox(height: 6),
              Text('${s.outOfStockSkuCount} SKU có ô kệ nhưng tồn bằng 0',
                  style: TextStyle(color: AppColors.warningText, fontWeight: FontWeight.w700)),
            ],
            if (s.materialsLow.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Vật tư dưới mức đặt lại:', style: TextStyle(color: AppColors.warningText, fontWeight: FontWeight.w700)),
              for (final m in s.materialsLow)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text('• ${m.name}: còn ${m.usable} (mức ${m.reorderLevel})', style: const TextStyle(fontSize: 13)),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
