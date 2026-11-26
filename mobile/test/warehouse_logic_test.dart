import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/core/format/deadline.dart';
import 'package:optipack_mobile/core/format/units.dart';
import 'package:optipack_mobile/features/auth/auth_models.dart';
import 'package:optipack_mobile/features/warehouse/warehouse_logic.dart';
import 'package:optipack_mobile/features/warehouse/warehouse_models.dart';

OrderGroupSummary mkGroup(
  String id, {
  String status = 'picking',
  String? staff = 'me',
  bool express = false,
  bool overdue = false,
  DateTime? deadline,
  int orders = 1,
  int active = 1,
  DateTime? created,
}) =>
    OrderGroupSummary(
      id: id,
      platform: 'lazada',
      fulfillmentStatus: status,
      version: 1,
      orderCount: orders,
      activeOrderCount: active,
      assignedStaffId: staff,
      isExpress: express,
      isOverdue: overdue,
      packagingDeadline: deadline,
      createdAt: created,
    );

PickLine line(
  String sku, {
  String bin = 'KA-D1-P01-T01-1',
  int qty = 2,
  int picked = 0,
  String? binId = 'bin1',
  String? master,
  List<OtherBin> others = const [],
}) =>
    PickLine(
      sku: sku,
      quantity: qty,
      pickedQuantity: picked,
      binCode: bin,
      zoneCode: 'KA',
      binLocationId: binId,
      masterSku: master,
      otherBins: others,
    );

void main() {
  group('Kho lấy hàng', () {
    const a = WarehouseOption(id: 'a', code: 'A');
    const b = WarehouseOption(id: 'b', code: 'B');

    test('kho của nhóm còn hoạt động thì giữ nguyên, không cho chọn', () {
      final r = resolvePickWarehouse('b', [a, b], chosenId: 'a')!;
      expect(r.id, 'b');
      expect(r.canChoose, isFalse);
      expect(r.groupWarehouseInactive, isFalse);
    });

    test('kho của nhóm đã tắt thì chuyển sang kho đang hoạt động', () {
      final r = resolvePickWarehouse('old', [a, b])!;
      expect(r.id, 'a');
      expect(r.groupWarehouseInactive, isTrue);
      expect(resolvePickWarehouse('old', [a, b], chosenId: 'b')!.id, 'b');
    });

    test('nhóm chưa gắn kho thì không báo kho đã tắt; hết kho thì null', () {
      expect(resolvePickWarehouse(null, [a])!.groupWarehouseInactive, isFalse);
      expect(resolvePickWarehouse('old', const []), isNull);
    });
  });

  group('Mục của màn lấy hàng', () {
    final groups = [
      mkGroup('picking', staff: 'other'),
      mkGroup('mine-awaiting', status: 'awaiting_packaging'),
      mkGroup('short', status: 'partial_needs_review'),
      mkGroup('picked', status: 'picked'),
      mkGroup('approved', status: 'approved_for_packing'),
      mkGroup('packed', status: 'packed'),
      mkGroup('dead', orders: 2, active: 0),
    ];
    Set<String> ids(WorkTab tab, {WorkFilter filter = WorkFilter.all, String search = ''}) =>
        queueGroups(groups, tab: tab, filter: filter, userId: 'me', search: search).map((g) => g.id).toSet();

    test('chia mục giống web', () {
      expect(ids(WorkTab.toPick), {'picking', 'mine-awaiting'});
      expect(ids(WorkTab.review), {'short'});
      expect(ids(WorkTab.picked), {'picked', 'approved'});
      expect(ids(WorkTab.packed), {'packed'});
      expect(ids(WorkTab.canceled), {'dead'});
    });

    test('lọc Của tôi và tìm theo mã', () {
      expect(ids(WorkTab.toPick, filter: WorkFilter.mine), {'mine-awaiting'});
      expect(ids(WorkTab.toPick, search: 'PICK'), {'picking'});
    });

    test('tên người lấy hàng', () {
      expect(assigneeLabel(null, 'me', const {}), 'Chưa phân công');
      expect(assigneeLabel('me', 'me', const {}), 'Bạn');
      expect(assigneeLabel('x', 'me', const {'x': 'An'}), 'An');
      expect(assigneeLabel('y', 'me', const {}), 'Nhân viên khác');
    });
  });

  group('Việc của tôi', () {
    test('chỉ lấy nhóm giao cho mình, còn phải lấy, còn đơn hợp lệ', () {
      final result = myPickingWork([
        mkGroup('mine-picking'),
        mkGroup('mine-awaiting', status: 'awaiting_packaging'),
        mkGroup('mine-approved', status: 'approved_for_packing'),
        mkGroup('mine-pending', status: 'pending_approval'),
        mkGroup('other', staff: 'someone'),
        mkGroup('picked-already', status: 'picked'),
        mkGroup('all-canceled', orders: 2, active: 0),
      ], 'me');

      expect(result.map((g) => g.id).toSet(), {
        'mine-picking',
        'mine-awaiting',
      });
    });

    test('chỉ quét được khi đang lấy hàng; chờ bắt đầu thì chỉ báo thiếu', () {
      expect(mkGroup('a').canScan, isTrue);
      expect(mkGroup('b', status: 'awaiting_packaging').canScan, isFalse);
      expect(mkGroup('b', status: 'awaiting_packaging').canReportMissing, isTrue);
      expect(mkGroup('c', status: 'pending_approval').canReportMissing, isFalse);
      expect(pickBlockedReason('picking'), isNull);
      expect(pickBlockedReason('pending_approval'), contains('Chờ chấp nhận kế hoạch'));
    });

    test('đọc phần chia theo đơn của một dòng lấy hàng', () {
      final l = PickLine.fromJson({
        'sku': 'A',
        'quantity': 3,
        'order_allocations': [
          {'order_id': 'o1', 'platform_order_id': '111', 'recipient_name': 'An', 'quantity': 2},
          {'order_id': 'abcdef123456', 'quantity': 1},
        ],
      }).copyWith(pickedQuantity: 1);
      expect(l.allocations.map((a) => a.label).toList(), ['Đơn 111 · An × 2', 'Đơn 123456 × 1']);
    });

    test('Hỏa Tốc lên đầu, rồi quá hạn, rồi hạn gần nhất', () {
      final t = DateTime(2026, 11, 9, 10);
      final result = myPickingWork([
        mkGroup('late-normal', deadline: t.add(const Duration(hours: 5))),
        mkGroup('overdue', overdue: true),
        mkGroup('express-far', express: true, deadline: t.add(const Duration(hours: 2))),
        mkGroup('express-near', express: true, deadline: t.add(const Duration(hours: 1))),
        mkGroup('soon', deadline: t.add(const Duration(hours: 1))),
      ], 'me');

      expect(result.map((g) => g.id).toList(), [
        'express-near',
        'express-far',
        'overdue',
        'soon',
        'late-normal',
      ]);
    });
  });

  group('Khớp mã quét', () {
    test('khớp mã ô, SKU, SKU nội bộ, ô khác — không phân biệt hoa thường và khoảng trắng', () {
      final l = line(
        'AOPOLO-030-BE-L',
        master: 'ATHUN-005-DEN-M',
        others: const [OtherBin(binCode: 'KA-D2-P02-T01-1', quantityOnHand: 16)],
      );

      expect(lineMatchesScan(l, 'ka-d1-p01-t01-1'), isTrue);
      expect(lineMatchesScan(l, '  AOPOLO-030-BE-L '), isTrue);
      expect(lineMatchesScan(l, 'athun-005-den-m'), isTrue);
      expect(lineMatchesScan(l, 'KA-D2-P02-T01-1'), isTrue);
      expect(lineMatchesScan(l, 'KA-D1-P01-T01-1 AOPOLO-030-BE-L'), isTrue);
    });

    test('AOFP-327: quét mã ô phụ → trả ô phụ (gửi id ô phụ); SKU / ô chính → null (ô chính)', () {
      final l = line(
        'AOPOLO-030-BE-L',
        master: 'ATHUN-005-DEN-M',
        others: const [OtherBin(binCode: 'KA-D2-P02-T01-1', quantityOnHand: 4, binLocationId: 'bin2')],
      );
      expect(otherBinForScan(l, ' ka-d2-p02-t01-1 ')?.binLocationId, 'bin2');
      expect(otherBinForScan(l, 'KA-D1-P01-T01-1'), isNull);
      expect(otherBinForScan(l, 'AOPOLO-030-BE-L'), isNull);
      expect(otherBinForScan(l, 'athun-005-den-m'), isNull);
      expect(otherBinForScan(l, ''), isNull);
    });

    test('mã sai hoặc rỗng thì không khớp', () {
      final l = line('SKU-1');
      expect(lineMatchesScan(l, 'SKU-2'), isFalse);
      expect(lineMatchesScan(l, ''), isFalse);
      expect(lineMatchesScan(l, '   '), isFalse);
    });

    test('quét mã ô chung của 2 SKU: chọn dòng còn phải lấy trước', () {
      final lines = [
        line('A', bin: 'BIN-1', qty: 1, picked: 1),
        line('B', bin: 'BIN-1', qty: 2, picked: 0),
      ];
      expect(findLineForScan(lines, 'BIN-1')!.sku, 'B');
    });

    test('mọi dòng khớp đã đủ thì trả dòng đủ để báo "đã lấy đủ"', () {
      final lines = [line('A', bin: 'BIN-1', qty: 1, picked: 1)];
      expect(findLineForScan(lines, 'BIN-1')!.sku, 'A');
      expect(findLineForScan(lines, 'KHONG-CO'), isNull);
    });
  });

  group('Tiến độ', () {
    test('cộng thao tác đang chờ gửi vào số đã ghi nhận để hiện đúng khi ngoại tuyến', () {
      final lines = [line('A', qty: 3, picked: 1), line('B', qty: 2)];
      final result = withPendingProgress(lines, {'A': 1});
      expect(result[0].pickedQuantity, 2);
      expect(result[1].pickedQuantity, 0);
    });

    test('không vượt số đặt', () {
      final result = withPendingProgress([line('A', qty: 2, picked: 1)], {'A': 5});
      expect(result.single.pickedQuantity, 2);
    });

    test('allPicked chỉ đúng khi có dòng và đủ hết', () {
      expect(allPicked([]), isFalse);
      expect(allPicked([line('A', qty: 1, picked: 1)]), isTrue);
      expect(allPicked([line('A', qty: 1, picked: 1), line('B', qty: 1)]), isFalse);
    });

    test('SKU chưa gán ô thì không quét được', () {
      expect(line('A', binId: null).hasBin, isFalse);
      expect(line('A', bin: 'CHƯA GÁN VỊ TRÍ').hasBin, isFalse);
      expect(line('A').hasBin, isTrue);
    });
  });

  group('Lỗi lấy chưa đủ từ BE', () {
    test('đọc danh sách món thiếu theo đúng cấu trúc details.missing', () {
      expect(
        missingLines({
          'groupId': 'g1',
          'missing': [
            {'sku': 'A', 'orderedQuantity': 3, 'pickedQuantity': 1},
            {'sku': 'B', 'orderedQuantity': 2, 'pickedQuantity': 0},
          ],
        }),
        ['A: còn 2', 'B: còn 2'],
      );
    });

    test('details lạ hoặc rỗng thì không làm app lỗi', () {
      expect(missingLines(null), isEmpty);
      expect(missingLines('x'), isEmpty);
      expect(missingLines({'missing': 'x'}), isEmpty);
      expect(missingLines({'missing': [1, null]}), isEmpty);
    });
  });

  group('Đọc JSON từ BE', () {
    test('nhóm đơn: nhận cả camelCase lẫn snake_case, thiếu activeOrderCount thì coi là còn hết', () {
      final g = OrderGroupSummary.fromJson({
        'id': 'abc1234567890',
        'fulfillment_status': 'picking',
        'order_count': 3,
        'orderPriority': 'express',
        'packagingDeadline': '2026-11-09T10:00:00.000Z',
        'version': 7,
      });
      expect(g.fulfillmentStatus, 'picking');
      expect(g.activeOrderCount, 3);
      expect(g.isExpress, isTrue);
      expect(g.version, 7);
      expect(g.shortId, '1234567890');
      expect(g.packagingDeadline, isNotNull);
    });

    test('dòng lấy hàng đọc đủ ô, lô cũ nhất và ô khác', () {
      final l = PickLine.fromJson({
        'sku': 'S1',
        'quantity': 2,
        'picked_quantity': 1,
        'bin_code': 'KA-D1-P01-T01-1',
        'bin_location_id': 'b1',
        'oldest_lot': {'lot_code': 'LOT-1'},
        'other_bins': [
          {'bin_code': 'KA-D2', 'quantity_on_hand': 16},
        ],
        'length_cm': 20,
        'weight_kg': 0.1,
      });
      expect(l.pickedQuantity, 1);
      expect(l.oldestLotCode, 'LOT-1');
      expect(l.otherBins.single.quantityOnHand, 16);
      expect(l.hasBin, isTrue);
    });
  });

  group('Đơn vị hiển thị (cm / kg, dấu phẩy)', () {
    test('cm tối đa 1 chữ số lẻ', () {
      expect(formatCm(20), '20');
      expect(formatCm(12.34), '12,3');
      expect(formatDimsCm(20, 20, 5), '20 × 20 × 5 cm');
    });

    test('kg tối đa 2 chữ số lẻ, số nhỏ không hiện 0', () {
      expect(formatKg(0.1), '0,1 kg');
      expect(formatKg(1.256), '1,26 kg');
      expect(formatKg(0.003), '0,003 kg');
      expect(formatGAsKg(150), '0,15 kg');
    });
  });

  group('Đếm ngược hạn đóng', () {
    final now = DateTime(2026, 11, 9, 9);

    test('còn nhiều thời gian', () {
      final l = deadlineLabel(now.add(const Duration(minutes: 45)), now);
      expect(l.text, 'Còn 45 phút để đóng');
      expect(l.tone, DeadlineTone.ok);
    });

    test('còn ≤ 15 phút thì cảnh báo, quá hạn thì đỏ', () {
      expect(deadlineLabel(now.add(const Duration(minutes: 10)), now).tone, DeadlineTone.soon);
      final late = deadlineLabel(now.subtract(const Duration(minutes: 10)), now);
      expect(late.text, 'Quá hạn đóng 10 phút');
      expect(late.tone, DeadlineTone.late);
    });

    test('hiện giờ khi từ 60 phút trở lên', () {
      expect(formatRemain(const Duration(minutes: 90)), '1 giờ 30 phút');
      expect(formatRemain(const Duration(hours: 2)), '2 giờ');
    });
  });

  group('Vai trò (BE trả số)', () {
    test('đúng 5 giá trị', () {
      expect(UserRole.fromValue(0), UserRole.storeOwner);
      expect(UserRole.fromValue(1), UserRole.warehouseStaff);
      expect(UserRole.fromValue(2), UserRole.packagingStaff);
      expect(UserRole.fromValue(3), UserRole.shippingCoordinator);
      expect(UserRole.fromValue(4), UserRole.admin);
      expect(UserRole.fromValue(9), isNull);
      expect(UserRole.fromValue('admin'), isNull, reason: 'không dùng chuỗi cũ');
    });

    test('hồ sơ lưu rồi đọc lại giữ nguyên, hỏng thì trả null', () {
      final user = CurrentUser.fromJson({'id': 'u1', 'name': 'Việt', 'email': 'a@b.c', 'role': 1});
      final back = CurrentUser.tryDecode(user.encode());
      expect(back!.id, 'u1');
      expect(back.role, UserRole.warehouseStaff);
      expect(back.isWarehouse, isTrue);
      expect(CurrentUser.tryDecode('không phải json'), isNull);
      expect(CurrentUser.tryDecode(null), isNull);
    });
  });
}
