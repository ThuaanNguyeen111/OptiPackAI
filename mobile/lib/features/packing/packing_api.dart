/// Lời gọi BE của trang Đóng gói, khớp `fe/src/api/packing-plan.api.ts`.
/// Mọi thao tác gửi `expected_version` của kế hoạch; BE trả 409 khi dữ liệu vừa bị người khác đổi.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../shared/admin_kit.dart';
import '../offline/pending_action.dart';

class PackingApi {
  const PackingApi(this.api);

  final ApiClient api;

  String _path(String groupId, [String suffix = '']) =>
      '/order-groups/${Uri.encodeComponent(groupId)}/packing-plan$suffix';

  Future<List<Map<String, dynamic>>> listGroups([Map<String, dynamic> query = const {}]) async =>
      rowsOf(await api.get('/order-groups', query: query.isEmpty ? null : query));

  Future<Map<String, dynamic>> group(String id) async =>
      asMap(await api.get('/order-groups/${Uri.encodeComponent(id)}')) ??
      (throw const ApiException(message: 'Server không trả đủ dữ liệu nhóm đơn.'));

  Future<Map<String, Map<String, dynamic>>> summaries(List<String> ids) async {
    if (ids.isEmpty) return {};
    final res = await api.get('/packing-plans/summary', query: {'group_ids': ids.take(200).join(',')});
    return {for (final s in rowsOf(res, 'summaries')) pickString(s, ['orderGroupId']): s};
  }

  Future<Map<String, dynamic>?> plan(String groupId) async => asMap(asMap(await api.get(_path(groupId)))?['plan']);

  /// POST trả `{ plan }`.
  Future<Map<String, dynamic>> write(String groupId, String suffix, [Map<String, dynamic> body = const {}]) async =>
      _planOf(await api.post(_path(groupId, suffix), body: body));

  Map<String, dynamic> _planOf(Object? res) =>
      asMap(asMap(res)?['plan']) ?? (throw const ApiException(message: 'Máy chủ không trả kế hoạch đóng gói.'));

  Future<({Map<String, dynamic> plan, Map<String, dynamic> scan})> scan(
    String groupId,
    int parcelNo,
    Map<String, dynamic> body,
  ) async {
    final res = await api.post(_path(groupId, '/parcels/$parcelNo/scan'), body: body);
    return (plan: _planOf(res), scan: asMap(asMap(res)?['scan']) ?? const {});
  }

  /// Lần quét lưu lại khi mất mạng: cùng `client_event_id` nên BE không ghi trùng.
  PendingAction scanAction(String groupId, int parcelNo, Map<String, dynamic> body) => PendingAction(
        id: pickString(body, ['client_event_id']),
        kind: 'pack_scan',
        label: 'Quét ${pickString(body, ['code'])} vào kiện $parcelNo',
        path: _path(groupId, '/parcels/$parcelNo/scan'),
        body: body,
        createdAt: DateTime.now(),
      );

  Future<bool> pack(String groupId, int expectedVersion, List<Map<String, dynamic>> parcels) async {
    final res = await api.post(_path(groupId, '/pack'), body: {'expected_version': expectedVersion, 'parcels': parcels});
    return asMap(res)?['completed'] == true;
  }

  Future<Map<String, dynamic>> boxSources(String groupId) async =>
      asMap(await api.get(_path(groupId, '/box-sources'))) ?? const {};

  Future<List<Map<String, dynamic>>> replacementWarehouses(String groupId) async =>
      rowsOf(await api.get(_path(groupId, '/replacement-warehouses')));

  Future<void> decidePartial(String groupId, bool approve, int expectedVersion) => api.post(
        '/order-groups/${Uri.encodeComponent(groupId)}/fulfillment/decide-partial',
        body: {'approve': approve, 'expected_version': expectedVersion},
      );

  Future<List<Map<String, dynamic>>> materials() async => rowsOf(await api.get('/packaging-materials'));

  Future<List<Map<String, dynamic>>> staff() async => rowsOf(await api.get('/packing/staff'), 'staff');

  Future<Map<String, dynamic>> settings() async => asMap(asMap(await api.get('/packing/settings'))?['settings']) ?? const {};

  Future<({Map<String, dynamic> plan, bool savedAsExample})> rateGuide(
    String groupId,
    int parcelNo,
    bool helpful,
    String comment,
  ) async {
    final res = await api.post(_path(groupId, '/parcels/$parcelNo/guide/rating'), body: {
      'helpful': helpful,
      if (comment.trim().isNotEmpty) 'comment': comment.trim(),
    });
    return (plan: _planOf(res), savedAsExample: asMap(res)?['savedAsExample'] == true);
  }

  Future<Map<String, dynamic>?> guideTrace(String groupId, int parcelNo) async =>
      asMap(asMap(await api.get(_path(groupId, '/parcels/$parcelNo/guide/trace')))?['trace']);
}

final packingApiProvider = Provider<PackingApi>((ref) => PackingApi(ref.watch(apiClientProvider)));
