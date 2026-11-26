import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'warehouse_models.dart';

/// Nhóm liên kết lấy chung được: còn ở bước lấy hàng và cùng kho (hoặc chưa gắn kho).
List<String> combinablePickGroups(String groupId, String warehouseId, List<Map<String, dynamic>> linked) => [
      groupId,
      for (final g in linked)
        if (pickableStatuses.contains(pickString(g, ['fulfillmentStatus'])) &&
            (pickStringOrNull(g, ['warehouseId']) == null || g['warehouseId'] == warehouseId))
          pickString(g, ['id']),
    ];

/// Một vòng đi kho cho nhiều nhóm liên kết: danh sách theo lộ trình kệ, bấm dòng để quét ở đúng nhóm.
class CombinedPickScreen extends ConsumerWidget {
  const CombinedPickScreen({super.key, required this.groupId, required this.warehouseId});

  final String groupId;
  final String warehouseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiClientProvider);
    return SubPage(
      title: 'Lấy chung nhóm liên kết',
      child: LoadList<(List<String>, List<Map<String, dynamic>>)>(
        load: () async {
          final linked = rowsOf(await api.get('/order-groups/$groupId/linked'), 'linkedGroups');
          final ids = combinablePickGroups(groupId, warehouseId, linked);
          if (ids.length < 2) return (ids, <Map<String, dynamic>>[]);
          return (
            ids,
            rowsOf(await api.get('/warehouse/$warehouseId/picking-list', query: {'group_ids': ids.join(',')})),
          );
        },
        builder: (context, data, reload) {
          final (ids, lines) = data;
          if (ids.length < 2) {
            return [emptyNote('Chưa có nhóm liên kết nào cùng đang lấy hàng ở kho này.')];
          }
          return [
            Text('${ids.length} nhóm · ${lines.length} dòng — hàng của mỗi nhóm để khay riêng.',
                style: TextStyle(color: AppColors.inkSubtle)),
            const SizedBox(height: 10),
            for (final l in lines)
              RecordCard(
                mono: true,
                title: pickString(l, ['bin_code'], unassignedBin),
                lines: [
                  pickString(l, ['sku']),
                  'Nhóm ${shortId(pickString(l, ['order_group_id']))}',
                ],
                pills: [Pill('Nhóm ${ids.indexOf(pickString(l, ['order_group_id'])) + 1}', AppColors.stagePick)],
                trailing: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('${pickInt(l, ['picked_quantity'])}/${pickInt(l, ['quantity'])}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                ),
                onTap: () async {
                  await context.push('/pick/${pickString(l, ['order_group_id'])}');
                  await reload();
                },
              ),
          ];
        },
      ),
    );
  }
}
