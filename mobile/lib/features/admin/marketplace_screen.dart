import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';

const platformNames = {'lazada': 'Lazada', 'aurelle': 'AURELLE', 'tiki': 'Tiki'};

class _MarketData {
  const _MarketData(this.shops, this.failed, this.errors);
  final Map<String, List<Map<String, dynamic>>> shops;
  final List<Map<String, dynamic>> failed;
  final Map<String, String> errors;
}

/// Kết nối sàn: shop đã kết nối, đồng bộ đơn, ngắt kết nối và cập nhật trạng thái gửi lỗi.
class MarketplaceScreen extends ConsumerStatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  ConsumerState<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends ConsumerState<MarketplaceScreen> {
  final _list = GlobalKey<LoadListState<_MarketData>>();

  ApiClient get _api => ref.read(apiClientProvider);
  Future<void> _reload() async => _list.currentState?.reload();

  Future<_MarketData> _load() async {
    final shops = <String, List<Map<String, dynamic>>>{};
    final errors = <String, String>{};
    for (final p in platformNames.keys) {
      try {
        shops[p] = rowsOf(await _api.get('/marketplace/$p/shops'), 'shops');
      } catch (e) {
        errors[p] = errorText(e);
      }
    }
    var failed = <Map<String, dynamic>>[];
    try {
      failed = rowsOf(await _api.get('/admin/writeback/failed'), 'rows');
    } catch (e) {
      errors['writeback'] = errorText(e);
    }
    return _MarketData(shops, failed, errors);
  }

  Future<void> _connect(String platform) async {
    Map<String, dynamic>? res;
    await runAction(context, () async {
      res = asMap(await _api.get('/marketplace/$platform/connect'));
    });
    final url = pickStringOrNull(res, ['url', 'authorizationUrl', 'authUrl', 'redirectUrl']);
    if (!mounted || res == null) return;
    if (url == null) {
      showToast(context, 'Máy chủ không trả liên kết kết nối.', error: true);
      return;
    }
    await showSecret(context,
        title: 'Liên kết kết nối ${platformNames[platform]}',
        value: url,
        note: 'Sao chép rồi mở bằng trình duyệt để đăng nhập sàn. Xong thì kéo xuống để tải lại.');
    await _reload();
  }

  Future<void> _sync(String platform, String shopId) async {
    Map<String, dynamic>? res;
    final ok = await runAction(context, () async {
      res = asMap(await _api.post('/orders/$platform/sync?shop_id=${Uri.encodeQueryComponent(shopId)}'));
    });
    if (!ok || !mounted) return;
    showToast(context, 'Đã đồng bộ: lấy ${pickInt(res, ['fetched'])}, ghi ${pickInt(res, ['upserted'])} đơn.');
    await _reload();
  }

  Future<void> _disconnect(String platform, String shopId, String name) async {
    final ok = await confirmDialog(context,
        title: 'Ngắt kết nối shop?', message: 'Ngừng đồng bộ đơn của $name. Đơn đã về vẫn giữ nguyên.');
    if (!ok || !mounted) return;
    if (await runAction(context,
        () async => _api.delete('/marketplace/$platform/shops/${Uri.encodeComponent(shopId)}'),
        success: 'Đã ngắt kết nối.')) {
      await _reload();
    }
  }

  Widget _shop(String platform, Map<String, dynamic> s) {
    final id = pickString(s, ['shopId']);
    final name = pickString(s, ['shopName'], id);
    final active = s['isActive'] == true;
    return RecordCard(
      title: name,
      lines: [
        'Mã shop: $id',
        'Đồng bộ gần nhất: ${dateTimeText(s['lastPolledAt']).isEmpty ? 'chưa có' : dateTimeText(s['lastPolledAt'])}',
        if (dateTimeText(s['disconnectedAt']).isNotEmpty) 'Đã ngắt: ${dateTimeText(s['disconnectedAt'])}',
      ],
      pills: [Pill(active ? 'Đang kết nối' : 'Đã ngắt', active ? AppColors.good : AppColors.inkSubtle)],
      actions: [
        if (active) CardAction('Đồng bộ đơn ngay', () => _sync(platform, id), icon: Icons.sync),
        if (active)
          CardAction('Ngắt kết nối', () => _disconnect(platform, id, name), icon: Icons.link_off, danger: true),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Kết nối sàn',
      child: LoadList<_MarketData>(
        key: _list,
        load: _load,
        builder: (context, data, _) => [
          for (final p in platformNames.entries) ...[
            Row(
              children: [
                Expanded(child: sectionTitle(p.value)),
                TextButton.icon(
                    onPressed: () => _connect(p.key), icon: const Icon(Icons.add_link), label: const Text('Kết nối')),
              ],
            ),
            if (data.errors[p.key] != null) emptyNote(data.errors[p.key]!),
            if (data.shops[p.key]?.isEmpty ?? false) emptyNote('Chưa kết nối shop nào.'),
            for (final s in data.shops[p.key] ?? const <Map<String, dynamic>>[]) _shop(p.key, s),
          ],
          sectionTitle('Cập nhật trạng thái gửi sàn bị lỗi'),
          if (data.errors['writeback'] != null) emptyNote(data.errors['writeback']!),
          if (data.errors['writeback'] == null && data.failed.isEmpty) emptyNote('Không có mục nào bị lỗi.'),
          for (final r in data.failed)
            RecordCard(
              title: '${pickString(r, ['kind'])} · nhóm ${shortId(pickString(r, ['orderGroupId']))}',
              lines: [
                'Đã thử ${pickInt(r, ['attempts'])} lần · ${dateTimeText(r['updatedAt'])}',
                pickString(r, ['lastError']),
              ],
              actions: [
                CardAction('Gửi lại', () async {
                  if (await runAction(context,
                      () async => _api.post('/admin/writeback/${Uri.encodeComponent(pickString(r, ['id']))}/retry'),
                      success: 'Đã đưa vào hàng gửi lại.')) {
                    await _reload();
                  }
                }, icon: Icons.replay),
              ],
            ),
        ],
      ),
    );
  }
}
