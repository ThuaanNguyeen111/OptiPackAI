import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/colors.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/app/theme_mode.dart';
import 'package:optipack_mobile/core/storage/json_cache.dart';

void main() {
  tearDown(() => AppColors.dark = false);

  test('chọn sáng/tối: theo hệ thống hoặc ép cố định', () {
    expect(resolveDark(ThemeMode.system, Brightness.dark), isTrue);
    expect(resolveDark(ThemeMode.system, Brightness.light), isFalse);
    expect(resolveDark(ThemeMode.dark, Brightness.light), isTrue);
    expect(resolveDark(ThemeMode.light, Brightness.dark), isFalse);
  });

  test('bảng màu đúng với web ở cả hai chế độ', () {
    AppColors.dark = false;
    expect(AppColors.canvas, const Color(0xFFD3E8E4));
    expect(AppColors.primary, const Color(0xFF0F766E));
    expect(AppColors.danger, const Color(0xFFDC2626));

    AppColors.dark = true;
    expect(AppColors.canvas, const Color(0xFF0B2428));
    expect(AppColors.surface, const Color(0xFF103138));
    expect(AppColors.primary, const Color(0xFF14B8A6));
    expect(AppColors.ink, const Color(0xFFE6F6F3));
    expect(AppColors.stagePick, const Color(0xFF3B82F6));
  });

  test('theme dựng theo chế độ hiện tại', () {
    AppColors.dark = true;
    final dark = buildTheme();
    expect(dark.brightness, Brightness.dark);
    expect(dark.scaffoldBackgroundColor, const Color(0xFF0B2428));

    AppColors.dark = false;
    final light = buildTheme();
    expect(light.brightness, Brightness.light);
    expect(light.scaffoldBackgroundColor, const Color(0xFFD3E8E4));
  });

  test('chế độ đã chọn được lưu và nạp lại', () async {
    final cache = InMemoryJsonCache();
    final c1 = ProviderContainer(overrides: [jsonCacheProvider.overrideWithValue(cache)]);
    addTearDown(c1.dispose);
    expect(c1.read(themeModeProvider), ThemeMode.system);
    await c1.read(themeModeProvider.notifier).set(ThemeMode.dark);
    expect(c1.read(themeModeProvider), ThemeMode.dark);

    final c2 = ProviderContainer(overrides: [jsonCacheProvider.overrideWithValue(cache)]);
    addTearDown(c2.dispose);
    c2.read(themeModeProvider);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(c2.read(themeModeProvider), ThemeMode.dark);
  });
}
