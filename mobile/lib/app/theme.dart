import 'package:flutter/material.dart';

import 'colors.dart';

/// Màu bước lấy hàng của hệ thống (`--stage-pick` trên web). Giữ tên cũ cho code đang dùng.
Color get stagePick => AppColors.stagePick;

/// Dựng theme theo [AppColors.dark] hiện tại.
ThemeData buildTheme() {
  final dark = AppColors.dark;
  final base = ColorScheme.fromSeed(
    seedColor: AppColors.primary,
    brightness: dark ? Brightness.dark : Brightness.light,
  );
  final scheme = base.copyWith(
    primary: AppColors.primary,
    onPrimary: AppColors.onPrimary,
    surface: AppColors.surface,
    onSurface: AppColors.ink,
    onSurfaceVariant: AppColors.inkSubtle,
    outline: AppColors.hairlineStrong,
    outlineVariant: AppColors.hairline,
    error: AppColors.danger,
    surfaceContainerHighest: AppColors.surface3,
    surfaceContainerHigh: AppColors.surface2,
  );
  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: c, width: w),
      );
  return ThemeData(
    useMaterial3: true,
    brightness: dark ? Brightness.dark : Brightness.light,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.canvas,
    canvasColor: AppColors.surface,
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.topbar,
      foregroundColor: AppColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 1,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.topbar,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppColors.primary.withValues(alpha: 0.18),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: AppColors.hairline),
      ),
    ),
    dialogTheme: DialogThemeData(backgroundColor: AppColors.surface, surfaceTintColor: Colors.transparent),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: AppColors.surface, surfaceTintColor: Colors.transparent),
    dividerTheme: DividerThemeData(color: AppColors.hairline),
    // Nút to, dễ bấm bằng một tay (docs: nút to ở nửa dưới màn hình).
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        side: BorderSide(color: AppColors.hairlineStrong),
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      border: border(AppColors.hairline),
      enabledBorder: border(AppColors.hairline),
      focusedBorder: border(AppColors.primary, 1.6),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? AppColors.primary : null,
      ),
    ),
  );
}
