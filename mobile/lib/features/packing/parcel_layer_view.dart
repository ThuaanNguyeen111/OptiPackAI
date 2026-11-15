import 'package:flutter/material.dart';

import 'packing_repository.dart';
import '../../app/colors.dart';

/// Nhìn từ trên xuống một kiện, theo **lớp độ cao** (2D thay cho khung 3D của web — điện thoại chỉ cần biết
/// món nào nằm ở đâu và đặt theo thứ tự nào). Kéo thanh trượt để xem từng lớp.
class ParcelLayerView extends StatefulWidget {
  const ParcelLayerView({super.key, required this.parcel});

  final Parcel parcel;

  @override
  State<ParcelLayerView> createState() => _ParcelLayerViewState();
}

class _ParcelLayerViewState extends State<ParcelLayerView> {
  late double _layer = widget.parcel.innerH;

  @override
  Widget build(BuildContext context) {
    final p = widget.parcel;
    final visible = p.items.where((i) => i.z < _layer).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(
          aspectRatio: p.innerL / p.innerW,
          child: CustomPaint(
            painter: _LayerPainter(parcel: p, layerTop: _layer),
            child: const SizedBox.expand(),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            const Icon(Icons.layers_outlined, size: 18),
            Expanded(
              child: Slider(
                min: 0.1,
                max: p.innerH,
                value: _layer.clamp(0.1, p.innerH),
                onChanged: (v) => setState(() => _layer = v),
              ),
            ),
            SizedBox(
              width: 64,
              child: Text('${_layer.toStringAsFixed(1).replaceAll('.', ',')} cm',
                  textAlign: TextAlign.right, style: const TextStyle(fontSize: 12)),
            ),
          ],
        ),
        Text(
          'Đang hiện $visible/${p.items.length} món (từ đáy tới ${_layer.toStringAsFixed(1).replaceAll('.', ',')} cm).',
          style: TextStyle(fontSize: 12, color: AppColors.inkSubtle),
        ),
      ],
    );
  }
}

Color skuColor(String sku) {
  final hue = (sku.hashCode.abs() % 360).toDouble();
  return HSLColor.fromAHSL(1, hue, 0.55, 0.55).toColor();
}

class _LayerPainter extends CustomPainter {
  _LayerPainter({required this.parcel, required this.layerTop});

  final Parcel parcel;
  final double layerTop;

  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / parcel.innerL;
    final sy = size.height / parcel.innerW;

    final box = Paint()..color = const Color(0xFFD7B98E);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(6)),
      box,
    );

    // Vẽ từ thấp lên cao để món cao hơn che món thấp, như nhìn từ trên xuống.
    final sorted = [...parcel.items]..sort((a, b) => a.z.compareTo(b.z));
    for (final item in sorted) {
      if (item.z >= layerTop) continue;
      final rect = Rect.fromLTWH(item.x * sx, item.y * sy, item.dx * sx, item.dy * sy).deflate(1);
      final cut = item.z + item.dz > layerTop;
      final fill = Paint()..color = skuColor(item.sku).withValues(alpha: cut ? 0.55 : 0.95);
      canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(4)), fill);
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(4)),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2
          ..color = AppColors.inkSubtle,
      );
      final label = TextPainter(
        text: TextSpan(
          text: item.sku.split('-').take(2).join('-'),
          style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: rect.width - 4);
      if (rect.width > 24 && rect.height > 14) {
        label.paint(canvas, rect.topLeft + const Offset(3, 3));
      }
    }
  }

  @override
  bool shouldRepaint(covariant _LayerPainter old) =>
      old.layerTop != layerTop || old.parcel != parcel;
}
