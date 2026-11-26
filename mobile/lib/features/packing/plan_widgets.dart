/// Các khối hiển thị của kế hoạch đóng gói, giống web.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../core/format/units.dart';
import '../../core/json.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'packing_api.dart';
import 'packing_logic.dart';

/// Khung màu có viền cho các thông báo theo tab.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.color, required this.children});

  final Color color;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.45)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );
}

TextStyle subtle([double size = 12.5]) => TextStyle(fontSize: size, color: AppColors.inkSubtle);

const boldText = TextStyle(fontWeight: FontWeight.w700);
const monoText = TextStyle(fontFamily: 'monospace', fontSize: 12.5, fontWeight: FontWeight.w700);

/// Nút nhỏ nằm trong hàng / Wrap (theme mặc định đặt nút rộng hết cỡ).
ButtonStyle compactButton({Color? background}) => FilledButton.styleFrom(
      minimumSize: const Size(0, 40),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
      backgroundColor: background,
    );

ButtonStyle compactOutlined({Color? foreground}) => OutlinedButton.styleFrom(
      minimumSize: const Size(0, 40),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
      foregroundColor: foreground,
    );

/// Danh sách chọn một giá trị.
class Choice<T> extends StatelessWidget {
  const Choice({super.key, required this.label, required this.value, required this.options, required this.onChanged});

  final String label;
  final T? value;
  final Map<T, String> options;
  final ValueChanged<T?>? onChanged;

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<T>(
        key: ValueKey('$label|$value|${options.length}'),
        initialValue: options.containsKey(value) ? value : null,
        isExpanded: true,
        decoration: InputDecoration(labelText: label, isDense: true),
        items: [
          for (final o in options.entries)
            DropdownMenuItem(value: o.key, child: Text(o.value, overflow: TextOverflow.ellipsis)),
        ],
        onChanged: onChanged,
      );
}

/// Kiện gộp nhiều đơn: liệt kê món từng đơn.
List<Widget> sharedOrderWidgets(Map<String, dynamic> parcel, Map<String, dynamic> plan) => [
      for (final line in sharedOrderLines(parcel, rowsOf(plan['orders'])))
        Padding(padding: const EdgeInsets.only(top: 4), child: Text(line, style: const TextStyle(fontSize: 12.5))),
    ];

class MaterialTags extends StatelessWidget {
  const MaterialTags({super.key, required this.materials});

  final List<Map<String, dynamic>> materials;

  @override
  Widget build(BuildContext context) => materials.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [for (final m in materials) Pill(materialLabel(m), AppColors.primary)],
          ),
        );
}

/// Hàng cần đóng, theo đơn (bỏ đơn đã hủy).
class PackItemsList extends StatelessWidget {
  const PackItemsList({super.key, required this.orders});

  final List<Map<String, dynamic>> orders;

  @override
  Widget build(BuildContext context) {
    final total = orders.fold<int>(
        0, (n, o) => n + rowsOf(o['items']).fold<int>(0, (m, i) => m + pickInt(i, ['quantity'])));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        sectionTitle('Hàng cần đóng ($total)'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (index, order) in orders.indexed) ...[
                  if (index > 0) const Divider(height: 18),
                  if (orders.length > 1)
                    Text('${pickString(order, ['platformOrderId'])} · ${recipientNameOf(order)}',
                        style: subtle()),
                  for (final item in rowsOf(order['items']))
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(pickString(item, ['name']), maxLines: 2, overflow: TextOverflow.ellipsis),
                                Text(pickString(item, ['sku']), style: monoText.copyWith(color: AppColors.inkSubtle)),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text('×${pickInt(item, ['quantity'])}', style: boldText),
                        ],
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Các kiện của kế hoạch, nhóm theo đơn khi có nhiều người nhận.
class PlanParcelList extends StatelessWidget {
  const PlanParcelList({super.key, required this.plan});

  final Map<String, dynamic> plan;

  @override
  Widget build(BuildContext context) {
    final layout = groupParcelsByOrder(parcelsOf(plan));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final bucket in layout.groups) ...[
          if (layout.multi)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(bucket.heading, style: boldText.copyWith(fontSize: 12.5)),
            ),
          for (final parcel in bucket.parcels)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        '#${parcelNoOf(parcel)} ${pickString(boxOf(parcel), ['name'])} '
                        '(${pickString(boxOf(parcel), ['code'])})${showMailerBadge(parcel) ? ' · Túi niêm phong' : ''}',
                        style: boldText,
                      ),
                      if (parcelOrderCaption(parcel) case final caption?) Text(caption, style: subtle()),
                      Text(
                        '${outerDims(boxOf(parcel))}${boxCutNote(boxOf(parcel))}'
                        ' · ${formatGAsKg(pickDouble(parcel, ['estimatedWeightG']))}'
                        '${parcel['shippingCostVnd'] is num ? ' · ${formatVnd(parcel['shippingCostVnd'] as num)}' : ''}',
                        style: subtle(),
                      ),
                      ...sharedOrderWidgets(parcel, plan),
                      MaterialTags(materials: rowsOf(parcel['materials'])),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ],
    );
  }
}

/// Tồn thùng trong danh mục vật liệu (mở ra khi cần).
class BoxStockTable extends StatelessWidget {
  const BoxStockTable({super.key, required this.boxes, this.plan, this.error});

  final List<Map<String, dynamic>> boxes;
  final Map<String, dynamic>? plan;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final used = {for (final p in parcelsOf(plan)) pickString(boxOf(p), ['code'])};
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      title: const Text('Tồn thùng', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
      expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (error != null)
          Text(error!, style: TextStyle(color: AppColors.danger, fontSize: 12.5))
        else if (boxes.isEmpty)
          Text('Chưa có thùng trong danh mục vật liệu.', style: subtle())
        else
          for (final row in boxes)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(pickString(row, ['name']),
                            style: TextStyle(
                                color: used.contains(row['code']) ? AppColors.primary : null,
                                fontWeight: used.contains(row['code']) ? FontWeight.w700 : null)),
                        Text(
                          [
                            if (row['lengthCm'] is num && row['widthCm'] is num && row['heightCm'] is num)
                              formatDimsCm(pickDouble(row, ['lengthCm']), pickDouble(row, ['widthCm']),
                                  pickDouble(row, ['heightCm'])),
                            if (used.contains(row['code'])) 'kế hoạch đang dùng',
                          ].join(' · '),
                          style: subtle(11.5),
                        ),
                      ],
                    ),
                  ),
                  Text('Mới ${pickInt(row, ['qtyNew', 'quantityNew'])}',
                      style: TextStyle(
                          fontSize: 12.5,
                          color: pickInt(row, ['qtyNew', 'quantityNew']) == 0 ? AppColors.danger : null)),
                  const SizedBox(width: 10),
                  Text('Tái dùng ${pickInt(row, ['qtyReused', 'quantityReused'])}', style: const TextStyle(fontSize: 12.5)),
                ],
              ),
            ),
      ],
    );
  }
}

/// Chọn nguồn thùng (mới / tái sử dụng) trước khi niêm phong hoặc đóng nhanh.
class BoxSourceFields extends StatelessWidget {
  const BoxSourceFields({super.key, required this.info, required this.value, required this.onChanged});

  final Map<String, dynamic>? info;
  final BoxSourceInput value;
  final ValueChanged<BoxSourceInput> onChanged;

  @override
  Widget build(BuildContext context) {
    final reusedBlocked = info != null && info!['reusedAllowed'] != true;
    final forced = pickString(info, ['forcedNewReason']);
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Choice<String>(
            label: 'Nguồn thùng',
            value: value.source,
            options: {
              'auto': 'Theo gợi ý (${boxSourceName(info?['planned'])})',
              'new': 'Thùng mới',
              if (!reusedBlocked) 'reused': 'Thùng tái sử dụng',
            },
            onChanged: (v) => onChanged(BoxSourceInput(source: v ?? 'auto')),
          ),
          if (forced.isNotEmpty) Text('(${forcedNewLabels[forced] ?? forced})', style: subtle()),
          if (info?['outOfStock'] == true)
            Text('Thùng gợi ý đã hết', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
          if (value.needsReason(info?['planned'])) ...[
            const SizedBox(height: 8),
            Choice<String>(
              label: 'Lý do',
              value: value.reason,
              options: boxSourceReasons,
              onChanged: (v) => onChanged(BoxSourceInput(source: value.source, reason: v, note: value.note)),
            ),
            if (value.reason == 'OTHER') ...[
              const SizedBox(height: 8),
              TextFormField(
                initialValue: value.note,
                maxLength: 300,
                decoration: const InputDecoration(labelText: 'Ghi chú (bắt buộc)', counterText: '', isDense: true),
                onChanged: (v) => onChanged(BoxSourceInput(source: value.source, reason: value.reason, note: v)),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

/// Bảng so sánh thùng của một kiện. Giữ đúng thứ tự BE trả (thứ hạng quyết định, điểm chỉ để so nhanh).
class BoxComparisonList extends StatelessWidget {
  const BoxComparisonList({super.key, required this.comparison});

  final Map<String, dynamic> comparison;

  static const _criteria = {
    'billable': 'Cân tính cước',
    'packaging': 'Giá thùng + vật tư',
    'fill': 'Lấp đầy',
    'handling': 'Ít phải gập',
  };

  String _score(num n) => n.toStringAsFixed(1).replaceAll('.', ',');

  @override
  Widget build(BuildContext context) {
    final rows = rowsOf(comparison['rows']);
    if (rows.isEmpty) return const SizedBox.shrink();
    final usable = [for (final r in rows) if (r['eligible'] == true) r];
    final unusable = [for (final r in rows) if (r['eligible'] != true) r];
    final weights = asMap(comparison['weights']);
    final cheapest = comparison['prefer'] == 'cheapest';
    final order = cheapest
        ? 'Cân tính cước › Giá thùng + vật tư › Số kiện › Cân quy đổi › Số món gập'
        : 'Số kiện › Cân tính cước › Giá thùng + vật tư › Cân quy đổi › Số món gập';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Xếp theo luật ưu tiên của bộ giải · ${usable.length} thùng dùng được, ${unusable.length} không vừa',
            style: subtle()),
        if (comparison['scoresConsistent'] == false)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Có thùng điểm cao hơn nhưng xếp sau: thứ hạng mới là quyết định, điểm chỉ để so nhanh.',
                style: TextStyle(color: AppColors.warningText, fontSize: 12.5)),
          ),
        for (final r in usable)
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: r['isChosen'] == true ? AppColors.primary : AppColors.hairline),
              color: r['isChosen'] == true ? AppColors.primary.withValues(alpha: 0.06) : null,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 12,
                      backgroundColor: r['rank'] == 1 ? AppColors.primary : AppColors.surface3,
                      child: Text('${r['rank'] ?? ''}',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: r['rank'] == 1 ? AppColors.onPrimary : AppColors.ink)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${pickString(r, ['boxName'])}'
                            '${pickInt(r, ['parcels'], 1) > 1 ? ' × ${pickInt(r, ['parcels'])} thùng' : ''}'
                            '${r['isChosen'] == true ? ' · Đang dùng' : ''}',
                            style: boldText,
                          ),
                          Text(pickString(r, ['boxCode']), style: subtle(11.5)),
                        ],
                      ),
                    ),
                    Text('${_score(pickDouble(r, ['score']))}/10', style: boldText),
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 14,
                  runSpacing: 4,
                  children: [
                    Text('Cước ${r['billableWeightG'] is num ? formatGAsKg(r['billableWeightG'] as num) : '—'}',
                        style: const TextStyle(fontSize: 12.5)),
                    Text('Chi phí ${r['packagingCostVnd'] is num ? formatVnd(r['packagingCostVnd'] as num) : '—'}',
                        style: const TextStyle(fontSize: 12.5)),
                    Text('Lấp đầy ${r['fillRatio'] is num ? '${((r['fillRatio'] as num) * 100).round()}%' : '—'}',
                        style: const TextStyle(fontSize: 12.5)),
                    Text('Tồn ${r['available'] ?? '—'}',
                        style: TextStyle(fontSize: 12.5, color: r['available'] == 0 ? AppColors.danger : null)),
                  ],
                ),
                if (r['isChosen'] != true && pickString(r, ['verdict']).isNotEmpty)
                  Padding(padding: const EdgeInsets.only(top: 4), child: Text(pickString(r, ['verdict']), style: subtle())),
              ],
            ),
          ),
        if (unusable.isNotEmpty) ...[
          sectionTitle('Không dùng được (${unusable.length})'),
          for (final r in unusable)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text.rich(TextSpan(children: [
                TextSpan(text: '${pickString(r, ['boxName'])} (${pickString(r, ['boxCode'])})\n'),
                TextSpan(text: pickString(r, ['verdict']), style: subtle()),
              ])),
            ),
        ],
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: const Text('Cách chấm điểm', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
          expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Thứ hạng quyết định chọn thùng. So lần lượt, hơn ở tiêu chí trước thì thắng: $order.', style: subtle()),
            const SizedBox(height: 6),
            Text(
              'Điểm /10 để so nhanh: mỗi tiêu chí thùng tốt nhất được 10, thùng khác tính theo tỉ lệ; '
              'điểm tổng cộng các tiêu chí nhân trọng số. Thùng không dùng được không chấm.',
              style: subtle(),
            ),
            for (final r in usable)
              if (asMap(r['criteria']) case final scores?)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '${pickString(r, ['boxCode'])}: ${[
                      for (final c in _criteria.entries)
                        '${c.value} ${_score(pickDouble(scores, [c.key]))} (${(pickDouble(weights, [c.key]) * 100).round()}%)',
                    ].join(' · ')}',
                    style: const TextStyle(fontSize: 12.5),
                  ),
                ),
          ],
        ),
      ],
    );
  }
}

/// Lời hướng dẫn của kiện (tóm tắt + từng món). Các bước thao tác đầy đủ đi cùng hoạt ảnh nằm trong khung 3D.
class GuideText extends StatelessWidget {
  const GuideText({super.key, required this.guide});

  final Map<String, dynamic>? guide;

  @override
  Widget build(BuildContext context) {
    final steps = rowsOf(guide?['steps']);
    if (steps.isEmpty) {
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text('Chưa có hướng dẫn từng bước.', style: subtle(13)),
      );
    }
    final summary = pickString(guide, ['summary']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (summary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(summary)),
        for (final (i, step) in steps.indexed)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: AppColors.primary,
                  child: Text('${i + 1}',
                      style: TextStyle(fontSize: 12, color: AppColors.onPrimary, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(pickString(step, ['instruction'])),
                      if (pickString(step, ['tip']).isNotEmpty) Text('Lưu ý: ${pickString(step, ['tip'])}', style: subtle()),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// 👍/👎 dưới hướng dẫn. Hướng dẫn AI được chấm hữu ích sẽ thành ví dụ mẫu cho lần viết sau.
class GuideRating extends ConsumerStatefulWidget {
  const GuideRating({super.key, required this.groupId, required this.parcelNo, required this.guide, required this.onPlan});

  final String groupId;
  final int parcelNo;
  final Map<String, dynamic> guide;
  final ValueChanged<Map<String, dynamic>> onPlan;

  @override
  ConsumerState<GuideRating> createState() => _GuideRatingState();
}

class _GuideRatingState extends ConsumerState<GuideRating> {
  final _comment = TextEditingController();
  bool _showComment = false;
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _rate(bool helpful) async {
    setState(() => _busy = true);
    await runAction(context, () async {
      final res = await ref
          .read(packingApiProvider)
          .rateGuide(widget.groupId, widget.parcelNo, helpful, _comment.text);
      widget.onPlan(res.plan);
      if (mounted) {
        showToast(context, res.savedAsExample ? 'Đã thêm làm ví dụ mẫu cho AI.' : 'Đã ghi nhận đánh giá.');
      }
    });
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final rating = asMap(widget.guide['rating']);
    final helpful = rating?['helpful'];
    final examples = pickInt(widget.guide, ['examplesUsed']);
    Widget button(bool value, IconData icon, String label) => helpful == value
        ? FilledButton.icon(
            style: compactButton(), onPressed: _busy ? null : () => _rate(value), icon: Icon(icon, size: 16), label: Text(label))
        : OutlinedButton.icon(
            style: compactOutlined(),
            onPressed: _busy ? null : () => _rate(value),
            icon: Icon(icon, size: 16),
            label: Text(label));
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
              widget.guide['source'] == 'ai'
                  ? 'Hướng dẫn này dễ làm theo không?'
                  : 'Hướng dẫn mẫu (không do AI viết).',
              style: boldText),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              button(true, Icons.thumb_up_outlined, 'Dễ làm theo'),
              button(false, Icons.thumb_down_outlined, 'Khó hiểu'),
            ],
          ),
          if (_showComment)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: TextField(
                controller: _comment,
                maxLength: 300,
                decoration: const InputDecoration(
                    labelText: 'Góp ý thêm', helperText: 'Góp ý gửi kèm khi bạn chọn đánh giá', counterText: ''),
              ),
            )
          else
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(onPressed: () => setState(() => _showComment = true), child: const Text('Thêm góp ý')),
            ),
          if (pickString(rating, ['comment']).isNotEmpty)
            Text('Góp ý đã gửi: ${pickString(rating, ['comment'])}', style: subtle()),
          if (examples > 0) Text('AI đã tham khảo $examples ví dụ mẫu', style: subtle()),
        ],
      ),
    );
  }
}

/// Admin: xem đúng những gì đã gửi cho mô hình và mô hình trả về.
class GuideTraceScreen extends ConsumerWidget {
  const GuideTraceScreen({super.key, required this.groupId, required this.parcelNo});

  final String groupId;
  final int parcelNo;

  static String _pretty(String raw) {
    try {
      return const JsonEncoder.withIndent('  ').convert(jsonDecode(raw));
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SubPage(
      title: 'Dữ liệu đã gửi cho AI',
      child: LoadList<Map<String, dynamic>>(
        load: () async => await ref.read(packingApiProvider).guideTrace(groupId, parcelNo) ?? const {},
        builder: (context, trace, _) {
          if (trace.isEmpty) {
            return [emptyNote('Không có dữ liệu. Nhật ký chỉ lưu 30 ngày, hoặc hướng dẫn chưa được viết.')];
          }
          Widget block(String title, String body) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  sectionTitle(title),
                  SelectableText(body, style: const TextStyle(fontFamily: 'monospace', fontSize: 11.5)),
                ],
              );
          final fallback = pickString(trace, ['fallbackReason']);
          final raw = pickString(trace, ['rawResponse']);
          return [
            Text(
              '${trace['source'] == 'ai' ? 'AI · ${pickString(trace, ['model'])}' : 'Câu mẫu${fallback.isEmpty ? '' : ' ($fallback)'}'}'
              '${trace['latencyMs'] is num ? ' · ${trace['latencyMs']} ms' : ''} · ví dụ mẫu ${pickInt(trace, ['examplesUsed'])}',
              style: subtle(),
            ),
            block('Luật viết (system prompt)', pickString(trace, ['systemPrompt'])),
            block('Dữ kiện đã gửi (JSON)', _pretty(pickString(trace, ['userPayload']))),
            if (raw.isNotEmpty)
              block('Phản hồi thô của mô hình', _pretty(raw))
            else
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text('Không có phản hồi thô: hệ thống dùng câu mẫu hoặc lời gọi AI bị lỗi.', style: subtle()),
              ),
          ];
        },
      ),
    );
  }
}
