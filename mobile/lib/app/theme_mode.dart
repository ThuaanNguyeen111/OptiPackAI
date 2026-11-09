import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';

const _cacheKey = 'theme_mode';

String themeModeLabel(ThemeMode mode) => switch (mode) {
      ThemeMode.system => 'Theo hệ thống',
      ThemeMode.light => 'Sáng',
      ThemeMode.dark => 'Tối',
    };

/// Chế độ giao diện người dùng chọn (mặc định theo hệ thống), lưu trên máy.
class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    _load();
    return ThemeMode.system;
  }

  Future<void> _load() async {
    final saved = await ref.read(jsonCacheProvider).read(_cacheKey);
    final name = saved?.value;
    final mode = ThemeMode.values.where((m) => m.name == name).firstOrNull;
    if (mode != null) state = mode;
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await ref.read(jsonCacheProvider).write(_cacheKey, mode.name);
  }
}

final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

/// Tính xem lúc này có dùng giao diện tối không.
bool resolveDark(ThemeMode mode, Brightness system) => switch (mode) {
      ThemeMode.dark => true,
      ThemeMode.light => false,
      ThemeMode.system => system == Brightness.dark,
    };
