import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/config/env.dart';
import 'packing_repository.dart';
import 'parcel_layer_view.dart';

/// Địa chỉ trang nhúng khung 3D của web. Phiên đăng nhập đi qua **fragment** (`#...`): fragment không
/// gửi lên máy chủ và không vào log; web ghi vào localStorage của WebView rồi xoá khỏi thanh địa chỉ.
/// Chỉ truyền access token (web không tự làm mới, tránh xoay vòng refresh token làm app bị đăng xuất).
///
/// Web gọi API qua chính origin của nó (`<web>/api`): máy chủ web (Vite dev hoặc nginx) chuyển tiếp sang BE,
/// nên WebView không gặp lỗi CORS và BE không cần cấu hình thêm.
/// Trang web nhúng: khung 3D hoặc hướng dẫn (vật tư, các bước, so sánh thùng).
enum EmbedView { scene, guide }

Uri embedPackingUri({
  required String webBaseUrl,
  required String groupId,
  required int parcelNo,
  required String accessToken,
  required int role,
  EmbedView view = EmbedView.scene,
}) {
  final base = webBaseUrl.replaceAll(RegExp(r'/+$'), '');
  final fragment = Uri(queryParameters: {'t': accessToken, 'r': '$role', 'a': '$base/api'}).query;
  final suffix = view == EmbedView.guide ? '/guide' : '';
  return Uri.parse('$base/embed/packing/${Uri.encodeComponent(groupId)}$suffix?parcel=$parcelNo#$fragment');
}

/// Mở màn web nhúng (3D hoặc hướng dẫn) của một kiện.
Future<void> openParcelWeb(BuildContext context, String groupId, Parcel parcel, EmbedView view,
    {bool replace = false}) {
  final route = MaterialPageRoute<void>(
    fullscreenDialog: !replace,
    builder: (_) => ParcelWebScreen(groupId: groupId, parcel: parcel, view: view),
  );
  final nav = Navigator.of(context);
  return replace ? nav.pushReplacement(route) : nav.push(route);
}

/// Một kiện: nhìn 2D theo lớp (có sẵn, chạy offline) kèm nút mở khung 3D đầy đủ như web.
class ParcelLayoutCard extends StatelessWidget {
  const ParcelLayoutCard({super.key, required this.groupId, required this.parcel});

  final String groupId;
  final Parcel parcel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ParcelLayerView(parcel: parcel),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => openParcelWeb(context, groupId, parcel, EmbedView.scene),
                icon: const Icon(Icons.view_in_ar_outlined),
                label: const Text('Xem 3D'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => openParcelWeb(context, groupId, parcel, EmbedView.guide),
                icon: const Icon(Icons.menu_book_outlined),
                label: const Text('Hướng dẫn'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Khung 3D hoặc trang hướng dẫn đóng gói của web trong WebView. Tải lỗi (mất mạng, web chưa chạy) thì hiện bản 2D để nhân viên
/// vẫn biết cách xếp, kèm nút thử lại.
class ParcelWebScreen extends ConsumerStatefulWidget {
  const ParcelWebScreen({super.key, required this.groupId, required this.parcel, this.view = EmbedView.scene});

  final String groupId;
  final Parcel parcel;
  final EmbedView view;

  @override
  ConsumerState<ParcelWebScreen> createState() => _ParcelWebScreenState();
}

class _ParcelWebScreenState extends ConsumerState<ParcelWebScreen> {
  WebViewController? _controller;
  int _progress = 0;
  String? _error;
  bool _starting = true;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    setState(() {
      _starting = true;
      _error = null;
      _progress = 0;
    });
    final token = await ref.read(tokenStoreProvider).readAccessToken();
    final role = ref.read(authControllerProvider).user?.role.value;
    if (!mounted) return;
    if (token == null || role == null) {
      setState(() {
        _starting = false;
        _error = 'Chưa có phiên đăng nhập. Hãy đăng nhập lại.';
      });
      return;
    }
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF8FAFF))
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (mounted) setState(() => _progress = p);
          },
          onWebResourceError: (e) {
            // Chỉ lỗi của trang chính; lỗi tải phụ (ảnh, font) không làm hỏng màn.
            if ((e.isForMainFrame ?? true) && mounted) {
              setState(() => _error = 'Không mở được trang 3D (${e.description}). Kiểm tra mạng và địa chỉ web.');
            }
          },
        ),
      )
      ..loadRequest(
        embedPackingUri(
          webBaseUrl: Env.webBaseUrl,
          groupId: widget.groupId,
          parcelNo: widget.parcel.no,
          accessToken: token,
          role: role,
          view: widget.view,
        ),
      );
    setState(() {
      _controller = controller;
      _starting = false;
    });
  }

  @override
  void dispose() {
    // Xoá phiên đã chép vào WebView để token không nằm lại sau khi thoát.
    final c = _controller;
    if (c != null) {
      c.clearLocalStorage();
      c.clearCache();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.view == EmbedView.guide
            ? 'Kiện ${widget.parcel.no} · Hướng dẫn'
            : 'Kiện ${widget.parcel.no} · 3D'),
        actions: [
          // Chuyển qua lại giữa khung 3D và hướng dẫn của cùng kiện.
          IconButton(
            tooltip: widget.view == EmbedView.guide ? 'Xem 3D' : 'Xem hướng dẫn',
            icon: Icon(widget.view == EmbedView.guide ? Icons.view_in_ar_outlined : Icons.menu_book_outlined),
            onPressed: () => openParcelWeb(
              context,
              widget.groupId,
              widget.parcel,
              widget.view == EmbedView.guide ? EmbedView.scene : EmbedView.guide,
              replace: true,
            ),
          ),
          IconButton(
            tooltip: 'Tải lại',
            icon: const Icon(Icons.refresh),
            onPressed: _start,
          ),
        ],
        bottom: _progress < 100 && _error == null && !_starting
            ? PreferredSize(
                preferredSize: const Size.fromHeight(3),
                child: LinearProgressIndicator(value: _progress / 100, minHeight: 3),
              )
            : null,
      ),
      body: _error != null
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(_error!, style: TextStyle(color: AppColors.warningText, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: _start,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Thử lại'),
                ),
                const SizedBox(height: 16),
                const Text('Bản 2D theo lớp:', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                ParcelLayerView(parcel: widget.parcel),
              ],
            )
          : controller == null
              ? const Center(child: CircularProgressIndicator())
              : WebViewWidget(controller: controller),
    );
  }
}
