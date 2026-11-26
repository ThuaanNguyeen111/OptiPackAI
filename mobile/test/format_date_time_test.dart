import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/shared/widgets.dart';

void main() {
  test('Giờ UTC từ BE hiện theo giờ máy', () {
    final utc = DateTime.parse('2026-11-23T16:59:00.000Z');
    final local = utc.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');

    expect(formatDateTime(utc), '${two(local.day)}/${two(local.month)} ${two(local.hour)}:${two(local.minute)}');
    expect(formatDateTime(utc), formatDateTime(local));
  });
}
