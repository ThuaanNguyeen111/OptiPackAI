import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'core/storage/app_database.dart';

/// Push đến khi app chạy nền / đã tắt: Android tự hiện thông báo từ phần `notification`.
@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Đọc android/app/google-services.json. Lỗi (thiếu file) thì app vẫn chạy, chỉ không có push.
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);
  } catch (e) {
    debugPrint('Firebase chưa cấu hình, tắt push: $e');
  }
  final db = await AppDatabase.open();
  runApp(
    ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const OptiPackApp(),
    ),
  );
}
