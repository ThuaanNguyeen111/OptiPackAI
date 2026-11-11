import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/features/notifications/notifications_repository.dart';
import 'package:optipack_mobile/features/packing/packing_repository.dart';
import 'package:optipack_mobile/features/returns/returns_repository.dart';
import 'package:optipack_mobile/features/shipping/shipping_repository.dart';
import 'package:optipack_mobile/features/stock/stock_repository.dart';
import 'package:optipack_mobile/shared/widgets.dart';

/// Các repository dữ liệu giả mô phỏng luật THẬT của BE. Test ở đây để khi nối API thật,
/// hành vi mong đợi của màn hình vẫn đúng.
void main() {
  group('Kho: nhập thêm / kiểm kê / chuyển ô', () {
    late MockStockRepository repo;
    setUp(() => repo = MockStockRepository());

    test('nhập thêm cộng đúng số lượng', () async {
      final item = await repo.restock('a1', 4, eventId: 'e1');
      expect(item.quantityOnHand, 10);
    });

    test('gửi lại CÙNG client_event_id không ghi hai lần (như BE)', () async {
      await repo.restock('a1', 4, eventId: 'same');
      final again = await repo.restock('a1', 4, eventId: 'same');
      expect(again.quantityOnHand, 10, reason: 'không cộng lần 2');
      final bin = await repo.findBin('KA-D1-P01-T01-1');
      expect(bin!.items.firstWhere((i) => i.assignmentId == 'a1').quantityOnHand, 10);
    });

    test('mã khác nhau thì là hai thao tác riêng', () async {
      await repo.restock('a1', 1, eventId: 'x');
      final second = await repo.restock('a1', 1, eventId: 'y');
      expect(second.quantityOnHand, 8);
    });

    test('vượt sức chứa ô thì báo WH_BIN_OVER_CAPACITY', () async {
      await expectLater(
        repo.restock('a1', 100, eventId: 'big'),
        throwsA(isA<StockException>().having((e) => e.code, 'code', 'WH_BIN_OVER_CAPACITY')),
      );
    });

    test('kiểm kê đặt tồn bằng số đếm thực tế, không cho số âm', () async {
      final item = await repo.adjust('a1', 2, reason: StockAdjustReason.damaged, eventId: 'adj');
      expect(item.quantityOnHand, 2);
      await expectLater(
        repo.adjust('a1', -1, reason: StockAdjustReason.other, eventId: 'neg'),
        throwsA(isA<StockException>()),
      );
    });

    test('chuyển ô trừ ô nguồn, cộng ô đích và chặn chuyển quá tồn', () async {
      final from = await repo.transfer('a1', 'KA-D1-P01-T01-2', 2, eventId: 't1');
      expect(from.quantityOnHand, 4);
      final target = await repo.findBin('KA-D1-P01-T01-2');
      expect(target!.items.any((i) => i.sku == 'AOPOLO-030-BE-L' && i.quantityOnHand == 2), isTrue);

      await expectLater(
        repo.transfer('a1', 'KA-D1-P01-T01-2', 99, eventId: 't2'),
        throwsA(isA<StockException>().having((e) => e.code, 'code', 'WH_INSUFFICIENT_STOCK')),
      );
      await expectLater(
        repo.transfer('a1', 'KHONG-CO', 1, eventId: 't3'),
        throwsA(isA<StockException>().having((e) => e.code, 'code', 'WH_BIN_NOT_FOUND')),
      );
    });

    test('ô không tồn tại thì findBin trả null', () async {
      expect(await repo.findBin('NOPE'), isNull);
    });
  });

  group('Hàng hoàn', () {
    late MockReturnsRepository repo;
    setUp(() => repo = MockReturnsRepository());

    test('phải nhận kiện trước khi kiểm hàng', () async {
      await expectLater(
        repo.inspect('rma-1', const [], null),
        throwsA(isA<ReturnsException>().having((e) => e.code, 'code', 'RMA_INVALID_TRANSITION')),
      );
    });

    test('tổng mỗi SKU kiểm phải khớp số trả', () async {
      await repo.receive('rma-3');
      await expectLater(
        repo.inspect('rma-3', const [InspectLine(sku: 'AOPOLO-030-BE-M', quantity: 5, result: InspectResult.restock)], null),
        throwsA(isA<ReturnsException>().having((e) => e.code, 'code', 'RMA_INSPECT_MISMATCH')),
      );
    });

    test('thùng hạng A bắt buộc đã gỡ nhãn cũ (dữ liệu cá nhân của khách)', () async {
      const lines = [InspectLine(sku: 'AOPOLO-030-BE-L', quantity: 2, result: InspectResult.restock)];
      await repo.receive('rma-4');
      await expectLater(
        repo.inspect('rma-4', lines, const PackagingCheck(grade: PackagingGrade.a, oldLabelRemoved: false)),
        throwsA(isA<ReturnsException>().having((e) => e.code, 'code', 'PKG_OLD_LABEL_NOT_REMOVED')),
      );
      await repo.inspect('rma-4', lines, const PackagingCheck(grade: PackagingGrade.a, oldLabelRemoved: true));
      expect(await repo.list(ReturnStatus.closed), hasLength(1));
    });

    test('từ chối bắt buộc có lý do; duyệt chuyển sang chờ nhận kiện', () async {
      await expectLater(repo.reject('rma-1', '  '), throwsA(isA<ReturnsException>()));
      await repo.approve('rma-1');
      expect((await repo.list(ReturnStatus.awaitingReceipt)).any((r) => r.id == 'rma-1'), isTrue);
      await repo.reject('rma-2', 'Quá hạn đổi trả');
      expect((await repo.list(ReturnStatus.rejected)).single.id, 'rma-2');
    });

    test('không duyệt hai lần', () async {
      await repo.approve('rma-1');
      await expectLater(repo.approve('rma-1'), throwsA(isA<ReturnsException>()));
    });
  });

  group('Đóng gói', () {
    test('cân lệch quá 20% thì kiện bị giữ, trong ngưỡng thì niêm phong', () {
      expect(evaluateSealWeight(1.0, 1.15), SealOutcome.sealed);
      expect(evaluateSealWeight(1.0, 0.85), SealOutcome.sealed);
      expect(evaluateSealWeight(1.0, 1.25), SealOutcome.held);
      expect(evaluateSealWeight(1.0, 0.7), SealOutcome.held);
      expect(evaluateSealWeight(0, 5), SealOutcome.sealed, reason: 'không có cân ước tính thì không so');
    });

    test('quét món: sai món, vượt số lượng, và niêm phong chỉ khi quét đủ', () async {
      final repo = MockPackingRepository();
      await repo.approve('pg1');

      await expectLater(
        repo.scan('pg1', 2, 'KHONG-CO'),
        throwsA(isA<PackingException>().having((e) => e.code, 'code', 'PACKING_SCAN_NOT_IN_PARCEL')),
      );
      await expectLater(
        repo.seal('pg1', 2, 0.4),
        throwsA(isA<PackingException>().having((e) => e.code, 'code', 'PACKING_PARCEL_NOT_SCANNED')),
      );

      await repo.scan('pg1', 2, 'aopolo-030-be-m'); // không phân biệt hoa thường
      await repo.scan('pg1', 2, 'AOPOLO-030-BE-M');
      await expectLater(
        repo.scan('pg1', 2, 'AOPOLO-030-BE-M'),
        throwsA(isA<PackingException>().having((e) => e.code, 'code', 'PACKING_SCAN_EXCEEDS')),
      );

      final sealed = await repo.seal('pg1', 2, 0.43);
      expect(sealed.outcome, SealOutcome.sealed);
    });

    test('cân lệch thì kiện bị giữ và không được quét thêm', () async {
      final repo = MockPackingRepository();
      await repo.approve('pg1');
      await repo.scan('pg1', 2, 'AOPOLO-030-BE-M');
      await repo.scan('pg1', 2, 'AOPOLO-030-BE-M');
      final res = await repo.seal('pg1', 2, 0.9);
      expect(res.outcome, SealOutcome.held);
      expect(res.parcel.status, ParcelStatus.held);
      await expectLater(repo.scan('pg1', 2, 'AOPOLO-030-BE-M'), throwsA(isA<PackingException>()));
    });

    test('từ chối kế hoạch đưa nhóm ra khỏi hàng đợi; không từ chối được nhóm đang đóng', () async {
      final repo = MockPackingRepository();
      await repo.reject('pg1', RejectReason.boxTooTight, null);
      expect(await repo.queue(PackingStage.pendingApproval), isEmpty);
      await expectLater(repo.reject('pg2', RejectReason.other, null), throwsA(isA<PackingException>()));
    });

    test('món của kiện đếm theo từng đơn vị', () async {
      final p = (await MockPackingRepository().get('pg1')).parcels.first;
      expect(p.needed['AOPOLO-030-BE-L'], 2);
      expect(p.totalNeeded, 4);
    });
  });

  group('Giao hàng', () {
    test('thất bại lần 2 hoặc khách từ chối thì tự hoàn về kho', () {
      expect(statusAfterFailure(attempt: 1, reason: FailureReason.customerUnreachable), ShipmentStatus.deliveryFailed);
      expect(statusAfterFailure(attempt: 2, reason: FailureReason.customerUnreachable), ShipmentStatus.returningToWarehouse);
      expect(statusAfterFailure(attempt: 1, reason: FailureReason.customerRefused), ShipmentStatus.returningToWarehouse);
    });

    test('giao lại chỉ khi thất bại lần 1; lần 2 thất bại là hoàn kho', () async {
      final repo = MockShippingRepository();
      final failed = (await repo.shipments()).firstWhere((s) => s.status == ShipmentStatus.deliveryFailed);
      expect(failed.canRetry, isTrue);

      final again = await repo.retry(failed.id);
      expect(again.attempt, 2);
      expect(again.status, ShipmentStatus.outForDelivery);

      final second = await repo.fail(failed.id, FailureReason.wrongAddress);
      expect(second.status, ShipmentStatus.returningToWarehouse);
      expect(second.canRetry, isFalse);
      await expectLater(repo.retry(failed.id), throwsA(isA<ShippingException>()));
    });

    test('lý do "Khác" bắt buộc ghi chú', () async {
      final repo = MockShippingRepository();
      await expectLater(
        repo.fail('ship41', FailureReason.other),
        throwsA(isA<ShippingException>().having((e) => e.code, 'code', 'SHP_FAIL_NOTE_REQUIRED')),
      );
      final ok = await repo.fail('ship41', FailureReason.other, note: 'Khách đi vắng');
      expect(ok.status, ShipmentStatus.deliveryFailed);
    });

    test('tạo vận đơn đưa nhóm ra khỏi danh sách chờ giao', () async {
      final repo = MockShippingRepository();
      final v = await repo.create('sg1', 'GHN');
      expect(v.status, ShipmentStatus.outForDelivery);
      expect((await repo.readyToShip()).any((g) => g.id == 'sg1'), isFalse);
      await expectLater(repo.create('sg1', 'GHN'), throwsA(isA<ShippingException>()));
    });

    test('đã giao thì không giao / thất bại lần nữa', () async {
      final repo = MockShippingRepository();
      await repo.deliver('ship41');
      await expectLater(repo.deliver('ship41'), throwsA(isA<ShippingException>()));
      await expectLater(repo.fail('ship41', FailureReason.wrongAddress), throwsA(isA<ShippingException>()));
    });
  });

  group('Thông báo và định dạng', () {
    test('đánh dấu đã đọc từng cái và tất cả', () async {
      final repo = MockNotificationsRepository();
      final before = await repo.unreadCount();
      expect(before, greaterThan(0));
      await repo.markRead('n1');
      expect(await repo.unreadCount(), before - 1);
      await repo.markAllRead();
      expect(await repo.unreadCount(), 0);
    });

    test('tiền kiểu Việt Nam', () {
      expect(formatVnd(125000), '125.000 đ');
      expect(formatVnd(12450000), '12.450.000 đ');
      expect(formatVnd(999), '999 đ');
      expect(formatVnd(0), '0 đ');
    });
  });
}
