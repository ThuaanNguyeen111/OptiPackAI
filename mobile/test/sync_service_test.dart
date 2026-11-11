import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/core/network/api_exception.dart';
import 'package:optipack_mobile/features/offline/action_queue.dart';
import 'package:optipack_mobile/features/offline/pending_action.dart';
import 'package:optipack_mobile/features/offline/sync_service.dart';

PendingAction action(String id, int minute, {int attempts = 0, DateTime? next}) =>
    PendingAction(
      id: id,
      kind: 'pick_item',
      label: 'Lấy 1 × $id',
      path: '/order-groups/g1/fulfillment/pick-item',
      body: {'sku': id, 'scanned_quantity': 1, 'client_event_id': id},
      createdAt: DateTime(2026, 11, 9, 8, minute),
      attempts: attempts,
      nextAttemptAt: next,
    );

void main() {
  late InMemoryActionQueue queue;
  late List<String> sent;
  final now = DateTime(2026, 11, 9, 9);

  SyncService build(Future<void> Function(PendingAction) sender) =>
      SyncService(queue: queue, sender: sender, now: () => now);

  setUp(() {
    queue = InMemoryActionQueue();
    sent = [];
  });

  test('gửi đúng thứ tự thao tác và xoá khỏi hàng đợi khi thành công', () async {
    await queue.enqueue(action('c', 3));
    await queue.enqueue(action('a', 1));
    await queue.enqueue(action('b', 2));

    final report = await build((a) async => sent.add(a.id)).process();

    expect(sent, ['a', 'b', 'c']);
    expect(report.sent, 3);
    expect(await queue.pending(), isEmpty);
  });

  test('mất mạng: dừng cả lượt, giữ thứ tự, hẹn giờ thử lại', () async {
    await queue.enqueue(action('a', 1));
    await queue.enqueue(action('b', 2));

    final report = await build((a) async {
      sent.add(a.id);
      throw const ApiException(message: 'mất mạng', isNetwork: true);
    }).process();

    expect(sent, ['a'], reason: 'không gửi tiếp cái sau khi cái trước lỗi mạng');
    expect(report.stoppedBy, SyncStop.network);
    final pending = await queue.pending();
    expect(pending.length, 2);
    expect(pending.first.attempts, 1);
    expect(pending.first.nextAttemptAt, now.add(const Duration(seconds: 4)));
  });

  test('5xx và 429 được thử lại, 400 / 404 / 422 thì không', () async {
    for (final status in [500, 502, 408, 429]) {
      expect(ApiException(message: 'x', statusCode: status).isRetryable, isTrue, reason: '$status');
    }
    for (final status in [400, 403, 404, 409, 422]) {
      expect(ApiException(message: 'x', statusCode: status).isRetryable, isFalse, reason: '$status');
    }
  });

  test('lỗi nghiệp vụ: không thử lại, giữ message thật của BE, vẫn gửi cái sau', () async {
    await queue.enqueue(action('a', 1));
    await queue.enqueue(action('b', 2));

    final report = await build((a) async {
      sent.add(a.id);
      if (a.id == 'a') {
        throw const ApiException(
          message: 'Ô không đủ hàng',
          statusCode: 409,
          errorCode: 'ORD_GROUP_INSUFFICIENT_STOCK',
        );
      }
    }).process();

    expect(sent, ['a', 'b']);
    expect(report.failed, 1);
    expect(report.sent, 1);
    final failed = await queue.failed();
    expect(failed.single.id, 'a');
    expect(failed.single.lastError, 'Ô không đủ hàng');
    expect(failed.single.lastErrorCode, 'ORD_GROUP_INSUFFICIENT_STOCK');
    expect(await queue.pending(), isEmpty);
  });

  test('401: dừng, không đánh dấu lỗi, giữ nguyên hàng đợi', () async {
    await queue.enqueue(action('a', 1));
    await queue.enqueue(action('b', 2));

    final report = await build((a) async {
      throw const ApiException(message: 'hết hạn', statusCode: 401);
    }).process();

    expect(report.stoppedBy, SyncStop.sessionExpired);
    expect((await queue.pending()).length, 2);
    expect(await queue.failed(), isEmpty);
  });

  test('bỏ qua thao tác chưa tới giờ thử lại nhưng vẫn gửi cái khác', () async {
    await queue.enqueue(action('a', 1, next: now.add(const Duration(minutes: 1))));
    await queue.enqueue(action('b', 2));

    final report = await build((a) async => sent.add(a.id)).process();

    expect(sent, ['b']);
    expect(report.deferred, 1);
    expect((await queue.pending()).single.id, 'a');
  });

  test('chờ tăng dần 2 s → 4 s → 8 s và tối đa 5 phút', () {
    expect(SyncService.backoff(0), const Duration(seconds: 2));
    expect(SyncService.backoff(1), const Duration(seconds: 4));
    expect(SyncService.backoff(2), const Duration(seconds: 8));
    expect(SyncService.backoff(20), const Duration(minutes: 5));
  });

  test('gửi lại thao tác lỗi vẫn giữ nguyên client_event_id', () async {
    await queue.enqueue(action('a', 1));
    await queue.markFailed('a', message: 'lỗi');
    await queue.requeue('a');

    final item = (await queue.pending()).single;
    expect(item.id, 'a');
    expect(item.body['client_event_id'], 'a');
    expect(item.lastError, isNull);
  });

  test('không chạy hai lượt cùng lúc', () async {
    await queue.enqueue(action('a', 1));
    final service = build((a) async {
      await Future<void>.delayed(const Duration(milliseconds: 20));
      sent.add(a.id);
    });

    final first = service.process();
    final second = await service.process();
    await first;

    expect(second.sent, 0);
    expect(sent, ['a'], reason: 'chỉ gửi một lần');
  });
}
