import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

class FakeReply {
  FakeReply(this.status, [this.body]);
  final int status;
  final Object? body;
}

typedef Handler = Future<FakeReply> Function(RequestOptions options);

/// Thay mạng thật trong test: mỗi request đi qua [handler]; ném [DioException] để giả lập mất mạng.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);

  final Handler handler;
  final List<RequestOptions> requests = [];

  int count(String path) => requests.where((r) => r.path == path).length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final reply = await handler(options);
    return ResponseBody.fromString(
      jsonEncode(reply.body ?? {}),
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

DioException networkError(RequestOptions options) => DioException(
      requestOptions: options,
      type: DioExceptionType.connectionError,
    );
