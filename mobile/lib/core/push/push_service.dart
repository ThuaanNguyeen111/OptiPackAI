import 'dart:async';
import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';

import '../json.dart';
import '../network/api_client.dart';
import '../network/api_exception.dart';

/// Kênh Android mà BE gửi push vào (`optipack_alerts`, độ quan trọng cao).
const pushChannelId = 'optipack_alerts';

/// Loại thông báo liên quan tới lấy hàng: bấm push thì mở màn lấy hàng của nhóm.
const _pickingTypes = {'picking_assigned', 'stock_shortage'};

/// Đường dẫn app cần mở khi bấm push. Mở màn lấy hàng chỉ khi người dùng được lấy hàng
/// ([canPick]) và push có mã nhóm; còn lại về màn chính (chuông thông báo nằm ở đó).
String routeForPush(Map<String, dynamic> data, {required bool canPick}) {
  final type = pickString(data, ['type']);
  final entityType = pickString(data, ['related_entity_type']);
  final entityId = pickString(data, ['related_entity_id']);
  final isGroup = entityType == 'order_group' || entityType == 'orderGroup';
  if (canPick && entityId.isNotEmpty && isGroup && _pickingTypes.contains(type)) {
    return '/pick/$entityId';
  }
  return '/';
}

/// Đăng ký máy với BE và nhận push FCM (BE_MOBILE_CHECKLIST mục 3, `MOBILE_UPDATE_CHECKLIST.md` 9b).
///
/// - [start] sau khi đăng nhập: xin quyền, tạo kênh, gửi token (`POST /notifications/devices`),
///   theo dõi token mới, hiện push khi app đang mở, xử lý bấm push.
/// - [stop] trước khi đăng xuất: `DELETE /notifications/devices/<token>` để máy không nhận push của người cũ.
/// Mọi lỗi chỉ ghi log — push hỏng không được làm hỏng đăng nhập hay việc đang làm.
class PushService {
  PushService({
    required this.api,
    required this.router,
    required this.canPick,
    FirebaseMessaging? messaging,
    FlutterLocalNotificationsPlugin? local,
    this.appVersion = '1.0.0',
  })  : _messaging = messaging,
        _local = local ?? FlutterLocalNotificationsPlugin();

  final ApiClient api;
  final GoRouter router;
  final bool Function() canPick;
  final String appVersion;

  final FirebaseMessaging? _messaging;
  final FlutterLocalNotificationsPlugin _local;

  final List<StreamSubscription<Object?>> _subs = [];
  String? _token;
  bool _started = false;
  bool _localReady = false;

  /// Token FCM đã gửi cho BE (để kiểm tra / thử).
  String? get token => _token;

  FirebaseMessaging get _fcm => _messaging ?? FirebaseMessaging.instance;

  Future<void> start() async {
    if (_started) return;
    _started = true;
    try {
      await _initLocal();
      final settings = await _fcm.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('Push: người dùng không cho phép thông báo');
      }
      final token = await _fcm.getToken();
      if (token != null) {
        debugPrint('FCM token: $token');
        await _register(token);
      }
      _subs
        ..add(_fcm.onTokenRefresh.listen((t) => unawaited(_register(t))))
        ..add(FirebaseMessaging.onMessage.listen((m) => unawaited(_showForeground(m))))
        ..add(FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data)));
      // App đang tắt, người dùng bấm push để mở.
      final initial = await _fcm.getInitialMessage();
      if (initial != null) _open(initial.data);
    } catch (e) {
      _started = false;
      debugPrint('Push: không khởi động được: $e');
    }
  }

  Future<void> stop() async {
    for (final s in _subs) {
      unawaited(s.cancel());
    }
    _subs.clear();
    final token = _token;
    _token = null;
    _started = false;
    if (token == null) return;
    try {
      await api.delete('/notifications/devices/${Uri.encodeComponent(token)}');
    } on ApiException catch (e) {
      debugPrint('Push: gỡ máy khỏi BE lỗi (${e.statusCode}): ${e.message}');
    } catch (e) {
      debugPrint('Push: gỡ máy khỏi BE lỗi: $e');
    }
  }

  Future<void> _register(String token) async {
    _token = token;
    try {
      final res = await api.post('/notifications/devices', body: {
        'token': token,
        'platform': 'android',
        'app_version': appVersion,
      });
      final enabled = asMap(res)?['push_enabled'];
      debugPrint('Push: đã đăng ký máy (BE push_enabled=$enabled)');
    } catch (e) {
      // Mất mạng thì lần mở app sau gửi lại (không đưa vào hàng đợi ngoại tuyến).
      debugPrint('Push: đăng ký máy lỗi: $e');
    }
  }

  Future<void> _initLocal() async {
    if (_localReady) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _local.initialize(
      settings: const InitializationSettings(android: android),
      onDidReceiveNotificationResponse: (r) {
        final payload = r.payload;
        if (payload == null || payload.isEmpty) return;
        try {
          final decoded = jsonDecode(payload);
          _open(asMap(decoded) ?? const {});
        } catch (_) {
          _open(const {});
        }
      },
    );
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(const AndroidNotificationChannel(
          pushChannelId,
          'Cảnh báo OptiPack',
          description: 'Việc được giao, hạn xử lý, tồn kho, giao hàng',
          importance: Importance.high,
        ));
    _localReady = true;
  }

  /// Khi app đang mở Android không tự hiện push → tự hiện bằng thông báo cục bộ.
  Future<void> _showForeground(RemoteMessage message) async {
    final n = message.notification;
    if (n == null) return;
    try {
      await _local.show(
        id: message.hashCode,
        title: n.title,
        body: n.body,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            pushChannelId,
            'Cảnh báo OptiPack',
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        payload: jsonEncode(message.data),
      );
    } catch (e) {
      debugPrint('Push: hiện thông báo lỗi: $e');
    }
  }

  void _open(Map<String, dynamic> data) {
    router.go(routeForPush(data, canPick: canPick()));
    final id = pickStringOrNull(data, ['notification_id']);
    if (id != null && id.isNotEmpty) {
      unawaited(api.patch('/notifications/${Uri.encodeComponent(id)}/read').catchError((Object _) => null));
    }
  }
}
