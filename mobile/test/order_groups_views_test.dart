import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/core/network/api_client.dart';
import 'package:optipack_mobile/features/admin/order_groups_screen.dart';

class _FakeApi implements ApiClient {
  final queries = <Map<String, dynamic>>[];

  @override
  Future<Object?> get(String path, {Map<String, dynamic>? query, bool public = false}) async {
    queries.add(query!);
    final short = {'id': 'thieu', 'stockShortage': true, 'fulfillmentStatus': 'picking'};
    final review = {'id': 'cho-duyet', 'stockShortage': true, 'fulfillmentStatus': 'partial_needs_review'};
    final fine = {'id': 'du-hang', 'stockShortage': false, 'fulfillmentStatus': 'picking'};
    if (query['order_priority'] == 'express') {
      return [
        {'id': 'con-han', 'isOverdue': false},
        {'id': 'qua-han', 'isOverdue': true},
      ];
    }
    if (query['stock_shortage'] == true) return [short, review];
    if (query['fulfillment_status'] == 'partial_needs_review') return [review];
    return [short, review, fine];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

List<Object?> _ids(List<Map<String, dynamic>> rows) => [for (final r in rows) r['id']];

void main() {
  test('Đơn hỏa tốc: lọc theo ưu tiên, quá hạn lên đầu', () async {
    final api = _FakeApi();
    final rows = await fetchViewGroups(api, OrderGroupsView.express);

    expect(_ids(rows), ['qua-han', 'con-han']);
    expect(api.queries.single['order_priority'], 'express');
  });

  test('Thiếu hàng: gộp chờ duyệt với thiếu tồn, không trùng', () async {
    final api = _FakeApi();
    final rows = await fetchViewGroups(api, OrderGroupsView.shortage);

    expect(_ids(rows), ['cho-duyet', 'thieu']);
    expect(api.queries.length, 2);
  });

  test('Thiếu hàng: tìm theo mã chỉ giữ nhóm đang thiếu', () async {
    final api = _FakeApi();
    final rows = await fetchViewGroups(api, OrderGroupsView.shortage, q: '123456');

    expect(_ids(rows), ['thieu', 'cho-duyet']);
    expect(api.queries.single['q'], '123456');
  });

  test('Nhóm đơn: xem tất cả, không lọc ưu tiên', () async {
    final api = _FakeApi();
    final rows = await fetchViewGroups(api, OrderGroupsView.all);

    expect(rows.length, 3);
    expect(api.queries.single.containsKey('order_priority'), isFalse);
  });
}
