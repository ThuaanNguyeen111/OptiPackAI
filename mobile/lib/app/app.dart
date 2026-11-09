import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'colors.dart';
import 'router.dart';
import 'theme.dart';
import 'theme_mode.dart';

class OptiPackApp extends ConsumerStatefulWidget {
  const OptiPackApp({super.key});

  @override
  ConsumerState<OptiPackApp> createState() => _OptiPackAppState();
}

class _OptiPackAppState extends ConsumerState<OptiPackApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Người dùng đổi chế độ sáng/tối của máy khi đang theo hệ thống.
  @override
  void didChangePlatformBrightness() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(themeModeProvider);
    final dark = resolveDark(mode, WidgetsBinding.instance.platformDispatcher.platformBrightness);
    // Đặt cờ màu TRƯỚC khi dựng. Đổi chế độ thì dựng lại cả cây (key) để mọi màn nhận màu mới;
    // vị trí hiện tại vẫn giữ vì GoRouter nằm trong provider.
    AppColors.dark = dark;
    return KeyedSubtree(
      key: ValueKey(dark),
      child: MaterialApp.router(
        title: 'OptiPackAI',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        themeMode: dark ? ThemeMode.dark : ThemeMode.light,
        darkTheme: buildTheme(),
        routerConfig: ref.watch(routerProvider),
      ),
    );
  }
}
